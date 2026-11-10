const { fail } = require("./utils/receivables-money");

function createCollectionCatalogs(db) {
  function kind(value) {
    if (!["banks", "methods"].includes(value)) fail("Catálogo no encontrado.", 404);
    return value;
  }

  async function list(type, connection = db) {
    kind(type);
    if (type === "methods") {
      const rows = await connection("dmmarket_payment_methods").select("id", "name", "active").orderBy("name");
      return rows.map((row) => ({ ...row, active: Boolean(Number(row.active)) }));
    }
    const [banks, settings] = await Promise.all([
      connection("bancos").select("Id_Banco as id", "Nombre as name").orderBy("Nombre"),
      connection("dmmarket_bank_settings").select("id", "active"),
    ]);
    const disabled = new Set(settings.filter((row) => !Number(row.active)).map((row) => row.id.toUpperCase()));
    return banks.map((row) => ({ ...row, active: !disabled.has(row.id.toUpperCase()) }));
  }

  async function save(type, id, body) {
    kind(type);
    const creating = id === null;
    const code = creating ? body.id : id;
    const max = type === "banks" ? 10 : 50;
    if (
      typeof code !== "string" ||
      !code.trim() ||
      code.length > max ||
      !/^[A-Za-z0-9_-]+(?: [A-Za-z0-9_-]+)*$/.test(code)
    )
      fail(`Indica un código de hasta ${max} caracteres, usando letras, números, espacios o guiones.`);
    if (typeof body.name !== "string" || !body.name.trim() || body.name.trim().length > 50)
      fail("Indica un nombre de hasta 50 caracteres.");
    if (body.active !== undefined && typeof body.active !== "boolean") fail("El estado debe ser activo o inactivo.");
    const name = body.name.trim();
    const active = body.active ?? true;
    const table = type === "banks" ? "bancos" : "dmmarket_payment_methods";
    const idColumn = type === "banks" ? "Id_Banco" : "id";
    const nameColumn = type === "banks" ? "Nombre" : "name";
    try {
      return await db.transaction(async (connection) => {
        const existing = await connection(table).where(idColumn, code).first().forUpdate();
        if (creating && existing) fail("Ya existe un registro con ese código.", 409);
        if (!creating && !existing) fail("El registro ya no existe. Actualiza el catálogo.", 404);
        const duplicate = await connection(table).where(nameColumn, name).whereNot(idColumn, code).first();
        if (duplicate) fail("Ya existe un registro con ese nombre.", 409);
        const values = { [nameColumn]: name, ...(type === "methods" ? { active } : {}) };
        if (creating) await connection(table).insert({ [idColumn]: code, ...values });
        else await connection(table).where(idColumn, code).update(values);
        if (type === "banks") {
          await connection.raw(
            "INSERT INTO dmmarket_bank_settings (id, active) VALUES (?, ?) ON DUPLICATE KEY UPDATE active = ?",
            [code, active, active],
          );
        }
        return { id: code, name, active };
      });
    } catch (error) {
      if (error.code === "ER_DUP_ENTRY") fail("Ya existe un registro con ese código o nombre.", 409);
      throw error;
    }
  }

  async function validatePayment(connection, payload, lock) {
    const methodQuery = connection("dmmarket_payment_methods").where({ id: payload.method, active: true }).first();
    const method = await (lock ? methodQuery.forUpdate() : methodQuery);
    if (!method) fail("Selecciona un método de pago activo. Actualiza el formulario.");
    if (!payload.bank) return;
    const bankQuery = connection("bancos").where("Nombre", payload.bank).first();
    const bank = await (lock ? bankQuery.forUpdate() : bankQuery);
    if (!bank) fail("Selecciona un banco del catálogo.");
    const settingQuery = connection("dmmarket_bank_settings").where("id", bank.Id_Banco).first();
    const setting = await (lock ? settingQuery.forUpdate() : settingQuery);
    if (setting && !Number(setting.active)) fail("El banco está inactivo. Selecciona otro banco.");
  }

  return { list, save, validatePayment };
}

module.exports = { createCollectionCatalogs };
