const express = require("express");
const { withReportCache } = require("../middlewares/authorized-report-cache");
const {
  parameters,
  listSales,
  invoiceList,
  invoiceDetail,
  groupSales,
  dashboard,
  fail,
} = require("../controllers/sales");

function createSalesRoutes({ sessions }) {
  const router = express.Router();
  const handle = (work, options) => async (req, res, next) => {
    try {
      const result = await withReportCache(req, res, sessions, async ({ transaction, access }) =>
        work(transaction, access, parameters(req.query, options), req.params),
      );
      res.json(result);
    } catch (error) {
      next(error);
    }
  };
  router.get(
    "/sales/facturas",
    handle((transaction, access, query) => listSales(transaction, access, query, "invoices")),
  );
  router.get(
    "/sales/productos",
    handle((transaction, access, query) => listSales(transaction, access, query, "products")),
  );
  router.get("/invoices", handle(invoiceList));
  router.get(
    "/invoices/selection",
    handle(async (transaction, access, query) => {
      if (Object.hasOwn(query, "search") && typeof query.search !== "string") fail(400);
      const result = await invoiceList(transaction, access, { ...query, page: 1, limit: 5001 });
      if (result.pagination.total > 5000) fail(413);
      return result;
    }),
  );
  router.get(
    "/invoices/sales",
    handle(async (transaction, access, query) => {
      const products = await listSales(transaction, access, query, "products");
      return {
        data: products.data,
        pagination: products.pagination,
        group_sales_chart_data: await groupSales(transaction, access, query),
      };
    }),
  );
  const chartKeys = ["from", "to", "showNoe", "employeeId", "clientId", "categoryId", "ruta", "proveedorId"];
  router.get("/invoices/group", handle(groupSales, { keys: chartKeys }));
  router.get(
    "/invoices/sales/:categoryId",
    handle(
      (transaction, access, query, params) =>
        groupSales(transaction, access, { ...query, categoryId: params.categoryId }),
      { keys: chartKeys },
    ),
  );
  router.get(
    "/groups/sales/:groupId",
    handle(async (transaction, access, query, params) => {
      const products = await listSales(
        transaction,
        access,
        { ...query, categoryId: params.groupId, page: 1, limit: 100 },
        "products",
      );
      if (products.pagination.total > 100) fail(413);
      return products.data;
    }),
  );
  router.get("/invoices/:invoiceId/detail", (req, res, next) => {
    if (
      Object.keys(req.query).some(
        (key) =>
          !["showNoe", "from", "to", "employeeId", "clientId", "categoryId", "ruta", "proveedorId"].includes(key),
      )
    ) {
      try {
        fail(400);
      } catch (error) {
        return next(error);
      }
    }
    return handle((transaction, access, query, params) => invoiceDetail(transaction, access, query, params.invoiceId), {
      range: false,
    })(req, res, next);
  });
  router.get("/dashboard/sales", handle(dashboard, { compare: true, keys: chartKeys }));
  router.get("/groups", async (req, res, next) => {
    try {
      const result = await sessions.withSession(req.sessionID, { readOnly: true }, async ({ transaction, access }) => {
        if (Object.keys(req.query).length) fail(400);
        if (
          !["sales.read", "purchases.read", "inventory.read", "commissions.read"].some((capability) => {
            const scope = access.scopeFor(capability);
            return scope.global || scope.sellerIds.length;
          })
        )
          fail(403);
        const groups = await transaction("grupos")
          .select({ groupId: "IdGrupo", name: "Descripcion" })
          .orderBy("IdGrupo")
          .limit(501);
        if (groups.length > 500) fail(413);
        return groups;
      });
      res.json(result);
    } catch (error) {
      next(error);
    }
  });
  return router;
}

module.exports = { createSalesRoutes };
