const { randomUUID } = require("node:crypto");
const { createAccess, CAPABILITIES } = require("./capabilities");

const AUTH_TABLES = [
  "dmmarket_auth_attempts",
  "dmmarket_auth_control",
  "dmmarket_auth_users",
  "dmmarket_auth_roles",
  "dmmarket_auth_role_capabilities",
  "dmmarket_auth_user_roles",
  "dmmarket_auth_commercial_profiles",
  "dmmarket_auth_sessions",
  "dmmarket_auth_session_state",
  "dmmarket_auth_events",
];

async function assertAuthSchema(db) {
  if (process.env.DEBUG) throw new Error("Desactiva DEBUG antes de iniciar los servicios de acceso.");
  const schema = await db("information_schema.TABLES")
    .whereRaw("TABLE_SCHEMA = DATABASE()")
    .whereIn("TABLE_NAME", AUTH_TABLES)
    .select("ENGINE", "TABLE_COLLATION");
  if (
    schema.length !== AUTH_TABLES.length ||
    schema.some((row) => String(row.ENGINE) !== "InnoDB" || String(row.TABLE_COLLATION) !== "utf8_bin")
  ) {
    throw new Error(
      "El esquema de autenticación requiere todas sus tablas InnoDB/utf8_bin preparadas en mantenimiento.",
    );
  }
  if (!(await db.schema.hasColumn("dmmarket_auth_control", "first_setup")))
    throw new Error(
      "El esquema de acceso requiere preparar el estado de inicialización desde el instalador actualizado.",
    );
  if (!(await db.schema.hasColumn("dmmarket_auth_users", "mfa_required")))
    throw new Error("El esquema de acceso requiere preparar la política MFA por usuario.");
  if (!(await db.schema.hasColumn("dmmarket_auth_events", "target_role_id")))
    throw new Error("El esquema de acceso requiere la migración manual del objetivo de roles.");
  if (await db("dmmarket_auth_role_capabilities").whereNotIn("capability", Object.keys(CAPABILITIES)).first())
    throw new Error(
      "El catálogo de acceso requiere preparar las migraciones propias desde el instalador actualizado, con la web detenida.",
    );
  if (!(await db("dmmarket_auth_control").where("id", 1).first()))
    throw new Error("Falta el control transaccional de acceso.");
  if (
    !(await db.schema.hasColumn("dmmarket_auth_control", "commercial_model")) ||
    Number((await db("dmmarket_auth_control").where("id", 1).first())?.commercial_model) !== 1
  )
    throw new Error("Prepara la migración de identidad comercial individual antes de iniciar acceso.");
}

async function lockAccessMutation(connection) {
  if (!(await connection("dmmarket_auth_control").where("id", 1).forUpdate().first())) {
    throw new Error("Falta el control transaccional de acceso.");
  }
}

async function accessFor(connection, userId) {
  const grants = await connection("dmmarket_auth_role_capabilities as p")
    .join("dmmarket_auth_user_roles as r", "r.role_id", "p.role_id")
    .where("r.user_id", userId)
    .select("p.capability");
  const profile = await connection("dmmarket_auth_commercial_profiles").where("user_id", userId).first("seller_id");
  return createAccess(grants, profile?.seller_id || null);
}

async function appendEvent(
  connection,
  { actorId = null, targetId = null, targetRoleId = null, action, outcome = "success", reason = null, occurredMs },
) {
  await connection("dmmarket_auth_events").insert({
    id: randomUUID(),
    actor_id: actorId,
    target_user_id: targetId,
    target_role_id: targetRoleId,
    action,
    outcome,
    reason,
    occurred_ms: occurredMs,
  });
}

async function invalidateUser(connection, userId, now, reason) {
  await connection("dmmarket_auth_users").where("id", userId).increment("session_version", 1);
  await connection("dmmarket_auth_session_state")
    .where("user_id", userId)
    .update({ pending_mfa_secret: null, pending_mfa_expires_ms: null });
  await connection("dmmarket_auth_session_state")
    .where("user_id", userId)
    .whereNull("revoked_ms")
    .update({ revoked_ms: now, revocation_reason: reason });
  const user = await connection("dmmarket_auth_users").where("id", userId).first();
  return Number(user.session_version);
}

async function assertAdministratorRemains(connection) {
  const capabilities = [
    "access.users.read",
    "access.users.update",
    "access.roles.read",
    "access.roles.update",
    "access.roles.assign",
    "access.profile.read",
    "access.profile.update",
    "access.recovery.read",
    "access.recovery.execute",
  ];
  const owner = await connection("dmmarket_auth_users as u")
    .join("dmmarket_auth_user_roles as r", "r.user_id", "u.id")
    .join("dmmarket_auth_role_capabilities as p", "p.role_id", "r.role_id")
    .where("u.enabled", true)
    .where("u.must_change_password", false)
    .whereNull("u.temporary_expires_ms")
    .whereIn("p.capability", capabilities)
    .groupBy("u.id")
    .havingRaw("COUNT(DISTINCT p.capability) = ?", [capabilities.length])
    .select("u.id")
    .first();
  if (!owner) {
    const error = new Error("Debe permanecer un administrador habilitado con contraseña permanente.");
    error.status = 409;
    throw error;
  }
}

function validateReason(value) {
  if (
    typeof value !== "string" ||
    value.trim().length < 5 ||
    value.trim().length > 64 ||
    /[\p{Cc}\p{Cs}\u{10000}-\u{10FFFF}]/u.test(value)
  ) {
    const error = new Error("Indica un motivo de 5 a 64 caracteres sin controles.");
    error.status = 400;
    throw error;
  }
  return value.trim();
}

module.exports = {
  assertAuthSchema,
  lockAccessMutation,
  accessFor,
  appendEvent,
  invalidateUser,
  assertAdministratorRemains,
  validateReason,
};
