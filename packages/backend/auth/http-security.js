const session = require("express-session");
const { randomBytes } = require("node:crypto");
const NEXT_SESSION_ID = Symbol("nextSessionId");

function newSessionId() {
  return randomBytes(24).toString("base64url");
}

async function replaceSession(req, sid) {
  if (typeof sid !== "string" || !/^[a-zA-Z0-9_-]{32}$/.test(sid))
    throw new TypeError("El identificador de sesión no es válido.");
  req[NEXT_SESSION_ID] = sid;
  try {
    await new Promise((resolve, reject) => req.session.regenerate((error) => (error ? reject(error) : resolve())));
  } finally {
    delete req[NEXT_SESSION_ID];
  }
}
const { csrfSync } = require("csrf-sync");

const ABSOLUTE_SESSION_MS = 12 * 60 * 60 * 1000;
const IDLE_SESSION_MS = 30 * 60 * 1000;
const RECENT_AUTH_MS = 5 * 60 * 1000;

function canonicalOrigin(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new TypeError("El origen público de acceso no es válido.");
  }
  if (url.protocol !== "https:" || url.origin !== value) {
    throw new TypeError("El origen público debe ser HTTPS, sin ruta, credenciales ni barra final.");
  }
  return url;
}

function sessionOptions({ store, secret }) {
  if (!store || store instanceof session.MemoryStore || !(store instanceof session.Store)) {
    throw new TypeError("Se requiere un store persistente de express-session validado.");
  }
  if (typeof secret !== "string") throw new TypeError("Falta el secreto de sesión.");
  const bytes = Buffer.from(secret, "base64");
  if (bytes.length < 32 || bytes.toString("base64") !== secret) {
    throw new TypeError("El secreto de sesión debe contener al menos 32 bytes aleatorios en Base64 canónico.");
  }
  return {
    name: "__Host-dmmarket.sid",
    genid: (req) => req[NEXT_SESSION_ID] || newSessionId(),
    secret,
    store,
    resave: false,
    saveUninitialized: false,
    rolling: false,
    cookie: { path: "/", httpOnly: true, secure: true, sameSite: "lax", maxAge: ABSOLUTE_SESSION_MS },
  };
}

function trustLocalProxy(address, hop) {
  return hop === 0 && ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(address);
}

function createHttpSecurity(publicOrigin) {
  const url = canonicalOrigin(publicOrigin);
  const csrf = csrfSync({ getTokenFromRequest: (req) => req.get("x-csrf-token"), size: 32 });
  const forbidden = (res) => res.status(403).json({ error: { message: "La solicitud de acceso no está autorizada." } });
  return Object.freeze({
    transport(req, res, next) {
      res.set({ "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff" });
      if (!req.secure || req.get("host")?.toLowerCase() !== url.host) return forbidden(res);
      if (req.get("sec-fetch-site") === "cross-site") return forbidden(res);
      if (!["GET", "HEAD", "OPTIONS"].includes(req.method) && req.get("origin") !== url.origin) {
        return forbidden(res);
      }
      next();
    },
    issueCsrfToken(req) {
      return csrf.generateToken(req);
    },
    csrfProtection(req, res, next) {
      csrf.csrfSynchronisedProtection(req, res, (error) => {
        if (error === csrf.invalidCsrfTokenError) return forbidden(res);
        next(error);
      });
    },
  });
}

function authErrorHandler(error, _req, res, next) {
  if (res.headersSent) return next(error);
  const messages = {
    400: "La solicitud de acceso no es válida.",
    401: "La sesión o las credenciales no son válidas.",
    403: "Acceso no permitido.",
    404: "El recurso de acceso no está disponible.",
    409: "La operación de acceso no se puede completar en el estado actual.",
    413: "La solicitud excede el tamaño permitido.",
    415: "El formato de la solicitud no está permitido.",
    429: "Demasiados intentos de acceso. Vuelve a intentarlo más tarde.",
  };
  const status = Object.hasOwn(messages, error.status) ? Number(error.status) : 503;
  res.set("Cache-Control", "no-store");
  if (
    status === 429 ||
    (status === 503 && Number.isSafeInteger(error.retryAfterSeconds) && error.retryAfterSeconds > 0)
  ) {
    const seconds =
      Number.isSafeInteger(error.retryAfterSeconds) && error.retryAfterSeconds > 0 ? error.retryAfterSeconds : 1;
    res.set("Retry-After", String(seconds));
  }
  return res
    .status(status)
    .json({ error: { message: messages[status] || "El servicio de acceso no está disponible." } });
}

module.exports = {
  newSessionId,
  replaceSession,
  authErrorHandler,
  ABSOLUTE_SESSION_MS,
  IDLE_SESSION_MS,
  RECENT_AUTH_MS,
  createHttpSecurity,
  sessionOptions,
  trustLocalProxy,
};
