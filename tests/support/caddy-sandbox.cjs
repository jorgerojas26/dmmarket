const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { backend, until } = require("./auth-environment.cjs");
const { caddyFile } = backend("./web-config");
const { verifiedCaddy, rootCertificateFile } = backend("./web-service");
const { proxyReady } = backend("./setup-network");

async function startCaddySandbox(configuration, directory) {
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const target = `${process.platform}-${process.arch}`;
  const manifest = backend("./caddy-manifest.json");
  const binary = verifiedCaddy(path.resolve(__dirname, "../../.cache/caddy", target, manifest.targets[target].binary));
  const file = path.join(directory, "Caddyfile");
  fs.writeFileSync(file, caddyFile(configuration, undefined, path.join(directory, "data")), { mode: 0o600 });
  const child = spawn(binary, ["run", "--config", file, "--adapter", "caddyfile"], { stdio: "ignore" });
  try {
    await until(() => fs.existsSync(rootCertificateFile(directory)));
    const ca = fs.readFileSync(rootCertificateFile(directory));
    await until(() => proxyReady(configuration, ca));
    return {
      ca,
      close: async () => {
        if (child.exitCode !== null || child.signalCode) return;
        child.kill("SIGTERM");
        await new Promise((resolve) => child.once("exit", resolve));
      },
    };
  } catch (error) {
    child.kill("SIGKILL");
    throw error;
  }
}

module.exports = { startCaddySandbox };
