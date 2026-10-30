const { CAPABILITIES } = require("@dmmarket/permissions");
const { SUPERUSER_ROLE_ID } = require("./initial-administrator");
const keys = Object.keys(CAPABILITIES);
const roles = [
  {
    id: SUPERUSER_ROLE_ID,
    name: "Superusuario",
    permissions: keys,
  },
  {
    id: "9a5f7364-12b7-4ff2-8f0e-4f4723c73101",
    name: "Administrador",
    permissions: keys.filter(
      (key) =>
        !key.startsWith("audit.") &&
        !(
          key.startsWith("settings.") &&
          !["settings.preferences", "settings.currency"].includes(CAPABILITIES[key].resource) &&
          key !== "settings.rates.read"
        ) &&
        !key.startsWith("access.recovery.") &&
        key !== "sellers.commissions.update",
    ),
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
module.exports = { roles };
