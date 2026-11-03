const http = require("node:http");
const fs = require("node:fs");
const { createHash } = require("node:crypto");

async function startUpdateSource({ executablePath, corruptHash = false } = {}) {
  const binary = executablePath ? fs.readFileSync(executablePath) : null;
  const checksum = binary ? createHash("sha256").update(binary).digest("hex") : null;
  let requests = 0;
  const release = {
    tag_name: "v999.0.0",
    body: "Release sintética de integración",
    published_at: "2026-01-01T00:00:00Z",
    assets: ["dmmarket-app.exe", "dmmarket-app-mac", "dmmarket-app-linux"].flatMap((name) => [
      { name, browser_download_url: `https://github.com/jorgerojas26/dmmarket/releases/download/v999.0.0/${name}` },
      {
        name: `${name}.sha256`,
        browser_download_url: `https://github.com/jorgerojas26/dmmarket/releases/download/v999.0.0/${name}.sha256`,
      },
    ]),
  };
  const server = http.createServer((req, res) => {
    requests++;
    if (binary && req.url.includes("/releases/download/")) {
      if (req.url.endsWith(".sha256")) {
        res.setHeader("content-type", "text/plain");
        res.end(corruptHash ? "0".repeat(64) : checksum);
      } else {
        res.setHeader("content-type", "application/octet-stream");
        res.setHeader("content-length", binary.length);
        res.end(binary);
      }
      return;
    }
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(req.url.includes("/latest") ? release : [{ ...release, draft: false, prerelease: false }]));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    origin: `http://127.0.0.1:${server.address().port}`,
    requests: () => requests,
    hasAssets: Boolean(binary),
    close: async () => {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}

module.exports = { startUpdateSource };
