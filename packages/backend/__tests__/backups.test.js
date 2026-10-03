const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const { spawn } = require("node:child_process");
const { gunzipSync } = require("node:zlib");
const express = require("express");
const request = require("supertest");
const {
  backupDirectory,
  scheduledDate,
  nextRunAt,
  dumpDatabase,
  createBackupService,
  backupService,
} = require("../backups");

let directory;
const logger = { log: jest.fn(), error: jest.fn() };
const date = new Date(2026, 7, 20, 2, 0, 0);

beforeEach(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), "dmmarket-backups-"));
  jest.clearAllMocks();
});

afterEach(async () => {
  jest.restoreAllMocks();
  await fs.rm(directory, { recursive: true, force: true });
});

function service(options = {}) {
  return createBackupService({
    directory,
    now: () => date,
    logger,
    dump: (file) => fs.writeFile(file, "backup"),
    ...options,
  });
}

it("uses standard application folders and supports services and an override", () => {
  expect(backupDirectory({}, "linux", "/home/user")).toBe("/home/user/.local/share/dmmarket/backups");
  expect(backupDirectory({ XDG_DATA_HOME: "/data" }, "linux", "/home/user")).toBe("/data/dmmarket/backups");
  expect(backupDirectory({}, "darwin", "/Users/user")).toBe("/Users/user/Library/Application Support/DMMarket/backups");
  expect(backupDirectory({ LOCALAPPDATA: "C:\\Users\\user\\AppData\\Local" }, "win32")).toBe(
    "C:\\Users\\user\\AppData\\Local\\DMMarket\\backups",
  );
  expect(backupDirectory({ DMMARKET_SERVICE: "1" }, "linux")).toBe("/var/lib/dmmarket/backups");
  expect(backupDirectory({ DMMARKET_SERVICE: "1", BACKUP_DIRECTORY: directory })).toBe(directory);
});

it("schedules at 02:00 local and recovers only the latest missed day", () => {
  expect(scheduledDate(new Date(2026, 7, 20, 1, 59))).toBe("2026-08-19");
  expect(scheduledDate(date)).toBe("2026-08-20");
  expect(scheduledDate(new Date(2026, 0, 1, 1))).toBe("2025-12-31");
  expect(nextRunAt(new Date(2026, 7, 20, 1))).toBe(new Date(2026, 7, 20, 2).toISOString());
  expect(nextRunAt(date)).toBe(new Date(2026, 7, 21, 2).toISOString());
});

it("publishes successful backups with size and completion time and deduplicates after a restart", async () => {
  const dump = jest.fn((file) => fs.writeFile(file, "backup"));
  const first = service({ dump });
  await first.check();
  await first.check();
  await service({ dump }).check();
  expect(dump).toHaveBeenCalledTimes(1);
  const status = await first.status();
  expect(status.backups).toEqual([
    { name: "dmmarket-2026-08-20.sql.gz", scheduledDate: "2026-08-20", sizeBytes: 6, completedAt: expect.any(String) },
  ]);
  expect(status).toMatchObject({ directory, retention: 30, running: false, lastError: null });
});

it("runs the next day without generating duplicates on repeated checks", async () => {
  let clock = date;
  const backups = service({ now: () => clock });
  await backups.check();
  clock = new Date(2026, 7, 21, 2);
  await backups.check();
  await backups.check();
  expect((await backups.list()).map((backup) => backup.scheduledDate)).toEqual(["2026-08-21", "2026-08-20"]);
});

it("does not delay the next scheduled day when the previous attempt failed just before 02:00", async () => {
  let clock = new Date(2026, 7, 20, 1, 59);
  const dump = jest
    .fn()
    .mockRejectedValueOnce(new Error("offline"))
    .mockImplementation((file) => fs.writeFile(file, "backup"));
  const backups = service({ dump, now: () => clock });
  await backups.check();
  clock = date;
  await backups.check();
  expect(dump).toHaveBeenCalledTimes(2);
  expect((await backups.list()).map((backup) => backup.scheduledDate)).toEqual(["2026-08-20"]);
});

