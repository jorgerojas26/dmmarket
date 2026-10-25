const http = require("node:http");

async function startUpdateSource() {
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
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(req.url.includes("/latest") ? release : [{ ...release, draft: false, prerelease: false }]));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    origin: `http://127.0.0.1:${server.address().port}`,
    requests: () => requests,
    close: async () => {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}

module.exports = { startUpdateSource };
