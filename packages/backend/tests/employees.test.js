const makeBuilder = (rows) => {
  const builder = {
    select: jest.fn(() => builder),
    from: jest.fn(() => builder),
    innerJoin: jest.fn(() => builder),
    leftJoin: jest.fn(() => builder),
    whereBetween: jest.fn(() => builder),
    andWhere: jest.fn(() => builder),
    groupBy: jest.fn(() => builder),
    orderBy: jest.fn(() => builder),
    on: jest.fn(() => builder),
    andOn: jest.fn(() => builder),
    // biome-ignore lint/suspicious/noThenProperty: knex query builders are awaitable.
    then: jest.fn((resolve) => Promise.resolve(rows).then(resolve)),
  };
  return builder;
};

describe("GET_SALES for employees", () => {
  it("returns utility per invoice computed from sale cost", async () => {
    jest.resetModules();
    jest.restoreAllMocks();
    const rows = [
      {
        invoiceId: 12,
        invoiceTotal: 500,
        utilidad: 125,
        commissionTotal: 25,
      },
    ];
    const db = makeBuilder(rows);
    db.raw = jest.fn((sql) => sql);
    jest.doMock("../database", () => db);
    const controller = require("../controllers/employees");
    const req = {
      params: { employeeId: "7" },
      query: { from: "2026-05-01", to: "2026-05-31" },
      locals: { showNoe: { masterTable: "masterfact", slaveTable: "slavefact", idInvoice: "IdFactura" } },
    };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };

    await controller.GET_SALES(req, res);

    expect(db.raw).toHaveBeenCalledWith(expect.stringContaining("as utilidad"));
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(rows);
  });
});
