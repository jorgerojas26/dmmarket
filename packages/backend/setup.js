const express = require("express");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { installService, serviceDirectory, checkAdmin } = require("./service");
const { readConfiguration, normalizeConfiguration, databaseFingerprint, testDatabase } = require("./setup-config");
const {
  localAddresses,
  firewallSettings,
  configureFirewall,
  applicationReady,
  checkApplicationPort,
} = require("./setup-network");
const page = require("./setup-ui");

function createSetupApp({
  token,
  port = 8765,
  existing = {},
  installed = false,
  directory = serviceDirectory(),
  addresses = localAddresses(),
  testConnection = testDatabase,
  checkPort = checkApplicationPort,
  install = (configuration) => installService({ configuration }),
  firewall = configureFirewall,
  ready = applicationReady,
  finish = () => {},
} = {}) {
  if (!token || token.length < 32) throw new Error("El asistente requiere un token de sesión seguro.");
  const app = express();
  let busy = false;
  let tested;
  let applied;
  let warnings = [];
  let closed = false;
  app.disable("x-powered-by");
  app.use((req, res, next) => {
    res.set({
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "Content-Security-Policy":
        "default-src 'self'; script-src 'self'; style-src 'self'; frame-ancestors 'none'; form-action 'none'; base-uri 'none'",
    });
    if (![`127.0.0.1:${port}`, `localhost:${port}`].includes(req.get("host"))) {
      return res.status(403).json({ error: "El asistente solo admite acceso local." });
    }
    if (req.get("origin") && req.get("origin") !== `http://${req.get("host")}`) {
      return res.status(403).json({ error: "Origen no permitido." });
    }
    next();
  });
  app.get("/", (_req, res) => res.type("html").send(page.html));
  app.get("/favicon.ico", (_req, res) => res.status(204).end());
  app.get("/setup.css", (_req, res) => res.type("css").send(page.css));
  app.get("/setup.js", (_req, res) => res.type("js").send(page.script));
  app.use("/api", (req, res, next) => {
    if (closed) return res.status(410).json({ error: "La sesión de instalación está cerrada." });
    const authorization = Buffer.from(req.get("authorization") || "");
    const expected = Buffer.from(`Bearer ${token}`);
    if (authorization.length !== expected.length || !crypto.timingSafeEqual(authorization, expected)) {
      return res.status(401).json({ error: "Abre el enlace completo que aparece en la ventana del instalador." });
    }
    next();
  });
  app.use(express.json({ limit: "8kb" }));
  app.get("/api/config", (_req, res) => {
    const configuration = applied || existing;
    res.json({
      completed: Boolean(applied),
      platform: process.platform,
      installed,
      directory,
      addresses,
      hasSavedPassword: typeof existing.DATABASE_PASSWORD === "string",
      fields: {
        DATABASE_HOST: configuration.DATABASE_HOST || "localhost",
        DATABASE_PORT: configuration.DATABASE_PORT || "3306",
        DATABASE_USER: configuration.DATABASE_USER || "",
        DATABASE_NAME: configuration.DATABASE_NAME || "",
        HOST: configuration.HOST === "127.0.0.1" ? "127.0.0.1" : "0.0.0.0",
        PORT: configuration.PORT || "8000",
      },
    });
  });
  app.post("/api/test", async (req, res) => {
    if (busy || applied) return res.status(409).json({ error: "Hay una instalación en curso o ya terminada." });
    busy = true;
    tested = undefined;
    try {
      const configuration = normalizeConfiguration(req.body || {}, existing);
      const result = await testConnection(configuration);
      if (result.ok) tested = databaseFingerprint(configuration);
      res.status(result.ok ? 200 : 422).json(result);
    } catch (error) {
      res.status(400).json({ error: error.message });
    } finally {
      busy = false;
    }
  });
  app.post("/api/install", async (req, res) => {
    if (busy || applied) return res.status(409).json({ error: "Hay una instalación en curso o ya terminada." });
    busy = true;
    try {
      const input = req.body || {};
      const configuration = normalizeConfiguration(input, existing);
      if (input.confirm !== true || input.backupConfirmed !== true) {
        return res.status(400).json({ error: "Confirma la instalación y el respaldo de la base de datos." });
      }
      if (!tested || tested !== databaseFingerprint(configuration)) {
        return res.status(409).json({ error: "Comprueba la conexión con estos datos antes de instalar." });
      }
      if (configuration.PORT === String(port)) {
        return res
          .status(400)
          .json({ error: "El puerto elegido lo está usando el asistente. Elige otro puerto para DMMarket." });
      }
      const settings = firewallSettings(input, configuration);
      await checkPort(configuration, existing, installed);
      await install(configuration);
      applied = configuration;
      try {
        warnings = await firewall(settings, configuration);
      } catch {
        warnings = ["El servicio está registrado, pero debes revisar el firewall manualmente."];
      }
      res.json({ ok: true, message: "Servicio registrado. Estamos comprobando el inicio de DMMarket." });
    } catch (error) {
      res
        .status(400)
        .json({ error: error.message || "No se pudo registrar el servicio. Revisa la ventana del instalador." });
    } finally {
      busy = false;
    }
  });
  app.get("/api/status", async (_req, res) => {
    if (!applied) return res.status(409).json({ error: "La instalación aún no se ha realizado." });
    const isReady = await ready(applied);
    const urls =
      applied.HOST === "127.0.0.1" || !addresses.length
        ? [`http://127.0.0.1:${applied.PORT}`]
        : addresses.map(({ address }) => `http://${address}:${applied.PORT}`);
    const diagnostic =
      process.platform === "linux"
        ? "sudo journalctl -u dmmarket.service -n 100 --no-pager"
        : process.platform === "darwin"
          ? "sudo launchctl print system/com.dmmarket.server"
          : "Get-ScheduledTaskInfo -TaskName DMMarket";
    res.json({
      ready: isReady,
      urls,
      warnings,
      directory,
      diagnostic,
      localOnly: applied.HOST === "127.0.0.1" || !addresses.length,
    });
  });
  app.post("/api/finish", (_req, res) => {
    if (busy) return res.status(409).json({ error: "Espera a que termine la operación en curso." });
    closed = true;
    tested = undefined;
    res.json({ ok: true });
    finish();
  });
  app.use((_req, res) => res.status(404).json({ error: "Recurso no encontrado." }));
  app.use((error, _req, res, _next) => {
    res
      .status(error.status === 413 ? 413 : 400)
      .json({ error: "La solicitud no es válida. Revisa los campos del formulario." });
  });
  return app;
}

