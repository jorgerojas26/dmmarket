/**
 * Helper: creates a chainable knex query builder that resolves to `value` when awaited.
 */
const makeBuilder = (value) => {
  const resolved = typeof value === "function" ? value : () => value;
  const b = {
    select: jest.fn(() => b),
    from: jest.fn(() => b),
    leftJoin: jest.fn(() => b),
    innerJoin: jest.fn(() => b),
    where: jest.fn(() => b),
    andWhere: jest.fn(() => b),
    whereIn: jest.fn(() => b),
    whereBetween: jest.fn(() => b),
    andWhereBetween: jest.fn(() => b),
    groupBy: jest.fn(() => b),
    orderBy: jest.fn(() => b),
    orderByRaw: jest.fn(() => b),
    limit: jest.fn(() => b),
    offset: jest.fn(() => b),
    on: jest.fn(() => b),
    // Real knex `.first()` returns the row OBJECT, not an array
    first: jest.fn(() => {
      const v = resolved();
      return makeBuilder(Array.isArray(v) ? v[0] : v);
    }),
    as: jest.fn(() => b),
    countDistinct: jest.fn(() => b),
    raw: jest.fn((x) => x),
    andOn: jest.fn(() => b),
    then: jest.fn((cb) => Promise.resolve(resolved()).then(cb)),
  };
  return b;
};

