/**
 * Helper: creates a chainable knex query builder that resolves to `value` when awaited.
 * `results` puede ser un array (filas) o un objeto (resultado de countDistinct).
 */
const makeBuilder = (results) => {
  const resolved = typeof results === "function" ? results : () => results;
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
    countDistinct: jest.fn(() => b),
    first: jest.fn(() => {
      const v = resolved();
      return makeBuilder(Array.isArray(v) ? v[0] : v);
    }),
    as: jest.fn(() => b),
    raw: jest.fn((x) => x),
    andOn: jest.fn(() => b),
    then: jest.fn((cb, errCb) => Promise.resolve(resolved()).then(cb, errCb)),
  };
  return b;
};

describe("GET_PRODUCTS", () => {
  let req, res, controller, db;

  const dataResult = [
    { IdProducto: 1, Descripcion: "Arroz", PrecioA: 10, Existencia: 50, Grupo: "Granos", Proveedor: "Proveedor A" },
    { IdProducto: 2, Descripcion: "Azúcar", PrecioA: 8, Existencia: 30, Grupo: "Dulces", Proveedor: "Proveedor B" },
  ];

  beforeEach(() => {
    jest.resetModules();
    jest.restoreAllMocks();

    // countDistinct resuelve primero (await countQuery), luego las filas.
    db = makeBuilder(() => [{ total: dataResult.length }, ...dataResult]);
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

  it("should return paginated response with category and provider joins when no filters are given", async () => {
    await controller.GET_PRODUCTS(req, res);

    expect(db.leftJoin).toHaveBeenCalledWith("grupos", "grupos.IdGrupo", "productos.Grupo");
    expect(db.leftJoin).toHaveBeenCalledWith("proveedores", "proveedores.IdProveedor", "productos.Proveedor");
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.any(Array),
        total: 2,
        page: 1,
        limit: null,
      }),
    );
  });

  it("should filter by search term", async () => {
    req.query.search = "arroz";
    await controller.GET_PRODUCTS(req, res);

    expect(db.where).toHaveBeenCalledWith("productos.Descripcion", "like", "%arroz%");
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("should filter by category", async () => {
    req.query.categoryId = "3";
    await controller.GET_PRODUCTS(req, res);

    expect(db.where).toHaveBeenCalledWith("productos.Grupo", "3");
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("should filter by provider", async () => {
    req.query.proveedorId = "7";
    await controller.GET_PRODUCTS(req, res);

    expect(db.where).toHaveBeenCalledWith("productos.Proveedor", "7");
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("should filter to products with stock when stockOnly is true", async () => {
    req.query.stockOnly = "true";
    await controller.GET_PRODUCTS(req, res);

    expect(db.where).toHaveBeenCalledWith("productos.Existencia", ">", 0);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("should paginate with page and limit", async () => {
    req.query.page = "2";
    req.query.limit = "10";
    await controller.GET_PRODUCTS(req, res);

    expect(db.limit).toHaveBeenCalledWith(10);
    expect(db.offset).toHaveBeenCalledWith(10);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        page: 2,
        limit: 10,
      }),
    );
  });

  it("should apply whitelisted sort columns", async () => {
    req.query.sortBy = "Existencia";
    req.query.sortDir = "desc";
    await controller.GET_PRODUCTS(req, res);

    expect(db.orderBy).toHaveBeenCalledWith("productos.Existencia", "desc");
  });

  it("should fall back to Descripcion asc for unknown sort columns", async () => {
    req.query.sortBy = "DROP TABLE productos";
    await controller.GET_PRODUCTS(req, res);

    expect(db.orderBy).toHaveBeenCalledWith("productos.Descripcion", "asc");
  });

  it("should respond 500 when the query fails", async () => {
    jest.resetModules();
    db = makeBuilder(() => Promise.reject(new Error("boom")));
    controller = require("../controllers/products");

    await controller.GET_PRODUCTS(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
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
