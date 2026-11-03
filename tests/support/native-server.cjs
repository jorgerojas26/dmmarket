const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

function buildNativeServer(entry = "auth-server.cjs") {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "dmmarket-native-test-"));
  fs.chmodSync(directory, 0o700);
  const executablePath = path.join(directory, process.platform === "win32" ? "test-server.exe" : "test-server");
  try {
    execFileSync(
      "bun",
      [
        "build",
        "--compile",
        path.join(__dirname, entry),
        "--minify",
        "--external",
        "mysql",
        "--outfile",
        executablePath,
      ],
      { stdio: ["ignore", "pipe", "pipe"], timeout: 60000 },
    );
  } catch (error) {
    fs.rmSync(directory, { recursive: true, force: true });
    throw error;
  }
  return { executablePath, close: () => fs.rmSync(directory, { recursive: true, force: true }) };
}

module.exports = { buildNativeServer };
