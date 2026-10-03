const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const crypto = require("node:crypto");
const express = require("express");
const request = require("supertest");
const { encryptBackup, decryptBackup, parseRecoveryKey, OVERHEAD } = require("../backup-crypto");
const { createDriveStore } = require("../drive-store");
const { createDriveBackupService } = require("../drive-backups");
const { createBackupService } = require("../backups");
const { createDriveRouter, localAccess } = require("../routes/drive-backups");

let directory;
let store;
let api;
let oauth;
let session;
let clock;
const client = { clientId: "example.apps.googleusercontent.com", clientSecret: "desktop-secret" };
const logger = { log: jest.fn(), error: jest.fn() };

beforeEach(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), "dm-drive-"));
  store = createDriveStore(path.join(directory, ".google-drive"));
  clock = Date.UTC(2026, 7, 20, 3);
  api = {
    token: jest.fn().mockResolvedValue({
      access_token: "access-secret",
      refresh_token: "refresh-secret",
      expiresAt: clock + 3600000,
    }),
    account: jest.fn().mockResolvedValue({ email: "business@example.com" }),
    folder: jest.fn().mockResolvedValue("folder-id"),
    refresh: jest
      .fn()
      .mockResolvedValue({ access_token: "new-access", refresh_token: "refresh-secret", expiresAt: clock + 7200000 }),
    upload: jest.fn().mockResolvedValue({ id: "uploaded-id" }),
    revoke: jest.fn().mockResolvedValue(undefined),
  };
  oauth = jest.fn(async (options) => {
    session = options;
    return { authorizationUrl: "https://accounts.google.com/example", close: jest.fn() };
  });
});

afterEach(async () => {
  jest.restoreAllMocks();
  await fs.rm(directory, { recursive: true, force: true });
});

function service(options = {}) {
  return createDriveBackupService({
    directory,
    client,
    store,
    api,
    oauth,
    now: () => clock,
    logger,
    getBackups: () => createBackupService({ directory }).list(),
    ...options,
  });
}

async function connectAndEnable(drive) {
  await drive.connect();
  await session.complete({ code: "code", redirectUri: "http://127.0.0.1:5000/oauth2/callback", verifier: "verifier" });
  await drive.recoveryKey();
  await drive.confirmRecovery();
}

async function localBackup(name = "dmmarket-2026-08-20.sql.gz") {
  await fs.writeFile(path.join(directory, name), "compressed database bytes");
}

it.each(["", "database bytes"])(
  "encrypts and authenticates a round trip without exposing plaintext: %s",
  async (value) => {
    const key = crypto.randomBytes(32);
    const source = path.join(directory, "original");
    const encrypted = path.join(directory, "encrypted");
    const decrypted = path.join(directory, "decrypted");
    await fs.writeFile(source, value);
    await encryptBackup(source, encrypted, key);
    const bytes = await fs.readFile(encrypted);
    expect(bytes.length).toBe(
      Buffer.byteLength(value) + OVERHEAD + 4 + Buffer.byteLength(JSON.stringify({ name: "original" })),
    );
    if (value) expect(bytes.includes(Buffer.from(value))).toBe(false);
    expect((await decryptBackup(encrypted, decrypted, key)).name).toBe("original");
    expect(await fs.readFile(decrypted, "utf8")).toBe(value);
  },
);

it("rejects corrupted ciphertext, wrong keys and invalid recovery key files", async () => {
  const key = crypto.randomBytes(32);
  const source = path.join(directory, "original");
  const encrypted = path.join(directory, "encrypted");
  await fs.writeFile(source, "database");
  await encryptBackup(source, encrypted, key);
  await expect(decryptBackup(encrypted, path.join(directory, "wrong-key"), crypto.randomBytes(32))).rejects.toThrow();
  const bytes = await fs.readFile(encrypted);
  bytes[bytes.length - 1] ^= 1;
  await fs.writeFile(encrypted, bytes);
  await expect(decryptBackup(encrypted, path.join(directory, "tampered"), key)).rejects.toThrow();
  expect(() => parseRecoveryKey("wrong")).toThrow();
});

