# 01 — Backend: endpoint del dashboard de ventas

**Status:** ready-for-agent

**Blocked by:** None — can start immediately.

## What to build

Crear un nuevo endpoint `GET /api/dashboard/sales` que devuelva en UNA sola respuesta todos los datos necesarios para el dashboard de ventas: KPIs agregados, mejor vendedor, top 10 productos por ganancia neta, top 10 clientes por ventas, y datos del gráfico de categorías. Internamente usa UNA sola llamada `knex.raw()` con 6 statements SQL separados por `;` y named bindings (`:from`, `:to`) — **cero SQL injection, una sola ida a MySQL**.

## Acceptance criteria

- [ ] `GET /api/dashboard/sales?from=YYYY-MM-DD&to=YYYY-MM-DD&showNoe=true|false` responde 200 con la estructura exacta especificada abajo.
- [ ] Los parámetros opcionales `compareFrom` y `compareTo` (ISO date) activan los KPIs comparativos (`compareRawProfit`, `compareNetProfit`, `compareQuantity`, `compareInvoices`). Si no se envían, esos campos vienen en `null`.
- [ ] El middleware `showNoe` alterna correctamente entre `masterfact/slavefact/IdFactura` y `masternoe/slavenoe/IdNoe` en todas las queries.
- [ ] Si `from` o `to` no se envían, el endpoint responde 400 con mensaje de error.
- [ ] Si no hay datos en el rango, el endpoint responde 200 con arrays vacíos y KPIs en 0 (no 500).
- [ ] El endpoint se registra en `packages/backend/index.js` bajo `/api/dashboard`.
- [ ] **Todas las fechas van como named bindings (`:from`, `:to`) — knex los escapa automáticamente. SQL injection imposible.**

## Implementation details

### 1. Crear `packages/backend/controllers/dashboard.js`

```js
const knex = require("../database");

const GET_DASHBOARD_SALES = async (req, res) => {
  const { from, to, compareFrom, compareTo } = req.query;
  const { masterTable, slaveTable, idInvoice } = req.locals.showNoe;

  // Validar parámetros obligatorios
  if (!from || !to) {
    return res.status(400).json({ error: "from and to are required" });
  }

  try {
    const hasCompare = !!(compareFrom && compareTo);

    // Construir SQL multi-statement con named bindings (:from, :to, :compareFrom, :compareTo)
    const sql = buildDashboardQuery({ masterTable, slaveTable, idInvoice, hasCompare });

    // Pasar solo los bindings que el SQL realmente usa
    const bindings = { from, to };
    if (hasCompare) {
      bindings.compareFrom = compareFrom;
      bindings.compareTo = compareTo;
    }

    // Una sola llamada a MySQL. knex reemplaza :from/:to/:compareFrom/:compareTo con ? + escaping.
    // multipleStatements: true ya está configurado en la conexión MySQL.
    const [results] = await knex.raw(sql, bindings);

    // results es un array de arrays: results[0] = KPIs, results[1] = bestEmployee, etc.
    const response = {
      kpis: formatKpis(results[0], results[4]),
      bestEmployee: results[1][0] || null,
      topProducts: results[2] || [],
      topClients: results[3] || [],
      groupSalesChart: results[5] || [],
    };

    res.status(200).json(response);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal server error" });
  }
};

module.exports = { GET_DASHBOARD_SALES };
```

### 2. La función `buildDashboardQuery`

Genera un string SQL con 6 statements separados por `;`. Usa named bindings (`:from`, `:to`, `:compareFrom`, `:compareTo`) para TODOS los valores de fecha. Los nombres de tabla/columna (`${masterTable}`, `${slaveTable}`, `${idInvoice}`) vienen del middleware `showNoe` — strings fijos del servidor, seguros para template literal.

