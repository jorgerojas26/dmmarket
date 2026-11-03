const { CAPABILITIES } = require("@dmmarket/permissions");
const { SUPERUSER_ROLE_ID } = require("./initial-administrator");
const keys = Object.keys(CAPABILITIES);
const technical = (key) =>
  ["settings.backups", "settings.updates", "settings.cache"].includes(CAPABILITIES[key].resource) ||
  key === "settings.rates.sync";
const commercialModules = ["sales", "purchases", "clients", "sellers", "providers", "inventory"];
const roles = [
  { id: SUPERUSER_ROLE_ID, name: "Superusuario", permissions: keys },
  {
    id: "9a5f7364-12b7-4ff2-8f0e-4f4723c73101",
    name: "Administrador",
    permissions: keys.filter((key) => !technical(key)),
  },
  {
    id: "9a5f7364-12b7-4ff2-8f0e-4f4723c73103",
    name: "Consultor",
    permissions: [
      ...keys.filter((key) => {
        const definition = CAPABILITIES[key];
        return (
          commercialModules.includes(definition.module) &&
          definition.resource !== "sellers.commissions" &&
          (definition.action === "read" || key === "sales.dispatch.amounts")
        );
      }),
      "settings.rates.read",
    ],
  },
  {
    id: "9a5f7364-12b7-4ff2-8f0e-4f4723c73104",
    name: "Cobranza",
    permissions: ["clients.receivables.read", "clients.receivables.payment", "settings.rates.read"],
  },
  {
    id: "9a5f7364-12b7-4ff2-8f0e-4f4723c73106",
    name: "Vendedor",
    permissions: [
      "sales.dashboard.read",
      "sales.breakdown.read",
      "sales.breakdown.personal",
      "clients.dashboard.read",
      "clients.directory.read",
      "clients.directory.personal",
      "clients.details.read",
      "clients.details.personal",
      "clients.documents.read",
      "clients.documents.personal",
      "sellers.directory.read",
      "sellers.details.read",
      "sellers.documents.read",
      "sellers.commissions.read",
    ],
  },
  {
    id: "9a5f7364-12b7-4ff2-8f0e-4f4723c73107",
    name: "Anulación de abonos",
    permissions: ["clients.receivables.read", "clients.receivables.void"],
  },
  {
    id: "9a5f7364-12b7-4ff2-8f0e-4f4723c73108",
    name: "Cierre de deudas",
    permissions: ["clients.receivables.read", "clients.receivables.close"],
  },
];
module.exports = { roles };
