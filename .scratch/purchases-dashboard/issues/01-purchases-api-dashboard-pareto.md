# 01 — API de compras: dashboard y pareto

**What to build:** Los endpoints del backend que alimentan el Dashboard de Compras. `GET /api/purchases/dashboard` devuelve en UNA respuesta todos los datos del dashboard: KPIs de compra (total comprado, unidades, transacciones, ticket promedio, costo promedio por unidad) con comparativa contra el período anterior equivalente, mejor proveedor, top 30 productos por monto comprado, top 30 proveedores por monto comprado y torta de categorías por monto. `GET /api/purchases/pareto` devuelve el análisis Pareto ABC de productos ordenados por monto comprado. Ambos consultan siempre `mastercomp`/`slavecomp` (sin toggle de facturas/noe) y excluyen facturas anuladas (`Anulada = 0`).

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] `GET /api/purchases/dashboard?from=&to=` responde 200 con la estructura completa: `kpis` (totalPurchased, totalQuantity, totalInvoices, avgTicket, avgUnitCost), `bestProvider` (id, name, totalPurchased), `topProducts` (product, quantity, totalPurchased, avgUnitCost), `topProviders` (provider, totalPurchased), `groupPurchasesChart` (categoria, totalPurchased).
- [ ] Los parámetros opcionales `compareFrom`/`compareTo` activan los campos comparativos (`comparePurchased`, `compareQuantity`, `compareInvoices`); si no se envían vienen en `null`.
- [ ] `avgTicket` = total / transacciones y `avgUnitCost` = total / unidades, ambos con protección contra división por cero.
- [ ] El dashboard se construye con UNA sola llamada SQL multi-statement con named bindings (`:from`, `:to`, `:compareFrom`, `:compareTo`) — cero SQL injection.
- [ ] `GET /api/purchases/pareto?from=&to=` responde `products` (rank, producto, quantity, totalPurchased, cumulativePercent, abcClass) y `summary` (classA/B/C con count y profitPercent, totalProducts), acumulando por monto comprado.
- [ ] Sin `from` o `to`, ambos endpoints responden 400 con mensaje de error.
- [ ] Rango sin datos responde 200 con KPIs en 0 y arrays vacíos (no 500).
- [ ] Las facturas anuladas quedan excluidas de todos los cálculos.
- [ ] Los endpoints se registran bajo `/api/purchases` y los tests de contrato cubren: estructura de respuesta, 400, SQL injection neutralizada por named bindings, rango vacío, compare en null y exclusión de anuladas (prior art: tests del dashboard de ventas).