```js
const buildDashboardQuery = ({ masterTable, slaveTable, idInvoice, hasCompare }) => {
  // Statement 1 — KPIs del período actual
  const kpisCurrent = `
    SELECT 
      ROUND(SUM(s.rawProfit), 2) as totalRawProfit,
      ROUND(SUM(s.netProfit), 2) as totalNetProfit,
      ROUND(SUM(s.quantity), 3) as totalQuantity,
      COUNT(DISTINCT s.invoiceCount) as totalInvoices,
      ROUND(SUM(s.rawProfit) / NULLIF(COUNT(DISTINCT s.invoiceCount), 0), 2) as avgTicket,
      ROUND(AVG(s.averageProfitPercent), 2) as avgMarginPercent
    FROM (
      SELECT 
        SUM(${slaveTable}.Precio * ${slaveTable}.Cantidad) as rawProfit,
        SUM((${slaveTable}.Precio - ${slaveTable}.Costo) * ${slaveTable}.Cantidad) as netProfit,
        SUM(${slaveTable}.Cantidad) as quantity,
        ${masterTable}.${idInvoice} as invoiceCount,
        AVG((${slaveTable}.Precio - ${slaveTable}.Costo) / NULLIF(${slaveTable}.Precio, 0) * 100) as averageProfitPercent
      FROM ${slaveTable}
      INNER JOIN ${masterTable} ON ${masterTable}.${idInvoice} = ${slaveTable}.${idInvoice} AND ${masterTable}.Anulada = 0
      WHERE ${masterTable}.Fecha BETWEEN :from AND :to
      GROUP BY ${masterTable}.${idInvoice}
    ) s`;

  // Statement 2 — Mejor vendedor (top 1 por total ventas)
  const bestEmployee = `
    SELECT 
      ${masterTable}.IdVend as id,
      vendedores.Empresa as name,
      ROUND(SUM(${slaveTable}.Precio * ${slaveTable}.Cantidad), 2) as totalSales
    FROM ${slaveTable}
    INNER JOIN ${masterTable} ON ${masterTable}.${idInvoice} = ${slaveTable}.${idInvoice} AND ${masterTable}.Anulada = 0
    INNER JOIN vendedores ON vendedores.idVend = ${masterTable}.IdVend
    WHERE ${masterTable}.Fecha BETWEEN :from AND :to
    GROUP BY ${masterTable}.IdVend
    ORDER BY totalSales DESC
    LIMIT 1`;

  // Statement 3 — Top 10 productos por ganancia neta
  const topProducts = `
    SELECT 
      productos.Descripcion as product,
      ROUND(SUM(${slaveTable}.Cantidad), 3) as quantity,
      ROUND(SUM(${slaveTable}.Precio * ${slaveTable}.Cantidad), 2) as rawProfit,
      ROUND(SUM((${slaveTable}.Precio - ${slaveTable}.Costo) * ${slaveTable}.Cantidad), 2) as netProfit,
      ROUND(AVG((${slaveTable}.Precio - ${slaveTable}.Costo) / NULLIF(${slaveTable}.Precio, 0) * 100), 2) as averageProfitPercent
    FROM ${slaveTable}
    INNER JOIN ${masterTable} ON ${masterTable}.${idInvoice} = ${slaveTable}.${idInvoice} AND ${masterTable}.Anulada = 0
    INNER JOIN productos ON productos.IdProducto = ${slaveTable}.IdProducto
    WHERE ${masterTable}.Fecha BETWEEN :from AND :to
    GROUP BY productos.IdProducto
    ORDER BY netProfit DESC
    LIMIT 10`;

  // Statement 4 — Top 10 clientes por total ventas
  const topClients = `
    SELECT 
      clientes.Empresa as client,
      ROUND(SUM(${slaveTable}.Precio * ${slaveTable}.Cantidad), 2) as total_USD
    FROM ${slaveTable}
    INNER JOIN ${masterTable} ON ${masterTable}.${idInvoice} = ${slaveTable}.${idInvoice} AND ${masterTable}.Anulada = 0
    INNER JOIN clientes ON clientes.IdCliente = ${masterTable}.IdCliente
    WHERE ${masterTable}.Fecha BETWEEN :from AND :to
    GROUP BY clientes.IdCliente
    ORDER BY total_USD DESC
    LIMIT 10`;

  // Statement 5 — KPIs comparativos
  // Si hay compareFrom/compareTo, reutilizamos el SQL del statement 1 reemplazando :from/:to por :compareFrom/:compareTo.
  // Si no, ejecutamos un SELECT dummy que devuelve nulls para mantener el orden de results[].
  const kpisCompare = hasCompare
    ? kpisCurrent.replaceAll(':from', ':compareFrom').replaceAll(':to', ':compareTo')
    : `SELECT NULL as totalRawProfit, NULL as totalNetProfit, NULL as totalQuantity, NULL as totalInvoices`;

  // Statement 6 — Gráfico de categorías (torta)
  const groupSales = `
    SELECT 
      grupos.Descripcion as categoria,
      ROUND(SUM(${slaveTable}.Precio * ${slaveTable}.Cantidad), 2) as rawProfit,
      ROUND(SUM((${slaveTable}.Precio - ${slaveTable}.Costo) * ${slaveTable}.Cantidad), 2) as netProfit
    FROM ${slaveTable}
    INNER JOIN ${masterTable} ON ${masterTable}.${idInvoice} = ${slaveTable}.${idInvoice} AND ${masterTable}.Anulada = 0
    INNER JOIN productos ON productos.IdProducto = ${slaveTable}.IdProducto
    INNER JOIN grupos ON grupos.idGrupo = productos.Grupo
    WHERE ${masterTable}.Fecha BETWEEN :from AND :to
    GROUP BY grupos.idGrupo`;

  return [
    kpisCurrent,
    bestEmployee,
    topProducts,
    topClients,
    kpisCompare,
    groupSales,
  ].join(';');
};
```

