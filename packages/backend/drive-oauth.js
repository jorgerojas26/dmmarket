const http = require("node:http");
const crypto = require("node:crypto");
const { SCOPE } = require("./drive-client");

async function startDriveOAuth({ client, complete, failed, timeoutMs = 10 * 60 * 1000 } = {}) {
  const state = crypto.randomBytes(32).toString("base64url");
  const verifier = crypto.randomBytes(32).toString("base64url");
  let claimed = false;
  let timer;
  let redirectUri;
  const server = http.createServer(async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'; base-uri 'none'");
    res.setHeader("X-Content-Type-Options", "nosniff");
    const url = new URL(req.url, redirectUri);
    if (req.method !== "GET" || url.pathname !== "/oauth2/callback" || req.headers.host !== new URL(redirectUri).host) {
      res.writeHead(404).end("Recurso no encontrado.");
      return;
    }
    const received = Buffer.from(url.searchParams.get("state") || "");
    const expected = Buffer.from(state);
    if (
      claimed ||
      url.searchParams.getAll("state").length !== 1 ||
      received.length !== expected.length ||
      !crypto.timingSafeEqual(received, expected)
    ) {
      res.writeHead(400).end("La autorización no corresponde a esta sesión o ya fue utilizada.");
      return;
    }
    claimed = true;
    clearTimeout(timer);
    try {
      const codes = url.searchParams.getAll("code");
      if (url.searchParams.has("error") || codes.length !== 1 || !codes[0] || codes[0].length > 4096) {
        throw new Error("No se autorizó la conexión con Google. Puedes volver a intentarlo desde Configuración.");
      }
      await complete({ code: codes[0], redirectUri, verifier });
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.end(
        '<!doctype html><html lang="es"><meta charset="utf-8"><title>DMMarket</title><h1>Cuenta conectada</h1><p>Puedes cerrar esta pestaña y volver a Configuración → Respaldos. Descarga y guarda tu clave de recuperación para habilitar las cargas.</p></html>',
      );
    } catch (error) {
      failed(error);
      res
        .writeHead(400, { "Content-Type": "text/plain; charset=utf-8" })
        .end(
          "No se pudo conectar la cuenta. Vuelve a Configuración → Respaldos para ver el estado e intentarlo otra vez.",
        );
    } finally {
      server.close();
    }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  server.unref();
  redirectUri = `http://127.0.0.1:${server.address().port}/oauth2/callback`;
  timer = setTimeout(() => {
    claimed = true;
    failed(new Error("La sesión de Google expiró. Vuelve a pulsar Conectar con Google."));
    server.close();
    server.closeAllConnections();
  }, timeoutMs);
  timer.unref();
  const parameters = new URLSearchParams({
    client_id: client.clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: SCOPE,
    access_type: "offline",
    prompt: "consent select_account",
    state,
    code_challenge: crypto.createHash("sha256").update(verifier).digest("base64url"),
    code_challenge_method: "S256",
  });
  return {
    authorizationUrl: `https://accounts.google.com/o/oauth2/v2/auth?${parameters}`,
    close() {
      claimed = true;
      clearTimeout(timer);
      server.close();
      server.closeAllConnections();
    },
  };
}

module.exports = { startDriveOAuth };
