const { randomUUID } = require("node:crypto");
const capabilities = {
  "sales.dashboard.read": { sellerScoped: true },
  "sales.dashboard.financial": { sellerScoped: true },
  "sales.breakdown.read": { sellerScoped: true },
  "sales.breakdown.financial": { sellerScoped: true },
  "sales.dispatch.read": { sellerScoped: true },
  "sales.dispatch.amounts": { sellerScoped: true },
  "sales.dispatch.financial": { sellerScoped: true },
  "sales.dispatch.personal": { sellerScoped: true },
  "sales.others.read": {},
  "purchases.dashboard.read": {},
  "purchases.breakdown.read": {},
  "clients.dashboard.read": { sellerScoped: true },
  "clients.dashboard.financial": { sellerScoped: true },
  "clients.directory.read": { sellerScoped: true },
  "clients.directory.financial": { sellerScoped: true },
  "clients.details.read": { sellerScoped: true },
  "clients.details.financial": { sellerScoped: true },
  "clients.documents.read": { sellerScoped: true },
  "clients.documents.financial": { sellerScoped: true },
  "clients.receivables.read": { requiresAllSellers: true },
  "clients.receivables.payment": { requiresAllSellers: true, privileged: true },
  "clients.receivables.void": { requiresAllSellers: true, privileged: true },
  "clients.receivables.close": { requiresAllSellers: true, privileged: true },
  "sellers.dashboard.read": { sellerScoped: true },
  "sellers.dashboard.financial": { sellerScoped: true },
  "sellers.directory.read": { sellerScoped: true },
  "sellers.directory.financial": { sellerScoped: true },
  "sellers.details.read": { sellerScoped: true },
  "sellers.details.financial": { sellerScoped: true },
  "sellers.documents.read": { sellerScoped: true },
  "sellers.documents.financial": { sellerScoped: true },
  "sellers.commissions.read": { sellerScoped: true },
  "sellers.commissions.financial": { sellerScoped: true },
  "sellers.commissions.update": { sellerScoped: true, privileged: true },
  "providers.directory.read": { sellerScoped: true },
  "providers.directory.financial": { sellerScoped: true },
  "providers.details.read": { sellerScoped: true },
  "providers.details.financial": { sellerScoped: true },
  "providers.sales.read": { sellerScoped: true },
  "providers.sales.financial": { sellerScoped: true },
  "providers.purchases.read": {},
  "providers.clients.read": { sellerScoped: true },
  "providers.clients.financial": { sellerScoped: true },
  "providers.sellers.read": { sellerScoped: true },
  "providers.sellers.financial": { sellerScoped: true },
  "providers.products.read": { sellerScoped: true },
  "providers.products.financial": { sellerScoped: true },
  "inventory.stock.read": {},
  "inventory.stock.amounts": {},
  "settings.preferences.read": {},
  "settings.preferences.update": { privileged: true },
  "settings.currency.read": {},
  "settings.currency.update": { privileged: true },
  "settings.rates.read": {},
  "settings.rates.sync": { privileged: true },
  "settings.backups.read": {},
  "settings.backups.create": { privileged: true },
  "settings.updates.read": {},
  "settings.updates.execute": { privileged: true },
  "settings.cache.read": {},
  "settings.cache.clear": { privileged: true },
  "access.users.read": {},
  "access.users.create": { privileged: true },
  "access.users.update": { privileged: true },
  "access.roles.read": {},
  "access.roles.create": { privileged: true },
  "access.roles.update": { privileged: true },
  "access.roles.assign": { privileged: true },
  "access.profile.read": {},
  "access.profile.update": { privileged: true },
  "access.recovery.read": {},
  "access.recovery.execute": { privileged: true },
  "audit.events.read": {},
};

exports.config = { transaction: false, scope: "dmmarket" };
const sellerRoleId = "9a5f7364-12b7-4ff2-8f0e-4f4723c73106";
const sellerPermissions = [
  "sales.dashboard.read",
  "sales.breakdown.read",
  "sales.dispatch.read",
  "clients.dashboard.read",
  "clients.directory.read",
  "clients.details.read",
  "clients.documents.read",
  "sellers.directory.read",
  "sellers.details.read",
  "sellers.documents.read",
  "sellers.commissions.read",
];