### 3. Formateo de respuesta

```js
const formatKpis = (currentResultSet, compareResultSet) => {
  // Cada resultSet es un array de rows (el primer elemento del tuple [rows, fields] de knex.raw)
  const c = (currentResultSet && currentResultSet[0]) ? currentResultSet[0] : {};
  const p = (compareResultSet && compareResultSet[0]) ? compareResultSet[0] : {};

  return {
    totalRawProfit: Number(c.totalRawProfit) || 0,
    totalNetProfit: Number(c.totalNetProfit) || 0,
    totalQuantity: Number(c.totalQuantity) || 0,
    totalInvoices: Number(c.totalInvoices) || 0,
    avgTicket: Number(c.avgTicket) || 0,
    avgMarginPercent: Number(c.avgMarginPercent) || 0,
    compareRawProfit: p.totalRawProfit != null ? Number(p.totalRawProfit) : null,
    compareNetProfit: p.totalNetProfit != null ? Number(p.totalNetProfit) : null,
    compareQuantity: p.totalQuantity != null ? Number(p.totalQuantity) : null,
    compareInvoices: p.totalInvoices != null ? Number(p.totalInvoices) : null,
  };
};
```

### 4. Crear `packages/backend/routes/dashboard.js`

```js
const router = require("express").Router();
const controller = require("../controllers/dashboard");
const showNoe = require("../middlewares/showNoe");

router.route("/sales").get(showNoe, controller.GET_DASHBOARD_SALES);

module.exports = router;
```

### 5. Modificar `packages/backend/index.js`

Agregar después de la línea de `providers_routes`:

```js
const dashboard_routes = require("./routes/dashboard");
```

Y después de `app.use("/api/providers", providers_routes);`:

```js
app.use("/api/dashboard", dashboard_routes);
```

### 6. Seguridad — por qué este enfoque es seguro

- **Named bindings** (`:from`, `:to`, `:compareFrom`, `:compareTo`): knex los procesa ANTES de enviar el SQL a MySQL. Cada `:name` se reemplaza por `?` y el valor se agrega al array de bindings con el escaping apropiado del driver MySQL. Es idéntico en protección a usar `?` posicionales — imposible SQL injection.
- **Nombres de tabla/columna** (`${masterTable}`, `${slaveTable}`, `${idInvoice}`): vienen de `req.locals.showNoe`, que a su vez vienen del middleware `showNoe`. Este middleware asigna strings fijos (`"masterfact"` o `"masternoe"`, etc.) — nunca contienen input del usuario. Seguros para template literal.
- **Una sola llamada a `knex.raw()`**: `multipleStatements: true` ya está configurado. Los 6 statements se envían juntos, MySQL los ejecuta en orden, knex devuelve `[resultsArray]` donde cada elemento corresponde a un statement.

### 7. No tocar archivos existentes (excepto index.js)

No modificar `models/invoice.js`, `controllers/invoices.js`, `controllers/clients.js`, ni `controllers/employees/`. El nuevo endpoint es autónomo. Si se quiere reutilizar lógica, duplicar el SQL.

## Verificación manual

```bash
curl "http://localhost:8000/api/dashboard/sales?from=2026-07-01&to=2026-07-27&showNoe=false"
curl "http://localhost:8000/api/dashboard/sales?from=2026-07-01&to=2026-07-27&compareFrom=2026-06-04&compareTo=2026-06-30&showNoe=false"
```

## Tests

Primeros tests del proyecto. Usar Jest + supertest.

### Archivo: `packages/backend/__tests__/dashboard.test.js`

Test de integración sobre el endpoint. NO mockear knex — probar contra la respuesta HTTP real.

