function serverOptions(env = process.env) {
  const port = Number(env.PORT || 8000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT debe ser un entero entre 1 y 65535.");
  }
  return { port, host: env.HOST || "0.0.0.0", service: env.DMMARKET_SERVICE === "1" };
}

function startServer(app, options, onListening = () => {}) {
  return new Promise((resolve, reject) => {
    const server = app.listen(options.port, options.host);
    server.once("error", reject);
    server.once("listening", () => {
      console.log(`DMMarket disponible en http://${options.host}:${options.port}`);
      onListening();
      resolve(server);
    });
  });
}

module.exports = { serverOptions, startServer };
