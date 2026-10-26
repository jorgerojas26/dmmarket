const { createHash } = require("node:crypto");
const knex = require("knex");
const Client = require("knex/lib/dialects/mysql2");
const { assertAuthSchema, assertAdministratorRemains } = require("./auth/identity");

function connectionFor(configuration) {
  return knex({
    client: Client,
    connection: {
      host: configuration.DATABASE_HOST,
      port: Number(configuration.DATABASE_PORT),
      user: configuration.DATABASE_USER,
      password: configuration.DATABASE_PASSWORD,
      database: configuration.DATABASE_NAME,
      charset: "UTF8_GENERAL_CI",
    },
    pool: { min: 0, max: 1 },
  });
}

async function prepareAccessSchema(configuration) {
  const db = connectionFor(configuration);
  const lockName = `dmmarket:migrations:${createHash("sha256").update(configuration.DATABASE_NAME.toLowerCase()).digest("hex").slice(0, 40)}`;
  try {
    const [[lock]] = await db.raw("SELECT GET_LOCK(?, 30) AS acquired", [lockName]);
    if (Number(lock.acquired) !== 1) throw new Error("Otra instancia está preparando la base de datos.");
    const present = await db.schema.hasTable("dmmarket_auth_users");
    const users = present ? Number((await db("dmmarket_auth_users").count("* as total").first()).total) : 0;
    if (!users) {
      await require("./migrations/20261024_add_auth_access").up(db);
      await require("./migrations/20261025_add_auth_event_role").up(db);
    }
    await assertAuthSchema(db);
    await require("./seeds/001_default_roles").seed(db);
  } finally {
    try {
      await db.raw("SELECT RELEASE_LOCK(?)", [lockName]);
    } finally {
      await db.destroy();
    }
  }
}

async function accessState(configuration) {
  const db = connectionFor(configuration);
  try {
    await assertAuthSchema(db);
    const users = Number((await db("dmmarket_auth_users").count("* as total").first()).total);
    let administratorReady = false;
    try {
      await assertAdministratorRemains(db);
      administratorReady = true;
    } catch (error) {
      if (error.status !== 409) throw error;
    }
    return { firstAdministratorRequired: users === 0, administratorReady };
  } finally {
    await db.destroy();
  }
}

module.exports = { prepareAccessSchema, accessState };