function capabilityName(capability) {
  return capability.replace(/^access\.links\./, "access.profile.");
}

function mixed(grants) {
  const effective = new Map();
  for (const grant of grants) {
    const capability = capabilityName(grant.capability);
    const definition = capabilities[capability];
    if (
      !Object.hasOwn(capabilities, capability) ||
      grant.capability === "sales.others.read" ||
      grant.capability.startsWith("access.profile.")
    )
      throw new Error("El catálogo contiene un permiso desconocido; revisa la migración antes de continuar.");
    if (
      !["global", "assigned"].includes(grant.scope) ||
      (grant.scope === "assigned" && (!definition.sellerScoped || definition.privileged))
    )
      throw new Error("El catálogo contiene un alcance no admitido.");
    if (!definition.sellerScoped && !definition.requiresAllSellers) continue;
    if (effective.get(capability) !== "global") effective.set(capability, grant.scope);
  }
  return new Set(effective.values()).size > 1;
}

async function plan(connection) {
  const grants = await connection("dmmarket_auth_role_permissions").select("role_id", "capability", "scope");
  const links = await connection("dmmarket_auth_user_sellers").select("user_id", "seller_id");
  const userSellers = new Map();
  const sellerUsers = new Map();
  for (const link of links) {
    if (userSellers.has(link.user_id) && userSellers.get(link.user_id) !== link.seller_id)
      throw new Error(`La cuenta ${link.user_id} tiene varios vendedores; resuelve su identidad antes de migrar.`);
    if (sellerUsers.has(link.seller_id) && sellerUsers.get(link.seller_id) !== link.user_id)
      throw new Error(
        `El vendedor ${link.seller_id} aparece en varias cuentas; resuelve la identidad antes de migrar.`,
      );
    if (typeof link.seller_id !== "string" || !/^[\p{L}\p{N}._-]{1,32}$/u.test(link.seller_id))
      throw new Error("Una identidad comercial heredada no es válida.");
    userSellers.set(link.user_id, link.seller_id);
    sellerUsers.set(link.seller_id, link.user_id);
  }
  const byRole = new Map();
  for (const grant of grants) {
    if (!byRole.has(grant.role_id)) byRole.set(grant.role_id, []);
    byRole.get(grant.role_id).push(grant);
  }
  const converted = new Map();
  for (const [roleId, permissions] of byRole) {
    if (mixed(permissions))
      throw new Error(`El rol ${roleId} tiene alcances mezclados; la migración no ampliará sus permisos.`);
    let others = false;
    for (const grant of permissions) {
      const capability = capabilityName(grant.capability);
      const definition = capabilities[capability];
      converted.set(`${roleId}:${capability}`, { role_id: roleId, capability });
      if (grant.scope === "global" && (definition.sellerScoped || definition.requiresAllSellers)) others = true;
    }
    if (others) converted.set(`${roleId}:sales.others.read`, { role_id: roleId, capability: "sales.others.read" });
  }
  const assignments = await connection("dmmarket_auth_user_roles").select("user_id", "role_id");
  const byUser = new Map();
  for (const assignment of assignments) {
    if (!byUser.has(assignment.user_id)) byUser.set(assignment.user_id, []);
    byUser.get(assignment.user_id).push(...(byRole.get(assignment.role_id) || []));
  }
  for (const [userId, permissions] of byUser)
    if (mixed(permissions))
      throw new Error(`La cuenta ${userId} combina alcances mezclados entre roles; requiere revisión antes de migrar.`);
  const users = Number((await connection("dmmarket_auth_users").count("* as total").first()).total);
  const roles = Number((await connection("dmmarket_auth_roles").count("* as total").first()).total);
  const createSellerRole =
    (users > 0 || roles > 0) && !(await connection("dmmarket_auth_roles").where("id", sellerRoleId).first());
  if (createSellerRole && (await connection("dmmarket_auth_roles").where("name", "Vendedor").first()))
    throw new Error("Ya existe un rol Vendedor con otro identificador; revisa el conflicto antes de migrar.");
  return { grants: [...converted.values()], profiles: links, createSellerRole };
}

