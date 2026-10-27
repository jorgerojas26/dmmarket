const { randomUUID } = require("node:crypto");
const { CAPABILITIES, validateGrants } = require("./capabilities");
const {
  assertAuthSchema,
  appendEvent,
  invalidateUser,
  assertAdministratorRemains,
  validateReason,
} = require("./identity");

function fail(status, message) {
  const error = new Error(message);
  error.status = status;
  throw error;
}

function identifier(value) {
  if (typeof value !== "string" || !/^[a-zA-Z0-9-]{1,36}$/.test(value)) fail(400, "El identificador no es válido.");
  return value;
}

function roleName(value) {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.trim().length > 64 ||
    /[\p{Cc}\p{Cs}\u{10000}-\u{10FFFF}]/u.test(value)
  )
    fail(400, "El nombre del rol no es válido.");
  return value.trim();
}

function permissions(value) {
  if (!Array.isArray(value) || value.length > Object.keys(CAPABILITIES).length * 2)
    fail(400, "Los permisos no son válidos.");
  let grants;
  try {
    grants = validateGrants(value);
  } catch {
    fail(400, "La capacidad o su alcance no están admitidos.");
  }
  return [...new Map(grants.map((grant) => [`${grant.capability}:${grant.scope}`, grant])).values()];
}

function roleIds(value) {
  if (!Array.isArray(value) || value.length > 100) fail(400, "La selección de roles no es válida.");
  return [...new Set(value.map(identifier))].sort();
}

function sellerIds(value) {
  if (
    !Array.isArray(value) ||
    value.length > 100 ||
    value.some(
      (id) => typeof id !== "string" || !/^[\p{L}\p{N}._-]{1,32}$/u.test(id) || /[\u{10000}-\u{10FFFF}]/u.test(id),
    )
  )
    fail(400, "La selección de vendedores no es válida.");
  return [...new Set(value)].sort();
}

function optionalReason(value) {
  return value === undefined || value === null || value === "" ? null : validateReason(value);
}

