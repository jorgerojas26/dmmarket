const express = require("express");
const { inventory, options } = require("../controllers/products");

function createInventoryRoutes({ sessions }) {
  const router = express.Router();
  router.get("/products", async (req, res, next) => {
    try {
      res.json(
        await sessions.withSession(req.sessionID, { readOnly: true }, ({ transaction, access }) =>
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
