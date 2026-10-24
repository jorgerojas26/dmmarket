const { randomBytes, scrypt, timingSafeEqual } = require("node:crypto");
const { promisify } = require("node:util");

const derive = promisify(scrypt);
const PARAMETERS = Object.freeze({ N: 131072, r: 8, p: 1, maxmem: 160 * 1024 * 1024 });
const MAX_PASSWORD_BYTES = 4096;
const MAX_CONCURRENT_HASHES = 2;
let activeHashes = 0;

function validPasswordInput(password) {
  return (
    typeof password === "string" && password.length > 0 && Buffer.byteLength(password, "utf8") <= MAX_PASSWORD_BYTES
  );
}

function validateNewPassword(password) {
  if (!validPasswordInput(password) || Array.from(password).length < 15) {
    const error = new Error("Usa al menos 15 caracteres y como máximo 4096 bytes para la contraseña.");
    error.status = 400;
    throw error;
  }
}

async function derivePassword(password, salt) {
  if (activeHashes >= MAX_CONCURRENT_HASHES) {
    const error = new Error("El servicio de acceso está ocupado. Vuelve a intentarlo.");
    error.status = 503;
    throw error;
  }
  activeHashes += 1;
  try {
    return await derive(password, salt, 64, PARAMETERS);
  } finally {
    activeHashes -= 1;
  }
}

async function hashPassword(password) {
  validateNewPassword(password);
  const salt = randomBytes(32);
  const key = await derivePassword(password, salt);
  return JSON.stringify({
    version: 1,
    algorithm: "scrypt",
    N: PARAMETERS.N,
    r: PARAMETERS.r,
    p: PARAMETERS.p,
    salt: salt.toString("base64"),
    key: key.toString("base64"),
  });
}

function parseHash(encoded) {
  if (typeof encoded !== "string" || encoded.length > 512) return null;
  try {
    const hash = JSON.parse(encoded);
    if (
      hash?.version !== 1 ||
      hash.algorithm !== "scrypt" ||
      hash.N !== PARAMETERS.N ||
      hash.r !== PARAMETERS.r ||
      hash.p !== PARAMETERS.p ||
      typeof hash.salt !== "string" ||
      typeof hash.key !== "string"
    ) {
      return null;
    }
    const salt = Buffer.from(hash.salt, "base64");
    const key = Buffer.from(hash.key, "base64");
    if (
      salt.length !== 32 ||
      key.length !== 64 ||
      salt.toString("base64") !== hash.salt ||
      key.toString("base64") !== hash.key
    ) {
      return null;
    }
    return { salt, key };
  } catch {
    return null;
  }
}

async function verifyPassword(password, encoded) {
  if (!validPasswordInput(password)) return false;
  const hash = parseHash(encoded);
  if (!hash) return false;
  const key = await derivePassword(password, hash.salt);
  return timingSafeEqual(key, hash.key);
}

function createTemporaryPassword() {
  return randomBytes(24).toString("base64url");
}

module.exports = { hashPassword, verifyPassword, validateNewPassword, createTemporaryPassword };
