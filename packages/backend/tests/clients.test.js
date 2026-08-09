/**
 * Helper: chainable knex query builder that resolves (when awaited) values
 * from a queue, in call order. The controller awaits 3 queries:
 * clients list -> masterfact aggregates -> slavefact aggregates.
 */
const makeBuilder = (queue) => {
  const b = {
    select: jest.fn(() => b),
    from: jest.fn(() => b),
    innerJoin: jest.fn(() => b),
    leftJoin: jest.fn(() => b),
    where: jest.fn(() => b),
    andWhere: jest.fn(() => b),
    whereIn: jest.fn(() => b),
    whereNotIn: jest.fn(() => b),
    whereBetween: jest.fn(() => b),
    andWhereBetween: jest.fn(() => b),
    groupBy: jest.fn(() => b),
    orderBy: jest.fn(() => b),
    limit: jest.fn(() => b),
    offset: jest.fn(() => b),
    distinct: jest.fn(() => b),
    on: jest.fn(() => b),
    andOn: jest.fn(() => b),
    raw: jest.fn((x) => x),
    then: jest.fn((cb) => Promise.resolve(queue.shift()).then(cb)),
  };
  return b;
};

describe("GET_CLIENTS_LIST", () => {
  let req, res, controller, mockDb;

  const setup = (queue) => {
    jest.resetModules();
    jest.restoreAllMocks();
    mockDb = jest.fn(() => makeBuilder(queue));
    mockDb.raw = jest.fn((x) => x);
    jest.doMock("../database", () => mockDb);
    controller = require("../controllers/clients");

    req = {
      query: { page: "1", limit: "20", sortBy: "total_ventas", sortDir: "desc" },
      locals: { showNoe: { masterTable: "masterfact", slaveTable: "slavefact", idInvoice: "IdFactura" } },
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
  };

  const clients = [
    { IdCliente: "C1", Empresa: "Cliente Uno" },
    { IdCliente: "C2", Empresa: "Cliente Dos" },
    { IdCliente: "C3", Empresa: "Cliente Tres" },
  ];
  const masterAgg = [
    { IdCliente: "C1", last_factura: "2026-06-01", num_ventas: 5 },
    { IdCliente: "C2", last_factura: "2026-07-15", num_ventas: 2 },
  ];
  const slaveAgg = [
    { IdCliente: "C1", total_ventas: 1000, utilidad: 100 },
    { IdCliente: "C2", total_ventas: 500, utilidad: 50 },
  ];

  it("should return sorted rows with all 6 columns, defaulting clients without sales to 0", async () => {
    setup([clients, masterAgg, slaveAgg]);
    await controller.GET_CLIENTS_LIST(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const { data, total, page, limit } = res.json.mock.calls[0][0];

    expect(total).toBe(3);
    expect(page).toBe(1);
    expect(limit).toBe(20);

    // Default sort: total_ventas desc
    expect(data.map((r) => r.IdCliente)).toEqual(["C1", "C2", "C3"]);
    expect(data[0]).toEqual({
      IdCliente: "C1",
      Empresa: "Cliente Uno",
      last_factura: "2026-06-01",
      total_ventas: 1000,
      num_ventas: 5,
      utilidad: 100,
    });
    // Client without sales in the period still appears with zeros
    expect(data[2]).toEqual({
      IdCliente: "C3",
      Empresa: "Cliente Tres",
      last_factura: null,
      total_ventas: 0,
      num_ventas: 0,
      utilidad: 0,
    });
  });

  it("should filter clients by search", async () => {
    setup([clients, masterAgg, slaveAgg]);
    req.query.search = "Uno";
    await controller.GET_CLIENTS_LIST(req, res);

    const clientsBuilder = mockDb.mock.results[0].value;
    expect(clientsBuilder.where).toHaveBeenCalledWith("clientes.Empresa", "like", "%Uno%");
  });

  it("should filter clients by route", async () => {
    setup([clients, masterAgg, slaveAgg]);
    req.query.ruta = "R1";
    await controller.GET_CLIENTS_LIST(req, res);

    const clientsBuilder = mockDb.mock.results[0].value;
    expect(clientsBuilder.where).toHaveBeenCalledWith("clientes.Ruta", "R1");
  });

  it("should restrict aggregates to the filtered client ids", async () => {
    setup([clients, masterAgg, slaveAgg]);
    await controller.GET_CLIENTS_LIST(req, res);

    const masterBuilder = mockDb.mock.results[1].value;
    const slaveBuilder = mockDb.mock.results[2].value;
    expect(masterBuilder.whereIn).toHaveBeenCalledWith("mf.IdCliente", ["C1", "C2", "C3"]);
    expect(slaveBuilder.whereIn).toHaveBeenCalledWith("mf.IdCliente", ["C1", "C2", "C3"]);
  });

  it("should apply the date range to both aggregates", async () => {
    setup([clients, masterAgg, slaveAgg]);
    req.query.from = "2026-01-01";
    req.query.to = "2026-08-09";
    await controller.GET_CLIENTS_LIST(req, res);

    const masterBuilder = mockDb.mock.results[1].value;
    const slaveBuilder = mockDb.mock.results[2].value;
    expect(masterBuilder.andWhereBetween).toHaveBeenCalledWith("mf.Fecha", ["2026-01-01", "2026-08-09"]);
    expect(slaveBuilder.andWhereBetween).toHaveBeenCalledWith("mf.Fecha", ["2026-01-01", "2026-08-09"]);
  });

  it("should not apply date filters when no range is given", async () => {
    setup([clients, masterAgg, slaveAgg]);
    await controller.GET_CLIENTS_LIST(req, res);

    const masterBuilder = mockDb.mock.results[1].value;
    const slaveBuilder = mockDb.mock.results[2].value;
    expect(masterBuilder.andWhereBetween).not.toHaveBeenCalled();
    expect(slaveBuilder.andWhereBetween).not.toHaveBeenCalled();
  });

  it("should handle showNoe=true with masternoe/slavenoe and IdNoe", async () => {
    setup([clients, masterAgg, slaveAgg]);
    req.locals.showNoe = { masterTable: "masternoe", slaveTable: "slavenoe", idInvoice: "IdNoe" };
    await controller.GET_CLIENTS_LIST(req, res);

    expect(mockDb).toHaveBeenCalledWith("masternoe as mf");
    expect(mockDb).toHaveBeenCalledWith("slavenoe as sf");
    const slaveBuilder = mockDb.mock.results[2].value;
    expect(slaveBuilder.innerJoin).toHaveBeenCalled();
  });

  it("should paginate with offset/limit", async () => {
    setup([clients, masterAgg, slaveAgg]);
    req.query.page = "2";
    req.query.limit = "2";
    await controller.GET_CLIENTS_LIST(req, res);

    const { data, page, limit } = res.json.mock.calls[0][0];
    expect(page).toBe(2);
    expect(limit).toBe(2);
    expect(data).toHaveLength(1);
    expect(data[0].IdCliente).toBe("C3");
  });

  it("should sort by utilidad asc when requested", async () => {
    setup([clients, masterAgg, slaveAgg]);
    req.query.sortBy = "utilidad";
    req.query.sortDir = "asc";
    await controller.GET_CLIENTS_LIST(req, res);

    const { data } = res.json.mock.calls[0][0];
    expect(data.map((r) => r.IdCliente)).toEqual(["C3", "C2", "C1"]);
  });

  it("should sort by Empresa when requested", async () => {
    setup([clients, masterAgg, slaveAgg]);
    req.query.sortBy = "Empresa";
    req.query.sortDir = "asc";
    await controller.GET_CLIENTS_LIST(req, res);

    const { data } = res.json.mock.calls[0][0];
    // "Cliente Dos" < "Cliente Tres" < "Cliente Uno"
    expect(data.map((r) => r.IdCliente)).toEqual(["C2", "C3", "C1"]);
  });

  it("should return empty result when no clients match", async () => {
    setup([[], [], []]);
    await controller.GET_CLIENTS_LIST(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: [], total: 0 }));
    // Aggregates never run when there are no clients
    expect(mockDb).toHaveBeenCalledTimes(1);
  });

  it("should return 500 on database error", async () => {
    jest.resetModules();
    jest.restoreAllMocks();
    const failDb = jest.fn(() => {
      const b = makeBuilder([]);
      b.then = jest.fn((_ok, rej) => Promise.reject(new Error("DB error")).catch(rej || (() => {})));
      return b;
    });
    jest.doMock("../database", () => failDb);
    controller = require("../controllers/clients");

    await controller.GET_CLIENTS_LIST(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe("GET_CLIENTS_SIN_FACTURAR", () => {
  let req, res, controller, mockDb;

  // knex() call order: invoiced-in-period subquery (never awaited) -> clients
  // -> history aggregates -> revenue aggregates.
  const setup = (queue) => {
    jest.resetModules();
    jest.restoreAllMocks();
    mockDb = jest.fn(() => makeBuilder(queue));
    mockDb.raw = jest.fn((x) => x);
    jest.doMock("../database", () => mockDb);
    controller = require("../controllers/clients");

    req = {
      query: {
        from: "2026-01-01",
        to: "2026-08-09",
        page: "1",
        limit: "20",
        sortBy: "revenue_historico",
        sortDir: "desc",
      },
      locals: { showNoe: { masterTable: "masterfact", slaveTable: "slavefact", idInvoice: "IdFactura" } },
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
  };

  const clients = [
    { IdCliente: "C1", Empresa: "Cliente Uno", ruta_nombre: "Ruta 1" },
    { IdCliente: "C2", Empresa: "Cliente Dos", ruta_nombre: "Ruta 2" },
  ];
  const historyAgg = [{ IdCliente: "C1", last_factura: "2025-12-01", dias_inactivo: 251 }];
  const revenueAgg = [{ IdCliente: "C1", revenue_historico: 5000 }];

  it("should return rows with historical fields, defaulting never-billed clients", async () => {
    setup([clients, historyAgg, revenueAgg]);
    await controller.GET_CLIENTS_SIN_FACTURAR(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const { data, total, page, limit } = res.json.mock.calls[0][0];
    expect(total).toBe(2);
    expect(page).toBe(1);
    expect(limit).toBe(20);

    // Default sort: revenue_historico desc
    expect(data.map((r) => r.IdCliente)).toEqual(["C1", "C2"]);
    expect(data[0]).toEqual({
      IdCliente: "C1",
      Empresa: "Cliente Uno",
      ruta_nombre: "Ruta 1",
      last_factura: "2025-12-01",
      dias_inactivo: 251,
      revenue_historico: 5000,
    });
    // Client that never billed still appears with nulls and 0 revenue
    expect(data[1]).toEqual({
      IdCliente: "C2",
      Empresa: "Cliente Dos",
      ruta_nombre: "Ruta 2",
      last_factura: null,
      dias_inactivo: null,
      revenue_historico: 0,
    });
  });

  it("should require from and to", async () => {
    setup([[], [], []]);
    delete req.query.from;
    delete req.query.to;
    await controller.GET_CLIENTS_SIN_FACTURAR(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockDb).not.toHaveBeenCalled();
  });

  it("should filter by search and route", async () => {
    setup([clients, historyAgg, revenueAgg]);
    req.query.search = "Uno";
    req.query.ruta = "R1";
    await controller.GET_CLIENTS_SIN_FACTURAR(req, res);

    const clientsBuilder = mockDb.mock.results[1].value;
    expect(clientsBuilder.where).toHaveBeenCalledWith("c.Empresa", "like", "%Uno%");
    expect(clientsBuilder.where).toHaveBeenCalledWith("c.Ruta", "R1");
  });

  it("should restrict aggregates to the sin-facturar client ids", async () => {
    setup([clients, historyAgg, revenueAgg]);
    await controller.GET_CLIENTS_SIN_FACTURAR(req, res);

    const historyBuilder = mockDb.mock.results[2].value;
    const revenueBuilder = mockDb.mock.results[3].value;
    expect(historyBuilder.whereIn).toHaveBeenCalledWith("mh.IdCliente", ["C1", "C2"]);
    expect(revenueBuilder.whereIn).toHaveBeenCalledWith("mh.IdCliente", ["C1", "C2"]);
  });

  it("should handle showNoe=true with masternoe/slavenoe and IdNoe", async () => {
    setup([clients, historyAgg, revenueAgg]);
    req.locals.showNoe = { masterTable: "masternoe", slaveTable: "slavenoe", idInvoice: "IdNoe" };
    await controller.GET_CLIENTS_SIN_FACTURAR(req, res);

    expect(mockDb.mock.calls[0][0]).toBe("masternoe");
    expect(mockDb.mock.calls[2][0]).toBe("masternoe as mh");
    expect(mockDb.mock.calls[3][0]).toBe("slavenoe as sh");
  });

  it("should paginate with offset/limit", async () => {
    setup([clients, historyAgg, revenueAgg]);
    req.query.page = "2";
    req.query.limit = "1";
    await controller.GET_CLIENTS_SIN_FACTURAR(req, res);

    const { data, page, limit } = res.json.mock.calls[0][0];
    expect(page).toBe(2);
    expect(limit).toBe(1);
    expect(data).toHaveLength(1);
    expect(data[0].IdCliente).toBe("C2");
  });

  it("should sort by dias_inactivo asc when requested", async () => {
    const history = [
      { IdCliente: "C1", last_factura: "2025-12-01", dias_inactivo: 251 },
      { IdCliente: "C2", last_factura: "2026-07-01", dias_inactivo: 39 },
    ];
    setup([clients, history, revenueAgg]);
    req.query.sortBy = "dias_inactivo";
    req.query.sortDir = "asc";
    await controller.GET_CLIENTS_SIN_FACTURAR(req, res);

    const { data } = res.json.mock.calls[0][0];
    expect(data.map((r) => r.IdCliente)).toEqual(["C2", "C1"]);
  });

  it("should return empty result when no clients match", async () => {
    setup([[], [], []]);
    await controller.GET_CLIENTS_SIN_FACTURAR(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: [], total: 0 }));
    // Only the invoiced-in-period subquery and the clients query run
    expect(mockDb).toHaveBeenCalledTimes(2);
  });

  it("should return 500 on database error", async () => {
    jest.resetModules();
    jest.restoreAllMocks();
    const failDb = jest.fn(() => {
      const b = makeBuilder([]);
      b.then = jest.fn((_ok, rej) => Promise.reject(new Error("DB error")).catch(rej || (() => {})));
      return b;
    });
    jest.doMock("../database", () => failDb);
    controller = require("../controllers/clients");

    await controller.GET_CLIENTS_SIN_FACTURAR(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});
