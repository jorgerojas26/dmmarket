const router = require("express").Router();
const database = require("../database");
const { reportCache } = require("../middlewares/report-cache");

async function readSettings() {
  const setting = await database("dmmarket_settings").where("name", "reportCurrency").first();
  return { reportCurrency: setting?.value === "Bs" ? "Bs" : "USD" };
}

router.use((_req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});

router.get("/", async (_req, res) => {
  try {
    res.json(await readSettings());
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "No se pudo cargar la configuración de reportes." });
  }
});

router.put("/", async (req, res) => {
  const { reportCurrency } = req.body;
  if (!["USD", "Bs"].includes(reportCurrency)) {
    return res.status(400).json({ error: "Selecciona USD o Bs." });
  }
  try {
    await database.raw("INSERT INTO dmmarket_settings (name, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = ?", [
      "reportCurrency",
      reportCurrency,
      reportCurrency,
    ]);
    reportCache.clear();
    res.json({ reportCurrency });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "No se pudo guardar la configuración de reportes." });
  }
});

module.exports = router;
