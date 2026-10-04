const { spawnSync } = require("node:child_process");
const { createHash } = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { caddyFixture } = require("../tests/caddy-fixture");

const script = path.resolve(__dirname, "../../../scripts/prepare-caddy.mjs");
let root;
let manifest;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "DMMarket Caddy download test "));
  manifest = caddyFixture(root);
});

afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

function prepare(extra = "", targets = ["linux-x64"]) {
  return spawnSync(
    "bun",
    [
      "-e",
      `${extra}; const {prepareCaddy} = await import(${JSON.stringify(script)}); await prepareCaddy(${JSON.stringify(root)}, ${JSON.stringify(targets)});`,
    ],
    { encoding: "utf8" },
  );
}

it("uses verified cached executables without any network access", () => {
  const result = prepare(
    'globalThis.fetch = () => { throw new Error("Network must not be used"); }',
    Object.keys(manifest.targets),
  );
  expect(result.status).toBe(0);
});

it("rejects a modified cache rather than silently packaging it", () => {
  fs.writeFileSync(path.join(root, ".cache/caddy/linux-x64/caddy"), "modified");
  const result = prepare();
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain("verificación de Caddy");
});

it.each(
  ["linux-x64", "win32-x64"].flatMap((target) =>
    ["valid", "bad archive hash", "bad binary hash"].map((scenario) => [target, scenario]),
  ),
)("verifies downloaded archives and extracted binaries (%s, %s)", (target, scenario) => {
  const definition = manifest.targets[target];
  const directory = path.join(root, ".cache/caddy", target);
  const archive = path.join(root, definition.archive);
  const packed =
    target === "win32-x64"
      ? spawnSync("zip", ["-q", archive, definition.binary, "LICENSE"], { cwd: directory })
      : spawnSync("tar", ["-czf", archive, "-C", directory, definition.binary, "LICENSE"]);
  expect(packed.status).toBe(0);
  definition.sha512 =
    scenario === "bad archive hash"
      ? "0".repeat(128)
      : createHash("sha512").update(fs.readFileSync(archive)).digest("hex");
  if (scenario === "bad binary hash") definition.sha256 = "0".repeat(64);
  fs.writeFileSync(path.join(root, "packages/backend/caddy-manifest.json"), JSON.stringify(manifest));
  fs.rmSync(directory, { recursive: true });
  const result = prepare(
    `globalThis.fetch = async (url) => {
    if (url !== ${JSON.stringify(`https://github.com/caddyserver/caddy/releases/download/v${manifest.version}/${definition.archive}`)}) throw new Error("Unexpected URL");
    return {ok: true, arrayBuffer: async () => require("node:fs").readFileSync(${JSON.stringify(archive)})};
  }`,
    [target],
  );
  if (scenario === "valid") {
    expect(result.status).toBe(0);
    expect(
      createHash("sha256")
        .update(fs.readFileSync(path.join(directory, definition.binary)))
        .digest("hex"),
    ).toBe(definition.sha256);
    expect(fs.existsSync(path.join(directory, "LICENSE"))).toBe(true);
  } else {
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("verificación");
    expect(fs.existsSync(path.join(directory, definition.binary))).toBe(false);
  }
});
