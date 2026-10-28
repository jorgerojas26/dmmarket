require("dotenv").config();
const express = require("express");
const path = require("node:path");
const fs = require("node:fs");
const app = express();
app.use((_req, res, next) => {
  res.set("X-Frame-Options", "DENY");
  next();
});

// Detección de binario compilado: Bun.isStandaloneExecutable no existe en bun 1.3.14.
// Los assets embebidos (ver scripts/generate-assets.js) solo existen en el binario compilado.
const IS_STANDALONE = typeof Bun !== "undefined" && Bun.embeddedFiles.length > 0;
const ASSETS = IS_STANDALONE ? require("./assets.js").default : null;

const EXT_MIME = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".map": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".eot": "application/vnd.ms-fontobject",
  ".txt": "text/plain",
};

const { backupService } = require("./backups");
const { driveBackupService } = require("./drive-backups");
const { bcvRateService } = require("./bcv");

let authRuntime = null;
const { createAuthRuntime, validateAuthConfig } = require("./auth/runtime");
const { trustLocalProxy, authErrorHandler } = require("./auth/http-security");
const { createBusinessRouter } = require("./routes");
app.set("trust proxy", trustLocalProxy);
app.get("/api/health", (_req, res) =>
  res
    .set("Cache-Control", "no-store")
    .status(authRuntime ? 200 : 503)
    .json({ ok: Boolean(authRuntime), service: process.env.DMMARKET_SERVICE === "1" }),
);
app.use("/api", (req, res, next) => {
  res.set("Cache-Control", "no-store");
  if (!authRuntime) return res.status(503).json({ error: { message: "El servicio de acceso no está disponible." } });
  return authRuntime.middleware(req, res, next);
});

async function initializeAuth(env = process.env, services = {}) {
  if (authRuntime) throw new Error("El servicio de acceso ya está iniciado.");
  const db = require("./database");
  const runtime = await createAuthRuntime({ db, env });
  try {
    const middleware = express.Router();
    middleware.use(runtime.middleware);
    middleware.use(createBusinessRouter({ sessions: runtime.sessions, security: runtime.security, db, services }));
    middleware.use(authErrorHandler);
    authRuntime = { ...runtime, middleware };
  } catch (error) {
    await runtime.close();
    throw error;
  }
  return authRuntime;
}

async function closeAuth() {
  const current = authRuntime;
  authRuntime = null;
  if (current) await current.close();
}

// En el binario compilado los assets viven embebidos en el ejecutable (ver scripts/generate-assets.js).
// En dev se sirven desde disco como siempre.
app.use((req, res, next) => {
  if (!ASSETS) return next();
  const rel = `./client/build/${req.path.replace(/^\/+/, "")}`;
  const file = ASSETS[rel];
  if (!file) return next();
  const type = EXT_MIME[path.extname(file)] || "application/octet-stream";
  res.setHeader("Content-Type", type);
  res.send(fs.readFileSync(file));
});

app.use(express.static(path.join(__dirname, "client/build")));

app.get("/*", (_request, response) => {
  if (ASSETS) {
    response.setHeader("Content-Type", "text/html");
    response.send(fs.readFileSync(ASSETS["./client/build/index.html"]));
  } else {
    response.sendFile(path.resolve(__dirname, "client/build", "index.html"));
  }
});

const { runEmbeddedMigrations } = require("./migrate");
const { cleanupStartup } = require("./cleanup");

const { serverOptions, startServer } = require("./server");

// En Windows el binario se lanza con doble clic: si la app muere al arrancar, la consola
// se cierra sin mostrar nada. Con esto el error queda visible en pantalla (espera Enter)
// y además se escribe a dmmarket-error.log junto al exe, con el estado del .env.
function failStartup(error) {
  console.error("Fallo al iniciar la aplicación:", error);
  if (IS_STANDALONE) {
    const logPath = path.join(process.cwd(), "dmmarket-error.log");
    const envSummary = {
      CWD: process.cwd(),
      DATABASE_HOST: process.env.DATABASE_HOST,
      DATABASE_PORT: process.env.DATABASE_PORT,
      DATABASE_USER: process.env.DATABASE_USER,
      DATABASE_NAME: process.env.DATABASE_NAME,
      DATABASE_PASSWORD_SET: Boolean(process.env.DATABASE_PASSWORD),
    };
    fs.writeFileSync(
      logPath,
      `${new Date().toISOString()}\n${error.stack || error}\n\n.env detectado: ${JSON.stringify(envSummary, null, 2)}\n`,
    );
    console.log(`\nEl detalle se guardó en: ${logPath}`);
  }
  if (process.platform === "win32" && process.env.DMMARKET_SERVICE !== "1" && process.stdin.isTTY) {
    console.log("\nPresiona Enter para cerrar...");
    process.stdin.once("data", () => process.exit(1));
    return;
  }
  process.exit(1);
}

if (require.main === module) {
  bootstrap().catch(failStartup);
}

// En el binario compilado: limpieza de arranque, migraciones pendientes (si una falla, no se levanta
// el server con la DB medio migrada), y después el server. En dev estos pasos no hacen nada.
async function bootstrap() {
  const options = serverOptions();
  validateAuthConfig(process.env);
  cleanupStartup();
  await runEmbeddedMigrations();
  await initializeAuth();
  const server = await startServer(app, options, () => {
    if (IS_STANDALONE && !options.service) openBrowser(authRuntime.publicOrigin);
  });
  backupService.start();
  driveBackupService.start();
  bcvRateService.start();
  server.once("close", () => {
    void closeAuth();
  });
  server.once("close", backupService.stop);
  server.once("close", driveBackupService.stop);
  server.once("close", bcvRateService.stop);
  return server;
}

// En el binario compilado abre el navegador automáticamente (reemplaza el viejo `run.bat start http://localhost:8000`).
function openBrowser(url) {
  const opener =
    process.platform === "win32"
      ? `cmd /c start "" "${url}"`
      : process.platform === "darwin"
        ? `open "${url}"`
        : `xdg-open "${url}"`;
  require("node:child_process").exec(opener, (error) => {
    if (error) console.error(`no se pudo abrir el navegador: ${error.message}`);
  });
}

module.exports = app;
module.exports.bootstrap = bootstrap;
module.exports.failStartup = failStartup;

module.exports.initializeAuth = initializeAuth;
module.exports.closeAuth = closeAuth;
