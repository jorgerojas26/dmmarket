const { createMongoAbility, subject } = require("@casl/ability");

const { CAPABILITIES, RESOURCES } = require("@dmmarket/permissions");

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
  const dependencies = (capability) => {
    const definition = CAPABILITIES[capability];
    if (!definition) return [];
    return [
      capability,
      ...(definition.action === "read" ? [] : [`${definition.resource}.read`]),
      ...(!RESOURCES[definition.resource].completeConsultation && ["financial", "inventory"].includes(definition.action)
        ? [`${definition.resource}.amounts`]
        : []),
    ];
  };
  const hasGlobal = (capability) =>
    Object.hasOwn(CAPABILITIES, capability) && dependencies(capability).every((key) => scopes.get(key) === "global");
  const canRecord = (capability, recordSellerId) => {
    if (!Object.hasOwn(CAPABILITIES, capability)) return false;
    return dependencies(capability).every((key) =>
      ability.can(key, subject("record", { sellerId: sellerId(recordSellerId) })),
    );
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
        sellerIds: hasGlobal(capability) ? [] : sellers.filter((id) => canRecord(capability, id)),
      };
    },
  });
}

module.exports = { CAPABILITIES, createAccess, validateGrants };
