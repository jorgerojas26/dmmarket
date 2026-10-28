require("dotenv").config();
const { createHash } = require("node:crypto");

// Mismo client class que database.js (bun no puede bundlear el require dinámico
// de knex, por eso se usa la clase directamente, no el string "mysql2").
const MySql2Client = require("knex/lib/dialects/mysql2");

module.exports = {
  client: MySql2Client,
  connection: {
    host: process.env.DATABASE_HOST,
    port: process.env.DATABASE_PORT,
    user: process.env.DATABASE_USER,
    password: process.env.DATABASE_PASSWORD,
    database: process.env.DATABASE_NAME,
    charset: "UTF8_GENERAL_CI",
    multipleStatements: true,
  },
  pool: {
    min: 1,
    max: 1,
    afterCreate(connection, done) {
      const database = String(connection.config.database || "").toLowerCase();
      const name = `dmmarket:migrations:${createHash("sha256").update(database).digest("hex").slice(0, 40)}`;
      console.log("Esperando acceso exclusivo para preparar la base de datos...");
      connection.query("SELECT GET_LOCK(?, 30) AS acquired", [name], (error, rows) => {
        if (error || Number(rows?.[0]?.acquired) !== 1) {
          connection.destroy();
          done(error || new Error("Otra instancia está preparando la base de datos. Espera a que termine."));
          return;
        }
        done(null, connection);
      });
    },
  },
  migrations: {
    directory: "./migrations",
    disableTransactions: true,
  },
};
