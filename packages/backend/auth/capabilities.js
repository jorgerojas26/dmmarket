const { createMongoAbility, subject } = require("@casl/ability");
const { CAPABILITIES, RESOURCES } = require("@dmmarket/permissions");

function sellerId(value) {
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return String(value);
  if (typeof value === "string" && /^[\p{L}\p{N}._-]{1,32}$/u.test(value) && !/[\u{10000}-\u{10FFFF}]/u.test(value))
    return value;
  return null;
}

function validateGrants(grants) {
  if (!Array.isArray(grants)) throw new TypeError("Los permisos deben ser una lista.");
  return grants.map((grant) => {
    if (!grant || !Object.hasOwn(CAPABILITIES, grant.capability) || Object.hasOwn(grant, "scope"))
      throw new TypeError("El permiso no está admitido; los alcances por permiso ya no se utilizan.");
    return { capability: grant.capability };
  });
}

function createAccess(grants, commercialSellerId = null) {
  const validated = validateGrants(grants);
  if (commercialSellerId !== null && !sellerId(commercialSellerId))
    throw new TypeError("El perfil comercial requiere un único vendedor.");
  const identity = sellerId(commercialSellerId);
  const capabilities = new Set(validated.map(({ capability }) => capability));
  const allSellers = capabilities.has("sales.others.read");
  const rules = [];
  for (const capability of capabilities) {
    const definition = CAPABILITIES[capability];
    if (definition.sellerScoped && !allSellers) {
      if (identity) rules.push({ action: capability, subject: "record", conditions: { sellerId: identity } });
    } else rules.push({ action: capability, subject: "record" });
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
    Object.hasOwn(CAPABILITIES, capability) &&
    dependencies(capability).every((key) => {
      const definition = CAPABILITIES[key];
      return capabilities.has(key) && (!definition.sellerScoped || allSellers);
    });
  const canRecord = (capability, recordSellerId) =>
    Object.hasOwn(CAPABILITIES, capability) &&
    dependencies(capability).every((key) =>
      ability.can(key, subject("record", { sellerId: sellerId(recordSellerId) })),
    );
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
        sellerIds: !hasGlobal(capability) && identity && canRecord(capability, identity) ? [identity] : [],
      };
    },
  });
}

module.exports = { CAPABILITIES, createAccess, validateGrants, sellerId };
