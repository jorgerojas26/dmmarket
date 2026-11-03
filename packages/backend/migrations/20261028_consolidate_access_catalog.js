const { randomUUID } = require("node:crypto");

exports.config = { transaction: false };

const retired = ["sales.costs", "sales.profit", "providers.personal"];
const tables = [
  "dmmarket_auth_control",
  "dmmarket_auth_roles",
  "dmmarket_auth_role_permissions",
  "dmmarket_auth_user_roles",
  "dmmarket_auth_users",
  "dmmarket_auth_session_state",
  "dmmarket_auth_events",
];
const rank = (scope) => (scope === "global" ? 2 : scope === "assigned" ? 1 : 0);
const level = (grants, capability) =>
  Math.max(0, ...grants.filter((row) => row.capability === capability).map((row) => rank(row.scope)));
const financial = (grants) =>
  Math.max(level(grants, "sales.financial"), Math.min(level(grants, "sales.costs"), level(grants, "sales.profit")));

exports.up = async (db) => {
  const schema = await db("information_schema.TABLES")
    .whereRaw("TABLE_SCHEMA = DATABASE()")
    .whereIn("TABLE_NAME", tables)
    .select("ENGINE", "TABLE_COLLATION");
  if (
    schema.length !== tables.length ||
    schema.some((row) => String(row.ENGINE) !== "InnoDB" || String(row.TABLE_COLLATION) !== "utf8_bin")
  )
    throw new Error("Prepara el esquema propio de acceso InnoDB/utf8_bin antes de migrar el catálogo.");
  await db.transaction(async (tx) => {
    if (!(await tx("dmmarket_auth_control").where("id", 1).forUpdate().first()))
      throw new Error("Falta el control transaccional de acceso.");
    const grants = await tx("dmmarket_auth_role_permissions").select("role_id", "capability", "scope");
    const affected = grants.filter((row) => retired.includes(row.capability));
    if (!affected.length) return;
    if (
      grants
        .filter((row) => retired.includes(row.capability) || row.capability === "sales.financial")
        .some(
          (row) =>
            !["global", "assigned"].includes(row.scope) ||
            (row.capability === "providers.personal" && row.scope !== "global"),
        )
    )
      throw new Error("Los permisos anteriores contienen alcances inválidos; requieren revisión manual.");
    const roleIds = [...new Set(affected.map((row) => row.role_id))];
    const roleGrants = new Map();
    for (const row of grants) {
      if (!roleGrants.has(row.role_id)) roleGrants.set(row.role_id, []);
      roleGrants.get(row.role_id).push(row);
    }
    const planned = new Map([...roleGrants].map(([id, rows]) => [id, financial(rows)]));
    const assignments = await tx("dmmarket_auth_user_roles").select("user_id", "role_id").orderBy("user_id");
    const users = new Map();
    for (const row of assignments) {
      if (!users.has(row.user_id)) users.set(row.user_id, []);
      users.get(row.user_id).push(row.role_id);
    }
    const review = [];
    for (const [id, roles] of users) {
      const before = financial(roles.flatMap((role) => roleGrants.get(role) || []));
      const after = Math.max(0, ...roles.map((role) => planned.get(role) || 0));
      if (before !== after) review.push(id);
    }
    if (review.length)
      throw new Error(
        `Revisión manual requerida: costos y utilidad combinados entre roles no se pueden consolidar sin cambiar acceso. Usuarios: ${review.slice(0, 10).join(", ")}. No se modificó el catálogo.`,
      );
    const now = Date.now();
    for (const id of roleIds) {
      await tx("dmmarket_auth_role_permissions")
        .where("role_id", id)
        .whereIn("capability", [...retired, "sales.financial"])
        .delete();
      if (planned.get(id))
        await tx("dmmarket_auth_role_permissions").insert({
          role_id: id,
          capability: "sales.financial",
          scope: planned.get(id) === 2 ? "global" : "assigned",
        });
      await tx("dmmarket_auth_events").insert({
        id: randomUUID(),
        actor_id: null,
        target_user_id: null,
        target_role_id: id,
        action: "auth.catalog_migrated",
        outcome: "success",
        reason: "financial-permission-consolidated",
        occurred_ms: now,
      });
    }
    for (const [id, roles] of users) {
      if (!roles.some((role) => roleIds.includes(role))) continue;
      await tx("dmmarket_auth_users").where("id", id).increment("session_version", 1);
      await tx("dmmarket_auth_session_state")
        .where("user_id", id)
        .update({ pending_mfa_secret: null, pending_mfa_expires_ms: null });
      await tx("dmmarket_auth_session_state")
        .where("user_id", id)
        .whereNull("revoked_ms")
        .update({ revoked_ms: now, revocation_reason: "catalog-changed" });
      await tx("dmmarket_auth_events").insert({
        id: randomUUID(),
        actor_id: null,
        target_user_id: id,
        target_role_id: null,
        action: "auth.catalog_access_changed",
        outcome: "success",
        reason: "financial-permission-consolidated",
        occurred_ms: now,
      });
    }
  });
};

exports.down = async () => {
  throw new Error("La consolidación no es reversible automáticamente; restaura un respaldo revisado en mantenimiento.");
};
