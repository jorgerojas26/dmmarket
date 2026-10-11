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
    const { products, newProducts } = splitParetoByAge([rows[0]], new Map([[1, "2021-03-20"]]), "2021-04-01");
    expect(products).toEqual([]);
    expect(newProducts).toHaveLength(1);
  });

  it("clasifica y ordena fechas de compra devueltas como Buffer", () => {
    const firstPurchases = new Map([
      [1, Buffer.from("2026-10-09")],
      [2, Buffer.from("2026-10-10")],
      [3, Buffer.from("2025-01-01")],
    ]);
    const { products, newProducts } = splitParetoByAge(rows, firstPurchases, "2026-10-11");
    expect(products.map((p) => p.productId)).toEqual([3]);
    expect(products[0].firstPurchaseDate).toBe("2025-01-01");
    expect(newProducts.map((p) => p.productId)).toEqual([2, 1]);
    expect(newProducts.map((p) => p.firstPurchaseDate)).toEqual(["2026-10-10", "2026-10-09"]);
  });

  it("mantiene el límite de 30 días y las fechas nulas al combinar texto y Buffer", () => {
    const firstPurchases = new Map([
      [1, Buffer.from("2026-06-01")],
      [2, "2026-06-30"],
      [3, null],
    ]);
    const { products, newProducts } = splitParetoByAge(rows, firstPurchases, "2026-07-01");
    expect(products.map((p) => p.productId)).toEqual([1, 3]);
    expect(products.map((p) => p.firstPurchaseDate)).toEqual(["2026-06-01", null]);
    expect(newProducts.map((p) => p.productId)).toEqual([2]);
  });

  it("conserva en el ABC productos sin primera compra conocida", () => {
    const { products, newProducts } = splitParetoByAge([rows[0]], new Map(), "2026-07-01");
    expect(products).toHaveLength(1);
    expect(newProducts).toEqual([]);
  });
});
