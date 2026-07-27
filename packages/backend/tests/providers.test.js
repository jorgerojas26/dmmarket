/**
 * Helper: creates a chainable knex query builder that resolves to `value` when awaited.
 */
const makeBuilder = (value) => {
  const resolved = typeof value === 'function' ? value : (() => value);
  const b = {
    select: jest.fn(() => b),
    from: jest.fn(() => b),
    leftJoin: jest.fn(() => b),
    innerJoin: jest.fn(() => b),
    where: jest.fn(() => b),
    andWhere: jest.fn(() => b),
    whereBetween: jest.fn(() => b),
    andWhereBetween: jest.fn(() => b),
    groupBy: jest.fn(() => b),
    orderBy: jest.fn(() => b),
    orderByRaw: jest.fn(() => b),
    limit: jest.fn(() => b),
    offset: jest.fn(() => b),
    first: jest.fn(() => b),
    as: jest.fn(() => b),
    countDistinct: jest.fn(() => b),
    raw: jest.fn((x) => x),
    andOn: jest.fn(() => b),
    then: jest.fn((cb) => Promise.resolve(resolved()).then(cb)),
  };
  return b;
};

describe("GET_PROVIDERS_LIST", () => {
  let req, res, controller;

  beforeEach(() => {
    jest.resetModules();
    jest.restoreAllMocks();

    const dataResult = [
      {
        IdProveedor: 1,
        Empresa: "Proveedor A",
        total_compras: 1000,
        num_compras: 5,
        total_ventas: 2000,
        num_ventas: 10,
      },
    ];

    // Create a builder that returns `[{ total: 2 }]` for count queries
    const db = makeBuilder([{ total: 2 }]);
    // Override offset so the data query (await db.offset(n)) returns dataResult
    db.offset = jest.fn(() => ({
      then: jest.fn((cb) => Promise.resolve(dataResult).then(cb)),
    }));

    jest.doMock("../database", () => db);
    controller = require("../controllers/providers");

    req = {
      query: { page: "1", limit: "20", showNoe: "false" },
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("should return paginated list with all 6 columns", async () => {
    await controller.GET_PROVIDERS_LIST(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.any(Array),
        total: 2,
        page: 1,
        limit: 20,
      })
    );

    const { data } = res.json.mock.calls[0][0];
    expect(data[0]).toHaveProperty("IdProveedor");
    expect(data[0]).toHaveProperty("Empresa");
    expect(data[0]).toHaveProperty("total_compras");
    expect(data[0]).toHaveProperty("num_compras");
    expect(data[0]).toHaveProperty("total_ventas");
    expect(data[0]).toHaveProperty("num_ventas");
  });

  it("should filter by search query", async () => {
    req.query.search = "Proveedor";
    await controller.GET_PROVIDERS_LIST(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("should handle showNoe=true", async () => {
    req.query.showNoe = "true";
    await controller.GET_PROVIDERS_LIST(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("should handle pagination parameters", async () => {
    req.query.page = "2";
    req.query.limit = "10";
    await controller.GET_PROVIDERS_LIST(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("should return 500 on database error", async () => {
    jest.resetModules();
    jest.restoreAllMocks();
    const failDb = makeBuilder(() => { throw new Error("DB error"); });
    // Rejected promise on the count query
    failDb.then = jest.fn((_onFulfilled, onRejected) =>
      Promise.reject(new Error("DB error")).catch(onRejected || (() => {}))
    );
    jest.doMock("../database", () => failDb);
    controller = require("../controllers/providers");

    await controller.GET_PROVIDERS_LIST(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  it("should return empty data array when no providers match", async () => {
    jest.resetModules();
    jest.restoreAllMocks();
    const emptyDb = makeBuilder([{ total: 0 }]);
    emptyDb.offset = jest.fn(() => ({
      then: jest.fn((cb) => Promise.resolve([]).then(cb)),
    }));
    jest.doMock("../database", () => emptyDb);
    controller = require("../controllers/providers");

    await controller.GET_PROVIDERS_LIST(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ data: [], total: 0 })
    );
  });

  it("should order by total_ventas DESC by default", async () => {
    await controller.GET_PROVIDERS_LIST(req, res);
    const db = require("../database");
    expect(db.orderByRaw).toHaveBeenCalled();
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
      expect.objectContaining({ totalCompras: 100, totalVentas: 200, bestSeller: "V NOE" })
    );
  });

  it("should handle errors gracefully", async () => {
    const db = makeBuilder([]);
    db.select.mockImplementationOnce(() => { throw new Error("DB error"); });

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
      { vendedor: "Vendor A", fecha: "2024-06-15", monto: 500 },
      { vendedor: "Vendor B", fecha: "2024-05-10", monto: 300 },
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

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ data: [], total: 0 })
    );
  });

  it("should handle showNoe=true", async () => {
    req.query.showNoe = "true";
    const db = makeBuilder([]);
    db.countDistinct = jest.fn(() => makeBuilder([{ count: 1 }]));
    db.select = jest.fn(() => makeBuilder([{ vendedor: "V NOE", fecha: "2024-06-15", monto: 100 }]));

    jest.doMock("../database", () => db);
    controller = require("../controllers/providers");
    await controller.GET_PROVIDER_SALES(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("should handle errors gracefully", async () => {
    const db = makeBuilder([]);
    db.countDistinct = jest.fn(() => { throw new Error("DB error"); });

    jest.doMock("../database", () => db);
    controller = require("../controllers/providers");
    await controller.GET_PROVIDER_SALES(req, res);

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

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ data: [], total: 0 })
    );
  });

  it("should handle errors gracefully", async () => {
    const db = makeBuilder([]);
    db.countDistinct = jest.fn(() => { throw new Error("DB error"); });

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
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.any(String) })
    );
  });

  it("should handle errors gracefully", async () => {
    const db = makeBuilder([]);
    db.select.mockImplementationOnce(() => { throw new Error("DB error"); });

    jest.doMock("../database", () => db);
    controller = require("../controllers/providers");
    await controller.GET_PURCHASE_DETAIL(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});
