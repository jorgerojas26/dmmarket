const { networkInterfaces } = require("node:os");
const { normalizeSource } = require("./attempts");

function isLocalSource(source) {
  let address;
  try {
    address = normalizeSource(source);
  } catch {
    return false;
  }
  if (address === "::1" || /^127\./.test(address)) return true;
  return Object.values(networkInterfaces())
    .flat()
    .some((entry) => {
      try {
        return normalizeSource(entry.address) === address;
      } catch {
        return false;
      }
    });
}

async function initialSetupState(db, source) {
  const control = await db("dmmarket_auth_control").where("id", 1).first("first_setup");
  if (!control || !["new", "pending", "closed"].includes(control.first_setup))
    throw new Error("El estado de inicialización de acceso no es válido.");
  if (control.first_setup !== "pending") return "anonymous";
  if (Number((await db("dmmarket_auth_users").count("* as total").first()).total)) return "anonymous";
  return isLocalSource(source) ? "first-user" : "setup-required";
}

module.exports = { isLocalSource, initialSetupState };
