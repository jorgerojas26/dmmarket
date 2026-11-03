exports.config = { transaction: false };

const definitions = [
  [
    "dmmarket_auth_attempts",
    (table) => {
      table.string("bucket_key", 64).primary();
      table.bigInteger("started_ms").notNullable();
      table.integer("hits").unsigned().notNullable();
      table.boolean("notified").notNullable().defaultTo(false);
      table.index("started_ms", "dmmarket_auth_attempts_expiry");
    },
  ],
  [
    "dmmarket_auth_control",
    (table) => {
      table.integer("id").primary();
      table.string("first_setup", 16).notNullable().defaultTo("closed");
    },
  ],
  [
    "dmmarket_auth_users",
    (table) => {
      table.string("id", 36).primary();
      table.string("username", 64).notNullable().unique();
      table.string("display_name", 128).notNullable();
      table.text("password_hash").notNullable();
      table.boolean("enabled").notNullable().defaultTo(true);
      table.integer("session_version").unsigned().notNullable().defaultTo(1);
      table.boolean("must_change_password").notNullable().defaultTo(true);
      table.bigInteger("temporary_expires_ms").nullable();
      table.boolean("temporary_consumed").notNullable().defaultTo(false);
      table.text("mfa_secret").nullable();
      table.bigInteger("mfa_last_step").nullable();
    },
  ],
  [
    "dmmarket_auth_roles",
    (table) => {
      table.string("id", 36).primary();
      table.string("name", 64).notNullable().unique();
    },
  ],
  [
    "dmmarket_auth_role_permissions",
    (table) => {
      table.string("role_id", 36).notNullable().references("id").inTable("dmmarket_auth_roles");
      table.string("capability", 64).notNullable();
      table.string("scope", 16).notNullable();
      table.primary(["role_id", "capability", "scope"]);
    },
  ],
  [
    "dmmarket_auth_user_roles",
    (table) => {
      table.string("user_id", 36).notNullable().references("id").inTable("dmmarket_auth_users");
      table.string("role_id", 36).notNullable().references("id").inTable("dmmarket_auth_roles");
      table.primary(["user_id", "role_id"]);
    },
  ],
  [
    "dmmarket_auth_user_sellers",
    (table) => {
      table.string("user_id", 36).notNullable().references("id").inTable("dmmarket_auth_users");
      table.string("seller_id", 32).notNullable();
      table.primary(["user_id", "seller_id"]);
    },
  ],
  [
    "dmmarket_auth_sessions",
    (table) => {
      table.string("session_id", 128).primary();
      table.integer("expires").unsigned().notNullable();
      table.text("data", "mediumtext").nullable();
    },
  ],
  [
    "dmmarket_auth_session_state",
    (table) => {
      table.string("sid_hash", 64).primary();
      table.string("user_id", 36).notNullable().references("id").inTable("dmmarket_auth_users");
      table.integer("session_version").unsigned().notNullable();
      table.bigInteger("authenticated_ms").notNullable();
      table.bigInteger("activity_ms").notNullable();
      table.bigInteger("password_ms").notNullable();
      table.bigInteger("mfa_ms").nullable();
      table.text("pending_mfa_secret").nullable();
      table.bigInteger("pending_mfa_expires_ms").nullable();
      table.bigInteger("revoked_ms").nullable();
      table.string("revocation_reason", 32).nullable();
      table.index(["user_id", "revoked_ms"], "dmmarket_auth_state_user_revoked");
    },
  ],
  [
    "dmmarket_auth_events",
    (table) => {
      table.string("id", 36).primary();
      table.string("actor_id", 36).nullable().references("id").inTable("dmmarket_auth_users");
      table.string("target_user_id", 36).nullable().references("id").inTable("dmmarket_auth_users");
      table.string("action", 64).notNullable();
      table.string("outcome", 16).notNullable();
      table.string("reason", 64).nullable();
      table.bigInteger("occurred_ms").notNullable();
      table.index(["target_user_id", "occurred_ms"], "dmmarket_auth_events_user_time");
    },
  ],
];

exports.tables = definitions.map(([name]) => name);

exports.up = async (knex) => {
  const [engines] = await knex.raw("SHOW ENGINES");
  if (!engines.some((row) => String(row.Engine) === "InnoDB" && ["YES", "DEFAULT"].includes(String(row.Support)))) {
    throw new Error("Autenticación requiere InnoDB disponible; no se crearon tablas.");
  }
  for (const [name, define] of definitions) {
    if (!(await knex.schema.hasTable(name))) {
      await knex.schema.createTable(name, (table) => {
        table.engine("InnoDB");
        table.charset("utf8");
        table.collate("utf8_bin");
        define(table);
      });
      if (name === "dmmarket_auth_control") await knex(name).insert({ id: 1, first_setup: "new" });
    }
    const row = await knex("information_schema.TABLES")
      .whereRaw("TABLE_SCHEMA = DATABASE()")
      .where("TABLE_NAME", name)
      .select("ENGINE", "TABLE_COLLATION")
      .first();
    if (String(row?.ENGINE) !== "InnoDB" || String(row?.TABLE_COLLATION) !== "utf8_bin") {
      throw new Error(
        "Una tabla de autenticación existente no usa InnoDB/utf8_bin. Requiere revisión de mantenimiento.",
      );
    }
  }
};

exports.down = async (knex) => {
  for (const [name] of definitions) {
    if (name === "dmmarket_auth_control") continue;
    if (await knex.schema.hasTable(name)) {
      const row = await knex(name).count("* as total").first();
      if (Number(row.total) > 0)
        throw new Error("No se elimina autenticación con cuentas, sesiones o historial registrado.");
    }
  }
  for (const [name] of [...definitions].reverse()) await knex.schema.dropTableIfExists(name);
};
