const { createMongoAbility, subject } = require("@casl/ability");

const DEFINITIONS = {
  "sales.read": { assigned: true },
  "sales.costs": { assigned: true },
  "sales.profit": { assigned: true },
  "sales.export": { assigned: true },
  "clients.read": {},
  "clients.personal": {},
  "sellers.read": { assigned: true },
  "sellers.personal": { assigned: true },
  "commissions.read": { assigned: true },
  "commissions.update": { privileged: true },
  "receivables.read": {},
  "receivables.payment": { privileged: true },
  "receivables.void": { privileged: true },
  "receivables.close": { privileged: true },
  "receivables.reopen": { privileged: true },
  "purchases.read": {},
  "purchases.costs": {},
  "purchases.export": {},
  "providers.read": {},
  "providers.personal": {},
  "providers.export": {},
  "inventory.read": {},
  "inventory.costs": {},
  "inventory.export": {},
  "rates.read": {},
  "rates.sync": { privileged: true },
  "cache.clear": { privileged: true },
  "backups.read": {},
  "backups.create": { privileged: true },
  "updates.read": {},
  "updates.execute": { privileged: true },
  "access.users": { privileged: true },
  "access.roles": { privileged: true },
  "access.links": { privileged: true },
  "access.recover": { privileged: true },
  "audit.read": {},
};

const CAPABILITIES = Object.freeze(
  Object.fromEntries(
    Object.entries(DEFINITIONS).map(([name, options]) => [
      name,
      Object.freeze({ assigned: options.assigned === true, privileged: options.privileged === true }),
    ]),
  ),
);

function sellerId(value) {
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return String(value);
  if (typeof value === "string" && /^[\p{L}\p{N}._-]{1,32}$/u.test(value)) return value;
  return null;
}

function validateGrants(grants) {
  if (!Array.isArray(grants)) throw new TypeError("Las concesiones deben ser una lista.");
  return grants.map((grant) => {
    if (
      !grant ||
      !Object.hasOwn(CAPABILITIES, grant.capability) ||
      !["global", "assigned"].includes(grant.scope) ||
      (grant.scope === "assigned" && !CAPABILITIES[grant.capability].assigned)
    ) {
      throw new TypeError("La capacidad o su alcance no están admitidos.");
    }
    return { capability: grant.capability, scope: grant.scope };
  });
}

function createAccess(grants, linkedSellerIds) {
  const validated = validateGrants(grants);
  if (!Array.isArray(linkedSellerIds)) throw new TypeError("Los vínculos deben ser una lista.");
  const normalized = linkedSellerIds.map(sellerId);
  const sellers = normalized.includes(null) ? [] : [...new Set(normalized)];
  const scopes = new Map();
  const rules = [];
  for (const { capability, scope } of validated) {
    if (scope === "assigned" && sellers.length === 0) continue;
    if (scopes.get(capability) !== "global") scopes.set(capability, scope);
    rules.push({
      action: capability,
      subject: "record",
      ...(scope === "assigned" ? { conditions: { sellerId: { $in: sellers } } } : {}),
    });
  }
  const ability = createMongoAbility(rules);
  const hasGlobal = (capability) => scopes.get(capability) === "global";
  const canRecord = (capability, recordSellerId) => {
    if (!Object.hasOwn(CAPABILITIES, capability)) return false;
    return ability.can(capability, subject("record", { sellerId: sellerId(recordSellerId) }));
  };
  return Object.freeze({
    privileged: validated.some(({ capability }) => CAPABILITIES[capability].privileged),
    hasGlobal,
    canRecord,
    covers(capability, recordSellerIds) {
      if (hasGlobal(capability)) return true;
      return (
        Array.isArray(recordSellerIds) &&
        recordSellerIds.length > 0 &&
        recordSellerIds.every((id) => canRecord(capability, id))
      );
    },
    scopeFor(capability) {
      return {
        global: hasGlobal(capability),
        sellerIds: scopes.get(capability) === "assigned" ? [...sellers] : [],
      };
    },
  });
}

module.exports = { CAPABILITIES, createAccess, validateGrants };