it("ignores incomplete, empty, unrelated and symlinked files", async () => {
  await fs.writeFile(path.join(directory, "dmmarket-2026-08-19.sql.gz.1.partial"), "partial");
  await fs.writeFile(path.join(directory, "unrelated.sql.gz"), "data");
  await fs.writeFile(path.join(directory, "dmmarket-2026-08-18.sql.gz"), "");
  await fs.symlink(path.join(directory, "unrelated.sql.gz"), path.join(directory, "dmmarket-2026-08-17.sql.gz"));
  expect(await service().list()).toEqual([]);
});

it("does not publish failed dumps or prune good backups, and retries after one hour", async () => {
  await fs.writeFile(path.join(directory, "dmmarket-2026-08-19.sql.gz"), "good");
  let clock = date;
  const dump = jest.fn(async (file) => {
    await fs.writeFile(file, "partial");
    throw new Error("dump failed");
  });
  const backups = service({ dump, now: () => clock });
  await backups.check();
  await backups.check();
  expect(dump).toHaveBeenCalledTimes(1);
  expect(await fs.readdir(directory)).toEqual(["dmmarket-2026-08-19.sql.gz"]);
  expect((await backups.status()).lastError.message).toBe("dump failed");
  clock = new Date(date.getTime() + 60 * 60 * 1000);
  dump.mockImplementation((file) => fs.writeFile(file, "good"));
  await backups.check();
  expect(dump).toHaveBeenCalledTimes(2);
  expect((await backups.status()).lastError).toBeNull();
});

it("waits one hour after a slow failure before retrying", async () => {
  let clock = date;
  const dump = jest.fn(async () => {
    clock = new Date(date.getTime() + 30 * 60 * 1000);
    throw new Error("slow failure");
  });
  const backups = service({ dump, now: () => clock });
  await backups.check();
  clock = new Date(date.getTime() + 60 * 60 * 1000);
  await backups.check();
  expect(dump).toHaveBeenCalledTimes(1);
  clock = new Date(date.getTime() + 90 * 60 * 1000);
  await backups.check();
  expect(dump).toHaveBeenCalledTimes(2);
});

it("rejects an empty dump", async () => {
  const backups = service({ dump: (file) => fs.writeFile(file, "") });
  await backups.check();
  expect(await backups.list()).toEqual([]);
  expect((await backups.status()).lastError.message).toMatch(/vacío/);
});

it("retains the latest 30 only after a successful backup", async () => {
  for (let day = 1; day <= 31; day++) {
    await fs.writeFile(path.join(directory, `dmmarket-2026-07-${String(day).padStart(2, "0")}.sql.gz`), "good");
  }
  await fs.writeFile(path.join(directory, "keep.txt"), "keep");
  const backups = service();
  await backups.check();
  const files = await backups.list();
  expect(files).toHaveLength(30);
  expect(files[0].scheduledDate).toBe("2026-08-20");
  expect(files[29].scheduledDate).toBe("2026-07-03");
  expect(await fs.readFile(path.join(directory, "keep.txt"), "utf8")).toBe("keep");
});

it("reports retention failures separately from a successfully published backup", async () => {
  for (let day = 1; day <= 31; day++) {
    await fs.writeFile(path.join(directory, `dmmarket-2026-07-${String(day).padStart(2, "0")}.sql.gz`), "good");
  }
  jest.spyOn(fs, "unlink").mockRejectedValueOnce(new Error("EACCES"));
  let clock = date;
  const backups = service({ now: () => clock });
  await backups.check();
  expect(await backups.list()).toHaveLength(32);
  expect((await backups.status()).lastError).toBeNull();
  expect((await backups.status()).retentionError.message).toMatch(/El respaldo se guardó/);
  clock = new Date(2026, 7, 21, 2);
  await backups.check();
  expect(await backups.list()).toHaveLength(30);
  expect((await backups.status()).retentionError).toBeNull();
});

it("prevents concurrent executions and hides the running partial file", async () => {
  let finish;
  const dump = jest.fn(async (file) => {
    await fs.writeFile(file, "partial");
    await new Promise((resolve) => {
      finish = resolve;
    });
  });
  const backups = service({ dump });
  const running = backups.check();
  while (!finish) await new Promise((resolve) => setImmediate(resolve));
  await backups.check();
  expect(await backups.list()).toEqual([]);
  expect((await backups.status()).running).toBe(true);
  finish();
  await running;
  expect(dump).toHaveBeenCalledTimes(1);
  expect((await backups.status()).running).toBe(false);
});