it("stores tokens encrypted, exports a usable recovery key and never replaces a missing original key", async () => {
  await store.write({ tokens: { access_token: "private-access", refresh_token: "private-refresh" } });
  const bytes = await fs.readFile(path.join(directory, ".google-drive", "state.enc"));
  expect(bytes.includes(Buffer.from("private-access"))).toBe(false);
  expect(bytes.includes(Buffer.from("private-refresh"))).toBe(false);
  expect((await store.read()).tokens.refresh_token).toBe("private-refresh");
  expect(parseRecoveryKey(await store.exportKey())).toEqual(await store.key());
  expect(await store.key()).not.toEqual(await fs.readFile(path.join(directory, ".google-drive", "credentials.key")));
  if (process.platform !== "win32")
    expect((await fs.stat(path.join(directory, ".google-drive", "recovery.key"))).mode & 0o777).toBe(0o600);
  await fs.unlink(path.join(directory, ".google-drive", "recovery.key"));
  await expect(store.key(true)).rejects.toThrow("clave original");
});

it("works locally with no OAuth configuration, no account and no network calls", async () => {
  const drive = service({ client: { clientId: "", clientSecret: "" } });
  await drive.check();
  expect(await drive.status()).toMatchObject({ configured: false, connected: false, uploads: [] });
  expect(api.upload).not.toHaveBeenCalled();
  expect(await fs.readdir(directory)).toEqual([]);
  const backups = createBackupService({
    directory,
    logger,
    now: () => new Date(clock),
    dump: (file) => fs.writeFile(file, "local"),
  });
  await backups.check();
  expect(await backups.list()).toHaveLength(1);
  await expect(drive.connect()).rejects.toThrow("opcional");
});

it("does not call Google or create secrets with configured OAuth but no linked account", async () => {
  await service().check();
  expect(api.upload).not.toHaveBeenCalled();
  expect(await fs.readdir(directory)).toEqual([]);
});

it("requires offline consent and explicitly saving the recovery key before enabling uploads", async () => {
  const drive = service();
  await drive.connect();
  expect((await drive.status()).connecting).toBe(true);
  await session.complete({ code: "code", redirectUri: "http://127.0.0.1:5000/oauth2/callback", verifier: "verifier" });
  await expect(drive.confirmRecovery()).rejects.toThrow("Descarga");
  await localBackup();
  await drive.check();
  expect(api.upload).not.toHaveBeenCalled();
  const status = await drive.status();
  expect(status).toMatchObject({ connected: true, email: "business@example.com", recoveryConfirmed: false });
  expect(JSON.stringify(status)).not.toMatch(/access-secret|refresh-secret|desktop-secret/);
});

it("uploads only finished backups as encrypted files, records success and deduplicates across restarts", async () => {
  const drive = service();
  await connectAndEnable(drive);
  await localBackup();
  await fs.writeFile(path.join(directory, "dmmarket-2026-08-20.sql.gz.partial"), "unfinished");
  await fs.writeFile(path.join(directory, ".env"), "password");
  api.upload.mockImplementation(async ({ file }) => {
    const restored = path.join(directory, "restored");
    await decryptBackup(file, restored, await store.key());
    expect(await fs.readFile(restored, "utf8")).toBe("compressed database bytes");
    return { id: "cloud-id" };
  });
  await drive.check();
  await service().check();
  expect(api.upload).toHaveBeenCalledTimes(1);
  expect((await drive.status()).uploads).toEqual([
    {
      name: "dmmarket-2026-08-20.sql.gz",
      status: "uploaded",
      uploadedAt: new Date(clock).toISOString(),
      error: undefined,
    },
  ]);
  expect((await fs.readdir(path.join(directory, ".google-drive"))).filter((file) => file.endsWith(".upload"))).toEqual(
    [],
  );
});

it("persists failed uploads, retries after an hour and preserves the encrypted payload across retries", async () => {
  const drive = service();
  await connectAndEnable(drive);
  await localBackup();
  let firstBytes;
  api.upload.mockImplementationOnce(async ({ file }) => {
    firstBytes = await fs.readFile(file);
    throw new Error("Offline");
  });
  await drive.check();
  expect((await drive.status()).uploads[0].status).toBe("error");
  const restarted = service();
  await restarted.check();
  expect(api.upload).toHaveBeenCalledTimes(1);
  clock += 3600000;
  api.upload.mockImplementationOnce(async ({ file }) => {
    expect(await fs.readFile(file)).toEqual(firstBytes);
    return { id: "retried-id" };
  });
  await restarted.check();
  expect(api.upload).toHaveBeenCalledTimes(2);
  expect(api.refresh).toHaveBeenCalledTimes(1);
  expect((await restarted.status()).uploads[0].status).toBe("uploaded");
  expect(await fs.readFile(path.join(directory, "dmmarket-2026-08-20.sql.gz"), "utf8")).toBe(
    "compressed database bytes",
  );
});

