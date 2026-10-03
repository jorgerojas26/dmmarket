let bundled;
try {
  bundled = require("./google-client.generated.json");
} catch {
  bundled = {};
}

function googleClient(env = process.env) {
  return {
    clientId: env.GOOGLE_DRIVE_CLIENT_ID || bundled.clientId || "",
    clientSecret: env.GOOGLE_DRIVE_CLIENT_SECRET || bundled.clientSecret || "",
  };
}

module.exports = { googleClient };
