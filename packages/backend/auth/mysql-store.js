const session = require("express-session");
const MySQLStore = require("express-mysql-session")(session);
const { ABSOLUTE_SESSION_MS } = require("./http-security");

function createSessionStore(connection) {
  if (!connection || typeof connection.query !== "function") {
    throw new TypeError("El store requiere una conexión MySQL explícita y validada.");
  }
  if (process.env.DEBUG)
    throw new Error("Desactiva DEBUG antes de iniciar sesiones para no registrar identificadores.");
  return new MySQLStore(
    {
      createDatabaseTable: false,
      clearExpired: false,
      disableTouch: true,
      endConnectionOnClose: false,
      expiration: ABSOLUTE_SESSION_MS,
      charset: "utf8_bin",
      schema: { tableName: "dmmarket_auth_sessions" },
    },
    connection,
  );
}

module.exports = { createSessionStore };
