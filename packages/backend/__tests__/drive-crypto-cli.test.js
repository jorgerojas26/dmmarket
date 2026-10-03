const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");
const { encryptBackup } = require("../backup-crypto");

let directory;
let source;
let encrypted;
let keyFile;
let destination;
const script = path.resolve(__dirname, "../../../scripts/decrypt-backup.mjs");

beforeEach(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), "dm-restore-"));
  source = path.join(directory, "dmmarket-2026-08-20.sql.gz");
  encrypted = path.join(directory, "cloud.dmbak");
  keyFile = path.join(directory, "key.txt");
  destination = path.join(directory, "restored.sql.gz");
  const key = crypto.randomBytes(32);
  await fs.writeFile(source, Buffer.alloc(2 * 1024 * 1024, 123));
  await fs.writeFile(keyFile, `DMMARKET-BACKUP-KEY-1\n${key.toString("base64")}\n`);
  await encryptBackup(source, encrypted, key);
});
afterEach(async () => fs.rm(directory, { recursive: true, force: true }));

it("restores a streamed ciphertext and reports the encrypted original filename", async () => {
  const result = spawnSync("bun", [script, encrypted, keyFile, destination], { encoding: "utf8" });
  expect(result.status).toBe(0);
  expect(result.stdout).toContain("dmmarket-2026-08-20.sql.gz");
  expect(await fs.readFile(destination)).toEqual(await fs.readFile(source));
});

it("does not publish unauthenticated plaintext or leave partial files after tampering", async () => {
  const file = await fs.open(encrypted, "r+");
  const byte = Buffer.alloc(1);
  const size = (await file.stat()).size;
  await file.read(byte, 0, 1, size - 1);
  byte[0] ^= 1;
  await file.write(byte, 0, 1, size - 1);
  await file.close();
  const result = spawnSync("bun", [script, encrypted, keyFile, destination], { encoding: "utf8" });
  expect(result.status).toBe(1);
  await expect(fs.stat(destination)).rejects.toMatchObject({ code: "ENOENT" });
  expect((await fs.readdir(directory)).filter((name) => name.endsWith(".partial"))).toEqual([]);
});

it("never overwrites an existing restored backup", async () => {
  await fs.writeFile(destination, "keep");
  const result = spawnSync("bun", [script, encrypted, keyFile, destination], { encoding: "utf8" });
  expect(result.status).toBe(1);
  expect(await fs.readFile(destination, "utf8")).toBe("keep");
});
