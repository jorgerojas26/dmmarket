const makeBuilder = (rows) => {
  const builder = {
    select: jest.fn(() => builder),
    from: jest.fn(() => builder),
    innerJoin: jest.fn(() => builder),
    where: jest.fn(() => builder),
    on: jest.fn(() => builder),
    andOn: jest.fn(() => builder),
    // biome-ignore lint/suspicious/noThenProperty: knex query builders are awaitable.
    then: jest.fn((resolve) => Promise.resolve(rows).then(resolve)),
  };
  return builder;
};

describe("GET_INVOICE_DETAIL", () => {
  it("returns utility per product and for the whole invoice", async () => {
    jest.resetModules();
    jest.restoreAllMocks();
    const rows = [
      {
        idFactura: 12,
        fecha: "2026-05-10",
        cliente: "Cliente A",
        vendedor: "Vendedor A",
        descripcion: "Producto A",
        cantidad: 2,
        precio: 250,
        subtotal: 500,
        utilidad: 125,
      },
      {
        idFactura: 12,
        fecha: "2026-05-10",
        cliente: "Cliente A",
        vendedor: "Vendedor A",
        descripcion: "Producto B",
        cantidad: 1,
        precio: 300,
        subtotal: 300,
        utilidad: 80,
      },
    ];
    const db = makeBuilder(rows);
    db.raw = jest.fn((sql) => sql);
    jest.doMock("../database", () => db);
    const controller = require("../controllers/invoices");
    const req = {
      params: { invoiceId: "12" },
      locals: { showNoe: { masterTable: "masterfact", slaveTable: "slavefact", idInvoice: "IdFactura" } },
    };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };

    await controller.GET_INVOICE_DETAIL(req, res);

    expect(db.raw).toHaveBeenCalledWith(expect.stringContaining("as utilidad"));
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      idFactura: 12,
      fecha: "2026-05-10",
      cliente: "Cliente A",
      vendedor: "Vendedor A",
      total: 800,
      utilidad: 205,
      productos: [
        { descripcion: "Producto A", cantidad: 2, precio: 250, subtotal: 500, utilidad: 125 },
        { descripcion: "Producto B", cantidad: 1, precio: 300, subtotal: 300, utilidad: 80 },
      ],
    });
  });
});
