require("dotenv").config();

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
    multipleStatements: true,
  },
  migrations: {
    directory: "./migrations",
  },
};
