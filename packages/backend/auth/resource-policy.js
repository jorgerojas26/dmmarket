const { canExportSales } = require("../controllers/sales-export");
const { RESOURCES, permissionKey } = require("@dmmarket/permissions");

function denied() {
  throw Object.assign(new Error("Este submódulo no está autorizado para tu cuenta."), { status: 403 });
}

function requestedResource(req) {
  const path = (req.originalUrl || req.path || "")
    .split("?")[0]
    .replace(/^\/api/, "")
    .replace(/\/$/, "");
  const query = req.query || {};
  const source = req.get?.("X-Access-Resource");
  const choose = (resources) => {
    if (source && !resources.includes(source)) denied();
    return source || resources[0];
  };
  if (/^\/exports\/providers\/[^/]+\//.test(path)) {
    const kind = path.split("/")[4];
    return `providers.${{ "sales-documents": "sales", "purchase-documents": "purchases" }[kind] || kind}`;
  }
  if (path === "/exports/sales/dispatch") return "sales.dispatch";
  if (/^\/exports\/sales\/[^/]+$/.test(path) || /^\/invoices\/[^/]+\/detail$/.test(path))
    return choose(["sales.breakdown", "clients.documents", "sellers.documents"]);
  if (path === "/exports/sales")
    return query.kind === "pareto"
      ? query.modo === "compras-sin-vender"
        ? "sales.unsold"
        : "sales.pareto"
      : choose(["sales.breakdown", "clients.documents", "sellers.documents"]);
  if (path === "/exports/purchases") return query.kind === "pareto" ? "purchases.dashboard" : "purchases.breakdown";
  if (path === "/exports/clients")
    return `clients.${{ inactive: "inactive", pareto: "dashboard" }[query.kind] || "directory"}`;
  if (path === "/exports/sellers") return "sellers.directory";
  if (path === "/exports/inventory") return "inventory.stock";
  if (path === "/exports/providers") return "providers.directory";
  if (/^\/exports\/receivables/.test(path) || /^\/receivables(?:\/|$)/.test(path)) return "clients.receivables";
  if (path === "/dashboard/sales") return "sales.dashboard";
  if (path === "/dashboard/pareto") return query.modo === "compras-sin-vender" ? "sales.unsold" : "sales.pareto";
  if (/^\/sales\//.test(path) || /^\/invoices\/(sales|group)/.test(path) || /^\/groups\/sales\//.test(path))
    return "sales.breakdown";
  if (path === "/invoices" || path === "/invoices/selection") return "sales.dispatch";
  if (path === "/products") return "inventory.stock";
  if (/^\/purchases\/(dashboard|pareto)$/.test(path)) return "purchases.dashboard";
  if (/^\/purchases\//.test(path)) return "purchases.breakdown";
  if (/^\/providers\/[^/]+\/(sales|purchases|clients|sellers|products)(?:\/|$)/.test(path))
    return `providers.${path.split("/")[3]}`;
  if (/^\/providers\/[^/]+\/summary$/.test(path)) return "providers.details";
  if (path === "/providers/list" || path === "/providers/best") return "providers.directory";
  if (path === "/clients/dashboard" || path === "/clients/best" || /^\/clients\/best\/product\//.test(path))
    return "clients.dashboard";
  if (path === "/clients/sin-facturar") return "clients.inactive";
  if (/^\/clients\/[^/]+\/sales$/.test(path)) return "clients.documents";
  if (/^\/clients\/[^/]+\/summary$/.test(path) || /^\/clients\/average\/month\//.test(path)) return "clients.details";
  if (path === "/clients/list") return "clients.directory";
  if (path === "/sellers/dashboard") return "sellers.dashboard";
  if (path === "/sellers/list") return "sellers.directory";
  if (/^\/sellers\/[^/]+\/summary$/.test(path)) return "sellers.details";
  if (/^\/sellers\/[^/]+\/sales$/.test(path)) return "sellers.documents";
  if (/^\/employees\/(commissionInfo|sales)\//.test(path)) return "sellers.commissions";
  const lookups = {
    "/clients": ["clients.directory", "sales.breakdown"],
    "/employees": ["sellers.directory", "sales.breakdown", "sellers.commissions"],
    "/clients/routes": [
      "clients.directory",
      "clients.dashboard",
      "clients.receivables",
      "sales.breakdown",
      "sales.dispatch",
    ],
    "/providers/options": ["providers.directory", "sales.breakdown", "purchases.breakdown", "inventory.stock"],
    "/groups": ["sales.breakdown", "purchases.breakdown", "inventory.stock"],
  };
  if (lookups[path]) return choose(lookups[path]);
  return null;
}

function requestResource(req) {
  const resource = requestedResource(req);
  return resource ? permissionKey(`${resource}.read`).slice(0, -5) : null;
}

function scopedAccess(access, resource) {
  const resolve = (capability) => permissionKey(capability.includes(".") ? capability : `${resource}.${capability}`);
  return Object.freeze({
    resource,
    privileged: access.privileged,
    hasGlobal: (capability) => {
      if (access.hasGlobal(resolve(capability))) return true;
      if (!["amounts", "financial", "personal", "inventory"].includes(capability)) return false;
      const read = access.scopeFor(`${resource}.read`);
      return !read.global && access.covers(resolve(capability), read.sellerIds);
    },
    hasAny: (capability) => {
      const scope = access.scopeFor(resolve(capability));
      return scope.global || scope.sellerIds.length > 0;
    },
    canRecord: (capability, id) => access.canRecord(resolve(capability), id),
    covers: (capability, ids) => access.covers(resolve(capability), ids),
    scopeFor: (capability) => access.scopeFor(resolve(capability)),
  });
}

const { AMOUNTS, FINANCIAL, PERSONAL, INVENTORY, AMOUNT_ANALYSIS } = require("@dmmarket/permissions/information");

function groupAllowed(access, group, query) {
  if (access.hasGlobal(group)) return true;
  const read = access.scopeFor("read");
  if (query.authorizedSellerIds) return access.covers(group, query.authorizedSellerIds);
  if (query.employeeId) return access.canRecord(group, query.employeeId);
  return !read.global && access.covers(group, read.sellerIds);
}
function projectInformation(value, access, query = {}, parent = "") {
  if (value == null || typeof value !== "object" || value instanceof Date) return value;
  if (Array.isArray(value)) return value.map((item) => projectInformation(item, access, query, parent));
  const rowSellerId = value.sellerId || (access.resource.startsWith("sellers.") ? value.id : null);
  if (value.authorizedSellerIds || rowSellerId)
    query = { ...query, authorizedSellerIds: value.authorizedSellerIds || [rowSellerId] };
  const amounts = groupAllowed(access, "amounts", query);
  const financial = amounts && groupAllowed(access, "financial", query);
  const personal =
    !query.operationalLookup &&
    (typeof value.authorizedPersonal === "boolean"
      ? value.authorizedPersonal
      : groupAllowed(access, "personal", query));
  const inventory =
    amounts &&
    (!RESOURCES[access.resource]?.information.includes("inventory") || groupAllowed(access, "inventory", query));
  const output = {};
  for (const [key, item] of Object.entries(value)) {
    if (
      !amounts &&
      ((AMOUNT_ANALYSIS.has(key) && !(access.resource === "purchases.dashboard" && key === "topProducts")) ||
        (access.resource === "clients.receivables" && key === "timeline") ||
        (AMOUNTS.has(key) && (item == null || typeof item !== "object")) ||
        key === "y" ||
        (key === "total" && !["", "pagination", "documents", "timeline"].includes(parent)))
    )
      continue;
    if (!financial && FINANCIAL.has(key)) continue;
    if (!personal && PERSONAL.has(key)) continue;
    if (!inventory && INVENTORY.has(key)) continue;
    if (key === "columns" && Array.isArray(item)) {
      output[key] = item.filter(
        (column) =>
          !(
            (AMOUNTS.has(column.key) && !amounts) ||
            (FINANCIAL.has(column.key) && !financial) ||
            (PERSONAL.has(column.key) && !personal) ||
            (INVENTORY.has(column.key) && !inventory)
          ),
      );
    } else output[key] = projectInformation(item, access, query, key);
  }
  if (!amounts && ["invoiceId", "idFactura", "invoices", "products"].some((key) => Object.hasOwn(output, key)))
    delete output.total;
  return output;
}

async function requestSession(sessions, req, options, work) {
  return sessions.withSession(req.sessionID, options, async (context) => {
    const resource = requestResource(req);
    if (!resource) return work(context);
    if (!RESOURCES[resource]) denied();
    const access = scopedAccess(context.access, resource);
    if (!access.hasAny("read")) denied();
    const endpoint = (req.originalUrl || req.path || "").split("?")[0].replace(/\/$/, "");
    const lookupOwner = { "/api/clients": "clients.directory", "/api/employees": "sellers.directory" }[endpoint];
    const operationalLookup = lookupOwner && resource !== lookupOwner;
    const sorting = req.query?.sortBy || req.query?.newSortBy;
    if (operationalLookup && PERSONAL.has(sorting)) denied();
    const sortFields = {
      "sales.breakdown": ["rawProfit", "netProfit", "averageProfitPercent", "monto", "utilidad", "promedio", "rif"],
      "sales.dispatch": ["total", "monto", "utilidad", "promedio", "rif"],
      "purchases.breakdown": ["monto", "avgUnitCost"],
      "clients.directory": ["total_ventas", "utilidad", "rif"],
      "clients.inactive": ["revenue_historico"],
      "sellers.directory": [
        "sales",
        "profit",
        "marginPercent",
        "avgTicket",
        "sharePercent",
        "rif",
        "ci",
        "phone",
        "email",
      ],
      "sellers.commissions": ["invoiceTotal", "commissionTotal", "utilidad"],
      "providers.directory": ["total_ventas", "total_compras", "utilidad"],
      "providers.sales": ["monto", "utilidad", "promedio"],
      "providers.products": ["rawProfit", "netProfit", "averageProfitPercent"],
      "providers.purchases": ["monto", "avgUnitCost"],
      "providers.clients": ["amount", "profit", "totalVentas"],
      "providers.sellers": ["amount", "profit", "totalVentas"],
      "clients.receivables": ["balance", "overdue"],
      "inventory.stock": ["PrecioA", "inventoryValue"],
    };
    const protectedSort = sortFields[resource]?.includes(sorting);
    if (
      protectedSort &&
      (((AMOUNTS.has(sorting) || sorting === "total") && !groupAllowed(access, "amounts", req.query)) ||
        (FINANCIAL.has(sorting) && !groupAllowed(access, "financial", req.query)) ||
        (PERSONAL.has(sorting) && !groupAllowed(access, "personal", req.query)))
    )
      denied();
    if ((req.originalUrl || req.path || "").startsWith("/api/exports") && !access.hasAny("export")) denied();
    let result = await work({ ...context, access });
    const sellerId = req.params?.sellerId || req.params?.employeeId;
    const query = sellerId ? { ...req.query, employeeId: sellerId } : req.query;
    if (
      RESOURCES[resource].exportable &&
      result &&
      !Array.isArray(result) &&
      !Object.hasOwn(result, "exportAllowed") &&
      ["data", "kpis", "summary"].some((key) => Object.hasOwn(result, key))
    )
      result = { ...result, exportAllowed: canExportSales(access, query) };
    return projectInformation(result, access, operationalLookup ? { ...query, operationalLookup: true } : query);
  });
}
module.exports = { requestResource, scopedAccess, requestSession, projectInformation, groupAllowed };
