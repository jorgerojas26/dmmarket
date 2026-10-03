const fs = require("node:fs");
const path = require("node:path");
const dotenv = require("dotenv");
const { serverOptions } = require("./server");

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

function normalizeConfiguration(input, existing = {}) {
  const configuration = {};
  for (const key of [...DATABASE_KEYS, "HOST", "PORT"]) {
    const defaults = { DATABASE_HOST: "localhost", DATABASE_PORT: "3306", HOST: "0.0.0.0", PORT: "8000" };
    const value =
      key === "DATABASE_PASSWORD" && input.useSavedPassword === true
        ? existing.DATABASE_PASSWORD
        : (input[key] ?? defaults[key] ?? "");
    if (typeof value !== "string" || value.length > 1024 || /[\r\n\0]/.test(value)) {
      throw new Error(`Revisa el campo ${key}: contiene caracteres no válidos.`);
    }
    configuration[key] = key === "DATABASE_PASSWORD" ? value : value.trim();
  }
  for (const key of ["DATABASE_HOST", "DATABASE_USER", "DATABASE_NAME"]) {
    if (!configuration[key]) throw new Error("Completa el servidor, el usuario y el nombre de la base de datos.");
  }
  if (
    !/^\d+$/.test(configuration.DATABASE_PORT) ||
    Number(configuration.DATABASE_PORT) < 1 ||
    Number(configuration.DATABASE_PORT) > 65535
  ) {
    throw new Error("El puerto de MySQL debe estar entre 1 y 65535.");
  }
  if (!/^\d+$/.test(configuration.PORT)) throw new Error("El puerto de DMMarket debe ser un número entero.");
  serverOptions(configuration);
  if (!["0.0.0.0", "127.0.0.1"].includes(configuration.HOST)) {
    throw new Error("Elige acceso por red local o solo desde este servidor.");
  }
  return configuration;
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
  normalizeConfiguration,
  databaseFingerprint,
  testDatabase,
};
