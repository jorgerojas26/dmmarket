const command = process.argv[2];

if (["--install-service", "--uninstall-service", "--setup"].includes(command)) {
  Promise.resolve()
    .then(() => {
      if (typeof Bun === "undefined" || Bun.embeddedFiles.length === 0) {
        throw new Error("Usa el binario compilado para instalar o desinstalar el servicio.");
      }
      if (command === "--setup") return require("./setup").startSetup();
      const service = require("./service");
      if (command === "--install-service") service.installService();
      else service.uninstallService();
    })
    .catch((error) => {
      console.error(error.message);
      process.exit(1);
    });
} else {
  const app = require("./index");
  app.bootstrap().catch(app.failStartup);
}