```js
const request = require("supertest");
const app = require("../index");

describe("GET /api/dashboard/sales", () => {
  // 1. Estructura de respuesta con datos
  it("responde 200 con la estructura completa cuando hay datos", async () => {
    const res = await request(app)
      .get("/api/dashboard/sales")
      .query({ from: "2026-01-01", to: "2026-12-31", showNoe: "false" });
    
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("kpis");
    expect(res.body.kpis).toHaveProperty("totalRawProfit");
    expect(res.body.kpis).toHaveProperty("totalNetProfit");
    expect(res.body.kpis).toHaveProperty("totalQuantity");
    expect(res.body.kpis).toHaveProperty("totalInvoices");
    expect(res.body.kpis).toHaveProperty("avgTicket");
    expect(res.body.kpis).toHaveProperty("avgMarginPercent");
    expect(res.body).toHaveProperty("bestEmployee");
    expect(res.body).toHaveProperty("topProducts");
    expect(res.body).toHaveProperty("topClients");
    expect(res.body).toHaveProperty("groupSalesChart");
  });

  // 2. Rango sin datos → 200 con ceros
  it("responde 200 con KPIs en 0 y arrays vacíos cuando no hay datos", async () => {
    const res = await request(app)
      .get("/api/dashboard/sales")
      .query({ from: "2000-01-01", to: "2000-01-02", showNoe: "false" });
    
    expect(res.status).toBe(200);
    expect(res.body.kpis.totalRawProfit).toBe(0);
    expect(res.body.topProducts).toEqual([]);
    expect(res.body.groupSalesChart).toEqual([]);
  });

  // 3. Falta from → 400
  it("responde 400 si falta 'from'", async () => {
    const res = await request(app)
      .get("/api/dashboard/sales")
      .query({ to: "2026-12-31", showNoe: "false" });
    
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
  });

  // 4. Falta to → 400
  it("responde 400 si falta 'to'", async () => {
    const res = await request(app)
      .get("/api/dashboard/sales")
      .query({ from: "2026-01-01", showNoe: "false" });
    
    expect(res.status).toBe(400);
  });

  // 5. Intento de SQL injection → 200 sin crash (named bindings lo neutralizan)
  it("no es vulnerable a SQL injection — responde 200, no crashea", async () => {
    const res = await request(app)
      .get("/api/dashboard/sales")
      .query({ from: "'; DROP TABLE usuarios;--", to: "2026-12-31", showNoe: "false" });
    
    // Con named bindings, knex escapa el valor. MySQL lo trata como string literal.
    // No matchea ninguna fecha → datos vacíos, no error.
    expect(res.status).toBe(200);
  });

  // 6. KPIs comparativos cuando se envían compareFrom/compareTo
  it("incluye compare* cuando se envían fechas comparativas", async () => {
    const res = await request(app)
      .get("/api/dashboard/sales")
      .query({ from: "2026-07-01", to: "2026-07-27", compareFrom: "2026-06-04", compareTo: "2026-06-30", showNoe: "false" });
    
    expect(res.status).toBe(200);
    expect(res.body.kpis).toHaveProperty("compareRawProfit");
    expect(res.body.kpis).toHaveProperty("compareNetProfit");
    expect(res.body.kpis).toHaveProperty("compareQuantity");
    expect(res.body.kpis).toHaveProperty("compareInvoices");
  });

  // 7. Sin compare → campos comparativos null
  it("campos compare* son null cuando no se envían fechas comparativas", async () => {
    const res = await request(app)
      .get("/api/dashboard/sales")
      .query({ from: "2026-01-01", to: "2026-12-31", showNoe: "false" });
    
    expect(res.body.kpis.compareRawProfit).toBeNull();
    expect(res.body.kpis.compareNetProfit).toBeNull();
  });

  // 8. topProducts limitado a 10
  it("topProducts no excede 10 elementos", async () => {
    const res = await request(app)
      .get("/api/dashboard/sales")
      .query({ from: "2026-01-01", to: "2026-12-31", showNoe: "false" });
    
    expect(res.body.topProducts.length).toBeLessThanOrEqual(10);
  });

  // 9. showNoe=true alterna a tablas Noe
  it("showNoe=true no crashea", async () => {
    const res = await request(app)
      .get("/api/dashboard/sales")
      .query({ from: "2026-01-01", to: "2026-12-31", showNoe: "true" });
    
    expect(res.status).toBe(200);
  });
});
```

**Setup:** Si no existe `__tests__/` en backend, crear el directorio. Si `supertest` no está instalado: `npm i -D supertest` en `packages/backend/`.

**Para correr:** `npx jest packages/backend/__tests__/dashboard.test.js`
