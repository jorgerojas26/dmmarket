const { createHash } = require("node:crypto");
const { Money, fail, decimal, fixed, total, allocate } = require("./utils/receivables-money");

const hash = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const parseJson = (value) => (typeof value === "string" ? JSON.parse(value) : value);
const types = { payment: "ABONO", void: "ANULACION", close: "CIERRE", reopen: "REAPERTURA" };

function localDate(date) {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Caracas" }).format(date);
}

function timestamp(date) {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/Caracas",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  })
    .format(date)
    .replace(",", "")
    .concat(".", String(date.getMilliseconds()).padStart(3, "0"));
}

function dateOnly(value) {
  if (!value || value === "0000-00-00") return null;
  if (!(value instanceof Date)) return String(value).slice(0, 10);
  if (!Number.isFinite(value.getTime())) return null;
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

function integer(value, fallback, max = 1000000) {
  if (value === undefined || value === null) return fallback;
  if (!/^\d+$/.test(String(value))) fail("Número de registro o página no válido.");
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < 1 || result > max) fail("Número de registro o página no válido.");
  return result;
}

function text(value, max = 250, required = false) {
  if (value !== undefined && typeof value !== "string") fail("El texto enviado no es válido.");
  const result = (value || "").trim();
  if (result.length > max || (required && !result))
    fail(required ? "Indica un motivo para continuar." : "El texto es demasiado largo.");
  return result;
}

function input(body, today) {
  if (!Object.hasOwn(types, body.type)) fail("Operación de cobranza no válida.");
  const result = { type: body.type };
  if (body.type === "payment") {
    result.amount = fixed(decimal(body.amount, 4, true));
    if (!["USD", "BsS"].includes(body.currency)) fail("Selecciona USD o bolívares.");
    result.currency = body.currency;
    if (
      typeof body.date !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(body.date) ||
      !Number.isFinite(Date.parse(`${body.date}T00:00:00Z`)) ||
      new Date(`${body.date}T00:00:00Z`).toISOString().slice(0, 10) !== body.date ||
      body.date < "1000-01-01" ||
      body.date > today
    ) {
      fail("Indica una fecha de pago válida, no posterior a hoy.");
    }
    result.date = body.date;
    if (!["EFECTIVO", "TRANSFERENCIA", "PAGO MOVIL", "TARJETA", "OTRO"].includes(body.method))
      fail("Selecciona un método de pago.");
    result.method = body.method;
    result.reference = text(body.reference, 50);
    result.bank = text(body.bank, 50);
    result.notes = text(body.notes);
  } else {
    result.reason = text(body.reason, 250, true);
    result.id = integer(body.id, null, 2147483647);
    if (body.type !== "close" && !result.id) fail("Selecciona el registro que deseas corregir.");
  }
  return result;
}

const eligible = (d) =>
  d.TipoDoc === "FAC" &&
  d.MonedaOriginal === "USD" &&
  d.Estatus !== "ANULADO" &&
  Number(d.saleCancelled) === 0 &&
  d.saleClient === d.IdCliente;

