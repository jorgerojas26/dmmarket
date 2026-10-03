const { spawnSync } = require("node:child_process");
const { createHash } = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const repository = path.resolve(__dirname, "../../..");
let root;

beforeEach(() => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "DMMarket installer test ")));
});

afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

it.each([
  ["linux", "Instalar.sh", "dmmarket-app-linux"],
  ["macos", "Instalar.command", "dmmarket-app-mac"],
])("launches the %s wizard from a path containing spaces after checksum verification", (platform, launcher, binary) => {
  const stubs = path.join(root, "stubs");
  fs.mkdirSync(stubs);
  fs.writeFileSync(path.join(stubs, "sudo"), '#!/bin/sh\nexec "$@"\n', { mode: 0o755 });
  fs.copyFileSync(path.join(repository, "installers", platform, launcher), path.join(root, launcher));
  const content = '#!/bin/sh\nprintf "%s\\n" "$PWD" "$*" > "$CALLS_FILE"\n';
  fs.writeFileSync(path.join(root, binary), content, { mode: 0o644 });
  fs.writeFileSync(path.join(root, `${binary}.sha256`), createHash("sha256").update(content).digest("hex"));
  const result = spawnSync("bash", [path.join(root, launcher)], {
    encoding: "utf8",
    cwd: os.tmpdir(),
    env: {
      ...process.env,
      PATH: `${stubs}${path.delimiter}${process.env.PATH}`,
      DISPLAY: "",
      WAYLAND_DISPLAY: "",
      CALLS_FILE: path.join(root, "calls"),
    },
  });
  expect(result.status).toBe(0);
  expect(fs.readFileSync(path.join(root, "calls"), "utf8").trim().split("\n")).toEqual([root, "--setup"]);
  fs.writeFileSync(path.join(root, `${binary}.sha256`), "0".repeat(64));
  fs.rmSync(path.join(root, "calls"));
  const rejected = spawnSync("bash", [path.join(root, launcher)], {
    encoding: "utf8",
    cwd: root,
    env: {
      ...process.env,
      PATH: `${stubs}${path.delimiter}${process.env.PATH}`,
      DISPLAY: "",
      WAYLAND_DISPLAY: "",
      CALLS_FILE: path.join(root, "calls"),
    },
  });
  expect(rejected.status).toBe(1);
  expect(fs.existsSync(path.join(root, "calls"))).toBe(false);
});

it.each([
  ["linux", "dmmarket-app-linux", "Instalar.sh"],
  ["windows", "dmmarket-app.exe", "Instalar.cmd"],
  ["macos", "dmmarket-app-mac", "Instalar.command"],
])("packages the %s installer with valid hashes, launchers, and instructions", (platform, binary, launcher) => {
  const backend = path.join(root, "packages", "backend");
  fs.mkdirSync(backend, { recursive: true });
  fs.writeFileSync(path.join(backend, binary), "test compiled executable");
  fs.cpSync(path.join(repository, "installers"), path.join(root, "installers"), { recursive: true });
  const modulePath = path.join(repository, "scripts", "package-installers.mjs");
  const result = spawnSync(
    "bun",
    [
      "-e",
      `const {packageInstaller} = await import(${JSON.stringify(modulePath)}); packageInstaller(${JSON.stringify(root)}, ${JSON.stringify(platform)}, "9.9.9");`,
    ],
    { encoding: "utf8" },
  );
  expect(result.status).toBe(0);
  const archive = path.join(root, "dist", `DMMarket-9.9.9-${platform}.zip`);
  const actual = createHash("sha256").update(fs.readFileSync(archive)).digest("hex");
  expect(fs.readFileSync(`${archive}.sha256`, "utf8")).toBe(actual);
  const extracted = path.join(root, "extracted");
  expect(spawnSync("unzip", ["-q", archive, "-d", extracted]).status).toBe(0);
  const directory = path.join(extracted, `DMMarket-${platform}`);
  expect(fs.existsSync(path.join(directory, launcher))).toBe(true);
  expect(fs.readFileSync(path.join(directory, "LEEME.txt"), "utf8")).toContain("No necesitas crear .env");
  expect(fs.readFileSync(path.join(directory, `${binary}.sha256`), "utf8")).toBe(
    createHash("sha256").update("test compiled executable").digest("hex"),
  );
  if (platform !== "windows") expect(fs.statSync(path.join(directory, launcher)).mode & 0o111).toBe(0o111);
  else expect(fs.existsSync(path.join(directory, "Instalar.ps1"))).toBe(true);
});
