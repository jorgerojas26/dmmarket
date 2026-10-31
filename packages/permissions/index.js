const DEFINITIONS = [
  [
    "sales",
    "Ventas",
    [
      ["dashboard", "Dashboard", ["amounts", "financial"], [], true],
      ["breakdown", "Desglose", ["amounts", "financial", "personal"], ["export"], true],
      ["dispatch", "Despacho", ["amounts", "financial", "personal"], ["export"], true],
      ["others", "Datos de otros vendedores", [], []],
    ],
  ],
  [
    "purchases",
    "Compras",
    [
      ["dashboard", "Dashboard", ["amounts"], ["export"]],
      ["breakdown", "Desglose", ["amounts"], ["export"]],
    ],
  ],
  [
    "clients",
    "Clientes",
    [
      ["dashboard", "Dashboard", ["amounts", "financial"], ["export"]],
      ["directory", "Desglose", ["amounts", "financial", "personal"], ["export"]],
      ["details", "Resumen del cliente", ["amounts", "financial"], []],
      ["documents", "Documentos del cliente", ["amounts", "financial", "personal"], ["export"]],
      ["receivables", "Cuentas por cobrar", ["amounts", "personal"], ["export", "payment", "void", "close"]],
    ],
  ],
  [
    "sellers",
    "Vendedores",
    [
      ["dashboard", "Dashboard", ["amounts", "financial", "personal"], [], true],
      ["directory", "Desglose", ["amounts", "financial", "personal"], ["export"], true],
      ["details", "Resumen del vendedor", ["amounts", "financial", "personal"], [], true],
      ["documents", "Documentos del vendedor", ["amounts", "financial", "personal"], ["export"], true],
      ["commissions", "Comisiones", ["amounts", "financial"], ["update"], true],
    ],
  ],
  [
    "providers",
    "Proveedores",
    [
      ["directory", "Desglose", ["amounts", "financial"], ["export"]],
      ["details", "Resumen del proveedor", ["amounts", "financial"], []],
      ["sales", "Ventas del proveedor", ["amounts", "financial", "personal"], ["export"], true],
      ["purchases", "Compras del proveedor", ["amounts"], ["export"]],
      ["clients", "Clientes del proveedor", ["amounts", "financial", "personal"], ["export"], true],
      ["sellers", "Vendedores del proveedor", ["amounts", "financial", "personal"], ["export"], true],
      ["products", "Productos del proveedor", ["amounts", "financial"], ["export"], true],
    ],
  ],
  ["inventory", "Inventario", [["stock", "Desglose", ["amounts"], ["export"]]]],
  [
    "settings",
    "Configuración",
    [
      ["preferences", "Tipo de documento", [], ["update"]],
      ["currency", "Moneda del negocio", [], ["update"]],
      ["rates", "Tasas BCV", [], ["sync"]],
      ["backups", "Respaldos", [], ["create"]],
      ["updates", "Actualizaciones", [], ["execute"]],
      ["cache", "Caché de reportes", [], ["clear"]],
    ],
  ],
  [
    "access",
    "Acceso",
    [
      ["users", "Usuarios", [], ["create", "update"]],
      ["roles", "Roles", [], ["create", "update", "assign"]],
      ["profile", "Perfil comercial", [], ["update"]],
      ["recovery", "Recuperación de cuentas", [], ["execute"]],
    ],
  ],
  ["audit", "Auditoría", [["events", "Eventos", [], []]]],
];
const LABELS = {
  read: "Consultar",
  amounts: "Ver importes comerciales",
  financial: "Ver rentabilidad (costos, utilidad y margen)",
  personal: "Ver datos personales",
  inventory: "Ver valoración de inventario",
  export: "Imprimir y exportar",
  update: "Modificar",
  create: "Crear",
  assign: "Asignar roles",
  execute: "Ejecutar",
  sync: "Sincronizar",
  clear: "Vaciar caché",
  payment: "Registrar abonos",
  void: "Anular abonos y cierres",
  close: "Cerrar deuda",
  reopen: "Reabrir deuda",
};
const INFORMATION = ["amounts", "financial", "personal", "inventory"];
const PRIVILEGED = ["update", "create", "assign", "execute", "sync", "clear", "payment", "void", "close", "reopen"];
const NAVIGATION = {
  sales: ["dashboard", "breakdown", "dispatch"],
  purchases: ["dashboard", "breakdown"],
  clients: ["dashboard", "directory", "receivables"],
  sellers: ["dashboard", "directory"],
  providers: ["directory"],
  inventory: ["stock"],
  settings: ["preferences", "currency", "rates", "backups", "updates", "cache"],
  access: ["users", "roles", "profile", "recovery"],
  audit: ["events"],
};
const RESOURCE_ALIASES = {
  "sales.pareto": "sales.dashboard",
  "sales.unsold": "sales.dashboard",
  "clients.inactive": "clients.dashboard",
};
const BUSINESS_MODULES = ["sales", "purchases", "clients", "sellers", "providers", "inventory"];
const OPERATIONAL_RESOURCES = ["sales.dispatch", "inventory.stock"];
const RESOURCES = Object.fromEntries(
  DEFINITIONS.flatMap(([module, moduleLabel, resources]) =>
    resources.map(([key, label, information, actions, sellerScoped = false]) => {
      const resource = `${module}.${key}`;
      const business = BUSINESS_MODULES.includes(module) && resource !== "sales.others";
      const completeConsultation = business && !OPERATIONAL_RESOURCES.includes(resource);
      return [
        resource,
        {
          resource,
          module,
          moduleLabel,
          navigation: NAVIGATION[module].includes(key),
          label,
          completeConsultation,
          exportable: business,
          information: completeConsultation ? information.filter((kind) => kind === "financial") : information,
          actions: business ? actions.filter((action) => action !== "export") : actions,
          requiresAllSellers: resource === "clients.receivables",
          sellerScoped:
            sellerScoped ||
            (module === "clients" && key !== "receivables") ||
            (module === "providers" && ["directory", "details"].includes(key)),
        },
      ];
    }),
  ),
);
const CAPABILITIES = Object.fromEntries(
  Object.values(RESOURCES).flatMap((resource) =>
    ["read", ...resource.information, ...resource.actions].map((action) => {
      const capability = `${resource.resource}.${action}`;
      return [
        capability,
        {
          ...resource,
          action,
          label: capability === "sales.others.read" ? "Consultar datos de otros vendedores" : LABELS[action],
          submoduleLabel: resource.label,
          kind: action === "read" ? "access" : INFORMATION.includes(action) ? "information" : "action",
          privileged: PRIVILEGED.includes(action),
        },
      ];
    }),
  ),
);
const MODULES = DEFINITIONS.map(([key, label]) => ({
  key,
  label,
  resources: Object.values(RESOURCES).filter((resource) => resource.module === key),
}));
function modulePermissions(permissions, module) {
  return permissions.filter((grant) => {
    const definition = CAPABILITIES[grant.capability];
    return definition && definition.module === module && definition.action === "read" && definition.navigation;
  });
}
function permissionKey(capability) {
  const parts = capability.split(".");
  if (parts.length !== 3) return capability;
  const resource = RESOURCE_ALIASES[`${parts[0]}.${parts[1]}`] || `${parts[0]}.${parts[1]}`;
  const definition = RESOURCES[resource];
  let action = parts[2];
  if (resource === "clients.receivables" && action === "reopen") action = "void";
  if (
    definition &&
    ((definition.exportable && action === "export") ||
      (definition.completeConsultation && ["amounts", "personal", "inventory"].includes(action)))
  )
    action = "read";
  return `${resource}.${action}`;
}
function requiresCommercialProfile(permissions) {
  return (
    !permissions.some(({ capability }) => capability === "sales.others.read") &&
    permissions.some(({ capability }) => {
      const definition = CAPABILITIES[capability];
      return definition ? definition.sellerScoped : false;
    })
  );
}
module.exports = {
  CAPABILITIES,
  RESOURCES,
  MODULES,
  RESOURCE_ALIASES,
  permissionKey,
  modulePermissions,
  requiresCommercialProfile,
};
