const { splitParetoByAge } = require("../controllers/pareto-age");

describe("Pareto: maduración de productos", () => {
  const rows = [
    { productId: 1, netProfit: 100 },
    { productId: 2, netProfit: 80 },
    { productId: 3, netProfit: 20 },
  ];

  it("excluye del ABC solo a quienes tienen menos de 30 días al final del rango", () => {
    const firstPurchases = new Map([
      [1, "2025-01-01"], // un producto antiguo que se volvió a comprar en el rango
      [2, "2026-06-01"], // exactamente 30 días: ya es maduro
      [3, "2026-06-30"],
    ]);
    const { products, newProducts } = splitParetoByAge(rows, firstPurchases, "2026-07-01");
    expect(products.map((p) => p.productId)).toEqual([1, 2]);
    expect(newProducts.map((p) => p.productId)).toEqual([3]);
    expect(newProducts[0].firstPurchaseDate).toBe("2026-06-30");
  });

  it("usa la fecha del reporte y no la fecha actual", () => {
    const { products, newProducts } = splitParetoByAge(
      [rows[0]],
      new Map([[1, "2021-03-20"]]),
      "2021-04-01",
    );
    expect(products).toEqual([]);
    expect(newProducts).toHaveLength(1);
  });

  it("conserva en el ABC productos sin primera compra conocida", () => {
    const { products, newProducts } = splitParetoByAge([rows[0]], new Map(), "2026-07-01");
    expect(products).toHaveLength(1);
    expect(newProducts).toEqual([]);
  });
});
