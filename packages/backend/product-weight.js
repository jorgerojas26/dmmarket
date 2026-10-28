const database = require("./database");

async function productWeightColumn() {
  return (await database.schema.hasColumn("productos", "Peso")) ? "productos.Peso" : "NULL";
}

module.exports = { productWeightColumn };