describe("GET_PROVIDERS_LIST", () => {
  let req, res, controller, mockDb;

  // Each of the 5 knex() calls returns a builder with its own resolved value,
  // in call order: providers -> purchases counts -> purchases totals ->
  // sales counts -> sales totals.
  const setup = ([providers, purchasesCounts, purchasesTotals, salesCounts, salesTotals]) => {
    jest.resetModules();
    jest.restoreAllMocks();
    mockDb = jest.fn();
    mockDb.raw = jest.fn((x) => x);
    mockDb
      .mockReturnValueOnce(makeBuilder(providers))
      .mockReturnValueOnce(makeBuilder(purchasesCounts))
      .mockReturnValueOnce(makeBuilder(purchasesTotals))
      .mockReturnValueOnce(makeBuilder(salesCounts))
      .mockReturnValueOnce(makeBuilder(salesTotals));
    jest.doMock("../database", () => mockDb);
    controller = require("../controllers/providers");

    req = {
      query: { page: "1", limit: "20", sortBy: "total_ventas", sortDir: "desc" },
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
  };

  beforeEach(() => {
    const providers = [
      { IdProveedor: 1, Empresa: "Proveedor A" },
      { IdProveedor: 2, Empresa: "Proveedor B" },
    ];
    const purchasesCounts = [{ IdProveedor: 1, num_compras: 5 }];
    const purchasesTotals = [{ IdProveedor: 1, total_compras: 1000 }];
    const salesCounts = [{ Proveedor: 1, num_ventas: 10 }];
    const salesTotals = [{ Proveedor: 1, total_ventas: 2000 }];
    setup([providers, purchasesCounts, purchasesTotals, salesCounts, salesTotals]);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("should return paginated list with all 6 columns, defaulting providers without data to 0", async () => {
    await controller.GET_PROVIDERS_LIST(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.any(Array),
        total: 2,
        page: 1,
        limit: 20,
      }),
    );

    const { data } = res.json.mock.calls[0][0];
    expect(data[0]).toEqual({
      IdProveedor: 1,
      Empresa: "Proveedor A",
      total_compras: 1000,
      num_compras: 5,
      total_ventas: 2000,
      num_ventas: 10,
    });
    // Provider without purchases/sales still appears with zeros
    expect(data[1]).toEqual({
      IdProveedor: 2,
      Empresa: "Proveedor B",
      total_compras: 0,
      num_compras: 0,
      total_ventas: 0,
      num_ventas: 0,
    });
  });

  it("should filter by search query", async () => {
    req.query.search = "Proveedor";
    await controller.GET_PROVIDERS_LIST(req, res);

    const providersBuilder = mockDb.mock.results[0].value;
    expect(providersBuilder.where).toHaveBeenCalledWith("p.Empresa", "like", "%Proveedor%");
  });

  it("should restrict all aggregates to the filtered provider ids", async () => {
    await controller.GET_PROVIDERS_LIST(req, res);

    for (let i = 1; i <= 4; i++) {
      const builder = mockDb.mock.results[i].value;
      expect(builder.whereIn).toHaveBeenCalledWith(expect.any(String), [1, 2]);
    }
  });

  it("should handle showNoe=true with masternoe/slavenoe and IdNoe", async () => {
    req.query.showNoe = "true";
    await controller.GET_PROVIDERS_LIST(req, res);

    const salesCountsBuilder = mockDb.mock.results[3].value;
    const salesTotalsBuilder = mockDb.mock.results[4].value;
    expect(salesCountsBuilder.innerJoin).toHaveBeenCalledWith("slavenoe as sf", "sf.IdProducto", "pr.IdProducto");
    expect(salesCountsBuilder.innerJoin).toHaveBeenCalledWith("masternoe as mf", expect.any(Function));
    expect(salesTotalsBuilder.innerJoin).toHaveBeenCalledWith("slavenoe as sf", "sf.IdProducto", "pr.IdProducto");
    expect(salesTotalsBuilder.innerJoin).toHaveBeenCalledWith("masternoe as mf", expect.any(Function));
  });

  it("should handle pagination parameters", async () => {
    req.query.page = "2";
    req.query.limit = "2";
    await controller.GET_PROVIDERS_LIST(req, res);

    const { data, page, limit } = res.json.mock.calls[0][0];
    expect(page).toBe(2);
    expect(limit).toBe(2);
    expect(data).toHaveLength(0);
  });

  it("should return 500 on database error", async () => {
    jest.resetModules();
    jest.restoreAllMocks();
    const failDb = jest.fn(() => {
      const b = makeBuilder([]);
      b.then = jest.fn((_onFulfilled, onRejected) =>
        Promise.reject(new Error("DB error")).catch(onRejected || (() => {})),
      );
      return b;
    });
    failDb.raw = jest.fn((x) => x);
    jest.doMock("../database", () => failDb);
    controller = require("../controllers/providers");

    await controller.GET_PROVIDERS_LIST(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  it("should return empty data array when no providers match", async () => {
    setup([[], [], [], [], []]);
    await controller.GET_PROVIDERS_LIST(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: [], total: 0 }));
    // Aggregates never run when there are no providers
    expect(mockDb).toHaveBeenCalledTimes(1);
  });

  it("should order by total_ventas DESC by default", async () => {
    const providers = [
      { IdProveedor: 1, Empresa: "Proveedor A" },
      { IdProveedor: 2, Empresa: "Proveedor B" },
    ];
    const purchasesCounts = [{ IdProveedor: 1, num_compras: 5 }];
    const purchasesTotals = [{ IdProveedor: 1, total_compras: 1000 }];
    const salesCounts = [
      { Proveedor: 1, num_ventas: 10 },
      { Proveedor: 2, num_ventas: 99 },
    ];
    const salesTotals = [
      { Proveedor: 1, total_ventas: 2000 },
      { Proveedor: 2, total_ventas: 5000 },
    ];
    setup([providers, purchasesCounts, purchasesTotals, salesCounts, salesTotals]);

    await controller.GET_PROVIDERS_LIST(req, res);
    const { data } = res.json.mock.calls[0][0];
    expect(data.map((r) => r.IdProveedor)).toEqual([2, 1]);
  });

  it("should filter sales and purchases by date range", async () => {
    req.query.from = "2026-01-01";
    req.query.to = "2026-12-31";
    await controller.GET_PROVIDERS_LIST(req, res);

    const purchasesCountsBuilder = mockDb.mock.results[1].value;
    const purchasesTotalsBuilder = mockDb.mock.results[2].value;
    const salesCountsBuilder = mockDb.mock.results[3].value;
    const salesTotalsBuilder = mockDb.mock.results[4].value;
    expect(purchasesCountsBuilder.andWhereBetween).toHaveBeenCalledWith("mc.Fecha", ["2026-01-01", "2026-12-31"]);
    expect(purchasesTotalsBuilder.andWhereBetween).toHaveBeenCalledWith("mc.Fecha", ["2026-01-01", "2026-12-31"]);
    expect(salesCountsBuilder.andWhereBetween).toHaveBeenCalledWith("mf.Fecha", ["2026-01-01", "2026-12-31"]);
    expect(salesTotalsBuilder.andWhereBetween).toHaveBeenCalledWith("mf.Fecha", ["2026-01-01", "2026-12-31"]);
  });

  it("should not apply date filters when no range is given", async () => {
    await controller.GET_PROVIDERS_LIST(req, res);

    for (let i = 1; i <= 4; i++) {
      const builder = mockDb.mock.results[i].value;
      expect(builder.andWhereBetween).not.toHaveBeenCalled();
    }
  });
});

describe("GET_PROVIDER_SUMMARY", () => {
  let req, res, controller;

  beforeEach(() => {
    jest.resetModules();
    jest.restoreAllMocks();

    req = {
      params: { providerId: "1" },
      query: { from: "2024-01-01", to: "2024-12-31", showNoe: "false" },
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
  });

  it("should return summary with compras, ventas and bestSeller", async () => {
    const db = makeBuilder([]);
    db.select
      .mockImplementationOnce(() => makeBuilder([{ totalCompras: 5000, numCompras: 10 }]))
      .mockImplementationOnce(() => makeBuilder([{ totalVentas: 8000, numVentas: 15 }]))
      .mockImplementationOnce(() => makeBuilder([{ Empresa: "Vendedor Top", total: 3000 }]));

    jest.doMock("../database", () => db);
    controller = require("../controllers/providers");
    await controller.GET_PROVIDER_SUMMARY(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      totalCompras: 5000,
      numCompras: 10,
      totalVentas: 8000,
      numVentas: 15,
      bestSeller: "Vendedor Top",
    });
  });

  it("should return null bestSeller when no sales exist", async () => {
    const db = makeBuilder([]);
    db.select
      .mockImplementationOnce(() => makeBuilder([{ totalCompras: 0, numCompras: 0 }]))
      .mockImplementationOnce(() => makeBuilder([{ totalVentas: 0, numVentas: 0 }]))
      .mockImplementationOnce(() => makeBuilder([null]));

    jest.doMock("../database", () => db);
    controller = require("../controllers/providers");
    await controller.GET_PROVIDER_SUMMARY(req, res);

    expect(res.json).toHaveBeenCalledWith({
      totalCompras: 0,
      numCompras: 0,
      totalVentas: 0,
      numVentas: 0,
      bestSeller: null,
    });
  });

  it("should handle showNoe=true", async () => {
    req.query.showNoe = "true";
    const db = makeBuilder([]);
    db.select
      .mockImplementationOnce(() => makeBuilder([{ totalCompras: 100, numCompras: 2 }]))
      .mockImplementationOnce(() => makeBuilder([{ totalVentas: 200, numVentas: 3 }]))
      .mockImplementationOnce(() => makeBuilder([{ Empresa: "V NOE", total: 200 }]));

    jest.doMock("../database", () => db);
    controller = require("../controllers/providers");
    await controller.GET_PROVIDER_SUMMARY(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ totalCompras: 100, totalVentas: 200, bestSeller: "V NOE" }),
    );
  });

  it("should handle errors gracefully", async () => {
    const db = makeBuilder([]);
    db.select.mockImplementationOnce(() => {
      throw new Error("DB error");
    });

    jest.doMock("../database", () => db);
    controller = require("../controllers/providers");
    await controller.GET_PROVIDER_SUMMARY(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe("GET_PROVIDER_SALES", () => {
  let req, res, controller;

  beforeEach(() => {
    jest.resetModules();
    jest.restoreAllMocks();

    req = {
      params: { providerId: "1" },
      query: { from: "2024-01-01", to: "2024-12-31", page: "1", limit: "20", showNoe: "false" },
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
  });

  it("should return paginated sales data", async () => {
    const mockSales = [
      { cliente: "Client A", vendedor: "Vendor A", fecha: "2024-06-15", monto: 500 },
      { cliente: "Client B", vendedor: "Vendor B", fecha: "2024-05-10", monto: 300 },
    ];

    const db = makeBuilder([]);
    db.countDistinct = jest.fn(() => makeBuilder([{ count: 2 }]));
    db.select = jest.fn(() => makeBuilder(mockSales));

    jest.doMock("../database", () => db);
    controller = require("../controllers/providers");
    await controller.GET_PROVIDER_SALES(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const called = res.json.mock.calls[0][0];
    expect(called.data).toEqual(mockSales);
    expect(called.total).toBe(2);
    expect(called.page).toBe(1);
    expect(called.limit).toBe(20);
  });

  it("should return empty array when no sales", async () => {
    const db = makeBuilder([]);
    db.countDistinct = jest.fn(() => makeBuilder([{ count: 0 }]));
    db.select = jest.fn(() => makeBuilder([]));

    jest.doMock("../database", () => db);
    controller = require("../controllers/providers");
    await controller.GET_PROVIDER_SALES(req, res);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: [], total: 0 }));
  });

  it("should handle showNoe=true", async () => {
    req.query.showNoe = "true";
    const db = makeBuilder([]);
    db.countDistinct = jest.fn(() => makeBuilder([{ count: 1 }]));
    db.select = jest.fn(() =>
      makeBuilder([{ cliente: "Client NOE", vendedor: "V NOE", fecha: "2024-06-15", monto: 100 }]),
    );

    jest.doMock("../database", () => db);
    controller = require("../controllers/providers");
    await controller.GET_PROVIDER_SALES(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("should handle errors gracefully", async () => {
    const db = makeBuilder([]);
    db.countDistinct = jest.fn(() => {
      throw new Error("DB error");
    });

    jest.doMock("../database", () => db);
    controller = require("../controllers/providers");
    await controller.GET_PROVIDER_SALES(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe("GET_PROVIDER_CLIENTS", () => {
  let req, res, controller;

  beforeEach(() => {
    jest.resetModules();
    jest.restoreAllMocks();

    req = {
      params: { providerId: "1" },
      query: { from: "2024-01-01", to: "2024-12-31", page: "1", limit: "20", showNoe: "false" },
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
  });

  it("should return clients with cliente, numVentas and totalVentas", async () => {
    const mockClients = [
      { cliente: "Client A", numVentas: 5, totalVentas: 500, utilidad: 100 },
      { cliente: "Client B", numVentas: 3, totalVentas: 300, utilidad: 60 },
    ];

    const db = makeBuilder([]);
    db.countDistinct = jest.fn(() => makeBuilder([{ count: 2 }]));
    db.select = jest.fn(() => makeBuilder(mockClients));

    jest.doMock("../database", () => db);
    controller = require("../controllers/providers");
    await controller.GET_PROVIDER_CLIENTS(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const called = res.json.mock.calls[0][0];
    expect(called.data).toEqual(mockClients);
    expect(called.total).toBe(2);
    expect(called.data[0]).toHaveProperty("cliente");
    expect(called.data[0]).toHaveProperty("numVentas");
    expect(called.data[0]).toHaveProperty("totalVentas");
  });

  it("should return empty array when no clients", async () => {
    const db = makeBuilder([]);
    db.countDistinct = jest.fn(() => makeBuilder([{ count: 0 }]));
    db.select = jest.fn(() => makeBuilder([]));

    jest.doMock("../database", () => db);
    controller = require("../controllers/providers");
    await controller.GET_PROVIDER_CLIENTS(req, res);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: [], total: 0 }));
  });

  it("should handle errors gracefully", async () => {
    const db = makeBuilder([]);
    db.countDistinct = jest.fn(() => {
      throw new Error("DB error");
    });

    jest.doMock("../database", () => db);
    controller = require("../controllers/providers");
    await controller.GET_PROVIDER_CLIENTS(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe("GET_PROVIDER_PRODUCTS", () => {
  let req, res, controller;

  beforeEach(() => {
    jest.resetModules();
    jest.restoreAllMocks();

    req = {
      params: { providerId: "1" },
      query: { from: "2024-01-01", to: "2024-12-31", page: "1", limit: "20", showNoe: "false" },
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
  });

  it("should return products with producto, cantidad and totalVentas", async () => {
    const mockProducts = [
      { producto: "Product A", cantidad: 10, totalVentas: 500, utilidad: 100 },
      { producto: "Product B", cantidad: 4, totalVentas: 300, utilidad: 60 },
    ];

    const db = makeBuilder([]);
    db.countDistinct = jest.fn(() => makeBuilder([{ count: 2 }]));
    db.select = jest.fn(() => makeBuilder(mockProducts));

    jest.doMock("../database", () => db);
    controller = require("../controllers/providers");
    await controller.GET_PROVIDER_PRODUCTS(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const called = res.json.mock.calls[0][0];
    expect(called.data).toEqual(mockProducts);
    expect(called.total).toBe(2);
    expect(called.data[0]).toHaveProperty("producto");
    expect(called.data[0]).toHaveProperty("cantidad");
    expect(called.data[0]).toHaveProperty("totalVentas");
  });

  it("should return empty array when no products", async () => {
    const db = makeBuilder([]);
    db.countDistinct = jest.fn(() => makeBuilder([{ count: 0 }]));
    db.select = jest.fn(() => makeBuilder([]));

    jest.doMock("../database", () => db);
    controller = require("../controllers/providers");
    await controller.GET_PROVIDER_PRODUCTS(req, res);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: [], total: 0 }));
  });

  it("should handle errors gracefully", async () => {
    const db = makeBuilder([]);
    db.countDistinct = jest.fn(() => {
      throw new Error("DB error");
    });

    jest.doMock("../database", () => db);
    controller = require("../controllers/providers");
    await controller.GET_PROVIDER_PRODUCTS(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe("GET_PROVIDER_PURCHASES", () => {
  let req, res, controller;

  beforeEach(() => {
    jest.resetModules();
    jest.restoreAllMocks();

    req = {
      params: { providerId: "1" },
      query: { from: "2024-01-01", to: "2024-12-31", page: "1", limit: "20" },
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
  });

  it("should return paginated purchases data", async () => {
    const mockPurchases = [
      { idFactura: "FAC-001", fecha: "2024-06-15", monto: 1500 },
      { idFactura: "FAC-002", fecha: "2024-05-10", monto: 800 },
    ];

    const db = makeBuilder([]);
    db.countDistinct = jest.fn(() => makeBuilder([{ count: 2 }]));
    db.select = jest.fn(() => makeBuilder(mockPurchases));

    jest.doMock("../database", () => db);
    controller = require("../controllers/providers");
    await controller.GET_PROVIDER_PURCHASES(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const called = res.json.mock.calls[0][0];
    expect(called.data).toEqual(mockPurchases);
    expect(called.total).toBe(2);
    expect(called.page).toBe(1);
    expect(called.limit).toBe(20);
  });

  it("should return empty array when no purchases", async () => {
    const db = makeBuilder([]);
    db.countDistinct = jest.fn(() => makeBuilder([{ count: 0 }]));
    db.select = jest.fn(() => makeBuilder([]));

    jest.doMock("../database", () => db);
    controller = require("../controllers/providers");
    await controller.GET_PROVIDER_PURCHASES(req, res);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: [], total: 0 }));
  });

  it("should handle errors gracefully", async () => {
    const db = makeBuilder([]);
    db.countDistinct = jest.fn(() => {
      throw new Error("DB error");
    });

    jest.doMock("../database", () => db);
    controller = require("../controllers/providers");
    await controller.GET_PROVIDER_PURCHASES(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe("GET_PURCHASE_DETAIL", () => {
  let req, res, controller;

  beforeEach(() => {
    jest.resetModules();
    jest.restoreAllMocks();

    req = {
      params: { providerId: "1", invoiceId: "FAC-001" },
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
  });

  it("should return purchase detail with products", async () => {
    const mockMaster = [{ IdFactura: "FAC-001", Fecha: "2024-06-15" }];
    const mockProductos = [
      { descripcion: "Product A", cantidad: 10, precio: 50, subtotal: 500 },
      { descripcion: "Product B", cantidad: 5, precio: 100, subtotal: 500 },
    ];

    const db = makeBuilder([]);
    db.select
      .mockImplementationOnce(() => makeBuilder(mockMaster))
      .mockImplementationOnce(() => makeBuilder(mockProductos));

    jest.doMock("../database", () => db);
    controller = require("../controllers/providers");
    await controller.GET_PURCHASE_DETAIL(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      idFactura: "FAC-001",
      fecha: "2024-06-15",
      productos: mockProductos,
      total: 1000,
    });
  });

  it("should return 404 when invoice not found", async () => {
    const db = makeBuilder([]);
    db.select.mockImplementationOnce(() => makeBuilder([]));

    jest.doMock("../database", () => db);
    controller = require("../controllers/providers");
    await controller.GET_PURCHASE_DETAIL(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.any(String) }));
  });

  it("should handle errors gracefully", async () => {
    const db = makeBuilder([]);
    db.select.mockImplementationOnce(() => {
      throw new Error("DB error");
    });

    jest.doMock("../database", () => db);
    controller = require("../controllers/providers");
    await controller.GET_PURCHASE_DETAIL(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});
