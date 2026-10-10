const router = require("express").Router();
const crypto = require("node:crypto");
const { backupService } = require("../backups");

const controlToken = crypto.randomBytes(32).toString("hex");

router.use((_req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});

router.get("/", async (_req, res) => {
  try {
    res.json({ ...(await backupService.status()), controlToken });
  } catch (error) {
    console.error("No se pudo leer la carpeta de respaldos:", error.message);
    res
      .status(500)
      .json({ error: { message: "No se pudo leer la carpeta de respaldos. Revisa la ruta y sus permisos." } });
  }
});

router.post("/", (req, res) => {
  const received = Buffer.from(req.get("x-backup-token") || "");
  const expected = Buffer.from(controlToken);
  if (received.length !== expected.length || !crypto.timingSafeEqual(received, expected)) {
    return res.status(403).json({ error: { message: "Actualiza la pantalla de Respaldos antes de crear una copia." } });
  }
  if (req.body?.confirmed !== true) {
    return res.status(400).json({ error: { message: "Confirma la creación del respaldo antes de continuar." } });
  }
  try {
    backupService.createManual();
    res.status(202).json({ ok: true });
  } catch (error) {
    res.status(error.code === "BACKUP_RUNNING" ? 409 : 500).json({ error: { message: error.message } });
  }
});

module.exports = router;