it("disconnects locally even when Google cannot revoke, retains the key and never deletes cloud backups", async () => {
  const drive = service();
  await connectAndEnable(drive);
  const key = await store.key();
  api.revoke.mockRejectedValueOnce(new Error("offline"));
  const result = await drive.disconnect();
  expect(result.warning).toMatch(/se desconectó/);
  expect((await drive.status()).connected).toBe(false);
  expect(await store.key()).toEqual(key);
  await drive.check();
  expect(api.upload).not.toHaveBeenCalled();
  expect((await store.read()).tokens).toBeNull();
});

it("keeps local scheduling and retention independent when Google Drive is enabled but offline", async () => {
  const drive = service();
  await connectAndEnable(drive);
  for (let day = 1; day <= 31; day++) await localBackup(`dmmarket-2026-07-${String(day).padStart(2, "0")}.sql.gz`);
  api.upload.mockRejectedValue(new Error("Offline"));
  await drive.check();
  expect((await drive.status()).lastError).toBe("Offline");
  const backups = createBackupService({
    directory,
    logger,
    now: () => new Date(2026, 7, 20, 3),
    dump: (file) => fs.writeFile(file, "new local backup"),
  });
  await backups.check();
  expect(await backups.list()).toHaveLength(30);
  expect((await backups.list())[0].name).toBe("dmmarket-2026-08-20.sql.gz");
  expect((await backups.status()).lastError).toBeNull();
});

it("cancels an active upload before disconnecting and cannot reconnect over an existing account", async () => {
  const drive = service();
  await connectAndEnable(drive);
  await expect(drive.connect()).rejects.toThrow("Desconecta");
  await localBackup();
  let started;
  const ready = new Promise((resolve) => {
    started = resolve;
  });
  api.upload.mockImplementation(
    ({ signal }) =>
      new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
        started();
      }),
  );
  const checking = drive.check();
  await ready;
  await drive.disconnect();
  await checking;
  expect((await drive.status()).connected).toBe(false);
});

it("blocks control by remote clients, cross-origin requests, forged hosts and missing CSRF tokens", async () => {
  const fake = {
    status: jest.fn().mockResolvedValue({ connected: false }),
    connect: jest.fn().mockResolvedValue({ authorizationUrl: "https://accounts.google.com/example" }),
  };
  const app = express();
  app.use(express.json());
  app.use("/drive", createDriveRouter({ service: fake }));
  const status = await request(app).get("/drive").expect(200);
  expect(status.body.localAccess).toBe(true);
  expect(status.body.controlToken).toHaveLength(64);
  await request(app).post("/drive/connect").expect(403);
  await request(app)
    .post("/drive/connect")
    .set("X-Forwarded-For", "192.168.1.10")
    .set("x-drive-token", status.body.controlToken)
    .expect(403);
  await request(app)
    .post("/drive/connect")
    .set("Host", "evil.example")
    .set("x-drive-token", status.body.controlToken)
    .expect(403);
  await request(app)
    .post("/drive/connect")
    .set("Origin", "https://evil.example")
    .set("x-drive-token", status.body.controlToken)
    .expect(403);
  await request(app).post("/drive/connect").set("x-drive-token", status.body.controlToken).expect(200);
  expect(fake.connect).toHaveBeenCalledTimes(1);
  expect(localAccess({ socket: { remoteAddress: "192.168.1.10", localPort: 8000 }, get: () => "localhost:8000" })).toBe(
    false,
  );
  const remote = express();
  remote.use("/drive", createDriveRouter({ service: fake, access: () => false }));
  expect((await request(remote).get("/drive")).body.controlToken).toBeUndefined();
  await request(remote).post("/drive/connect").expect(403);
});

it("requires confirmation to enable and serves recovery keys only through an authorized POST", async () => {
  const fake = {
    status: jest.fn().mockResolvedValue({}),
    recoveryKey: jest.fn().mockResolvedValue("secret-key"),
    confirmRecovery: jest.fn(),
    check: jest.fn(),
  };
  const app = express();
  app.use(express.json());
  app.use("/drive", createDriveRouter({ service: fake }));
  const token = (await request(app).get("/drive")).body.controlToken;
  await request(app).post("/drive/enable").set("x-drive-token", token).send({ confirmed: false }).expect(400);
  await request(app).post("/drive/enable").set("x-drive-token", token).send({ confirmed: true }).expect(200);
  await request(app).post("/drive/recovery-key").expect(403);
  const key = await request(app).post("/drive/recovery-key").set("x-drive-token", token).expect(200);
  expect(key.text).toBe("secret-key");
  expect(key.headers["content-disposition"]).toContain("attachment");
  expect(key.headers["cache-control"]).toBe("no-store");
});
