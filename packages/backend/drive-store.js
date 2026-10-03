const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");

function createDriveStore(directory) {
  const keyFile = path.join(directory, "recovery.key");
  const stateFile = path.join(directory, "state.enc");
  const credentialsKeyFile = path.join(directory, "credentials.key");

  async function secret(file, create = false) {
    try {
      const value = await fs.readFile(file);
      if (value.length !== 32) throw new Error("La clave de Google Drive está dañada. Usa tu copia de recuperación.");
      return value;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      if (!create) throw new Error("Falta la clave de recuperación de Google Drive.");
      try {
        await fs.access(stateFile);
        throw new Error(
          "Falta la clave original de Google Drive. No se generará una nueva sobre la configuración existente.",
        );
      } catch (stateError) {
        if (stateError.code !== "ENOENT") throw stateError;
      }
      await fs.mkdir(directory, { recursive: true, mode: 0o700 });
      const value = crypto.randomBytes(32);
      try {
        await fs.writeFile(file, value, { flag: "wx", mode: 0o600 });
        return value;
      } catch (writeError) {
        if (writeError.code === "EEXIST") return secret(file);
        throw writeError;
      }
    }
  }

  const key = (create = false) => secret(keyFile, create);

  function stateKey(master) {
    return crypto.hkdfSync("sha256", master, Buffer.alloc(0), Buffer.from("dmmarket:drive:state:v1"), 32);
  }

  async function read() {
    let data;
    try {
      data = await fs.readFile(stateFile);
    } catch (error) {
      if (error.code === "ENOENT")
        return { tokens: null, email: null, folderId: null, recoveryConfirmed: false, uploads: {} };
      throw error;
    }
    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      stateKey(await secret(credentialsKeyFile)),
      data.subarray(0, 12),
    );
    decipher.setAuthTag(data.subarray(12, 28));
    try {
      return JSON.parse(Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]).toString());
    } catch {
      throw new Error(
        "No se pudo abrir la configuración privada de Google Drive. Revisa la clave y los archivos del servidor.",
      );
    }
  }

  async function write(state) {
    await key(true);
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", stateKey(await secret(credentialsKeyFile, true)), iv);
    const ciphertext = Buffer.concat([cipher.update(JSON.stringify(state)), cipher.final()]);
    const temporary = `${stateFile}.${crypto.randomUUID()}.tmp`;
    try {
      await fs.writeFile(temporary, Buffer.concat([iv, cipher.getAuthTag(), ciphertext]), { flag: "wx", mode: 0o600 });
      await fs.rename(temporary, stateFile);
    } finally {
      await fs.rm(temporary, { force: true });
    }
  }

  async function exportKey() {
    return `DMMARKET-BACKUP-KEY-1\n${(await key(true)).toString("base64")}\n`;
  }

  return { read, write, key, exportKey };
}

module.exports = { createDriveStore };
