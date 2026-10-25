const http = require("node:http");
const { backend } = require("./auth-environment.cjs");
const XLSX = backend("xlsx");

async function startRateSource() {
  let requests = 0;
  const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Caracas" }).format(new Date());
  const [year, month, day] = today.split("-");
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([
      [`Fecha Valor: ${day}/${month}/${year}`],
      ["Moneda/País", "Compra (BID)", "Venta (ASK)"],
      ["USD", 399, 400],
    ]),
    "Día",
  );
  const body = XLSX.write(workbook, { type: "buffer", bookType: "biff8" });
  const server = http.createServer((req, res) => {
    requests++;
    if (!req.url.endsWith(".xls")) {
      res.writeHead(404);
      res.end();
      return;
    }
    if (req.headers["if-none-match"] === '"rate-fixture"') {
      res.writeHead(304);
      res.end();
      return;
    }
    res.writeHead(200, { "content-type": "application/vnd.ms-excel", etag: '"rate-fixture"' });
    res.end(body);
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

module.exports = { startRateSource };