it("checks at startup and polls once per minute without duplicate timers", async () => {
  jest.useFakeTimers();
  const backups = service();
  const interval = jest.spyOn(global, "setInterval");
  backups.start();
  backups.start();
  expect(interval).toHaveBeenCalledTimes(1);
  expect(interval).toHaveBeenCalledWith(expect.any(Function), 60000);
  backups.stop();
  jest.useRealTimers();
  while ((await backups.status()).running) await new Promise((resolve) => setImmediate(resolve));
});

const env = { DATABASE_NAME: "business", DATABASE_USER: "user", DATABASE_PASSWORD: 'secret"\\value' };

it("streams a compressed dump using protected credentials and full-database flags", async () => {
  let args;
  let credentialFile;
  let content;
  const spawnProcess = (command, options, spawnOptions) => {
    args = options;
    credentialFile = options[0].slice("--defaults-file=".length);
    content = require("node:fs").readFileSync(credentialFile, "utf8");
    expect(command).toBe("mysqldump");
    return spawn(process.execPath, ["-e", "process.stdout.write('CREATE TABLE example (id INT);');"], spawnOptions);
  };
  const destination = path.join(directory, "dump.partial");
  await dumpDatabase(destination, env, spawnProcess);
  expect(gunzipSync(await fs.readFile(destination)).toString()).toBe("CREATE TABLE example (id INT);");
  expect(args).toEqual(
    expect.arrayContaining([
      "--lock-all-tables",
      "--routines",
      "--events",
      "--triggers",
      "--hex-blob",
      "--databases",
      "business",
    ]),
  );
  expect(args.join(" ")).not.toContain("secret");
  expect(content).toContain('password="secret\\"\\\\value"');
  await expect(fs.stat(credentialFile)).rejects.toMatchObject({ code: "ENOENT" });
  if (process.platform !== "win32") expect((await fs.stat(destination)).mode & 0o777).toBe(0o600);
});

it.each(["process.stdout.write('partial'); process.exit(1)", "process.exit(0)"])(
  "rejects failed or empty command output: %s",
  async (script) => {
    const destination = path.join(directory, "dump.partial");
    await expect(
      dumpDatabase(destination, env, (_command, _args, options) => spawn(process.execPath, ["-e", script], options)),
    ).rejects.toThrow();
    expect((await fs.readdir(directory)).filter((name) => name.startsWith(".mysql-"))).toEqual([]);
  },
);

it("preserves a filesystem error and stops the child process when streaming fails", async () => {
  const destination = path.join(directory, "unwritable");
  await fs.writeFile(destination, "existing");
  await expect(
    dumpDatabase(destination, env, (_command, _args, options) =>
      spawn(process.execPath, ["-e", "process.stdout.write('sql'); setInterval(() => {}, 1000);"], options),
    ),
  ).rejects.toMatchObject({ code: "EEXIST" });
  expect(await fs.readFile(destination, "utf8")).toBe("existing");
  expect((await fs.readdir(directory)).filter((name) => name.startsWith(".mysql-"))).toEqual([]);
});

it("reports a missing executable without exposing credentials", async () => {
  await expect(
    dumpDatabase(path.join(directory, "dump.partial"), {
      ...env,
      BACKUP_DUMP_COMMAND: path.join(directory, "missing"),
    }),
  ).rejects.toThrow("No se encontró mysqldump");
});

it("serves live backup metadata without caching or exposing a download endpoint", async () => {
  const status = { backups: [], directory, retention: 30 };
  jest.spyOn(backupService, "status").mockResolvedValue(status);
  const app = express();
  app.use("/api/backups", require("../routes/backups"));
  const response = await request(app).get("/api/backups").expect(200);
  expect(response.body).toEqual(status);
  expect(response.headers["cache-control"]).toBe("no-store");
  await request(app).get("/api/backups/dump.sql.gz").expect(404);
  jest.spyOn(console, "error").mockImplementation(() => {});
  backupService.status.mockRejectedValue(new Error("EACCES"));
  expect((await request(app).get("/api/backups").expect(500)).body.error.message).toMatch(/permisos/);
});
