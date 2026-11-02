const { randomUUID } = require("node:crypto");
const { CAPABILITIES, validateGrants } = require("./capabilities");
const { requiresCommercialProfile, validateCommercialProfile, commercialProfile } = require("./commercial-profile");
const {
  assertAuthSchema,
  grantsFor,
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
  if (!Array.isArray(value) || value.length > Object.keys(CAPABILITIES).length)
    fail(400, "Los permisos no son válidos.");
  let grants;
  try {
    grants = validateGrants(value);
  } catch {
    fail(400, "El permiso no está admitido.");
  }
  return [...new Map(grants.map((grant) => [grant.capability, grant])).values()];
}

function roleIds(value) {
  if (!Array.isArray(value) || value.length > 100) fail(400, "La selección de roles no es válida.");
  return [...new Set(value.map(identifier))].sort();
}

function optionalReason(value) {
  return value === undefined || value === null || value === "" ? null : validateReason(value);
}

async function userAccess(connection, id) {
  const roles = await connection("dmmarket_auth_roles").select("id", "name").orderBy("name");
  const grants = await connection("dmmarket_auth_role_capabilities")
    .select("role_id", "capability")
    .orderBy("capability");
  return {
    id,
    roleIds: await connection("dmmarket_auth_user_roles").where("user_id", id).orderBy("role_id").pluck("role_id"),
    permissions: await connection("dmmarket_auth_user_capabilities")
      .where("user_id", id)
      .select("capability")
      .orderBy("capability"),
    roles: roles.map((role) => ({
      ...role,
      permissions: grants.filter((grant) => grant.role_id === role.id).map(({ capability }) => ({ capability })),
    })),
  };
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
      return administer(sid, "access.roles.read", false, async () =>
        Object.entries(CAPABILITIES).map(([capability, configuration]) => ({ capability, ...configuration })),
      );
    },
    role(sid, id) {
      return administer(sid, "access.roles.read", false, async (connection) => {
        const role = await connection("dmmarket_auth_roles").where("id", identifier(id)).select("id", "name").first();
        if (!role) fail(404, "El rol no está disponible.");
        return {
          ...role,
          permissions: await connection("dmmarket_auth_role_capabilities")
            .where("role_id", id)
            .select("capability")
            .orderBy("capability"),
        };
      });
    },
    createRole(sid, input) {
      const name = roleName(input.name);
      const grants = permissions(input.permissions);
      const reason = optionalReason(input.reason);
      return administer(sid, "access.roles.create", true, async (connection, actorId) => {
        if (await connection("dmmarket_auth_roles").where("name", name).first())
          fail(409, "Ya existe un rol con ese nombre.");
        const id = randomUUID();
        await connection("dmmarket_auth_roles").insert({ id, name });
        if (grants.length)
          await connection("dmmarket_auth_role_capabilities").insert(
            grants.map((grant) => ({ role_id: id, ...grant })),
          );
        await event(connection, actorId, "auth.role_created", reason, null, id);
        return { id, name, permissions: grants };
      });
    },
    updateRole(sid, id, input) {
      const name = roleName(input.name);
      const grants = permissions(input.permissions);
      const reason = optionalReason(input.reason);
      return administer(sid, "access.roles.update", true, async (connection, actorId) => {
        await target(connection, "dmmarket_auth_roles", id);
        if (await connection("dmmarket_auth_roles").where("name", name).whereNot("id", id).first())
          fail(409, "Ya existe un rol con ese nombre.");
        await connection("dmmarket_auth_roles").where("id", id).update({ name });
        await connection("dmmarket_auth_role_capabilities").where("role_id", id).delete();
        if (grants.length)
          await connection("dmmarket_auth_role_capabilities").insert(
            grants.map((grant) => ({ role_id: id, ...grant })),
          );
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
    assignments(sid, id) {
      return administer(sid, "access.roles.read", false, async (connection) => {
        if (!(await connection("dmmarket_auth_users").where("id", identifier(id)).first()))
          fail(404, "La cuenta no está disponible.");
        return connection("dmmarket_auth_user_roles").where("user_id", id).orderBy("role_id").pluck("role_id");
      });
    },
    profile(sid, id) {
      return administer(sid, "access.profile.read", false, async (connection) => {
        if (!(await connection("dmmarket_auth_users").where("id", identifier(id)).first()))
          fail(404, "La cuenta no está disponible.");
        return commercialProfile(connection, id);
      });
    },
    userAccess(sid, id) {
      return administer(sid, "access.roles.read", false, async (connection) => {
        if (!(await connection("dmmarket_auth_users").where("id", identifier(id)).first()))
          fail(404, "La cuenta no está disponible.");
        return userAccess(connection, id);
      });
    },
    setUserAccess(sid, id, input) {
      const ids = roleIds(input.roleIds);
      const grants = permissions(input.permissions).sort((a, b) => a.capability.localeCompare(b.capability));
      return administer(sid, "access.roles.assign", true, async (connection, actorId) => {
        await target(connection, "dmmarket_auth_users", id);
        const previous = await userAccess(connection, id);
        if (ids.some((id) => !previous.roles.some((role) => role.id === id)))
          fail(400, "Uno de los roles no está disponible.");
        const rolesAdded = ids.filter((id) => !previous.roleIds.includes(id));
        const rolesRemoved = previous.roleIds.filter((id) => !ids.includes(id));
        const selected = grants.map((grant) => grant.capability);
        const old = previous.permissions.map((grant) => grant.capability);
        const added = selected.filter((capability) => !old.includes(capability));
        const removed = old.filter((capability) => !selected.includes(capability));
        if (!rolesAdded.length && !rolesRemoved.length && !added.length && !removed.length) return previous;
        if (rolesAdded.length || rolesRemoved.length) {
          await connection("dmmarket_auth_user_roles").where("user_id", id).delete();
          if (ids.length)
            await connection("dmmarket_auth_user_roles").insert(
              ids.map((roleId) => ({ user_id: id, role_id: roleId })),
            );
        }
        if (added.length || removed.length) {
          await connection("dmmarket_auth_user_capabilities").where("user_id", id).delete();
          if (grants.length)
            await connection("dmmarket_auth_user_capabilities").insert(
              grants.map((grant) => ({ user_id: id, ...grant })),
            );
        }
        if (
          requiresCommercialProfile(await grantsFor(connection, id)) &&
          !(await connection("dmmarket_auth_commercial_profiles").where("user_id", id).first())
        )
          fail(400, "El acceso seleccionado requiere un perfil comercial individual.");
        await assertAdministratorRemains(connection);
        const occurredMs = now();
        if (!Number.isSafeInteger(occurredMs) || occurredMs <= 0)
          throw new Error("El reloj del servidor no es válido.");
        await invalidateUser(connection, id, occurredMs, "user-access-changed");
        const roleDetails = (ids) =>
          ids.map((id) => {
            const role = previous.roles.find((role) => role.id === id);
            return { id, name: role.name };
          });
        await appendEvent(connection, {
          actorId,
          targetId: id,
          action: "auth.user_access_changed",
          details: { rolesAdded: roleDetails(rolesAdded), rolesRemoved: roleDetails(rolesRemoved), added, removed },
          occurredMs,
        });
        return userAccess(connection, id);
      });
    },
    userPermissions(sid, id) {
      return administer(sid, "access.roles.read", false, async (connection) => {
        if (!(await connection("dmmarket_auth_users").where("id", identifier(id)).first()))
          fail(404, "La cuenta no está disponible.");
        return {
          permissions: await connection("dmmarket_auth_user_capabilities")
            .where("user_id", id)
            .select("capability")
            .orderBy("capability"),
          inherited: await connection("dmmarket_auth_role_capabilities as p")
            .join("dmmarket_auth_user_roles as r", "r.role_id", "p.role_id")
            .where("r.user_id", id)
            .distinct("p.capability")
            .orderBy("p.capability"),
        };
      });
    },
    setUserPermissions(sid, id, input) {
      const grants = permissions(input.permissions).sort((a, b) => a.capability.localeCompare(b.capability));
      return administer(sid, "access.roles.assign", true, async (connection, actorId) => {
        await target(connection, "dmmarket_auth_users", id);
        const previous = await connection("dmmarket_auth_user_capabilities")
          .where("user_id", id)
          .orderBy("capability")
          .pluck("capability");
        const selected = grants.map((grant) => grant.capability);
        const added = selected.filter((capability) => !previous.includes(capability));
        const removed = previous.filter((capability) => !selected.includes(capability));
        if (!added.length && !removed.length) return { id, permissions: grants };
        await connection("dmmarket_auth_user_capabilities").where("user_id", id).delete();
        if (grants.length)
          await connection("dmmarket_auth_user_capabilities").insert(
            grants.map((grant) => ({ user_id: id, ...grant })),
          );
        if (
          requiresCommercialProfile(await grantsFor(connection, id)) &&
          !(await connection("dmmarket_auth_commercial_profiles").where("user_id", id).first())
        )
          fail(400, "Los permisos seleccionados requieren un perfil comercial individual.");
        await assertAdministratorRemains(connection);
        const occurredMs = now();
        await invalidateUser(connection, id, occurredMs, "user-permissions-changed");
        await appendEvent(connection, {
          actorId,
          targetId: id,
          action: "auth.user_permissions_changed",
          details: { added, removed },
          occurredMs,
        });
        return { id, permissions: grants };
      });
    },
    setRoles(sid, id, input) {
      const ids = roleIds(input.roleIds);
      const reason = optionalReason(input.reason);
      return administer(sid, "access.roles.assign", true, async (connection, actorId) => {
        await target(connection, "dmmarket_auth_users", id);
        const rows = ids.length ? await connection("dmmarket_auth_roles").whereIn("id", ids).select("id") : [];
        if (rows.length !== ids.length) fail(400, "Uno de los roles no está disponible.");
        const grants = ids.length
          ? validateGrants(
              await connection("dmmarket_auth_role_capabilities").whereIn("role_id", ids).select("capability"),
            )
          : [];
        const individual = await connection("dmmarket_auth_user_capabilities")
          .where("user_id", id)
          .select("capability");
        if (
          requiresCommercialProfile([...grants, ...individual]) &&
          !(await connection("dmmarket_auth_commercial_profiles").where("user_id", id).first())
        )
          fail(400, "Los roles seleccionados requieren un perfil comercial individual.");
        await connection("dmmarket_auth_user_roles").where("user_id", id).delete();
        if (ids.length)
          await connection("dmmarket_auth_user_roles").insert(ids.map((roleId) => ({ user_id: id, role_id: roleId })));
        await invalidateUser(connection, id, now(), "roles-changed");
        await assertAdministratorRemains(connection);
        await event(connection, actorId, "auth.user_roles_changed", reason, id);
        return { id, roleIds: ids };
      });
    },
    setProfile(sid, id, input) {
      if (!input || Array.isArray(input) || !Object.hasOwn(input, "sellerId"))
        fail(400, "Indica una identidad comercial o null.");
      return administer(sid, "access.profile.update", true, async (connection, actorId) => {
        await target(connection, "dmmarket_auth_users", id);
        const identity = await validateCommercialProfile(connection, input.sellerId, id);
        if (identity === null) {
          const grants = await grantsFor(connection, id);
          if (requiresCommercialProfile(grants))
            fail(409, "Retira primero los roles o permisos individuales que requieren esta identidad comercial.");
        }
        await connection("dmmarket_auth_commercial_profiles").where("user_id", id).delete();
        if (identity)
          await connection("dmmarket_auth_commercial_profiles").insert({ user_id: id, seller_id: identity });
        await invalidateUser(connection, id, now(), "commercial-profile-changed");
        await event(connection, actorId, "auth.commercial_profile_changed", null, id);
        return commercialProfile(connection, id);
      });
    },
  });
}

module.exports = { createAccessAdministration };