function openSetupBrowser(url) {
  const user = process.env.SUDO_USER;
  let command;
  let args;
  if (process.platform === "win32") {
    command = "explorer.exe";
    args = [url];
  } else if (user && user !== "root") {
    command = "sudo";
    args = ["-u", user, "--", "env"];
    if (process.platform === "linux") {
      for (const key of ["DISPLAY", "WAYLAND_DISPLAY", "XAUTHORITY", "DBUS_SESSION_BUS_ADDRESS", "XDG_RUNTIME_DIR"]) {
        if (process.env[key]) args.push(`${key}=${process.env[key]}`);
      }
    }
    args.push(process.platform === "darwin" ? "open" : "xdg-open", url);
  } else {
    console.log("Abre el enlace desde una sesión normal de usuario; no se abrirá un navegador como root.");
    return;
  }
  const child = spawn(command, args, { stdio: "ignore" });
  child.on("error", () =>
    console.log("No se pudo abrir el navegador automáticamente. Abre el enlace indicado arriba."),
  );
  child.on("exit", (code) => {
    if (code) console.log("Si no tienes escritorio, usa un túnel SSH y abre el enlace en tu computadora.");
  });
  child.unref();
}

async function startSetup() {
  const directory = serviceDirectory();
  checkAdmin();
  const installed = fs.existsSync(path.join(directory, ".env"));
  const existing = readConfiguration(installed ? directory : process.cwd());
  const token = crypto.randomBytes(32).toString("hex");
  const port = 8765;
  let server;
  const finish = () => setTimeout(() => server.close(() => process.exit(0)), 500);
  const app = createSetupApp({ token, port, existing, installed, directory, finish });
  await new Promise((resolve, reject) => {
    server = app.listen(port, "127.0.0.1", resolve);
    server.once("error", reject);
  });
  const timer = setTimeout(
    () => {
      console.log("La sesión de instalación expiró. Vuelve a abrir el instalador si lo necesitas.");
      server.close(() => process.exit(0));
    },
    30 * 60 * 1000,
  );
  timer.unref();
  const url = `http://127.0.0.1:${port}/#${token}`;
  console.log(`\nDMMarket — Asistente de instalación\n\n${url}\n`);
  console.log("Mantén esta ventana abierta. La sesión expira en 30 minutos.");
  console.log(
    `Sin escritorio: desde tu computadora ejecuta ssh -L ${port}:127.0.0.1:${port} USUARIO@SERVIDOR y abre el enlace completo.`,
  );
  openSetupBrowser(url);
  return server;
}

module.exports = { createSetupApp, startSetup };
