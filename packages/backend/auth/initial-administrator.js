const { randomUUID } = require("node:crypto");
const { CAPABILITIES } = require("./capabilities");

async function createInitialAdministratorRole(connection) {
  const id = randomUUID();
  await connection("dmmarket_auth_roles").insert({ id, name: "Superusuario inicial" });
  await connection("dmmarket_auth_role_permissions").insert(
    Object.keys(CAPABILITIES).map((capability) => ({ role_id: id, capability, scope: "global" })),
  );
  return id;
}

module.exports = { createInitialAdministratorRole };
