const { validateGrants } = require("../auth/capabilities");
const { assertAuthSchema, lockAccessMutation, appendEvent } = require("../auth/identity");

const roles = [
  {
    id: "9a5f7364-12b7-4ff2-8f0e-4f4723c73101",
    name: "Dirección",
    permissions: [
      "sales.read",
      "sales.financial",
      "sales.export",
      "clients.read",
      "clients.personal",
      "clients.export",
      "sellers.read",
      "sellers.personal",
      "sellers.export",
      "providers.read",
      "providers.export",
      "purchases.read",
      "purchases.costs",
      "purchases.export",
      "inventory.read",
      "inventory.costs",
      "inventory.export",
      "receivables.read",
      "receivables.export",
      "receivables.payment",
      "receivables.void",
      "receivables.close",
      "receivables.reopen",
      "rates.read",
      "access.users",
      "access.roles",
      "access.links",
    ],
  },
  {
    id: "9a5f7364-12b7-4ff2-8f0e-4f4723c73102",
    name: "Administración técnica",
    permissions: [
      "access.users",
      "access.roles",
      "access.links",
      "access.recover",
      "rates.read",
      "rates.sync",
      "backups.read",
      "backups.create",
      "updates.read",
      "updates.execute",
      "cache.clear",
      "audit.read",
    ],
  },
  {
    id: "9a5f7364-12b7-4ff2-8f0e-4f4723c73103",
    name: "Consulta operativa",
    permissions: ["sales.read", "inventory.read"],
  },
  {
    id: "9a5f7364-12b7-4ff2-8f0e-4f4723c73104",
    name: "Cobranza",
    permissions: ["receivables.read", "receivables.payment"],
  },
];

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
      const permissions = validateGrants(role.permissions.map((capability) => ({ capability, scope: "global" })));
      await transaction("dmmarket_auth_roles").insert({ id: role.id, name: role.name });
      await transaction("dmmarket_auth_role_permissions").insert(
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
