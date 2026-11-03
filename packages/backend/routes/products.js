const { requestSession } = require("../auth/resource-policy");
const express = require("express");
const { inventory, options } = require("../controllers/products");

function createInventoryRoutes({ sessions }) {
  const router = express.Router();
  router.get("/products", async (req, res, next) => {
    try {
      res.json(
        await requestSession(sessions, req, { readOnly: true }, ({ transaction, access }) =>
          inventory(transaction, access, options(req.query)),
        ),
      );
    } catch (error) {
      next(error);
    }
  });
  return router;
}

module.exports = { createInventoryRoutes };