function createReceivablesService({
  db,
  enabled = () => process.env.CXC_WRITES_ENABLED === "1",
  now = () => new Date(),
}) {
  async function readiness() {
    const tables = await Promise.all(
      ["cxc_documentos", "cxc_movimientos", "cxc_cruces", "cxc_operaciones", "cxc_cierres"].map((table) =>
        db.schema.hasTable(table),
      ),
    );
    return {
      available: tables.every(Boolean),
      writesEnabled: tables.every(Boolean) && enabled(),
      today: localDate(now()),
    };
  }

  async function requireSchema(write = false) {
    const status = await readiness();
    if (!status.available)
      fail("Cuentas por cobrar requiere su esquema y migración. Consulta la guía de habilitación.", 503);
    if (write && !status.writesEnabled)
      fail("Los cobros están deshabilitados hasta conciliar la cartera operativa y habilitar CXC_WRITES_ENABLED.", 409);
    return status;
  }

  function documents(connection, clientId) {
    return connection("cxc_documentos as d")
      .leftJoin("masterfact as f", "f.IdFactura", "d.IdFactura")
      .where("d.IdCliente", clientId)
      .where("d.TipoDoc", "FAC")
      .where("d.MonedaOriginal", "USD")
      .select("d.*", "f.Anulada as saleCancelled", "f.IdCliente as saleClient")
      .orderByRaw("CASE WHEN d.FechaVencimiento IS NULL OR d.FechaVencimiento = '0000-00-00' THEN 1 ELSE 0 END")
      .orderBy("d.FechaVencimiento")
      .orderBy("d.FechaEmision")
      .orderBy("d.IdDocumento");
  }

  async function context(connection, clientId, lock = false) {
    const clientQuery = connection("clientes").where("IdCliente", clientId).first();
    const client = await (lock ? clientQuery.forUpdate() : clientQuery);
    if (!client) fail("Cliente no encontrado.", 404);
    const docsQuery = documents(connection, clientId);
    const docs = await (lock ? docsQuery.forUpdate() : docsQuery);
    const closures = await connection("cxc_cierres as c")
      .join("cxc_documentos as d", "d.IdDocumento", "c.IdDocumento")
      .where("d.IdCliente", clientId)
      .whereNull("c.Reapertura")
      .select("c.*")
      .orderBy("c.IdCierre");
    return { client, docs, closures };
  }

  function summary(docs, today) {
    const valid = docs.filter(eligible).filter((d) => new Money(d.SaldoActual).gt(0));
    return {
      balance: fixed(total(valid.map((d) => d.SaldoActual))),
      overdue: fixed(
        total(
          valid
            .filter((d) => dateOnly(d.FechaVencimiento) && dateOnly(d.FechaVencimiento) < today)
            .map((d) => d.SaldoActual),
        ),
      ),
      pendingCount: valid.length,
    };
  }

  async function plan(connection, state, payload, lock = false) {
    const valid = state.docs.filter(eligible);
    const balance = total(valid.map((d) => d.SaldoActual));
    let result;
    let rate = null;
    if (payload.type === "payment") {
      if (balance.lte(0)) fail("El cliente no tiene deuda pendiente para aplicar un abono.");
      rate = "1.000000";
      if (payload.currency === "BsS") {
        const query = connection("divisas").where("Simbolo", "BsS").orderBy("IdDivisa").first();
        const currency = await (lock ? query.forUpdate() : query);
        if (!currency || !new Money(currency.Cambio || 0).isFinite() || new Money(currency.Cambio || 0).lte(0))
          fail("La tasa REF no está disponible. No se puede registrar el abono en bolívares.");
        rate = decimal(new Money(currency.Cambio).toFixed(6), 6, true).toFixed(6);
      }
      const base = decimal(new Money(payload.amount).div(rate).toFixed(4), 4, true);
      result = { ...payload, rate, base: fixed(base), ...allocate(valid, base) };
      result.balanceAfter = fixed(balance.minus(result.applied));
    } else if (payload.type === "close") {
      const selected = valid.filter(
        (d) => new Money(d.SaldoActual).gt(0) && (!payload.id || d.IdDocumento === payload.id),
      );
      if (!selected.length) fail("No hay deuda pendiente en el alcance seleccionado.");
      result = {
        ...payload,
        applications: selected.map((d) => ({ id: d.IdDocumento, sale: d.IdFactura, amount: fixed(d.SaldoActual) })),
      };
      result.base = fixed(total(result.applications.map((a) => a.amount)));
      result.balanceAfter = fixed(balance.minus(result.base));
    } else if (payload.type === "reopen") {
      const document = valid.find((d) => d.IdDocumento === payload.id);
      const closures = state.closures.filter((c) => c.IdDocumento === payload.id);
      if (!document || !closures.length) fail("El documento no tiene un cierre vigente que pueda reabrirse.", 409);
      const amount = total(closures.map((c) => c.Monto));
      if (new Money(document.SaldoActual).plus(amount).gt(document.MontoOriginal))
        fail("El saldo cambió fuera de DMMarket. Concilia el documento antes de reabrirlo.", 409);
      result = {
        ...payload,
        base: fixed(amount),
        closureIds: closures.map((c) => c.IdCierre),
        applications: [{ id: document.IdDocumento, sale: document.IdFactura, amount: fixed(amount) }],
        balanceAfter: fixed(balance.plus(amount)),
      };
    } else {
      const movement = await connection("cxc_movimientos")
        .where({ IdMov: payload.id, IdCliente: state.client.IdCliente })
        .first();
      const reversed = await connection("cxc_operaciones").where({ Tipo: "ANULACION", Referencia: payload.id }).first();
      if (!movement || reversed) fail("El abono no existe o ya fue anulado.", 409);
      const applications = await connection("cxc_cruces")
        .where("IdMovimiento", payload.id)
        .select("IdDocumento as id")
        .sum("MontoAplicado as amount")
        .groupBy("IdDocumento");
      for (const application of applications) {
        const document = valid.find((d) => d.IdDocumento === application.id);
        if (!document || new Money(document.SaldoActual).plus(application.amount).gt(document.MontoOriginal))
          fail("Una venta está anulada o su saldo cambió. Concilia la cuenta antes de anular el abono.", 409);
        application.sale = document.IdFactura;
        application.amount = fixed(application.amount);
      }
      result = {
        ...payload,
        applications,
        base: fixed(movement.MontoBase),
        balanceAfter: fixed(balance.plus(total(applications.map((a) => a.amount)))),
      };
    }
    result.snapshot = hash({
      documents: state.docs.map((d) => [
        d.IdDocumento,
        d.IdFactura,
        d.IdCliente,
        d.TipoDoc,
        d.MonedaOriginal,
        d.MontoOriginal,
        d.SaldoActual,
        d.Estatus,
        dateOnly(d.FechaVencimiento),
        d.saleCancelled,
        d.saleClient,
      ]),
      closures: state.closures.map((c) => [c.IdCierre, c.IdDocumento, c.Monto]),
      result,
    });
    return result;
  }

  async function preview(clientId, body) {
    await requireSchema();
    const payload = input(body, localDate(now()));
    return db.transaction(async (connection) => plan(connection, await context(connection, clientId), payload));
  }

  async function execute(clientId, body) {
    await requireSchema(true);
    if (
      typeof body.requestId !== "string" ||
      !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(body.requestId)
    )
      fail("La solicitud requiere un identificador válido.");
    if (typeof body.snapshot !== "string" || !/^[a-f0-9]{64}$/.test(body.snapshot))
      fail("Revisa la previsualización antes de confirmar.");
    const payload = input(body, localDate(now()));
    const fingerprint = hash({ clientId, payload, snapshot: body.snapshot });
    return db.transaction(async (connection) => {
      const state = await context(connection, clientId, true);
      const previous = await connection("cxc_operaciones").where("IdOperacion", body.requestId).first();
      if (previous) {
        if (previous.IdCliente !== clientId || previous.Huella !== fingerprint)
          fail("Este identificador ya corresponde a otra operación.", 409);
        return parseJson(previous.Datos);
      }
      const result = await plan(connection, state, payload, true);
      if (result.snapshot !== body.snapshot)
        fail("La deuda o la tasa cambió. Vuelve a revisar la previsualización antes de confirmar.", 409);
      result.operationId = body.requestId;
      result.registeredAt = timestamp(now());
      if (payload.type === "payment") {
        const [movementId] = await connection("cxc_movimientos").insert({
          Fecha: payload.date === localDate(now()) ? result.registeredAt.slice(0, 19) : `${payload.date} 00:00:00`,
          IdCliente: clientId,
          MonedaPago: payload.currency,
          TasaCambio: result.rate,
          MontoPago: payload.amount,
          MontoBase: result.base,
          FormaPago: payload.method,
          Referencia: payload.reference || null,
          Banco: payload.bank || null,
          Observaciones: payload.notes || null,
        });
        result.movementId = movementId;
        if (result.applications.length)
          await connection("cxc_cruces").insert(
            result.applications.map((a) => ({
              IdMovimiento: movementId,
              IdDocumento: a.id,
              MontoAplicado: a.amount,
              FechaCruce: result.registeredAt,
            })),
          );
      }
      await connection("cxc_operaciones").insert({
        IdOperacion: body.requestId,
        IdCliente: clientId,
        Tipo: types[payload.type],
        Referencia: result.movementId || payload.id || null,
        Huella: fingerprint,
        Motivo: payload.reason || null,
        Datos: JSON.stringify(result),
        FechaRegistro: result.registeredAt,
      });
      if (payload.type === "close") {
        await connection("cxc_cierres").insert(
          result.applications.map((a) => ({ IdOperacion: body.requestId, IdDocumento: a.id, Monto: a.amount })),
        );
      }
      if (payload.type === "reopen") {
        await connection("cxc_cierres").whereIn("IdCierre", result.closureIds).update({ Reapertura: body.requestId });
      }
      for (const application of result.applications) {
        const document = state.docs.find((d) => d.IdDocumento === application.id);
        const balanceAfter = ["payment", "close"].includes(payload.type)
          ? new Money(document.SaldoActual).minus(application.amount)
          : new Money(document.SaldoActual).plus(application.amount);
        const status = balanceAfter.eq(0)
          ? "PAGADO"
          : balanceAfter.eq(document.MontoOriginal)
            ? "PENDIENTE"
            : "PARCIAL";
        await connection("cxc_documentos")
          .where("IdDocumento", application.id)
          .update({ SaldoActual: fixed(balanceAfter), Estatus: status });
      }
      return result;
    });
  }

  function clientQuery(today) {
    const valid =
      "d.TipoDoc = 'FAC' AND d.MonedaOriginal = 'USD' AND d.Estatus <> 'ANULADO' AND f.Anulada = 0 AND f.IdCliente = d.IdCliente";
    const aggregates = db("cxc_documentos as d")
      .leftJoin("masterfact as f", "f.IdFactura", "d.IdFactura")
      .where("d.TipoDoc", "FAC")
      .where("d.MonedaOriginal", "USD")
      .select("d.IdCliente")
      .select(db.raw(`SUM(CASE WHEN ${valid} THEN GREATEST(d.SaldoActual, 0) ELSE 0 END) as balance`))
      .select(
        db.raw(
          `SUM(CASE WHEN ${valid} AND d.FechaVencimiento > '0000-00-00' AND d.FechaVencimiento < ? THEN GREATEST(d.SaldoActual, 0) ELSE 0 END) as overdue`,
          [today],
        ),
      )
      .select(db.raw(`SUM(CASE WHEN ${valid} AND d.SaldoActual > 0 THEN 1 ELSE 0 END) as pendingCount`))
      .groupBy("d.IdCliente");
    const lastPayment = db("cxc_movimientos as m")
      .leftJoin("cxc_operaciones as v", function () {
        this.on("v.Referencia", "m.IdMov").andOnVal("v.Tipo", "ANULACION");
      })
      .whereNull("v.IdOperacion")
      .select("m.IdCliente")
      .max("m.Fecha as lastPayment")
      .groupBy("m.IdCliente");
    return db("clientes as c")
      .join(aggregates.as("a"), "a.IdCliente", "c.IdCliente")
      .leftJoin(lastPayment.as("p"), "p.IdCliente", "c.IdCliente")
      .select(
        "c.IdCliente as id",
        "c.Empresa as name",
        "c.Ruta as ruta",
        "a.balance",
        "a.overdue",
        "a.pendingCount",
        "p.lastPayment",
      );
  }

  async function list(filters = {}) {
    const status = await requireSchema();
    const page = integer(filters.page, 1);
    const limit = integer(filters.limit, 20, 100);
    const search = text(filters.search, 100);
    const ruta = text(filters.ruta, 10);
    const state = filters.state || "debt";
    const due = filters.due || "all";
    if (!["debt", "settled", "all"].includes(state) || !["all", "overdue", "upcoming"].includes(due))
      fail("Filtro de cartera no válido.");
    const sort = {
      name: "c.Empresa",
      balance: "a.balance",
      overdue: "a.overdue",
      pendingCount: "a.pendingCount",
      lastPayment: "p.lastPayment",
    }[filters.sortBy || "overdue"];
    if (typeof sort !== "string" || (filters.sortDir && !["asc", "desc"].includes(filters.sortDir)))
      fail("Orden de cartera no válido.");
    const scope = clientQuery(status.today);
    if (ruta) scope.where("c.Ruta", ruta);
    const summaryRows = await db
      .from(scope.clone().as("s"))
      .sum("balance as balance")
      .sum("overdue as overdue")
      .select(db.raw("SUM(CASE WHEN balance > 0 THEN 1 ELSE 0 END) as debtors"))
      .first();
    const received = db("cxc_movimientos as m")
      .join("clientes as c", "c.IdCliente", "m.IdCliente")
      .leftJoin("cxc_operaciones as v", function () {
        this.on("v.Referencia", "m.IdMov").andOnVal("v.Tipo", "ANULACION");
      })
      .whereNull("v.IdOperacion")
      .where("m.Fecha", ">=", `${status.today.slice(0, 7)}-01 00:00:00`)
      .where("m.Fecha", "<=", `${status.today} 23:59:59`);
    if (ruta) received.where("c.Ruta", ruta);
    const receivedRow = await received.sum("m.MontoBase as amount").first();
    const query = scope.clone();
    if (search)
      query.where(function () {
        this.where("c.Empresa", "like", `%${search}%`)
          .orWhere("c.IdCliente", "like", `%${search}%`)
          .orWhere("c.Rif", "like", `%${search}%`);
      });
    if (state === "debt") query.where("a.balance", ">", 0);
    if (state === "settled") query.where("a.balance", "=", 0);
    if (due === "overdue") query.where("a.overdue", ">", 0);
    if (due === "upcoming") query.where("a.balance", ">", 0).where("a.overdue", "=", 0);
    const count = await db.from(query.clone().as("s")).count("* as count").first();
    const data = await query
      .orderBy(sort, filters.sortDir || "desc")
      .orderBy("a.balance", "desc")
      .orderBy("c.IdCliente")
      .limit(limit)
      .offset((page - 1) * limit);
    const routes = await db("clientes as c")
      .join("cxc_documentos as d", "d.IdCliente", "c.IdCliente")
      .distinct("c.Ruta as id")
      .orderBy("c.Ruta");
    return {
      ...status,
      data: data.map((row) => ({
        ...row,
        balance: fixed(row.balance),
        overdue: fixed(row.overdue),
        pendingCount: Number(row.pendingCount),
        lastPayment: dateOnly(row.lastPayment),
      })),
      total: Number(count.count),
      page,
      limit,
      summary: {
        balance: fixed(summaryRows.balance || 0),
        overdue: fixed(summaryRows.overdue || 0),
        debtors: Number(summaryRows.debtors || 0),
        received: fixed(receivedRow.amount || 0),
      },
      routes,
    };
  }

  async function detail(clientId, filters = {}) {
    const status = await requireSchema();
    const page = integer(filters.page, 1);
    const timelinePage = integer(filters.timelinePage, 1);
    const limit = 20;
    return db.transaction(async (connection) => {
      const state = await context(connection, clientId);
      const applied = await connection("cxc_cruces as x")
        .join("cxc_movimientos as m", "m.IdMov", "x.IdMovimiento")
        .leftJoin("cxc_operaciones as v", function () {
          this.on("v.Referencia", "m.IdMov").andOnVal("v.Tipo", "ANULACION");
        })
        .where("m.IdCliente", clientId)
        .whereNull("v.IdOperacion")
        .groupBy("x.IdDocumento")
        .select("x.IdDocumento")
        .sum("x.MontoAplicado as amount");
      const docs = state.docs
        .map((d) => {
          const closed = total(state.closures.filter((c) => c.IdDocumento === d.IdDocumento).map((c) => c.Monto));
          const valid = eligible(d);
          return {
            id: d.IdDocumento,
            sale: d.IdFactura,
            issued: dateOnly(d.FechaEmision),
            due: dateOnly(d.FechaVencimiento),
            original: fixed(d.MontoOriginal),
            balance: fixed(d.SaldoActual),
            applied: fixed(applied.find((a) => a.IdDocumento === d.IdDocumento)?.amount || 0),
            closed: fixed(closed),
            eligible: valid,
            status: !valid
              ? "Excluida"
              : new Money(d.SaldoActual).gt(0)
                ? "Pendiente"
                : closed.gt(0)
                  ? "Cerrada manualmente"
                  : "Saldada",
          };
        })
        .filter((d) => filters.documents === "all" || (d.eligible && new Money(d.balance).gt(0)));
      const movements = connection("cxc_movimientos as m")
        .leftJoin("cxc_operaciones as v", function () {
          this.on("v.Referencia", "m.IdMov").andOnVal("v.Tipo", "ANULACION");
        })
        .leftJoin("cxc_operaciones as p", function () {
          this.on("p.Referencia", "m.IdMov").andOnVal("p.Tipo", "ABONO");
        })
        .where("m.IdCliente", clientId)
        .select(
          connection.raw("CONCAT('m-', m.IdMov) as eventId"),
          connection.raw("'payment' as type"),
          "m.Fecha as date",
          connection.raw("COALESCE(p.FechaRegistro, m.Fecha) as registeredAt"),
          "m.IdMov as movementId",
          "m.MontoBase as base",
          "m.MontoPago as amount",
          "m.MonedaPago as currency",
          "m.TasaCambio as rate",
          "m.FormaPago as method",
          "m.Referencia as reference",
          "m.Banco as bank",
          "m.Observaciones as notes",
          "v.Motivo as voidReason",
          "p.Datos as data",
          connection.raw("NULL as reason"),
        );
      const operations = connection("cxc_operaciones")
        .where("IdCliente", clientId)
        .whereNot("Tipo", "ABONO")
        .select(
          "IdOperacion as eventId",
          "Tipo as type",
          "FechaRegistro as date",
          "FechaRegistro as registeredAt",
          connection.raw(
            "NULL as movementId, NULL as base, NULL as amount, NULL as currency, NULL as rate, NULL as method, NULL as reference, NULL as bank, NULL as notes, NULL as voidReason",
          ),
          "Datos as data",
          "Motivo as reason",
        );
      const events = connection.unionAll([movements, operations], true);
      const count = await connection.from(events.clone().as("e")).count("* as count").first();
      const timeline = await connection
        .from(events.as("e"))
        .select("e.*")
        .orderBy("registeredAt", "desc")
        .orderBy("eventId", "desc")
        .limit(limit)
        .offset((timelinePage - 1) * limit);
      const movementIds = timeline.filter((e) => e.movementId).map((e) => e.movementId);
      const applications = movementIds.length
        ? await connection("cxc_cruces as x")
            .join("cxc_documentos as d", "d.IdDocumento", "x.IdDocumento")
            .whereIn("x.IdMovimiento", movementIds)
            .select("x.IdMovimiento", "x.IdDocumento as id", "d.IdFactura as sale")
            .sum("x.MontoAplicado as amount")
            .groupBy("x.IdMovimiento", "x.IdDocumento", "d.IdFactura")
        : [];
      const rateRow = await connection("divisas").where("Simbolo", "BsS").orderBy("IdDivisa").first();
      return {
        ...status,
        client: {
          id: state.client.IdCliente,
          name: state.client.Empresa,
          rif: state.client.Rif,
          ruta: state.client.Ruta,
        },
        summary: summary(state.docs, status.today),
        rate: rateRow?.Cambio ? String(rateRow.Cambio) : null,
        documents: { data: docs.slice((page - 1) * limit, page * limit), total: docs.length, page, limit },
        timeline: {
          data: timeline.map((event) => {
            const data = event.data ? parseJson(event.data) : {};
            const allocations = event.movementId
              ? applications
                  .filter((a) => a.IdMovimiento === event.movementId)
                  .map(({ id, sale, amount }) => ({ id, sale, amount: fixed(amount) }))
              : data.applications || [];
            return {
              ...event,
              date: event.date instanceof Date ? dateOnly(event.date) : String(event.date),
              registeredAt:
                event.registeredAt instanceof Date ? dateOnly(event.registeredAt) : String(event.registeredAt),
              data,
              applications: allocations,
              excess: event.movementId
                ? fixed(Money.max(new Money(event.base).minus(total(allocations.map((a) => a.amount))), 0))
                : null,
            };
          }),
          total: Number(count.count),
          page: timelinePage,
          limit,
        },
      };
    });
  }

  return { readiness, list, detail, preview, execute };
}

module.exports = { createReceivablesService, localDate, input };
