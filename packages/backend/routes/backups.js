const router = require("express").Router();
const { backupService } = require("../backups");

router.get("/", async (_req, res) => {
  res.set("Cache-Control", "no-store");
  try {
    res.json(await backupService.status());
  } catch (error) {
    console.error("No se pudo leer la carpeta de respaldos:", error.message);
    res
      .status(500)
      .json({ error: { message: "No se pudo leer la carpeta de respaldos. Revisa la ruta y sus permisos." } });
  }
});

module.exports = router;
