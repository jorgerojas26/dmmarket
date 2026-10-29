const express = require("express");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { installService, serviceDirectory, checkAdmin } = require("./service");
const {
  readConfiguration,
  normalizeDatabase,
  normalizeConfiguration,
  prepareAccessConfiguration,
  databaseFingerprint,
  testDatabase,
} = require("./setup-config");
const { prepareAccessSchema, accessState } = require("./setup-access");
const { certificateInfo, trustCertificate } = require("./setup-certificates");
const { proxyCredential } = require("./web-config");
const {
  localAddresses,
  firewallSettings,
  configureFirewall,
  accessReady,
  checkApplicationPort,
} = require("./setup-network");
const page = require("./setup-ui");
const { webEnabled, accessOptions, accessUrls } = require("./web-config");

function startupFailure(directory, since) {
  let descriptor;
  try {
    const file = path.join(directory, "dmmarket-error.log");
    const stat = fs.statSync(file);
    if (stat.mtimeMs < since) return "";
    descriptor = fs.openSync(file, "r");
    const buffer = Buffer.alloc(Math.min(stat.size, 8192));
    const length = fs.readSync(descriptor, buffer, 0, buffer.length, 0);
    const lines = buffer.subarray(0, length).toString("utf8").split(/\r?\n/);
    return (lines[1] || "").slice(0, 1500);
  } catch {
    return "";
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
  }
}

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
  ready = accessReady,
  finish = () => {},
  prepareSchema = prepareAccessSchema,
  access = accessState,
  certificate = () => certificateInfo(),
  trust = () => trustCertificate(),
} = {}) {
  if (!token || token.length < 32) throw new Error("El asistente requiere un token de sesión seguro.");
  const app = express();
  let busy = false;
  let tested;
  let preparedKeys;
  let preparedFingerprint;
  let applied;
  let installStartedAt;
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
      hasSavedAccessKeys: Boolean(existing.AUTH_SESSION_SECRET && existing.AUTH_MFA_KEY),
      fields: {
        DATABASE_HOST: configuration.DATABASE_HOST || "localhost",
        DATABASE_PORT: configuration.DATABASE_PORT || "3306",
        DATABASE_USER: configuration.DATABASE_USER || "",
        DATABASE_NAME: configuration.DATABASE_NAME || "",
        HOST: "127.0.0.1",
        WEB_BIND_ADDRESS: configuration.WEB_BIND_ADDRESS || "0.0.0.0",
        WEB_HTTPS_PORT: configuration.AUTH_PUBLIC_ORIGIN?.startsWith("https:")
          ? new URL(configuration.AUTH_PUBLIC_ORIGIN).port || "443"
          : "443",
        PORT: configuration.PORT || "8000",
        WEB_MODE: "caddy",
        WEB_HOSTNAME: configuration.WEB_HOSTNAME || "",
      },
    });
  });
  app.post("/api/test", async (req, res) => {
    if (busy || applied) return res.status(409).json({ error: "Hay una instalación en curso o ya terminada." });
    busy = true;
    tested = undefined;
    try {
      const configuration = normalizeDatabase(req.body || {}, existing);
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
      const fingerprint = databaseFingerprint(normalizeDatabase(input, existing));
      const normalized = normalizeConfiguration(input, {
        ...existing,
        ...(preparedFingerprint === fingerprint ? preparedKeys : {}),
      });
      if (input.confirm !== true || input.backupConfirmed !== true) {
        return res.status(400).json({ error: "Confirma la instalación y el respaldo de la base de datos." });
      }
      if (!tested || tested !== databaseFingerprint(normalized)) {
        return res.status(409).json({ error: "Comprueba la conexión con estos datos antes de instalar." });
      }
      if (normalized.PORT === String(port)) {
        return res
          .status(400)
          .json({ error: "El puerto elegido lo está usando el asistente. Elige otro puerto para DMMarket." });
      }
      const configuration = await prepareAccessConfiguration(normalized);
      preparedKeys = {
        AUTH_SESSION_SECRET: configuration.AUTH_SESSION_SECRET,
        AUTH_MFA_KEY: configuration.AUTH_MFA_KEY,
      };
      preparedFingerprint = fingerprint;
      const settings = firewallSettings(input, configuration);
      await checkPort(configuration, existing, installed);
      await prepareSchema(configuration, { firstInstallation: !installed });
      installStartedAt = Date.now();
      await install(configuration);
      applied = configuration;
      if (settings.enabled) {
        try {
          warnings = await firewall(settings, configuration);
        } catch {
          warnings = ["El servicio está registrado, pero debes revisar el firewall manualmente."];
        }
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
    const serviceReady = await ready(applied);
    let identity = { firstAdministratorRequired: false, administratorReady: false };
    let accessUnavailable = false;
    try {
      identity = await access(applied);
    } catch {
      accessUnavailable = true;
    }
    const isReady = serviceReady && identity.administratorReady;
    let startupError = serviceReady ? "" : startupFailure(directory, installStartedAt);
    for (const secret of [
      applied.DATABASE_PASSWORD,
      applied.AUTH_SESSION_SECRET,
      applied.AUTH_MFA_KEY,
      proxyCredential(applied),
    ])
      if (secret) startupError = startupError.split(secret).join("[oculta]");
    let ca = null;
    try {
      ca = certificate();
    } catch {}
    const urls = accessUrls(applied, addresses);
    const dnsRecords = webEnabled(applied)
      ? addresses.map(({ address }) => ({ name: applied.WEB_HOSTNAME, type: "A", address }))
      : [];
    const diagnostic =
      process.platform === "linux"
        ? "sudo journalctl -u dmmarket.service -n 100 --no-pager"
        : process.platform === "darwin"
          ? "sudo launchctl print system/com.dmmarket.server"
          : "Get-ScheduledTaskInfo -TaskName DMMarket";
    res.json({
      ready: isReady,
      serviceReady,
      accessUnavailable,
      ...identity,
      certificateAvailable: Boolean(ca),
      certificateFingerprint: ca?.fingerprint || null,
      bootstrapInstructions: identity.initialSetupPending
        ? "Abre DMMarket por HTTPS desde el propio servidor para crear el primer administrador. No necesitas un código de activación ni una terminal."
        : identity.firstAdministratorRequired === false
          ? identity.administratorReady
            ? "El administrador inicial ya está configurado. Abre DMMarket para iniciar sesión."
            : "Ya existe una cuenta. Abre DMMarket e inicia sesión para completar los pasos pendientes; no necesitas crear otro administrador."
          : "Desde una terminal administrativa en la carpeta permanente: detén el servicio de DMMarket, ejecuta el binario con --bootstrap-access --username admin-acceso --display-name Administrador --reason Inicializacion y vuelve a iniciar el servicio. La contraseña temporal sólo se entrega en esa terminal; cambia la contraseña desde el acceso HTTPS. Si ya existe una cuenta temporal, completa ese acceso en lugar de crear otra.",
      startupError,
      urls,
      warnings: webEnabled(applied)
        ? [
            ...warnings,
            "El acceso requiere HTTPS confiable. Configura DNS e instala la CA pública de DMMarket en cada equipo autorizado; no ignores advertencias de certificado. La comprobación local no verifica el DNS o la confianza de otras máquinas.",
          ]
        : warnings,
      dnsRecords,
      directory,
      diagnostic: webEnabled(applied)
        ? `${diagnostic}\nLog de Caddy: ${require("./web-service").webDirectory()}/logs/caddy.log`
        : diagnostic,
      localOnly: accessOptions(applied).host === "127.0.0.1" || !addresses.length,
    });
  });
  app.get("/api/certificate", (_req, res) => {
    if (!applied) return res.status(409).json({ error: "Confirma primero la instalación." });
    try {
      const info = certificate();
      res
        .set("Content-Disposition", 'attachment; filename="DMMarket-CA.crt"')
        .type("application/x-x509-ca-cert")
        .send(info.certificate);
    } catch {
      res.status(404).json({ error: "La CA pública todavía no está disponible." });
    }
  });
  app.post("/api/trust", (req, res) => {
    if (!applied || req.body?.confirmed !== true || Object.keys(req.body).some((key) => key !== "confirmed"))
      return res.status(400).json({ error: "Confirma la confianza sólo para este servidor." });
    try {
      res.json(trust());
    } catch {
      res.status(400).json({
        error: "No se pudo registrar la CA. Instala su certificado público manualmente con permisos administrativos.",
      });
    }
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
