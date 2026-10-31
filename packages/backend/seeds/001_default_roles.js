const { validateGrants } = require("../auth/capabilities");
const { assertAuthSchema, lockAccessMutation, appendEvent, invalidateUser } = require("../auth/identity");
const { roles } = require("../auth/default-roles");

exports.seed = async (db) => {
  await assertAuthSchema(db);
  await db.transaction(async (transaction) => {
    await lockAccessMutation(transaction);
    const affected = new Set();
    for (const role of roles) {
      const existing = await transaction("dmmarket_auth_roles").where("id", role.id).first();
      const conflict = await transaction("dmmarket_auth_roles")
        .where("name", role.name)
        .whereNot("id", role.id)
        .first();
      if (conflict) throw new Error(`Ya existe un rol llamado ${role.name} con otro identificador.`);
      const permissions = validateGrants(role.permissions.map((capability) => ({ capability })));
      const current = await transaction("dmmarket_auth_role_capabilities")
        .where("role_id", role.id)
        .pluck("capability");
      const unchanged =
        existing?.name === role.name &&
        current.length === permissions.length &&
        current.every((key) => role.permissions.includes(key));
      if (unchanged) continue;
      if (existing) {
        await transaction("dmmarket_auth_roles").where("id", role.id).update({ name: role.name });
        for (const userId of await transaction("dmmarket_auth_user_roles").where("role_id", role.id).pluck("user_id"))
          affected.add(userId);
        await transaction("dmmarket_auth_role_capabilities").where("role_id", role.id).delete();
      } else await transaction("dmmarket_auth_roles").insert({ id: role.id, name: role.name });
      await transaction("dmmarket_auth_role_capabilities").insert(
        permissions.map((permission) => ({ role_id: role.id, ...permission })),
      );
      await appendEvent(transaction, {
        targetRoleId: role.id,
        action: existing ? "auth.default_role_updated" : "auth.default_role_created",
        reason: "installation-default-role",
        occurredMs: Date.now(),
      });
    }
    for (const userId of affected) await invalidateUser(transaction, userId, Date.now(), "default-roles-updated");
  });
};
