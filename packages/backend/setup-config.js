const fs = require("node:fs");
const path = require("node:path");
const dotenv = require("dotenv");
const { randomBytes } = require("node:crypto");
const { serverOptions } = require("./server");
const { normalizeWeb } = require("./web-config");

const DATABASE_KEYS = ["DATABASE_HOST", "DATABASE_PORT", "DATABASE_USER", "DATABASE_PASSWORD", "DATABASE_NAME"];

function readConfiguration(directory) {
  const file = path.join(directory, ".env");
  return fs.existsSync(file) ? dotenv.parse(fs.readFileSync(file)) : {};
}

function serializeConfiguration(configuration) {
  const lines = Object.entries(configuration)
    .map(([key, value]) => {
      if (!/^[\w.-]+$/.test(key) || /[\r\n\0]/.test(String(value))) {
        throw new Error("La configuración no puede contener saltos de línea ni caracteres nulos.");
      }
      return `${key}='${value}'`;
    })
    .join("\n");
  return `${lines}\n`;
}

function normalizeDatabase(input, existing = {}) {
  const configuration = {};
  const defaults = { DATABASE_HOST: "localhost", DATABASE_PORT: "3306" };
  for (const key of DATABASE_KEYS) {
    const value =
      key === "DATABASE_PASSWORD" && input.useSavedPassword === true
        ? existing.DATABASE_PASSWORD
        : (input[key] ?? defaults[key] ?? "");
    if (typeof value !== "string" || value.length > 1024 || /[\r\n\0]/.test(value))
      throw new Error(`Revisa el campo ${key}.`);
    configuration[key] = key === "DATABASE_PASSWORD" ? value : value.trim();
  }
  if (["DATABASE_HOST", "DATABASE_USER", "DATABASE_NAME"].some((key) => !configuration[key]))
    throw new Error("Completa servidor, usuario y base de datos.");
  if (
    !/^\d+$/.test(configuration.DATABASE_PORT) ||
    Number(configuration.DATABASE_PORT) < 1 ||
    Number(configuration.DATABASE_PORT) > 65535
  )
    throw new Error("El puerto de MySQL debe estar entre 1 y 65535.");
  return configuration;
}

function normalizeConfiguration(input, existing = {}) {
  const configuration = { ...existing, ...normalizeDatabase(input, existing), HOST: "127.0.0.1" };
  if (input.HOST !== undefined && input.HOST !== "127.0.0.1")
    throw new Error("El backend debe permanecer en 127.0.0.1; el acceso de red se configura en HTTPS.");
  const port = input.PORT ?? "8000";
  if (typeof port !== "string" || !/^\d+$/.test(port)) throw new Error("El puerto interno debe ser un entero.");
  configuration.PORT = String(serverOptions({ HOST: configuration.HOST, PORT: port }).port);
  if (Number(configuration.PORT) < 1024) throw new Error("El puerto interno debe ser 1024 o mayor.");
  Object.assign(configuration, normalizeWeb(input));
  const bind = input.WEB_BIND_ADDRESS ?? existing.WEB_BIND_ADDRESS ?? "0.0.0.0";
  if (!["127.0.0.1", "0.0.0.0"].includes(bind)) throw new Error("La dirección HTTPS no es válida.");
  if (bind === "0.0.0.0" && configuration.WEB_HOSTNAME.endsWith(".localhost"))
    throw new Error(
      "Los nombres .localhost sólo permiten acceso desde este servidor; para LAN utiliza un nombre de tu DNS.",
    );
  const httpsPort = String(
    input.WEB_HTTPS_PORT ?? (existing.AUTH_PUBLIC_ORIGIN ? new URL(existing.AUTH_PUBLIC_ORIGIN).port || "443" : "443"),
  );
  if (
    !/^\d+$/.test(httpsPort) ||
    Number(httpsPort) < 1 ||
    Number(httpsPort) > 65535 ||
    Number(httpsPort) === Number(configuration.PORT)
  )
    throw new Error("El puerto HTTPS debe ser válido y distinto del puerto interno.");
  configuration.WEB_BIND_ADDRESS = bind;
  configuration.AUTH_PUBLIC_ORIGIN = `https://${configuration.WEB_HOSTNAME}${Number(httpsPort) === 443 ? "" : `:${Number(httpsPort)}`}`;
  return configuration;
}