exports.up = async (db) => {
  if (!(await db.schema.hasTable("dmmarket_auth_users"))) return;
  const hasVersion = await db.schema.hasColumn("dmmarket_auth_control", "commercial_model");
  if (hasVersion && Number((await db("dmmarket_auth_control").where("id", 1).first())?.commercial_model) === 1) return;
  const tables = [
    "dmmarket_auth_control",
    "dmmarket_auth_users",
    "dmmarket_auth_roles",
    "dmmarket_auth_role_permissions",
    "dmmarket_auth_user_roles",
    "dmmarket_auth_user_sellers",
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
    throw new Error("Prepara las tablas de acceso InnoDB/utf8_bin antes de migrar identidades comerciales.");
  await plan(db);
  if (!hasVersion)
    await db.schema.alterTable("dmmarket_auth_control", (table) =>
      table.integer("commercial_model").notNullable().defaultTo(0),
    );
  if (!(await db.schema.hasTable("dmmarket_auth_role_capabilities"))) {
    await db.schema.createTable("dmmarket_auth_role_capabilities", (table) => {
      table.engine("InnoDB");
      table.charset("utf8");
      table.collate("utf8_bin");
      table.string("role_id", 36).notNullable().references("id").inTable("dmmarket_auth_roles");
      table.string("capability", 64).notNullable();
      table.primary(["role_id", "capability"]);
    });
  }
  if (!(await db.schema.hasTable("dmmarket_auth_commercial_profiles"))) {
    await db.schema.createTable("dmmarket_auth_commercial_profiles", (table) => {
      table.engine("InnoDB");
      table.charset("utf8");
      table.collate("utf8_bin");
      table.string("user_id", 36).primary().references("id").inTable("dmmarket_auth_users");
      table.string("seller_id", 32).notNullable().unique();
    });
  }
  const prepared = await db("information_schema.TABLES")
    .whereRaw("TABLE_SCHEMA = DATABASE()")
    .whereIn("TABLE_NAME", ["dmmarket_auth_role_capabilities", "dmmarket_auth_commercial_profiles"])
    .select("ENGINE", "TABLE_COLLATION");
  if (
    prepared.length !== 2 ||
    prepared.some((table) => table.ENGINE !== "InnoDB" || table.TABLE_COLLATION !== "utf8_bin")
  )
    throw new Error("Las nuevas tablas comerciales deben usar InnoDB/utf8_bin.");
  await db.transaction(async (connection) => {
    const control = await connection("dmmarket_auth_control").where("id", 1).forUpdate().first();
    if (!control) throw new Error("Falta el control transaccional de acceso.");
    if (Number(control.commercial_model) === 1) return;
    const conversion = await plan(connection);
    for (const table of ["dmmarket_auth_role_capabilities", "dmmarket_auth_commercial_profiles"])
      if (Number((await connection(table).count("* as total").first()).total))
        throw new Error("El nuevo modelo contiene datos sin una migración confirmada; requiere revisión.");
    if (conversion.createSellerRole) {
      await connection("dmmarket_auth_roles").insert({ id: sellerRoleId, name: "Vendedor" });
      await connection("dmmarket_auth_role_capabilities").insert(
        sellerPermissions.map((capability) => ({ role_id: sellerRoleId, capability })),
      );
    }
    for (const grant of conversion.grants) await connection("dmmarket_auth_role_capabilities").insert(grant);
    for (const profile of conversion.profiles) await connection("dmmarket_auth_commercial_profiles").insert(profile);
    const now = Date.now();
    await connection("dmmarket_auth_users").increment("session_version", 1);
    await connection("dmmarket_auth_session_state").update({ pending_mfa_secret: null, pending_mfa_expires_ms: null });
    await connection("dmmarket_auth_session_state")
      .whereNull("revoked_ms")
      .update({ revoked_ms: now, revocation_reason: "commercial-identity" });
    if (Number((await connection("dmmarket_auth_users").count("* as total").first()).total))
      await connection("dmmarket_auth_events").insert({
        id: randomUUID(),
        actor_id: null,
        target_user_id: null,
        target_role_id: null,
        action: "auth.commercial_identity_migrated",
        outcome: "success",
        reason: "individual-profile-binary-permissions",
        occurred_ms: now,
      });
    await connection("dmmarket_auth_control").where("id", 1).update({ commercial_model: 1 });
  });
};

exports.down = async () => {
  throw new Error(
    "La identidad comercial individual no se revierte automáticamente; conserva los archivos anteriores y revisa las cuentas en mantenimiento.",
  );
};
