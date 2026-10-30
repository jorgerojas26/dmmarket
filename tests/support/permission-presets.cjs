const { CAPABILITIES, RESOURCES, RESOURCE_ALIASES, permissionKey } = require("../../packages/permissions");
const resources = (module, action) =>
  Object.keys(RESOURCES)
    .filter((resource) => RESOURCES[resource].module === module && Object.hasOwn(CAPABILITIES, `${resource}.${action}`))
    .map((resource) => `${resource}.${action}`);
const presets = {
  "sales.read": ["dashboard", "breakdown", "dispatch"].flatMap((resource) =>
    ["read", "amounts"].map((action) => `sales.${resource}.${action}`),
  ),
  "sales.financial": resources("sales", "financial"),
  "sales.export": resources("sales", "export"),
  "clients.read": ["clients.directory.read"],
  "clients.personal": [
    ...resources("clients", "personal"),
    ...resources("sales", "personal"),
    ...resources("providers", "personal"),
  ],
  "clients.export": resources("clients", "export"),
  "sellers.read": ["sellers.directory.read"],
  "sellers.personal": resources("sellers", "personal"),
  "sellers.export": resources("sellers", "export"),
  "providers.read": ["providers.directory.read", "providers.details.read"],
  "providers.export": ["providers.directory.export"],
  "purchases.read": [...resources("purchases", "read"), "providers.purchases.read"],
  "purchases.costs": [...resources("purchases", "amounts"), "providers.purchases.amounts", "sales.unsold.amounts"],
  "purchases.export": [...resources("purchases", "export"), "providers.purchases.export"],
  "inventory.read": ["inventory.stock.read"],
  "inventory.costs": ["inventory.stock.amounts"],
  "inventory.export": ["inventory.stock.export"],
  "commissions.read": ["sellers.commissions.read", "sellers.commissions.amounts"],
  "commissions.update": ["sellers.commissions.update"],
  "receivables.read": ["clients.receivables.read", "clients.receivables.amounts"],
  "receivables.export": ["clients.receivables.export"],
  "receivables.payment": ["clients.receivables.payment"],
  "receivables.void": ["clients.receivables.void"],
  "receivables.close": ["clients.receivables.close"],
  "receivables.reopen": ["clients.receivables.reopen"],
  "preferences.read": ["settings.preferences.read", "settings.currency.read"],
  "preferences.update": ["settings.preferences.update", "settings.currency.update"],
  "rates.read": ["settings.rates.read"],
  "rates.sync": ["settings.rates.read", "settings.rates.sync"],
  "cache.clear": ["settings.cache.read", "settings.cache.clear"],
  "backups.read": ["settings.backups.read"],
  "backups.create": ["settings.backups.read", "settings.backups.create"],
  "updates.read": ["settings.updates.read"],
  "updates.execute": ["settings.updates.execute"],
  "access.users": ["access.users.read", "access.users.create", "access.users.update"],
  "access.roles": ["access.roles.read", "access.roles.create", "access.roles.update", "access.roles.assign"],
  "access.links": ["access.links.read", "access.links.update"],
  "access.recover": ["access.recovery.read", "access.recovery.execute"],
  "audit.read": ["audit.events.read"],
};
function scenarioPermissions(permissions) {
  let result = permissions.flatMap(({ capability, scope }) =>
    (presets[capability] || [capability]).map((key) => ({
      capability: key,
      scope: scope === "assigned" && !CAPABILITIES[permissionKey(key)]?.assigned ? "global" : scope,
    })),
  );
  const find = (capability) => permissions.find((grant) => grant.capability === capability);
  const sales = find("sales.read");
  if (sales) {
    const targets = [];
    if (find("purchases.read")) {
      result.push(
        ...["read", "amounts"].map((action) => ({ capability: `sales.pareto.${action}`, scope: sales.scope })),
      );
      if (find("inventory.read") && find("inventory.costs"))
        result.push({ capability: "sales.pareto.inventory", scope: sales.scope });
    }
    if (sales.scope === "global" && find("purchases.costs") && find("purchases.read")) {
      result.push(...["read", "amounts"].map((action) => ({ capability: `sales.unsold.${action}`, scope: "global" })));
      if (find("inventory.read") && find("inventory.costs"))
        result.push({ capability: "sales.unsold.inventory", scope: "global" });
    }
    if (find("receivables.read")) targets.push("clients.documents");
    if (find("clients.read"))
      targets.push(...["dashboard", "details", "documents", "directory", "inactive"].map((key) => `clients.${key}`));
    if (find("sellers.read"))
      targets.push(...["dashboard", "details", "documents", "directory", "commissions"].map((key) => `sellers.${key}`));
    if (find("providers.read"))
      targets.push(
        ...[
          "directory",
          "details",
          "sales",
          "products",
          ...(find("clients.read") ? ["clients"] : []),
          ...(find("sellers.read") ? ["sellers"] : []),
        ].map((key) => `providers.${key}`),
      );
    if (find("commissions.read")) targets.push("sellers.commissions");
    const targeted = new Set(targets.map((target) => `${target}.read`));
    result = result.filter((grant) => !targeted.has(grant.capability));
    for (const target of targets) {
      const related =
        target.startsWith("sellers.") || target === "providers.sellers"
          ? find("sellers.read") || find("commissions.read")
          : null;
      const readScope = sales.scope === "assigned" || related?.scope === "assigned" ? "assigned" : "global";
      const exporting = target.startsWith("providers.clients")
        ? find("clients.export")
        : target.startsWith("providers.sellers")
          ? find("sellers.export")
          : find("sales.export");
      for (const action of [
        "read",
        "amounts",
        ...(find("sales.financial") ? ["financial"] : []),
        ...(exporting ? ["export"] : []),
      ]) {
        const key = `${target}.${action}`;
        const scope =
          action === "financial" ? find("sales.financial").scope : action === "export" ? exporting.scope : readScope;
        if (CAPABILITIES[key]) result.push({ capability: key, scope: CAPABILITIES[key].assigned ? scope : "global" });
      }
    }
  }

  if (find("providers.read") && find("purchases.costs")) {
    result.push(
      { capability: "providers.directory.amounts", scope: "global" },
      { capability: "providers.details.amounts", scope: "global" },
    );
  }
  result.push(...permissions.filter((grant) => Object.hasOwn(CAPABILITIES, grant.capability)));
  result = result.flatMap((grant) => {
    if (CAPABILITIES[grant.capability]) return [grant];
    const resource = grant.capability.split(".").slice(0, 2).join(".");
    const action = grant.capability.split(".").at(-1);
    if ((RESOURCE_ALIASES[resource] && ["read", "financial"].includes(action)) || action === "reopen") {
      const key = permissionKey(grant.capability);
      return CAPABILITIES[key] ? [{ ...grant, capability: key }] : [];
    }
    return [];
  });
  return [...new Map(result.map((grant) => [`${grant.capability}:${grant.scope}`, grant])).values()];
}
module.exports = { scenarioPermissions };
