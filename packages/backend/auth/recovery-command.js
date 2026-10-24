const net = require("node:net");
const { spawnSync } = require("node:child_process");

function assertLocalAdministrator() {
  let administrator = false;
  if (process.platform === "win32") {
    const result = spawnSync(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        "([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)",
      ],
      { encoding: "utf8" },
    );
    administrator = !result.error && result.status === 0 && result.stdout.trim() === "True";
  } else {
    administrator = typeof process.getuid === "function" && process.getuid() === 0;
  }
  if (!administrator) throw new Error("La recuperación requiere permisos administrativos del sistema operativo.");
}

function parseOptions(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 2) {
    const keys = { "--username": "username", "--display-name": "displayName", "--reason": "reason" };
    const key = Object.hasOwn(keys, args[index]) ? keys[args[index]] : null;
    if (
      !key ||
      Object.hasOwn(options, key) ||
      typeof args[index + 1] !== "string" ||
      args[index + 1].startsWith("--")
    ) {
      throw new Error(
        "Usa --username, --reason y, para el primer administrador, --display-name. No se aceptan contraseñas por argumentos.",
      );
    }
    options[key] = args[index + 1];
  }
  return options;
}

async function runAccessCommand(mode, args) {
  assertLocalAdministrator();
  if (!process.stdout.isTTY || !process.stdin.isTTY)
    throw new Error("Usa una terminal interactiva; no se entregan credenciales a logs o redirecciones.");
  const options = parseOptions(args);
  require("dotenv").config();
  const port = Number(process.env.PORT || 8000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("PORT no es válido.");
  const guard = net.createServer((socket) => socket.destroy());
  await new Promise((resolve, reject) => {
    guard.once("error", () =>
      reject(
        new Error("Detén la web y su supervisor antes de recuperar acceso; el puerto configurado no está disponible."),
      ),
    );
    guard.listen(port, "127.0.0.1", resolve);
  });
  let db;
  try {
    db = require("knex")(require("../knexfile"));
    const accounts = await require("./accounts").createAccountService({ db });
    const result = await accounts.recoverLocally({ mode, ...options });
    process.stdout.write(
      `\nUsuario: ${result.username}\nContraseña temporal: ${result.temporaryPassword}\nVence: ${new Date(result.expiresAtMs).toISOString()}\nCambia la contraseña y completa MFA antes de abrir el acceso general.\n`,
    );
  } catch (error) {
    if (error.sql || error.sqlMessage || error.code?.startsWith("ER_")) {
      throw new Error("No se pudo recuperar el acceso. Revisa MySQL y el esquema propio preparado en mantenimiento.");
    }
    throw error;
  } finally {
    try {
      if (db) await db.destroy();
    } finally {
      await new Promise((resolve) => guard.close(resolve));
    }
  }
}

module.exports = { runAccessCommand, assertLocalAdministrator };
