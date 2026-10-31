const { sellerId } = require("./capabilities");
const { requiresCommercialProfile } = require("@dmmarket/permissions");

function fail(status, message) {
  throw Object.assign(new Error(message), { status });
}

async function validateCommercialProfile(connection, value, userId) {
  if (value === null) return null;
  if (typeof value !== "string" || sellerId(value) !== value)
    fail(400, "Selecciona una única identidad comercial válida.");
  if (!(await connection.schema.hasTable("vendedores"))) fail(400, "El catálogo de vendedores no está disponible.");
  const seller = await connection("vendedores")
    .where("idVend", value)
    .whereRaw("BINARY idVend = ?", [value])
    .first("idVend");
  if (!seller) fail(400, "El vendedor no está disponible en Solser.");
  const existing = await connection("dmmarket_auth_commercial_profiles")
    .where("seller_id", value)
    .whereNot("user_id", userId)
    .first();
  if (existing) fail(409, "Esta identidad comercial ya pertenece a otra cuenta.");
  return value;
}

async function commercialProfile(connection, userId) {
  const profile = await connection("dmmarket_auth_commercial_profiles").where("user_id", userId).first("seller_id");
  if (!profile) return null;
  let name = profile.seller_id;
  if (await connection.schema.hasTable("vendedores")) {
    if (await connection.schema.hasColumn("vendedores", "Empresa")) {
      const seller = await connection("vendedores")
        .where("idVend", profile.seller_id)
        .whereRaw("BINARY idVend = ?", [profile.seller_id])
        .first("Empresa");
      name = seller?.Empresa || name;
    }
  }
  return { sellerId: profile.seller_id, name };
}

module.exports = { requiresCommercialProfile, validateCommercialProfile, commercialProfile };
