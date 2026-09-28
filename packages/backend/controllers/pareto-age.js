// La fecha de primera compra aproxima el ingreso del producto al catálogo.
// Comparar contra el fin del rango, no contra hoy, para que reportes históricos
// mantengan la misma clasificación con el paso del tiempo.
const splitParetoByAge = (rows, firstPurchases, to) => {
  if (!rows.length) return { products: [], newProducts: [] };
  const cutoff = new Date(`${to}T00:00:00Z`);
  cutoff.setUTCDate(cutoff.getUTCDate() - 30);
  const cutoffDate = cutoff.toISOString().slice(0, 10);
  const products = [];
  const newProducts = [];

  for (const row of rows) {
    const firstPurchaseDate = firstPurchases.get(row.productId);
    const product = { ...row, firstPurchaseDate };
    if (firstPurchaseDate && firstPurchaseDate > cutoffDate) newProducts.push(product);
    else products.push(product);
  }

  newProducts.sort((a, b) => b.firstPurchaseDate.localeCompare(a.firstPurchaseDate));
  return { products, newProducts };
};

module.exports = { splitParetoByAge };