async function createAccessAdministration({ db, sessions, now = Date.now }) {
  await assertAuthSchema(db);
  const administer = (sid, capability, recent, work) =>
    sessions.withSession(sid, { recent, accessMutation: recent, readOnly: !recent }, async (context) => {
      if (!context.access.hasGlobal(capability)) fail(403, "Acceso no permitido.");
      return work(context.transaction, context.user.id);
    });
  async function target(connection, table, id) {
    const row = await connection(table).where("id", identifier(id)).forUpdate().first();
    if (!row) fail(404, "El recurso de acceso no está disponible.");
    return row;
  }
  async function event(connection, actorId, action, reason, targetId = null, targetRoleId = null) {
    const occurredMs = now();
    if (!Number.isSafeInteger(occurredMs) || occurredMs <= 0) throw new Error("El reloj del servidor no es válido.");
    await appendEvent(connection, { actorId, targetId, targetRoleId, action, reason, occurredMs });
  }
  return Object.freeze({
    catalog(sid) {
      return administer(sid, "access.roles", false, async () =>
        Object.entries(CAPABILITIES).map(([capability, configuration]) => ({ capability, ...configuration })),
      );
    },
    role(sid, id) {
      return administer(sid, "access.roles", false, async (connection) => {
        const role = await connection("dmmarket_auth_roles").where("id", identifier(id)).select("id", "name").first();
        if (!role) fail(404, "El rol no está disponible.");
        return {
          ...role,
          permissions: await connection("dmmarket_auth_role_permissions")
            .where("role_id", id)
            .select("capability", "scope")
            .orderBy("capability")
            .orderBy("scope"),
        };
      });
    },
    createRole(sid, input) {
      const name = roleName(input.name);
      const grants = permissions(input.permissions);
      const reason = optionalReason(input.reason);
      return administer(sid, "access.roles", true, async (connection, actorId) => {
        if (await connection("dmmarket_auth_roles").where("name", name).first())
          fail(409, "Ya existe un rol con ese nombre.");
        const id = randomUUID();
        await connection("dmmarket_auth_roles").insert({ id, name });
        if (grants.length)
          await connection("dmmarket_auth_role_permissions").insert(grants.map((grant) => ({ role_id: id, ...grant })));
        await event(connection, actorId, "auth.role_created", reason, null, id);
        return { id, name, permissions: grants };
      });
    },
    updateRole(sid, id, input) {
      const name = roleName(input.name);
      const grants = permissions(input.permissions);
      const reason = optionalReason(input.reason);
      return administer(sid, "access.roles", true, async (connection, actorId) => {
        await target(connection, "dmmarket_auth_roles", id);
        if (await connection("dmmarket_auth_roles").where("name", name).whereNot("id", id).first())
          fail(409, "Ya existe un rol con ese nombre.");
        await connection("dmmarket_auth_roles").where("id", id).update({ name });
        await connection("dmmarket_auth_role_permissions").where("role_id", id).delete();
        if (grants.length)
          await connection("dmmarket_auth_role_permissions").insert(grants.map((grant) => ({ role_id: id, ...grant })));
        const users = await connection("dmmarket_auth_user_roles")
          .where("role_id", id)
          .orderBy("user_id")
          .pluck("user_id");
        for (const userId of users) await invalidateUser(connection, userId, now(), "role-changed");
        await assertAdministratorRemains(connection);
        await event(connection, actorId, "auth.role_changed", reason, null, id);
        return { id, name, permissions: grants, affectedUsers: users.length };
      });
    },
    assignments(sid, id, kind) {
      const roles = kind === "roles";
      return administer(sid, roles ? "access.roles" : "access.links", false, async (connection) => {
        if (!(await connection("dmmarket_auth_users").where("id", identifier(id)).first()))
          fail(404, "La cuenta no está disponible.");
        return connection(roles ? "dmmarket_auth_user_roles" : "dmmarket_auth_user_sellers")
          .where("user_id", id)
          .orderBy(roles ? "role_id" : "seller_id")
          .pluck(roles ? "role_id" : "seller_id");
      });
    },
    setRoles(sid, id, input) {
      const ids = roleIds(input.roleIds);
      const reason = optionalReason(input.reason);
      return administer(sid, "access.roles", true, async (connection, actorId) => {
        await target(connection, "dmmarket_auth_users", id);
        const rows = ids.length ? await connection("dmmarket_auth_roles").whereIn("id", ids).select("id") : [];
        if (rows.length !== ids.length) fail(400, "Uno de los roles no está disponible.");
        if (ids.length)
          validateGrants(
            await connection("dmmarket_auth_role_permissions").whereIn("role_id", ids).select("capability", "scope"),
          );
        await connection("dmmarket_auth_user_roles").where("user_id", id).delete();
        if (ids.length)
          await connection("dmmarket_auth_user_roles").insert(ids.map((roleId) => ({ user_id: id, role_id: roleId })));
        await invalidateUser(connection, id, now(), "roles-changed");
        await assertAdministratorRemains(connection);
        await event(connection, actorId, "auth.user_roles_changed", reason, id);
        return { id, roleIds: ids };
      });
    },
    setSellers(sid, id, input) {
      const ids = sellerIds(input.sellerIds);
      const reason = validateReason(input.reason);
      return administer(sid, "access.links", true, async (connection, actorId) => {
        await target(connection, "dmmarket_auth_users", id);
        const rows = ids.length ? await connection("vendedores").whereIn("idVend", ids).select("idVend") : [];
        if (rows.length !== ids.length || rows.some((row) => !ids.includes(String(row.idVend))))
          fail(400, "Uno de los vendedores no está disponible.");
        await connection("dmmarket_auth_user_sellers").where("user_id", id).delete();
        if (ids.length)
          await connection("dmmarket_auth_user_sellers").insert(
            ids.map((sellerId) => ({ user_id: id, seller_id: sellerId })),
          );
        await invalidateUser(connection, id, now(), "links-changed");
        await event(connection, actorId, "auth.user_sellers_changed", reason, id);
        return { id, sellerIds: ids };
      });
    },
  });
}

module.exports = { createAccessAdministration };