async function prepareAccessConfiguration(configuration) {
  const mysql = require("mysql2/promise");
  const connection = await mysql.createConnection({
    host: configuration.DATABASE_HOST,
    port: Number(configuration.DATABASE_PORT),
    user: configuration.DATABASE_USER,
    password: configuration.DATABASE_PASSWORD,
    database: configuration.DATABASE_NAME,
    charset: "UTF8_GENERAL_CI",
    connectTimeout: 5000,
  });
  try {
    const [tables] = await connection.query(
      "SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'dmmarket_auth_users'",
    );
    const [[count]] = tables.length
      ? await connection.query("SELECT COUNT(*) AS total FROM dmmarket_auth_users")
      : [[{ total: 0 }]];
    if (Number(count.total) && (!configuration.AUTH_SESSION_SECRET || !configuration.AUTH_MFA_KEY))
      throw new Error("La base contiene cuentas. Restaura sus claves originales; no se regeneran desde el asistente.");
    const prepared = {
      ...configuration,
      AUTH_SESSION_SECRET: configuration.AUTH_SESSION_SECRET || randomBytes(32).toString("base64"),
      AUTH_MFA_KEY: configuration.AUTH_MFA_KEY || randomBytes(32).toString("base64"),
    };
    require("./auth/runtime").validateAuthConfig(prepared);
    if (Number(count.total)) {
      const mfa = require("./auth/mfa").createMfa(prepared.AUTH_MFA_KEY);
      const [users] = await connection.query(
        "SELECT id, mfa_secret FROM dmmarket_auth_users WHERE mfa_secret IS NOT NULL",
      );
      for (const user of users) mfa.assertStoredSecret(user.id, user.mfa_secret);
    }
    return prepared;
  } finally {
    await connection.end();
  }
}

function databaseFingerprint(configuration) {
  return JSON.stringify(DATABASE_KEYS.map((key) => configuration[key]));
}

async function testDatabase(configuration) {
  const mysql = require("mysql2/promise");
  let connection;
  try {
    connection = await mysql.createConnection({
      host: configuration.DATABASE_HOST,
      port: Number(configuration.DATABASE_PORT),
      user: configuration.DATABASE_USER,
      password: configuration.DATABASE_PASSWORD,
      database: configuration.DATABASE_NAME,
      charset: "UTF8_GENERAL_CI",
      connectTimeout: 5000,
    });
    const required = ["clientes", "productos", "proveedores", "masterfact", "slavefact", "mastercomp", "slavecomp"];
    const [rows] = await connection.execute(
      { sql: "SELECT TABLE_NAME AS name FROM information_schema.TABLES WHERE TABLE_SCHEMA = ?", timeout: 5000 },
      [configuration.DATABASE_NAME],
    );
    const tables = new Set(rows.map((row) => row.name));
    const missing = required.filter((table) => !tables.has(table));
    if (missing.length) {
      return {
        ok: false,
        message: `La conexión funciona, pero faltan tablas de DMMarket: ${missing.join(", ")}. Usa la base existente del negocio, no una base vacía.`,
      };
    }
    return { ok: true, message: "Conexión comprobada. La base contiene las tablas principales de DMMarket." };
  } catch (error) {
    const messages = {
      ER_ACCESS_DENIED_ERROR: "MySQL rechazó el usuario o la contraseña. Revisa los datos y permisos de conexión.",
      PROTOCOL_SEQUENCE_TIMEOUT: "MySQL tardó demasiado en responder. Revisa la conexión y vuelve a probar.",
      ER_BAD_DB_ERROR: "No existe una base con ese nombre. Revisa el nombre de la base del negocio.",
      ECONNREFUSED: "No hay un servidor MySQL atendiendo en esa dirección y puerto.",
      ENOTFOUND: "No se encontró el servidor indicado. Revisa su dirección o nombre.",
      ETIMEDOUT: "MySQL no respondió a tiempo. Revisa la red y el firewall del servidor de base de datos.",
    };
    return {
      ok: false,
      message:
        messages[error.code] || "No se pudo comprobar la base de datos. Revisa la conexión y los permisos de MySQL.",
    };
  } finally {
    if (connection) await connection.end();
  }
}

module.exports = {
  readConfiguration,
  serializeConfiguration,
  normalizeDatabase,
  normalizeConfiguration,
  prepareAccessConfiguration,
  databaseFingerprint,
  testDatabase,
};
