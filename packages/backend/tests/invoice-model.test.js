const makeBuilder = (rows = []) => {
  const builder = {
    distinct: jest.fn(() => builder),
    from: jest.fn(() => builder),
    innerJoin: jest.fn(() => builder),
    leftJoin: jest.fn(() => builder),
    where: jest.fn(() => builder),
    whereBetween: jest.fn(() => builder),
    whereIn: jest.fn(() => builder),
    groupBy: jest.fn(() => builder),
    orderBy: jest.fn(() => builder),
    orderByRaw: jest.fn(() => builder),
    limit: jest.fn(() => builder),
    offset: jest.fn(() => builder),
    select: jest.fn(() => builder),
    on: jest.fn(() => builder),
    andOn: jest.fn(() => builder),
    as: jest.fn(() => builder),
    joinRaw: jest.fn(() => builder),
    clone: jest.fn(),
    // biome-ignore lint/suspicious/noThenProperty: knex query builders are awaitable.
    then: jest.fn((resolve) => Promise.resolve(rows).then(resolve)),
  };
  return builder;
};

describe("GET_INVOICES", () => {
  it("returns all-filter totals independent of the current page", async () => {
    jest.resetModules();
    jest.restoreAllMocks();

    const countSubquery = makeBuilder();
    const totalsSubquery = makeBuilder();
    const pageIds = makeBuilder([{ invoiceId: "F-1" }]);
    const idQuery = makeBuilder();
    idQuery.clone.mockReturnValueOnce(countSubquery).mockReturnValueOnce(totalsSubquery).mockReturnValueOnce(pageIds);

    const totalsQuery = makeBuilder([{ total: 1200, utilidad: 300 }]);
    const lineItemsQuery = makeBuilder([
      {
        invoiceId: "F-1",
        client: "Cliente A",
        rif: "J-1",
        createdAt: "2026-05-10",
        IdProducto: 1,
        Descripcion: "Producto A",
        Cantidad: 2,
        Precio: 100,
        Costo: 50,
        group: "A",
        peso: 1,
      },
    ]);

    const knex = jest.fn((table) => {
      if (table === "slavefact as summary_sf") return totalsQuery;
      throw new Error(`Unexpected table: ${table}`);
    });
    knex.raw = jest.fn((sql) => sql);
    knex.count = jest.fn(() => makeBuilder([{ total: 8 }]));
    knex.select = jest.fn().mockReturnValueOnce(idQuery).mockReturnValueOnce(lineItemsQuery);
    jest.doMock("../database", () => knex);
    const model = require("../models/invoice");

    const result = await model.GET_INVOICES({
      from: "2026-05-01",
      to: "2026-05-31",
      showNoe: { masterTable: "masterfact", slaveTable: "slavefact", idInvoice: "IdFactura" },
      page: 2,
      limit: 1,
    });

    expect(result.pagination).toEqual({ page: 2, limit: 1, total: 8 });
    expect(result.totals).toEqual({ total: 1200, utilidad: 300 });
    expect(result.data[0]).toMatchObject({ invoiceId: "F-1", total: 200, utilidad: 100 });
  });
});
