require("dotenv").config();
const express = require("express");
const path = require("node:path");
const fs = require("node:fs");
const app = express();

// Detección de binario compilado: Bun.isStandaloneExecutable no existe en bun 1.3.14.
// Los assets embebidos (ver scripts/generate-assets.js) solo existen en el binario compilado.
const IS_STANDALONE = typeof Bun !== "undefined" && Bun.embeddedFiles.length > 0;
const ASSETS = IS_STANDALONE ? require("./assets.js").default : null;

const EXT_MIME = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".map": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".eot": "application/vnd.ms-fontobject",
  ".txt": "text/plain",
};

const clients_routes = require("./routes/clients");
const groups_routes = require("./routes/groups");
const invoices_routes = require("./routes/invoices");
const products_routes = require("./routes/products");
const employees_routes = require("./routes/employees");
const currency_rates_routes = require("./routes/currency_rates");
const providers_routes = require("./routes/providers");
const dashboard_routes = require("./routes/dashboard");
const sales_routes = require("./routes/sales");
const purchases_routes = require("./routes/purchases");

//app.use(express.static(path.join(__dirname, "public")));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api/clients", clients_routes);
app.use("/api/groups", groups_routes);
app.use("/api/invoices", invoices_routes);
app.use("/api/products", products_routes);
app.use("/api/employees", employees_routes);
app.use("/api/currency_rates", currency_rates_routes);
app.use("/api/providers", providers_routes);
app.use("/api/dashboard", dashboard_routes);
app.use("/api/sales", sales_routes);
app.use("/api/purchases", purchases_routes);

app.use("/api/*", (req, res) => {
  res.status(404).json({
    error: {
      message: `El servidor no encontró ningún recurso en la URL ${req.baseUrl}`,
    },
  });
});

// En el binario compilado los assets viven embebidos en el ejecutable (ver scripts/generate-assets.js).
// En dev se sirven desde disco como siempre.
app.use((req, res, next) => {
  if (!ASSETS) return next();
  const rel = "./client/build/" + req.path.replace(/^\/+/, "");
  const file = ASSETS[rel];
  if (!file) return next();
  const type = EXT_MIME[path.extname(file)] || "application/octet-stream";
  res.setHeader("Content-Type", type);
  res.send(fs.readFileSync(file));
});

app.use(express.static(path.join(__dirname, "client/build")));

app.get("/*", (_request, response) => {
  if (ASSETS) {
    response.setHeader("Content-Type", "text/html");
    response.send(fs.readFileSync(ASSETS["./client/build/index.html"]));
  } else {
    response.sendFile(path.resolve(__dirname, "client/build", "index.html"));
  }
});

const BASE_PORT = 8000;
const MAX_PORT_ATTEMPTS = 100;

if (require.main === module) {
  startServer(BASE_PORT);
}

// Si el puerto está ocupado, prueba con el siguiente (estilo Expo dev server).
function startServer(port, attempt = 0) {
  if (attempt >= MAX_PORT_ATTEMPTS) {
    console.error(`no se encontró un puerto libre entre ${BASE_PORT} y ${BASE_PORT + MAX_PORT_ATTEMPTS - 1}`);
    process.exit(1);
  }
  const server = app.listen(port, () => {
    console.log(`server listening in port ${port}`);
    if (IS_STANDALONE) openBrowser(`http://localhost:${port}`);
  });
  server.on("error", (error) => {
    if (error.code === "EADDRINUSE") {
      console.log(`puerto ${port} en uso, probando ${port + 1}...`);
      startServer(port + 1, attempt + 1);
    } else {
      console.error(error);
      process.exit(1);
    }
  });
}

// En el binario compilado abre el navegador automáticamente (reemplaza el viejo `run.bat start http://localhost:8000`).
function openBrowser(url) {
  const opener =
    process.platform === "win32"
      ? `cmd /c start "" "${url}"`
      : process.platform === "darwin"
        ? `open "${url}"`
        : `xdg-open "${url}"`;
  require("node:child_process").exec(opener, (error) => {
    if (error) console.error(`no se pudo abrir el navegador: ${error.message}`);
  });
}

module.exports = app;
