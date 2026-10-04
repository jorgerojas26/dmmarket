const { spawnSync } = require("node:child_process");
const { createHash } = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { caddyFixture } = require("../tests/caddy-fixture");

const releaseScript = path.resolve(__dirname, "../../../scripts/release.mjs");
const binaries = ["dmmarket-app.exe", "dmmarket-app-mac", "dmmarket-app-linux"];

let root;
let backendDir;
let script;
let env;

beforeEach(() => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "dmmarket-release-test-")));
  backendDir = path.join(root, "packages", "backend");
  const binDir = path.join(root, "bin");
  script = path.join(root, "scripts", "release.mjs");
  fs.mkdirSync(backendDir, { recursive: true });
  fs.mkdirSync(binDir);
  fs.mkdirSync(path.dirname(script));
  fs.copyFileSync(releaseScript, script);
  fs.copyFileSync(
    path.join(path.dirname(releaseScript), "package-installers.mjs"),
    path.join(root, "scripts", "package-installers.mjs"),
  );
  fs.copyFileSync(
    path.join(path.dirname(releaseScript), "prepare-caddy.mjs"),
    path.join(root, "scripts/prepare-caddy.mjs"),
  );
  caddyFixture(root);
  fs.cpSync(path.resolve(__dirname, "../../../installers"), path.join(root, "installers"), { recursive: true });
  fs.writeFileSync(path.join(backendDir, "package.json"), JSON.stringify({ version: "9.9.9" }));
  fs.writeFileSync(path.join(root, "CHANGELOG.md"), "# Changelog\n\n## [v9.9.9]\n\n- Soporte para Linux.\n");

  for (const command of ["bun", "git", "gh"]) {
    fs.writeFileSync(
      path.join(binDir, command),
      `#!${process.execPath}
const fs = require("node:fs");
const path = require("node:path");
const command = ${JSON.stringify(command)};
const args = process.argv.slice(2);
fs.appendFileSync(process.env.CALLS_LOG, JSON.stringify({ command, args }) + "\\n");
if (command === "git") {
  if (args[0] === "ls-remote") process.exit(1);
  if (args[0] === "describe") console.log("v9.9.8");
  if (args[0] === "log") console.log("abc123 Linux support");
}
if (command === "bun") {
  if (args.includes("build:windows")) {
    fs.writeFileSync(path.join(process.cwd(), "packages/backend/dmmarket-app.exe"), "windows");
  } else {
    const outfile = args[args.indexOf("--outfile") + 1];
    if (process.env.FAIL_LINUX && outfile === "dmmarket-app-linux") process.exit(1);
    fs.writeFileSync(outfile, outfile);
  }
}
`,
      { mode: 0o755 },
    );
  }

  env = {
    ...process.env,
    PATH: `${binDir}${path.delimiter}${process.env.PATH}`,
    CALLS_LOG: path.join(root, "calls.log"),
  };
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

function calls() {
  return fs
    .readFileSync(env.CALLS_LOG, "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
}

it("compila las tres plataformas y publica binarios e instaladores con sus hashes", () => {
  const result = spawnSync(process.execPath, [script], { cwd: root, env, encoding: "utf8" });
  expect(result.status).toBe(0);

  const builds = calls().filter((call) => call.command === "bun");
  expect(builds).toHaveLength(3);
  expect(builds[0].args).toEqual(["--filter", "@dmmarket/backend", "build:windows"]);
  expect(builds[1].args).toContain(
    process.platform === "darwin" ? `--target=bun-darwin-${process.arch}` : "--target=bun-darwin-arm64",
  );
  expect(builds[2].args).toContain("--target=bun-linux-x64-baseline");
  expect(builds[2].args.slice(-2)).toEqual(["--outfile", "dmmarket-app-linux"]);

  const upload = calls().find((call) => call.command === "gh");
  const assets = binaries.flatMap((binary) => [
    path.join(backendDir, binary),
    path.join(backendDir, `${binary}.sha256`),
  ]);
  const installers = ["windows", "macos", "linux"].flatMap((platform) => {
    const archive = path.join(root, "dist", `DMMarket-9.9.9-${platform}.zip`);
    const hash = createHash("sha256").update(fs.readFileSync(archive)).digest("hex");
    expect(fs.readFileSync(`${archive}.sha256`, "utf8")).toBe(hash);
    return [archive, `${archive}.sha256`];
  });
  expect(upload.args.slice(-12)).toEqual([...assets, ...installers]);
  expect(upload.args).toContain("v9.9.9");
  expect(upload.args[upload.args.indexOf("--notes") + 1]).toContain("Soporte para Linux.");

  for (const binary of binaries) {
    const hash = createHash("sha256")
      .update(fs.readFileSync(path.join(backendDir, binary)))
      .digest("hex");
    expect(fs.readFileSync(path.join(backendDir, `${binary}.sha256`), "utf8")).toBe(hash);
  }
  expect(result.stdout).toContain("sha256 (linux)");
});

it("no publica una release ni crea tags cuando falla la compilación de Linux", () => {
  const result = spawnSync(process.execPath, [script], {
    cwd: root,
    env: { ...env, FAIL_LINUX: "1" },
    encoding: "utf8",
  });

  expect(result.status).toBe(1);
  expect(calls().some((call) => call.command === "gh")).toBe(false);
  expect(calls().some((call) => call.command === "git" && call.args[0] === "push")).toBe(false);
  expect(calls().some((call) => call.command === "git" && call.args[0] === "tag" && call.args[1] !== "-l")).toBe(false);
});
