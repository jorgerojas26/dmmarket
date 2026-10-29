const database = require("./database");

async function productWeightColumn(connection = database, alias = "productos") {
  return (await connection.schema.hasColumn("productos", "Peso")) ? `${alias}.Peso` : "NULL";
}

module.exports = { productWeightColumn };
