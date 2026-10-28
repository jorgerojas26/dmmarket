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
    charset: "utf8",
    multipleStatements: true,
  },
  pool: {
    min: 1,
    max: 1,
    afterCreate(connection, done) {
      const prepare = async () => {
        const sql = connection.promise();
        const [engines] = await sql.query("SHOW ENGINES");
        if (
          !engines.some(
            (engine) =>
              String(engine.Engine).toUpperCase() === "INNODB" && ["YES", "DEFAULT"].includes(String(engine.Support)),
          )
        )
          throw new Error("InnoDB debe estar disponible para preparar las tablas de DMMarket.");
        try {
          await sql.query("SET SESSION default_storage_engine = 'InnoDB'");
        } catch (error) {
          if (error.code !== "ER_UNKNOWN_SYSTEM_VARIABLE") throw error;
          await sql.query("SET SESSION storage_engine = 'InnoDB'");
        }
        const database = String(connection.config.database || "").toLowerCase();
        const name = `dmmarket:migrations:${createHash("sha256").update(database).digest("hex").slice(0, 40)}`;
        console.log("Esperando acceso exclusivo para preparar la base de datos...");
        const [[lock]] = await sql.query("SELECT GET_LOCK(?, 30) AS acquired", [name]);
        if (Number(lock?.acquired) !== 1)
          throw new Error("Otra instancia está preparando la base de datos. Espera a que termine.");
      };
      prepare().then(
        () => done(null, connection),
        (error) => {
          connection.destroy();
          done(error);
        },
      );
    },
  },
  migrations: {
    directory: "./migrations",
    disableTransactions: true,
  },
};
