const { validateGrants } = require("../auth/capabilities");
const { assertAuthSchema, lockAccessMutation, appendEvent } = require("../auth/identity");

const { roles } = require("../auth/default-roles");

exports.seed = async (db) => {
  await assertAuthSchema(db);
  await db.transaction(async (transaction) => {
    await lockAccessMutation(transaction);
    for (const role of roles) {
      if (await transaction("dmmarket_auth_roles").where("id", role.id).first()) continue;
      if (await transaction("dmmarket_auth_roles").where("name", role.name).first())
        throw new Error(
          `Ya existe un rol llamado ${role.name} con otro identificador. Revisa el conflicto antes de instalar; no se sobrescriben roles existentes.`,
        );
      const permissions = validateGrants(role.permissions.map((capability) => ({ capability })));
      await transaction("dmmarket_auth_roles").insert({ id: role.id, name: role.name });
      await transaction("dmmarket_auth_role_capabilities").insert(
        permissions.map((permission) => ({ role_id: role.id, ...permission })),
      );
      await appendEvent(transaction, {
        targetRoleId: role.id,
        action: "auth.default_role_created",
        reason: "installation-default-role",
        occurredMs: Date.now(),
      });
    }
  });
};
