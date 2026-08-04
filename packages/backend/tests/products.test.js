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
    whereBetween: jest.fn(() => b),
    andWhereBetween: jest.fn(() => b),
    groupBy: jest.fn(() => b),
    orderBy: jest.fn(() => b),
    orderByRaw: jest.fn(() => b),
    limit: jest.fn(() => b),
    offset: jest.fn(() => b),
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

describe("GET_PRODUCTS", () => {
  let req, res, controller;

  beforeEach(() => {
    jest.resetModules();
    jest.restoreAllMocks();

    const dataResult = [
      { IdProducto: 1, Descripcion: "Arroz", PrecioA: 10, Existencia: 50 },
      { IdProducto: 2, Descripcion: "Azúcar", PrecioA: 8, Existencia: 30 },
    ];

    const db = makeBuilder(dataResult);
    jest.doMock("../database", () => db);
    controller = require("../controllers/products");

    req = { query: {} };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("should return all products when no filter is given", async () => {
    await controller.GET_PRODUCTS(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.any(Array));
    expect(res.json.mock.calls[0][0]).toHaveLength(2);
    expect(res.json.mock.calls[0][0][0]).toHaveProperty("Descripcion", "Arroz");
  });

  it("should filter products by query", async () => {
    req.query.filter = "arroz";
    await controller.GET_PRODUCTS(req, res);

    const db = require("../database");
    expect(db.where).toHaveBeenCalledWith(expect.stringContaining("arroz"));
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.any(Array));
  });
});

describe("removed products endpoints", () => {
  let controller;

  beforeEach(() => {
    jest.resetModules();
    jest.restoreAllMocks();
    jest.doMock("../database", () => makeBuilder([]));
    controller = require("../controllers/products");
  });

  it("should no longer export handlers for deleted cards (cost fluctuation, stock, cost by group, group, price lists)", () => {
    expect(controller.GET_COST_FLUCTUATION).toBeUndefined();
    expect(controller.GET_STOCK).toBeUndefined();
    expect(controller.GET_COST_BY_GROUP).toBeUndefined();
    expect(controller.GET_BY_GROUP).toBeUndefined();
    expect(controller.GET_PRICE_LIST).toBeUndefined();
    expect(controller.GET_PRICE_LIST_BY_GROUP).toBeUndefined();
  });
});
