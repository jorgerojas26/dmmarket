const fs = require("node:fs");
const path = require("node:path");
const root = path.join(__dirname, "..");
require("dotenv").config({ path: path.join(root, ".env") });
const configuration = {
  clientId: process.env.GOOGLE_DRIVE_CLIENT_ID || "",
  clientSecret: process.env.GOOGLE_DRIVE_CLIENT_SECRET || "",
};
fs.writeFileSync(path.join(root, "google-client.generated.json"), JSON.stringify(configuration));
console.log(
  `Google Drive OAuth: ${configuration.clientId && configuration.clientSecret ? "configurado" : "pendiente de registro por el mantenedor"}`,
);
