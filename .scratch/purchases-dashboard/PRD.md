# PRD: Dashboard de Compras

Status: ready-for-agent

## Problem Statement

La página `/productos` es una vista estática de tres cards (fluctuación de costo mensual por producto, stock por grupo, costo de inventario por grupo) que no ayuda a la toma de decisiones sobre adquisición y abastecimiento: no hay KPIs de compra, no hay comparativas contra períodos anteriores, no hay visibilidad de proveedores ni análisis de concentración. No existe ningún módulo que analice las transacciones de compra (`mastercomp`/`slavecomp`), a pesar de que el módulo de Ventas ya tiene un dashboard completo.

## Solution

Reemplazar `/productos` por un módulo `/compras` con la misma estructura que `/ventas`: sidebar lateral con dos vistas — **Dashboard** y **Desglose** — compartiendo un DateRangePicker global con persistencia en URL. El dashboard muestra KPIs de compra (total comprado, unidades, transacciones, ticket promedio, costo promedio por unidad, mejor proveedor) con comparativa contra el período anterior, torta de categorías por monto, análisis Pareto ABC por monto comprado, top productos y top proveedores. El desglose muestra dos tablas (facturas de compra y productos comprados) filtrables por proveedor y grupo, con export a PDF. Las tres cards anteriores y sus endpoints se eliminan sin reemplazo ni redirects.

## User Stories

1. Como gerente, quiero ver el total comprado (inversión en inventario) para un rango de fechas, para saber cuánto dinero se está invirtiendo en abastecimiento.
2. Como gerente, quiero ver las unidades compradas totales del período, para dimensionar el volumen de abastecimiento.
3. Como gerente, quiero ver el número de transacciones de compra (facturas) del período, para entender la frecuencia de compra.
4. Como gerente, quiero ver el ticket promedio de compra (total / transacciones), para entender el tamaño típico de cada compra.
5. Como gerente, quiero ver el costo promedio por unidad (total / unidades), para monitorear la evolución del costo de adquisición.
6. Como gerente, quiero ver la variación porcentual de cada KPI contra el período anterior equivalente, para detectar tendencias de abastecimiento sin cálculos manuales.
7. Como gerente, quiero saber quién fue el mejor proveedor del período con su monto total comprado, para identificar al proveedor más relevante.
8. Como gerente, quiero ver el top de productos por monto comprado, para saber qué productos concentran la inversión.
9. Como gerente, quiero ver el top de proveedores por monto comprado, para identificar concentración de proveeduría.
10. Como gerente, quiero ver una torta con la distribución del monto comprado por categoría de producto, para entender qué categorías dominan el abastecimiento.
11. Como gerente, quiero ver un análisis Pareto (ABC) de productos por monto comprado, para enfocar la gestión de inventario en el 20% de productos que concentran el 80% de la inversión.
12. Como usuario del sistema, quiero cambiar el rango de fechas y que TODO el dashboard (KPIs, gráficos, tablas, comparativa) se actualice junto, sin recargar secciones por separado.
13. Como usuario del sistema, quiero que el rango de fechas y la vista activa queden persistidos en la URL, para poder compartir o recargar una vista específica.
14. Como usuario del sistema, quiero navegar entre Dashboard y Desglose desde un sidebar lateral, para tener todo el análisis de compras en un solo lugar.
15. Como usuario del desglose, quiero ver la tabla de facturas de compra con número de factura, proveedor, fecha y monto total, para auditar las compras del período.
16. Como usuario del desglose, quiero ver la tabla de productos comprados con producto, unidades, monto total y costo promedio, para analizar qué se compró.
17. Como usuario del desglose, quiero filtrar ambas tablas por proveedor y por grupo de producto, para enfocar el análisis.
18. Como usuario del desglose, quiero paginar, ordenar y buscar por texto en ambas tablas, para manejar volúmenes grandes.
19. Como usuario del desglose, quiero exportar el desglose a PDF respetando la tasa de cambio vigente, igual que en ventas.
20. Como usuario del desglose, quiero que los filtros (proveedor, grupo, fechas) queden persistidos en la URL, para compartir un desglose filtrado.
21. Como usuario del sistema, quiero que las facturas de compra anuladas queden excluidas de todos los cálculos, para que los números reflejen compras reales.
22. Como usuario del sistema, quiero que el toggle Facturas/Notas de entrega del navbar NO afecte al módulo de compras, ya que las compras siempre usan las mismas tablas.
23. Como usuario en móvil, quiero que el dashboard y el desglose sean responsive (sidebar colapsa, KPIs se apilan), igual que en ventas.
24. Como desarrollador, quiero que el dashboard consuma UN solo endpoint agregado del backend, para minimizar llamadas y mantener la agregación en un solo lugar.
25. Como usuario, quiero que la navegación muestre "compras" en vez de "productos", para reflejar el nuevo propósito del módulo.

