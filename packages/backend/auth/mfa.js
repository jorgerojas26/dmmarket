const { createCipheriv, createDecipheriv, randomBytes } = require("node:crypto");
const { NodeCryptoPlugin } = require("@otplib/plugin-crypto-node");

const crypto = new NodeCryptoPlugin();
let library;

function otpLibrary() {
  library ||= import("otplib");
  return library;
}

function context(userId) {
  if (typeof userId !== "string" || !/^[a-zA-Z0-9-]{1,64}$/.test(userId)) {
    throw new TypeError("La identidad interna de usuario no es válida.");
  }
  return Buffer.from(`dmmarket:totp:1:${userId}`, "utf8");
}

function createMfa(keyBase64) {
  if (typeof keyBase64 !== "string") throw new TypeError("Falta la clave de cifrado MFA.");
  const key = Buffer.from(keyBase64, "base64");
  if (key.length !== 32 || key.toString("base64") !== keyBase64) {
    throw new TypeError("La clave MFA debe contener 32 bytes aleatorios en Base64 canónico.");
  }

  function encrypt(userId, secret) {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    cipher.setAAD(context(userId));
    const encrypted = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
    return JSON.stringify({
      version: 1,
      iv: iv.toString("base64"),
      tag: cipher.getAuthTag().toString("base64"),
      data: encrypted.toString("base64"),
    });
  }

  function decrypt(userId, encoded) {
    const aad = context(userId);
    try {
      if (typeof encoded !== "string" || encoded.length > 512) throw new Error();
      const envelope = JSON.parse(encoded);
      if (envelope?.version !== 1) throw new Error();
      const decoded = {};
      for (const [field, size] of Object.entries({ iv: 12, tag: 16, data: 32 })) {
        if (typeof envelope[field] !== "string") throw new Error();
        decoded[field] = Buffer.from(envelope[field], "base64");
        if (decoded[field].length !== size || decoded[field].toString("base64") !== envelope[field]) {
          throw new Error();
        }
      }
      const decipher = createDecipheriv("aes-256-gcm", key, decoded.iv);
      decipher.setAAD(aad);
      decipher.setAuthTag(decoded.tag);
      const secret = Buffer.concat([decipher.update(decoded.data), decipher.final()]).toString("utf8");
      if (!/^[A-Z2-7]{32}$/.test(secret)) throw new Error();
      return secret;
    } catch {
      throw new Error("No se pudo validar el secreto MFA almacenado.");
    }
  }

  return Object.freeze({
    async createEnrollment(userId, username) {
      context(userId);
      if (typeof username !== "string" || username.length < 1 || username.length > 128) {
        throw new TypeError("El nombre de usuario no es válido para enrolamiento.");
      }
      const otp = await otpLibrary();
      const secret = otp.generateSecret({ length: 20, crypto });
      return {
        encryptedSecret: encrypt(userId, secret),
        uri: otp.generateURI({ issuer: "DMMarket", label: username, secret, digits: 6, period: 30, algorithm: "sha1" }),
      };
    },
    async verifyToken({ userId, encryptedSecret, token, lastUsedTimeStep }) {
      if (lastUsedTimeStep !== null && (!Number.isSafeInteger(lastUsedTimeStep) || lastUsedTimeStep < 0)) {
        throw new TypeError("Falta el último paso TOTP consumido o no es válido.");
      }
      if (typeof token !== "string" || !/^\d{6}$/.test(token)) return { valid: false };
      const epoch = Math.floor(Date.now() / 1000);
      if (lastUsedTimeStep !== null && lastUsedTimeStep > Math.floor(epoch / 30) + 1) return { valid: false };
      const otp = await otpLibrary();
      const result = await otp.verify({
        secret: decrypt(userId, encryptedSecret),
        token,
        crypto,
        strategy: "totp",
        algorithm: "sha1",
        digits: 6,
        period: 30,
        epoch,
        epochTolerance: 30,
        ...(lastUsedTimeStep === null ? {} : { afterTimeStep: lastUsedTimeStep }),
      });
      return result.valid ? { valid: true, timeStep: result.timeStep } : { valid: false };
    },
  });
}

module.exports = { createMfa };
