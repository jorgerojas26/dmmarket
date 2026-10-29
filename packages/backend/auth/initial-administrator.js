const { CAPABILITIES } = require("./capabilities");

const SUPERUSER_ROLE_ID = "9a5f7364-12b7-4ff2-8f0e-4f4723c73105";

async function createInitialAdministratorRole(connection) {
  const id = SUPERUSER_ROLE_ID;
  if (await connection("dmmarket_auth_roles").where("id", id).first()) {
    const grants = await connection("dmmarket_auth_role_permissions").where("role_id", id);
    if (
      !Object.keys(CAPABILITIES).every((capability) =>
        grants.some((grant) => grant.capability === capability && grant.scope === "global"),
      )
    )
      throw new Error("El rol Superusuario fue modificado. Revisa sus permisos antes de crear la primera cuenta.");
    return id;
  }
  await connection("dmmarket_auth_roles").insert({ id, name: "Superusuario" });
  await connection("dmmarket_auth_role_permissions").insert(
    Object.keys(CAPABILITIES).map((capability) => ({ role_id: id, capability, scope: "global" })),
  );
  return id;
}

module.exports = { createInitialAdministratorRole, SUPERUSER_ROLE_ID };