## Implementation Decisions

### Arquitectura

- **Módulo nuevo en backend** `purchases`: cuatro endpoints bajo `/api/purchases`, **sin middleware `showNoe`** — las compras usan siempre `mastercomp`/`slavecomp` fijos. Las facturas anuladas (`Anulada = 0`) se excluyen en todas las queries.
- **Dashboard en un solo endpoint**: `GET /api/purchases/dashboard?from=&to=&compareFrom=&compareTo=` — una sola llamada `knex.raw()` multi-statement con named bindings (`:from`, `:to`, `:compareFrom`, `:compareTo`) y 6 statements: KPIs del período, mejor proveedor, top 30 productos por monto, top 30 proveedores por monto, KPIs comparativos, torta de categorías. Mismo patrón que `GET /api/dashboard/sales` (cero SQL injection, una ida a MySQL).
- **Pareto**: `GET /api/purchases/pareto?from=&to=` — mismo algoritmo que `/api/dashboard/pareto` pero agregando por **monto comprado** (`SUM(Precio * Cantidad)` sobre `slavecomp`) en vez de ganancia neta. El componente `ParetoChart` existente se reutiliza con un config override (`nameKey`, `valueKey`, `quantityKey`, etiquetas de compras).
- **Desglose**: `GET /api/purchases/invoices` y `GET /api/purchases/products` — tabla de facturas (número, proveedor, fecha, monto, unidades) y tabla de productos (producto, unidades, monto, costo promedio), ambas con paginación, ordenamiento, búsqueda y filtros `proveedorId` + `groupId`. Filtro de proveedores reutiliza el endpoint existente de proveedores.
- **Frontend**: página `pages/compras/` con el mismo esqueleto que `pages/ventas/` (sidebar, estado de vista, sync de URL con `view/from/to`), **sin** vista despacho y **sin** `showNoe`. `PurchasesDashboard` es espejo de `SalesDashboard`. `DesgloseView` de compras es adaptación del de ventas: dos tablas, filtros proveedor + grupo, export PDF con `CurrencyRateContext` (pdfMake), defaults de fecha: dashboard = inicio de año, desglose = hoy.
- **Navegación**: se elimina la ruta `/productos` y se crea `/compras`; label "compras" en el navbar; `/compras` se agrega a la lista de rutas con layout de sidebar en `App.js`. Sin redirects ni capas de compatibilidad.

### Contrato del endpoint

`GET /api/purchases/dashboard?from=YYYY-MM-DD&to=YYYY-MM-DD&compareFrom=YYYY-MM-DD&compareTo=YYYY-MM-DD`

