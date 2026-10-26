const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { pathToFileURL } = require("node:url");

async function main() {
  const root = path.resolve(__dirname, "../..");
  require("./test-database.cjs").prepareDatabase();
  const { prepareCaddy } = await import(pathToFileURL(path.join(root, "scripts/prepare-caddy.mjs")).href);
  await prepareCaddy(root, [`${process.platform}-${process.arch}`]);
  const versionFile = path.join(root, "packages/backend/version.js");
  const originalVersion = fs.readFileSync(versionFile);
  try {
    execFileSync("bun", ["--filter", "@dmmarket/backend", "build:prepare"], { cwd: root, stdio: "inherit" });
  } finally {
    fs.writeFileSync(versionFile, originalVersion);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
