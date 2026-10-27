const { randomUUID } = require("node:crypto");

exports.config = { scope: "dmmarket", transaction: false };

exports.up = async (db) => {
  if (!(await db.schema.hasTable("dmmarket_auth_roles"))) return;
  await db.transaction(async (transaction) => {
    if (!(await transaction("dmmarket_auth_control").where("id", 1).forUpdate().first()))
      throw new Error("Falta el control transaccional de acceso.");
    const role = await transaction("dmmarket_auth_roles").where("name", "Superusuario inicial").forUpdate().first();
    if (!role) return;
    if (await transaction("dmmarket_auth_roles").where("name", "Superusuario").first())
      throw new Error("Ya existe un rol llamado Superusuario. Revisa los nombres antes de renombrar el rol inicial.");
    await transaction("dmmarket_auth_roles").where("id", role.id).update({ name: "Superusuario" });
    await transaction("dmmarket_auth_events").insert({
      id: randomUUID(),
      actor_id: null,
      target_user_id: null,
      target_role_id: role.id,
      action: "auth.role_renamed",
      outcome: "success",
      reason: "Superusuario inicial → Superusuario",
      occurred_ms: Date.now(),
    });
  });
};

exports.down = async () => {
  throw new Error("El nombre del superusuario requiere una revisión manual para revertirse.");
};
