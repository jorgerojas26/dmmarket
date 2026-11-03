const { createHmac } = require("node:crypto");
const { isIP } = require("node:net");
const { appendEvent } = require("./identity");

const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
const ACCOUNT_ATTEMPTS = 10;
const SOURCE_ATTEMPTS = 300;

function invalidSource() {
  const error = new Error("La solicitud de acceso no es válida.");
  error.status = 400;
  return error;
}

function normalizeSource(value) {
  if (typeof value !== "string" || value.length > 80 || value.includes("%") || !isIP(value)) throw invalidSource();
  if (isIP(value) === 4) return value;
  const normalized = new URL(`http://[${value}]/`).hostname.slice(1, -1);
  const mapped = /^::ffff:([0-9a-f]+):([0-9a-f]+)$/.exec(normalized);
  if (!mapped) return normalized;
  const high = Number.parseInt(mapped[1], 16);
  const low = Number.parseInt(mapped[2], 16);
  return [high >> 8, high & 255, low >> 8, low & 255].join(".");
}

function requestSource(req) {
  return normalizeSource(req.ip);
}

function createAttemptLimiter({
  db,
  secret,
  now = Date.now,
  accountLimit = ACCOUNT_ATTEMPTS,
  sourceLimit = SOURCE_ATTEMPTS,
}) {
  if (typeof secret !== "string") throw new TypeError("Falta el secreto estable de los límites de acceso.");
  const key = Buffer.from(secret, "base64");
  if (key.length < 32 || key.length > 64 || key.toString("base64") !== secret) {
    throw new TypeError("El secreto de límites debe tener de 32 a 64 bytes aleatorios en Base64 canónico.");
  }
  if (![accountLimit, sourceLimit].every((limit) => Number.isSafeInteger(limit) && limit > 0 && limit <= 10000)) {
    throw new TypeError("Los límites deben ser enteros positivos de hasta 10000 intentos.");
  }

  function time() {
    const value = now();
    if (!Number.isSafeInteger(value) || value <= 0 || !Number.isSafeInteger(value + ATTEMPT_WINDOW_MS)) {
      throw new Error("El reloj del servidor no es válido.");
    }
    return value;
  }

  function bucketKey(kind, value) {
    return createHmac("sha256", key)
      .update(JSON.stringify(["dmmarket:attempts:v1", kind, value]))
      .digest("hex");
  }

  async function charge(connection, kind, identity, limit, targetId) {
    const bucket = bucketKey(kind, identity);
    await connection.raw(
      "INSERT INTO dmmarket_auth_attempts (bucket_key, started_ms, hits, notified) VALUES (?, ?, 0, 0) ON DUPLICATE KEY UPDATE bucket_key = VALUES(bucket_key)",
      [bucket, time()],
    );
    const row = await connection("dmmarket_auth_attempts").where("bucket_key", bucket).forUpdate().first();
    const current = time();
    let started = Number(row.started_ms);
    let hits = Number(row.hits);
    let notified = Number(row.notified);
    if (
      !Number.isSafeInteger(started) ||
      started <= 0 ||
      !Number.isSafeInteger(started + ATTEMPT_WINDOW_MS) ||
      !Number.isSafeInteger(hits) ||
      hits < 0 ||
      ![0, 1].includes(notified)
    )
      throw new Error("El contador de acceso no es válido.");
    if (current >= started + ATTEMPT_WINDOW_MS) {
      started = current;
      hits = 0;
      notified = 0;
    }
    if (hits >= limit) {
      if (!notified) {
        await connection("dmmarket_auth_attempts").where("bucket_key", bucket).update({ notified: true });
        await appendEvent(connection, {
          targetId,
          action: "auth.attempts_limited",
          outcome: "failure",
          reason: kind,
          occurredMs: current,
        });
      }
      return Math.max(1, Math.ceil((started + ATTEMPT_WINDOW_MS - current) / 1000));
    }
    await connection("dmmarket_auth_attempts")
      .where("bucket_key", bucket)
      .update({ started_ms: started, hits: hits + 1, notified });
    return 0;
  }

  return Object.freeze({
    async consume({ source, account = null, targetUserId = null }) {
      const address = normalizeSource(source);
      if (account !== null && (typeof account !== "string" || account.length < 1 || account.length > 128))
        throw invalidSource();
      if (targetUserId !== null && (typeof targetUserId !== "string" || !/^[a-zA-Z0-9-]{1,36}$/.test(targetUserId)))
        throw invalidSource();
      const retryAfterSeconds = await db.transaction(async (connection) => {
        const sourceRetry = await charge(connection, "source", address, sourceLimit, null);
        if (sourceRetry) return sourceRetry;
        return account === null ? 0 : charge(connection, "account", account, accountLimit, targetUserId);
      });
      if (retryAfterSeconds) {
        const error = new Error("Demasiados intentos de acceso. Vuelve a intentarlo más tarde.");
        error.status = 429;
        error.retryAfterSeconds = retryAfterSeconds;
        throw error;
      }
    },
    async pruneExpired() {
      const [result] = await db.raw("DELETE FROM dmmarket_auth_attempts WHERE started_ms < ? LIMIT 1000", [
        time() - 2 * ATTEMPT_WINDOW_MS,
      ]);
      return Number(result.affectedRows);
    },
  });
}

module.exports = {
  createAttemptLimiter,
  normalizeSource,
  requestSource,
  ATTEMPT_WINDOW_MS,
  ACCOUNT_ATTEMPTS,
  SOURCE_ATTEMPTS,
};
