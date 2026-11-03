async function seedRates(db) {
  if (await db.schema.hasTable("bcv_tasas")) return;
  await require("../../packages/backend/migrations/20261022_add_bcv_tasas").up(db);
  const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Caracas" }).format(new Date());
  const tomorrow = new Date(Date.parse(today) + 86400000).toISOString().slice(0, 10);
  await db("bcv_tasas").insert([
    { Fecha: "2026-01-01", Compra: 199.1234, Venta: 200.1234, Actualizado: "2026-01-01 12:00:00" },
    { Fecha: "2026-01-02", Compra: 200.1234, Venta: 201.1234, Actualizado: "2026-01-02 12:00:00" },
    { Fecha: today, Compra: 299, Venta: 300, Actualizado: `${today} 12:00:00` },
    { Fecha: tomorrow, Compra: 309, Venta: 310, Actualizado: `${today} 12:00:00` },
  ]);
}

module.exports = { seedRates };
