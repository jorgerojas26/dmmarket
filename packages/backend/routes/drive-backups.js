const express = require("express");
const crypto = require("node:crypto");
const { driveBackupService } = require("../drive-backups");

function localAccess(req) {
  if (["forwarded", "x-forwarded-for", "x-forwarded-host", "x-forwarded-proto"].some((header) => req.get(header)))
    return false;
  const address = req.socket.remoteAddress;
  if (!["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(address)) return false;
  const host = req.get("host");
  if (
    !["127.0.0.1", "localhost", "[::1]"].some(
      (name) => host === `${name}:${req.socket.localPort}` || (req.socket.localPort === 80 && host === name),
    )
  )
    return false;
  return !req.get("origin") || req.get("origin") === `http://${host}`;
}

function createDriveRouter({ service = driveBackupService, access = localAccess } = {}) {
  const router = express.Router();
  const controlToken = crypto.randomBytes(32).toString("hex");
  router.use((_req, res, next) => {
    res.set({ "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff" });
    next();
  });
  router.get("/", async (req, res) => {
    const local = access(req);
    const status = await service.status();
    res.json({
      ...status,
      email: local ? status.email : undefined,
      localAccess: local,
      controlToken: local ? controlToken : undefined,
      localSetupUrl: `http://127.0.0.1:${req.socket.localPort}/configuracion#respaldos`,
    });
  });
  router.use((req, res, next) => {
    if (!access(req))
      return res.status(403).json({
        error: {
          message:
            "Configura Google Drive desde el navegador del servidor usando 127.0.0.1. No se permite vincular cuentas por la red local.",
        },
      });
    const received = Buffer.from(req.get("x-drive-token") || "");
    const expected = Buffer.from(controlToken);
    if (received.length !== expected.length || !crypto.timingSafeEqual(received, expected)) {
      return res
        .status(403)
        .json({ error: { message: "Actualiza la pantalla de Configuración antes de realizar esta operación." } });
    }
    next();
  });
  const action = (handler) => async (req, res) => {
    try {
      await handler(req, res);
    } catch (error) {
      res.status(400).json({ error: { message: error.message } });
    }
  };
  router.post(
    "/connect",
    action(async (_req, res) => res.json(await service.connect())),
  );
  router.post(
    "/recovery-key",
    action(async (_req, res) => {
      const key = await service.recoveryKey();
      res
        .set("Content-Disposition", 'attachment; filename="DMMarket-clave-recuperacion.txt"')
        .type("text/plain")
        .send(key);
    }),
  );
  router.post(
    "/enable",
    action(async (req, res) => {
      if (req.body?.confirmed !== true)
        throw new Error("Confirma que guardaste la clave de recuperación fuera del servidor.");
      await service.confirmRecovery();
      res.json({ ok: true });
      void service.check();
    }),
  );
  router.post(
    "/test",
    action(async (_req, res) => {
      await service.testUpload();
      res.status(202).json({ ok: true });
    }),
  );
  router.post(
    "/disconnect",
    action(async (_req, res) => res.json(await service.disconnect())),
  );
  return router;
}

const router = createDriveRouter();
module.exports = router;
module.exports.createDriveRouter = createDriveRouter;
module.exports.localAccess = localAccess;
