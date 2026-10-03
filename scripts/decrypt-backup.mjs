import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import backupCrypto from "../packages/backend/backup-crypto.js";

const [source, keyFile, destination] = process.argv.slice(2);
if (!source || !keyFile || !destination) {
  console.error("Uso: bun scripts/decrypt-backup.mjs RESPALDO.dmbak CLAVE.txt DESTINO.sql.gz");
  process.exit(1);
}
const temporary = `${path.resolve(destination)}.${crypto.randomUUID()}.partial`;
try {
  const key = backupCrypto.parseRecoveryKey(await fs.readFile(keyFile, "utf8"));
  const metadata = await backupCrypto.decryptBackup(source, temporary, key);
  await fs.link(temporary, path.resolve(destination));
  console.log(`Archivo original: ${metadata.name}`);
  console.log(`Respaldo descifrado y autenticado: ${path.resolve(destination)}`);
} catch {
  console.error(
    "No se pudo descifrar: revisa la clave, la integridad del archivo, los permisos y que el destino no exista.",
  );
  process.exitCode = 1;
} finally {
  await fs.rm(temporary, { force: true });
}
