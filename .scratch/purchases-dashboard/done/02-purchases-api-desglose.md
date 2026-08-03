# 02 — API de compras: desglose (facturas y productos)

**What to build:** Los endpoints del backend que alimentan el Desglose de Compras. `GET /api/purchases/invoices` devuelve facturas de compra paginadas con proveedor, fecha, monto total y unidades; `GET /api/purchases/products` devuelve productos comprados paginados con unidades, monto total y costo promedio. Ambos soportan ordenamiento, búsqueda por texto y filtros por proveedor y por grupo de producto. Consultan siempre `mastercomp`/`slavecomp` y excluyen facturas anuladas.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] `GET /api/purchases/invoices?from=&to=&page=&limit=&sortBy=&sortDir=&search=&proveedorId=&groupId=` responde `{ data, pagination: { page, limit, total } }` con cada factura incluyendo número, proveedor, fecha, monto total y unidades.
- [ ] `GET /api/purchases/products?from=&to=&page=&limit=&sortBy=&sortDir=&search=&proveedorId=&groupId=` responde la misma estructura con producto, unidades, monto total y costo promedio por unidad.
- [ ] El filtro `proveedorId` restringe a las compras de ese proveedor en ambas tablas.
- [ ] El filtro `groupId` restringe a los productos de ese grupo (vía la tabla de productos) en ambas tablas.
- [ ] `search` filtra por texto en ambas tablas; `sortBy`/`sortDir` ordenan; `page`/`limit` pagan (defaults 1 y 20).
- [ ] Las facturas anuladas no aparecen en los resultados ni en los totales.
- [ ] Rango sin datos responde 200 con `data: []` y `total: 0` (no 500).
- [ ] Los endpoints se registran bajo `/api/purchases` y los tests de contrato cubren: estructura paginada, filtros por proveedor y grupo, ordenamiento, búsqueda, exclusión de anuladas y rango vacío (prior art: tests de proveedores y del dashboard de ventas).
