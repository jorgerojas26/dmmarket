const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");

function caddyFixture(root) {
  const manifest = JSON.parse(JSON.stringify(require("../caddy-manifest.json")));
  for (const [target, definition] of Object.entries(manifest.targets)) {
    const directory = path.join(root, ".cache/caddy", target);
    fs.mkdirSync(directory, { recursive: true });
    const content = `test caddy executable for ${target}`;
    fs.writeFileSync(path.join(directory, definition.binary), content, { mode: 0o755 });
    fs.writeFileSync(path.join(directory, "LICENSE"), "Caddy Apache License 2.0 test fixture");
    definition.sha256 = createHash("sha256").update(content).digest("hex");
  }
  fs.mkdirSync(path.join(root, "packages/backend"), { recursive: true });
  fs.writeFileSync(path.join(root, "packages/backend/caddy-manifest.json"), JSON.stringify(manifest));
  return manifest;
}

module.exports = { caddyFixture };
