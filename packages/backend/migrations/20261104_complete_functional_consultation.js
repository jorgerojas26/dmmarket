const { randomUUID } = require("node:crypto");
const capabilities = {
  "sales.dashboard.read": {
    assigned: true,
  },
  "sales.dashboard.financial": {
    assigned: true,
  },
  "sales.breakdown.read": {
    assigned: true,
  },
  "sales.breakdown.financial": {
    assigned: true,
  },
  "sales.dispatch.read": {
    assigned: true,
  },
  "sales.dispatch.amounts": {
    assigned: true,
  },
  "sales.dispatch.financial": {
    assigned: true,
  },
  "sales.dispatch.personal": {
    assigned: true,
  },
  "purchases.dashboard.read": {
    assigned: false,
  },
  "purchases.breakdown.read": {
    assigned: false,
  },
  "clients.dashboard.read": {
    assigned: true,
  },
  "clients.dashboard.financial": {
    assigned: true,
  },
  "clients.directory.read": {
    assigned: true,
  },
  "clients.directory.financial": {
    assigned: true,
  },
  "clients.details.read": {
    assigned: true,
  },
  "clients.details.financial": {
    assigned: true,
  },
  "clients.documents.read": {
    assigned: true,
  },
  "clients.documents.financial": {
    assigned: true,
  },
  "clients.receivables.read": {
    assigned: false,
  },
  "clients.receivables.payment": {
    assigned: false,
  },
  "clients.receivables.void": {
    assigned: false,
  },
  "clients.receivables.close": {
    assigned: false,
  },
  "sellers.dashboard.read": {
    assigned: true,
  },
  "sellers.dashboard.financial": {
    assigned: true,
  },
  "sellers.directory.read": {
    assigned: true,
  },
  "sellers.directory.financial": {
    assigned: true,
  },
  "sellers.details.read": {
    assigned: true,
  },
  "sellers.details.financial": {
    assigned: true,
  },
  "sellers.documents.read": {
    assigned: true,
  },
  "sellers.documents.financial": {
    assigned: true,
  },
  "sellers.commissions.read": {
    assigned: true,
  },
  "sellers.commissions.financial": {
    assigned: true,
  },
  "sellers.commissions.update": {
    assigned: false,
  },
  "providers.directory.read": {
    assigned: true,
  },
  "providers.directory.financial": {
    assigned: true,
  },
  "providers.details.read": {
    assigned: true,
  },
  "providers.details.financial": {
    assigned: true,
  },
  "providers.sales.read": {
    assigned: true,
  },
  "providers.sales.financial": {
    assigned: true,
  },
  "providers.purchases.read": {
    assigned: false,
  },
  "providers.clients.read": {
    assigned: true,
  },
  "providers.clients.financial": {
    assigned: true,
  },
  "providers.sellers.read": {
    assigned: true,
  },
  "providers.sellers.financial": {
    assigned: true,
  },
  "providers.products.read": {
    assigned: true,
  },
  "providers.products.financial": {
    assigned: true,
  },
  "inventory.stock.read": {
    assigned: false,
  },
  "inventory.stock.amounts": {
    assigned: false,
  },
  "settings.preferences.read": {
    assigned: false,
  },
  "settings.preferences.update": {
    assigned: false,
  },
  "settings.currency.read": {
    assigned: false,
  },
  "settings.currency.update": {
    assigned: false,
  },
  "settings.rates.read": {
    assigned: false,
  },
  "settings.rates.sync": {
    assigned: false,
  },
  "settings.backups.read": {
    assigned: false,
  },
  "settings.backups.create": {
    assigned: false,
  },
  "settings.updates.read": {
    assigned: false,
  },
  "settings.updates.execute": {
    assigned: false,
  },
  "settings.cache.read": {
    assigned: false,
  },
  "settings.cache.clear": {
    assigned: false,
  },
  "access.users.read": {
    assigned: false,
  },
  "access.users.create": {
    assigned: false,
  },
  "access.users.update": {
    assigned: false,
  },
  "access.roles.read": {
    assigned: false,
  },
  "access.roles.create": {
    assigned: false,
  },
  "access.roles.update": {
    assigned: false,
  },
  "access.roles.assign": {
    assigned: false,
  },
  "access.links.read": {
    assigned: false,
  },
  "access.links.update": {
    assigned: false,
  },
  "access.recovery.read": {
    assigned: false,
  },
  "access.recovery.execute": {
    assigned: false,
  },
  "audit.events.read": {
    assigned: false,
  },
};
const previous = [
  "sales.dashboard.read",
  "sales.dashboard.amounts",
  "sales.dashboard.financial",
  "sales.breakdown.read",
  "sales.breakdown.amounts",
  "sales.breakdown.financial",
  "sales.breakdown.personal",
  "sales.breakdown.export",
  "sales.dispatch.read",
  "sales.dispatch.amounts",
  "sales.dispatch.financial",
  "sales.dispatch.personal",
  "sales.dispatch.export",
  "sales.pareto.read",
  "sales.pareto.amounts",
  "sales.pareto.financial",
  "sales.pareto.inventory",
  "sales.pareto.export",
  "sales.unsold.read",
  "sales.unsold.amounts",
  "sales.unsold.inventory",
  "sales.unsold.export",
  "purchases.dashboard.read",
  "purchases.dashboard.amounts",
  "purchases.dashboard.export",
  "purchases.breakdown.read",
  "purchases.breakdown.amounts",
  "purchases.breakdown.export",
  "clients.dashboard.read",
  "clients.dashboard.amounts",
  "clients.dashboard.financial",
  "clients.dashboard.export",
  "clients.directory.read",
  "clients.directory.amounts",
  "clients.directory.financial",
  "clients.directory.personal",
  "clients.directory.export",
  "clients.details.read",
  "clients.details.amounts",
  "clients.details.financial",
  "clients.documents.read",
  "clients.documents.amounts",
  "clients.documents.financial",
  "clients.documents.personal",
  "clients.documents.export",
  "clients.inactive.read",
  "clients.inactive.amounts",
  "clients.inactive.export",
  "clients.receivables.read",
  "clients.receivables.amounts",
  "clients.receivables.personal",
  "clients.receivables.export",
  "clients.receivables.payment",
  "clients.receivables.void",
  "clients.receivables.close",
  "clients.receivables.reopen",
  "sellers.dashboard.read",
  "sellers.dashboard.amounts",
  "sellers.dashboard.financial",
  "sellers.dashboard.personal",
  "sellers.directory.read",
  "sellers.directory.amounts",
  "sellers.directory.financial",
  "sellers.directory.personal",
  "sellers.directory.export",
  "sellers.details.read",
  "sellers.details.amounts",
  "sellers.details.financial",
  "sellers.details.personal",
  "sellers.documents.read",
  "sellers.documents.amounts",
  "sellers.documents.financial",
  "sellers.documents.personal",
  "sellers.documents.export",
  "sellers.commissions.read",
  "sellers.commissions.amounts",
  "sellers.commissions.financial",
  "sellers.commissions.update",
  "providers.directory.read",
  "providers.directory.amounts",
  "providers.directory.financial",
  "providers.directory.export",
  "providers.details.read",
  "providers.details.amounts",
  "providers.details.financial",
  "providers.sales.read",
  "providers.sales.amounts",
  "providers.sales.financial",
  "providers.sales.personal",
  "providers.sales.export",
  "providers.purchases.read",
  "providers.purchases.amounts",
  "providers.purchases.export",
  "providers.clients.read",
  "providers.clients.amounts",
  "providers.clients.financial",
  "providers.clients.personal",
  "providers.clients.export",
  "providers.sellers.read",
  "providers.sellers.amounts",
  "providers.sellers.financial",
  "providers.sellers.personal",
  "providers.sellers.export",
  "providers.products.read",
  "providers.products.amounts",
  "providers.products.financial",
  "providers.products.export",
  "inventory.stock.read",
  "inventory.stock.amounts",
  "inventory.stock.export",
  "settings.preferences.read",
  "settings.preferences.update",
  "settings.currency.read",
  "settings.currency.update",
  "settings.rates.read",
  "settings.rates.sync",
  "settings.backups.read",
  "settings.backups.create",
  "settings.updates.read",
  "settings.updates.execute",
  "settings.cache.read",
  "settings.cache.clear",
  "access.users.read",
  "access.users.create",
  "access.users.update",
  "access.roles.read",
  "access.roles.create",
  "access.roles.update",
  "access.roles.assign",
  "access.links.read",
  "access.links.update",
  "access.recovery.read",
  "access.recovery.execute",
  "audit.events.read",
];
const aliases = {
  "sales.pareto": "sales.dashboard",
  "sales.unsold": "sales.dashboard",
  "clients.inactive": "clients.dashboard",
};
const roles = [
  {
    id: "9a5f7364-12b7-4ff2-8f0e-4f4723c73105",
    name: "Superusuario",
    permissions: [
      "sales.dashboard.read",
      "sales.dashboard.financial",
      "sales.breakdown.read",
      "sales.breakdown.financial",
      "sales.dispatch.read",
      "sales.dispatch.amounts",
      "sales.dispatch.financial",
      "sales.dispatch.personal",
      "purchases.dashboard.read",
      "purchases.breakdown.read",
      "clients.dashboard.read",
      "clients.dashboard.financial",
      "clients.directory.read",
      "clients.directory.financial",
      "clients.details.read",
      "clients.details.financial",
      "clients.documents.read",
      "clients.documents.financial",
      "clients.receivables.read",
      "clients.receivables.payment",
      "clients.receivables.void",
      "clients.receivables.close",
      "sellers.dashboard.read",
      "sellers.dashboard.financial",
      "sellers.directory.read",
      "sellers.directory.financial",
      "sellers.details.read",
      "sellers.details.financial",
      "sellers.documents.read",
      "sellers.documents.financial",
      "sellers.commissions.read",
      "sellers.commissions.financial",
      "sellers.commissions.update",
      "providers.directory.read",
      "providers.directory.financial",
      "providers.details.read",
      "providers.details.financial",
      "providers.sales.read",
      "providers.sales.financial",
      "providers.purchases.read",
      "providers.clients.read",
      "providers.clients.financial",
      "providers.sellers.read",
      "providers.sellers.financial",
      "providers.products.read",
      "providers.products.financial",
      "inventory.stock.read",
      "inventory.stock.amounts",
      "settings.preferences.read",
      "settings.preferences.update",
      "settings.currency.read",
      "settings.currency.update",
      "settings.rates.read",
      "settings.rates.sync",
      "settings.backups.read",
      "settings.backups.create",
      "settings.updates.read",
      "settings.updates.execute",
      "settings.cache.read",
      "settings.cache.clear",
      "access.users.read",
      "access.users.create",
      "access.users.update",
      "access.roles.read",
      "access.roles.create",
      "access.roles.update",
      "access.roles.assign",
      "access.links.read",
      "access.links.update",
      "access.recovery.read",
      "access.recovery.execute",
      "audit.events.read",
    ],
  },
  {
    id: "9a5f7364-12b7-4ff2-8f0e-4f4723c73101",
    name: "Administrador",
    permissions: [
      "sales.dashboard.read",
      "sales.dashboard.financial",
      "sales.breakdown.read",
      "sales.breakdown.financial",
      "sales.dispatch.read",
      "sales.dispatch.amounts",
      "sales.dispatch.financial",
      "sales.dispatch.personal",
      "purchases.dashboard.read",
      "purchases.breakdown.read",
      "clients.dashboard.read",
      "clients.dashboard.financial",
      "clients.directory.read",
      "clients.directory.financial",
      "clients.details.read",
      "clients.details.financial",
      "clients.documents.read",
      "clients.documents.financial",
      "clients.receivables.read",
      "clients.receivables.payment",
      "clients.receivables.void",
      "clients.receivables.close",
      "sellers.dashboard.read",
      "sellers.dashboard.financial",
      "sellers.directory.read",
      "sellers.directory.financial",
      "sellers.details.read",
      "sellers.details.financial",
      "sellers.documents.read",
      "sellers.documents.financial",
      "sellers.commissions.read",
      "sellers.commissions.financial",
      "providers.directory.read",
      "providers.directory.financial",
      "providers.details.read",
      "providers.details.financial",
      "providers.sales.read",
      "providers.sales.financial",
      "providers.purchases.read",
      "providers.clients.read",
      "providers.clients.financial",
      "providers.sellers.read",
      "providers.sellers.financial",
      "providers.products.read",
      "providers.products.financial",
      "inventory.stock.read",
      "inventory.stock.amounts",
      "settings.preferences.read",
      "settings.preferences.update",
      "settings.currency.read",
      "settings.currency.update",
      "settings.rates.read",
      "access.users.read",
      "access.users.create",
      "access.users.update",
      "access.roles.read",
      "access.roles.create",
      "access.roles.update",
      "access.roles.assign",
      "access.links.read",
      "access.links.update",
    ],
  },
  {
    id: "9a5f7364-12b7-4ff2-8f0e-4f4723c73103",
    name: "Consultor",
    permissions: ["sales.dashboard.read", "inventory.stock.read"],
  },
  {
    id: "9a5f7364-12b7-4ff2-8f0e-4f4723c73104",
    name: "Cobranza",
    permissions: ["clients.receivables.read", "clients.receivables.payment"],
  },
];
exports.config = { transaction: false, scope: "dmmarket" };
exports.up = async (db) => {
  if (!(await db.schema.hasTable("dmmarket_auth_role_permissions"))) return;
  const tables = [
    "dmmarket_auth_control",
    "dmmarket_auth_roles",
    "dmmarket_auth_role_permissions",
    "dmmarket_auth_users",
    "dmmarket_auth_session_state",
    "dmmarket_auth_events",
  ];
  const schema = await db("information_schema.TABLES")
    .whereRaw("TABLE_SCHEMA = DATABASE()")
    .whereIn("TABLE_NAME", tables)
    .select("ENGINE", "TABLE_COLLATION");
  if (
    schema.length !== tables.length ||
    schema.some((table) => table.ENGINE !== "InnoDB" || table.TABLE_COLLATION !== "utf8_bin")
  )
    throw new Error("Prepara las tablas de acceso InnoDB/utf8_bin antes de simplificar el catálogo.");
  await db.transaction(async (tx) => {
    if (!(await tx("dmmarket_auth_control").where("id", 1).forUpdate().first()))
      throw new Error("Falta el control transaccional de acceso.");
    const grants = await tx("dmmarket_auth_role_permissions").select("role_id", "capability", "scope");
    const converted = new Map();
    for (const grant of grants) {
      if (!previous.includes(grant.capability) && !Object.hasOwn(capabilities, grant.capability))
        throw new Error("El catálogo contiene un permiso desconocido; no se modificaron concesiones.");
      let capability = grant.capability;
      const parts = capability.split(".");
      const resource = parts.slice(0, 2).join(".");
      if (aliases[resource]) capability = `${aliases[resource]}.${parts[2]}`;
      if (capability === "clients.receivables.reopen") capability = "clients.receivables.void";
      if (!Object.hasOwn(capabilities, capability)) continue;
      if (
        !["global", "assigned"].includes(grant.scope) ||
        (grant.scope === "assigned" && !capabilities[capability].assigned)
      )
        throw new Error("Alcance no admitido en la conversión del catálogo.");
      const key = `${grant.role_id}:${capability}`;
      if (converted.get(key)?.scope !== "global") converted.set(key, { ...grant, capability });
    }
    await tx("dmmarket_auth_role_permissions").delete();
    for (const grant of converted.values()) await tx("dmmarket_auth_role_permissions").insert(grant);
    for (const role of roles) {
      if (!(await tx("dmmarket_auth_roles").where("id", role.id).first())) continue;
      await tx("dmmarket_auth_role_permissions").where("role_id", role.id).delete();
      await tx("dmmarket_auth_role_permissions").insert(
        role.permissions.map((capability) => ({ role_id: role.id, capability, scope: "global" })),
      );
    }
    const now = Date.now();
    await tx("dmmarket_auth_users").increment("session_version", 1);
    await tx("dmmarket_auth_session_state").update({ pending_mfa_secret: null, pending_mfa_expires_ms: null });
    await tx("dmmarket_auth_session_state")
      .whereNull("revoked_ms")
      .update({ revoked_ms: now, revocation_reason: "complete-functional-consultation" });
    await tx("dmmarket_auth_events").insert({
      id: randomUUID(),
      actor_id: null,
      target_user_id: null,
      target_role_id: null,
      action: "auth.permission_catalog_simplified",
      outcome: "success",
      reason: "complete-consultation-independent-business-actions",
      occurred_ms: now,
    });
  });
};
exports.down = async () => {
  throw new Error("La consulta fragmentada anterior no se restaura automáticamente.");
};