```json
{
  "kpis": {
    "totalPurchased": 123456.00,
    "totalQuantity": 999,
    "totalInvoices": 150,
    "avgTicket": 823.04,
    "avgUnitCost": 123.58,
    "comparePurchased": 110000.00,
    "compareQuantity": 850,
    "compareInvoices": 130
  },
  "bestProvider": {
    "id": 5,
    "name": "Proveedor A",
    "totalPurchased": 45000.00
  },
  "topProducts": [{ "product": "Producto A", "quantity": 100, "totalPurchased": 50000, "avgUnitCost": 500 }],
  "topProviders": [{ "provider": "Proveedor A", "totalPurchased": 25000 }],
  "groupPurchasesChart": [{ "categoria": "Lácteos", "totalPurchased": 80000 }]
}
```

### Datos que se eliminan

- Página `pages/productos` y sus tres cards (`CostFluctuation`, `GroupStock`, `ProductCostPerGroup`).
- Endpoints huérfanos de productos: `/api/products/cost-fluctuation/:productId`, `/api/products/stock/:productId`, `/api/products/cost/group` y el código frontend asociado (`api/products`, `useProducts`) si queda sin uso.

## Testing Decisions

- **Costura única: tests de contrato del API backend** con jest + supertest contra la base de datos local real (MySQL vía docker-compose, dump `bdsolser_md_nieto.sql` — misma modalidad que el prior art). Prior art: `packages/backend/__tests__/dashboard.test.js` (estructura de respuesta, 400, SQL injection, rango vacío) y `packages/backend/tests/providers.test.js`.
- **Qué se prueba** (solo comportamiento externo, no internals):
  - `GET /api/purchases/dashboard` responde 200 con la estructura completa; KPIs en 0 y arrays vacíos con rango sin datos (incluidos `avgTicket` y `avgUnitCost`); 400 si falta `from` o `to`; named bindings neutralizan intentos de SQL injection; `compareFrom/compareTo` activan los campos comparativos con valores reales (null si no se envían).
  - `GET /api/purchases/pareto` responde con productos rankeados, acumulados porcentuales y clases ABC; rango vacío responde arrays vacíos y summary en 0; 400 sin `from` o `to`; SQL injection neutralizada.
  - **Exclusión de anuladas**: los tests siembran una factura `Anulada=1` con monto alto y verifican que no altera dashboard ni pareto; al des-anularla, los totales suben (prueba que el filtro es real y la semilla visible). Limpieza en `finally`.
  - `GET /api/purchases/invoices` y `/products` (ticket 02): estructura paginada (data + pagination), filtros `proveedorId`/`groupId`, ordenamiento, búsqueda y exclusión de anuladas.
  - Cero tests de frontend: el dashboard es espejo de uno ya probado y el riesgo real (queries SQL de agregación sobre `mastercomp`/`slavecomp`) vive en el backend.

## Out of Scope

- Las cards de inventario/stock (fluctuación de costo, stock por grupo, costo por grupo) — se eliminan deliberadamente, sin reemplazo.
- Vista de despacho o recepción de mercancía — el módulo tiene solo Dashboard y Desglose.
- Márgenes o utilidad de compras — `slavecomp` no tiene precio de venta; en compras `Precio` es el costo de adquisición.
- Toggle `showNoe` en compras — no aplica.
- Reportes de compras por vendedor o ruta — no existen en el dominio de compras.
- Redirección o compatibilidad con `/productos`.
- Generalización/abstracción compartida entre los módulos Ventas y Compras (ver ADR 0001).

## Further Notes

- Decisión de arquitectura registrada en `docs/adr/0001-modulo-compras.md` (duplicación deliberada del esqueleto de Ventas; eliminación de `/productos` y sus endpoints).
- Término **Total Compras (Gross Purchases)** agregado al glosario en `CONTEXT.md`: `SUM(Precio * Cantidad)` sobre `slavecomp`, sin margen.
- Los deltas comparativos de KPIs se calculan con el mismo rango equivalente anterior (`buildCompareRange`) que ventas.
- `avgUnitCost` = `totalPurchased / totalQuantity`; `avgTicket` = `totalPurchased / totalInvoices` (ambos con `NULLIF` contra división por cero).
