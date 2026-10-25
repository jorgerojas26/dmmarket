const knex = require("knex");
const MySql2Client = require("knex/lib/dialects/mysql2");

const database = knex({
  client: MySql2Client,
  connection: {
    host: process.env.DATABASE_HOST,
    port: process.env.DATABASE_PORT,
    user: process.env.DATABASE_USER,
    password: process.env.DATABASE_PASSWORD,
    database: process.env.DATABASE_NAME,
    charset: "utf8",
    dateStrings: ["DATE"],
    multipleStatements: true,
  },
});

module.exports = database;
