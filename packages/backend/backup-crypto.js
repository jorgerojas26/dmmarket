const fs = require("node:fs");
const fsp = require("node:fs/promises");
const crypto = require("node:crypto");
const path = require("node:path");
const { pipeline } = require("node:stream/promises");
const { Transform } = require("node:stream");

const MAGIC = Buffer.from("DMMARKET-BACKUP-1\n");
const OVERHEAD = MAGIC.length + 12 + 16;

async function hashFile(file, algorithm = "sha256") {
  const hash = crypto.createHash(algorithm);
  for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}

async function encryptBackup(source, destination, key, iv = crypto.randomBytes(12)) {
  if (iv.length !== 12) throw new Error("El identificador del cifrado no es válido.");
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(MAGIC);
  const input = fs.createReadStream(source);
  const hash = crypto.createHash("sha256");
  async function* encrypted() {
    yield MAGIC;
    yield iv;
    const metadata = Buffer.from(JSON.stringify({ name: path.basename(source) }));
    const length = Buffer.alloc(4);
    length.writeUInt32BE(metadata.length);
    yield cipher.update(Buffer.concat([length, metadata]));
    for await (const chunk of input) {
      hash.update(chunk);
      yield cipher.update(chunk);
    }
    yield cipher.final();
    yield cipher.getAuthTag();
  }
  try {
    await pipeline(encrypted(), fs.createWriteStream(destination, { flags: "wx", mode: 0o600 }));
    return hash.digest("hex");
  } finally {
    input.destroy();
  }
}

async function decryptBackup(source, destination, key) {
  const file = await fsp.open(source, "r");
  let header;
  let tag;
  let size;
  try {
    size = (await file.stat()).size;
    if (size < OVERHEAD + 4) throw new Error("El archivo no es un respaldo cifrado de DMMarket.");
    header = Buffer.alloc(MAGIC.length + 12);
    tag = Buffer.alloc(16);
    await file.read(header, 0, header.length, 0);
    await file.read(tag, 0, tag.length, size - 16);
  } finally {
    await file.close();
  }
  if (!header.subarray(0, MAGIC.length).equals(MAGIC)) throw new Error("Formato de respaldo no compatible.");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, header.subarray(MAGIC.length));
  decipher.setAAD(MAGIC);
  decipher.setAuthTag(tag);
  let metadata;
  let buffered = Buffer.alloc(0);
  const extract = new Transform({
    transform(chunk, _encoding, callback) {
      if (metadata) return callback(null, chunk);
      buffered = Buffer.concat([buffered, chunk]);
      if (buffered.length < 4) return callback();
      const length = buffered.readUInt32BE();
      if (!length || length > 4096) return callback(new Error("Los metadatos del respaldo no son válidos."));
      if (buffered.length < length + 4) return callback();
      try {
        const parsed = JSON.parse(buffered.subarray(4, length + 4).toString());
        if (typeof parsed.name !== "string" || !/^[\w .-]{1,255}$/.test(parsed.name))
          throw new Error("El nombre original del respaldo no es válido.");
        metadata = parsed;
        const data = buffered.subarray(length + 4);
        buffered = null;
        callback(null, data);
      } catch (error) {
        callback(error);
      }
    },
    flush(callback) {
      callback(metadata ? null : new Error("El respaldo no contiene metadatos de recuperación."));
    },
  });
  await pipeline(
    fs.createReadStream(source, { start: header.length, end: size - 17 }),
    decipher,
    extract,
    fs.createWriteStream(destination, { flags: "wx", mode: 0o600 }),
  );
  return metadata;
}

function parseRecoveryKey(text) {
  const parts = text.trim().split(/\r?\n/);
  if (parts.length !== 2 || parts[0] !== "DMMARKET-BACKUP-KEY-1" || !/^[A-Za-z0-9+/]{43}=$/.test(parts[1])) {
    throw new Error("La clave de recuperación no tiene el formato esperado.");
  }
  return Buffer.from(parts[1], "base64");
}

module.exports = { OVERHEAD, hashFile, encryptBackup, decryptBackup, parseRecoveryKey };
