const express = require("express");
const session = require("express-session");
const mysql = require("mysql2/promise");
const { timingSafeEqual } = require("node:crypto");
const { proxyCredential } = require("../web-config");
const { createMfa } = require("./mfa");
const { createAttemptLimiter } = require("./attempts");
const { createSessionStore } = require("./mysql-store");
const { createSessionService } = require("./sessions");
const { createAccountService } = require("./accounts");
const { createAccessAdministration } = require("./access-administration");
const { createSalesReports } = require("./sales-reports");
const { createPartyReports } = require("./party-reports");
const { createClientReports } = require("./client-reports");
const { createParetoReports } = require("./pareto-reports");
const { createInventoryReports } = require("./inventory-reports");
const { createPurchaseReports } = require("./purchase-reports");
const { createProviderReports } = require("./provider-reports");
const { createAuditReports } = require("./audit-reports");
const { createCommissionReports } = require("./commission-reports");
const { createCommissionUpdates } = require("./commission-updates");
const { createReceivablesReports } = require("./receivables-reports");
const { createExportReports } = require("./export-reports");
const { createOperationReports } = require("./operation-reports");
const { createHttpSecurity, sessionOptions, authErrorHandler } = require("./http-security");
const { createAuthRouter, forbidden } = require("./router");

function validateAuthConfig(env) {
  if (env.WEB_MODE !== "caddy") throw new Error("El acceso requiere HTTPS con Caddy.");
  if (env.HOST !== "127.0.0.1") throw new Error("El acceso protegido requiere HOST=127.0.0.1 y un proxy HTTPS.");
  const security = createHttpSecurity(env.AUTH_PUBLIC_ORIGIN);
  const mfa = createMfa(env.AUTH_MFA_KEY);
  createAttemptLimiter({ db: null, secret: env.AUTH_SESSION_SECRET });
  return { security, mfa };
}

async function createAuthRuntime({ db, env = process.env, services = {} }) {
  const { security, mfa } = validateAuthConfig(env);
  const attempts = createAttemptLimiter({ db, secret: env.AUTH_SESSION_SECRET });
  const sessions = await createSessionService({ db, mfa, attempts });
  const accounts = await createAccountService({ db, sessions });
  const administration = await createAccessAdministration({ db, sessions });
  const connection = mysql.createPool({
    host: env.DATABASE_HOST,
    port: Number(env.DATABASE_PORT || 3306),
    user: env.DATABASE_USER,
    password: env.DATABASE_PASSWORD,
    database: env.DATABASE_NAME,
    charset: "UTF8_GENERAL_CI",
    connectionLimit: 4,
    queueLimit: 16,
    waitForConnections: true,
    connectTimeout: 5000,
  });
  const store = createSessionStore(connection);
  try {
    await store.onReady();
    const options = sessionOptions({ store, secret: env.AUTH_SESSION_SECRET });
    const router = express.Router();
    const expectedProxy = Buffer.from(proxyCredential(env));
    router.use((req, res, next) => {
      const received = Buffer.from(req.get("x-dmmarket-proxy") || "");
      if (received.length !== expectedProxy.length || !timingSafeEqual(received, expectedProxy)) {
        return res.status(403).json({ error: { message: "La solicitud debe pasar por el proxy HTTPS autorizado." } });
      }
      next();
    });
    router.use(security.transport);
    router.use(express.json({ limit: "8kb", strict: true }));
    router.use(session(options));
    router.use("/auth", createAuthRouter({ sessions, accounts, administration, security }));
    router.use(createSalesReports({ sessions }));
    router.use(createPartyReports({ sessions }));
    router.use(createClientReports({ sessions }));
    router.use(createParetoReports({ sessions }));
    router.use(createInventoryReports({ sessions }));
    router.use(createPurchaseReports({ sessions }));
    router.use(createProviderReports({ sessions }));
    router.use(createAuditReports({ sessions }));
    router.use(createExportReports({ sessions }));
    router.use(createOperationReports({ sessions, security, db, services }));
    router.use(createCommissionReports({ sessions }));
    router.use(createCommissionUpdates({ sessions, security }));
    router.use(createReceivablesReports({ sessions, security }));
    router.use((req, res, next) => {
      sessions
        .withSession(req.sessionID, {}, async ({ access, transaction }) => {
          if (
            req.method !== "GET" ||
            !["/currency_rates", "/currency_rates/"].includes(req.path) ||
            !access.hasGlobal("rates.read")
          )
            forbidden();
          return transaction("divisas").select("Simbolo", "Cambio").orderBy("Simbolo").limit(100);
        })
        .then((data) => res.json(data))
        .catch(next);
    });
    router.use(authErrorHandler);
    let maintenance = null;
    const timer = setInterval(() => {
      if (maintenance) return;
      maintenance = (async () => {
        try {
          await attempts.pruneExpired();
          await db.raw("DELETE FROM dmmarket_auth_sessions WHERE expires < UNIX_TIMESTAMP() LIMIT 1000");
          await db.raw(
            "UPDATE dmmarket_auth_session_state SET pending_mfa_secret = NULL, pending_mfa_expires_ms = NULL WHERE pending_mfa_expires_ms < ? LIMIT 1000",
            [Date.now()],
          );
        } catch {
          console.error("No se pudo completar el mantenimiento acotado de acceso.");
        } finally {
          maintenance = null;
        }
      })();
    }, 60000);
    timer.unref();
    return {
      middleware: router,
      publicOrigin: env.AUTH_PUBLIC_ORIGIN,
      async close() {
        clearInterval(timer);
        await maintenance;
        await store.close();
        await connection.end();
      },
    };
  } catch (error) {
    await store.close();
    await connection.end();
    throw error;
  }
}

module.exports = { createAuthRuntime, validateAuthConfig };
