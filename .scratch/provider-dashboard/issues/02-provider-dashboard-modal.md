# 02 — Provider dashboard modal (stats + compras table + ventas table + purchase detail)

**Status:** `done`

## What to build

Al hacer clic en un proveedor en la tabla (issue 01), se abre un modal `xl` con un mini-dashboard que muestra: DateRangePicker (default último año, auto-submit), 4 tarjetas de métricas, y un grid 5:7 con tabla de compras a la izquierda y tabla de ventas a la derecha, ambas server-side paginadas.

La tabla de compras permite drill-down: al hacer clic en una fila se abre un sub-modal con el detalle de la factura de compra (productos, cantidades, precios, subtotales).

El toggle showNoe del navbar afecta solo las métricas y tabla de ventas. Las compras (mastercomp/slavecomp) no tienen equivalente NOE y no se ven afectadas.

Los montos de ventas se calculan filtrando SOLO los productos cuyo `productos.Proveedor = proveedorId` seleccionado. No se incluyen otros productos de la misma factura.

## Acceptance criteria

- [ ] Al hacer clic en una fila de ProvidersTable, se abre el ProviderDashboardModal
- [ ] El modal es Bootstrap Modal `xl`, dark theme (siguiendo estilos de ClientDashboardModal)
- [ ] DateRangePicker con librería `react-date-range`, auto-submit, default 1 año atrás hasta hoy
- [ ] Al cambiar el rango de fechas, se recargan stats, tabla compras y tabla ventas (auto-submit)
- [ ] 4 tarjetas de métricas en fila horizontal con iconos, colores y spinners de carga:
  - Total Compras (`SUM(slavecomp.Precio * slavecomp.Cantidad)` filtrado por `mastercomp.IdProveedor`)
  - # Compras (`COUNT(DISTINCT mastercomp.IdFactura)`)
  - Total Ventas (`SUM(slavefact/slavenoe.Precio * Cantidad)` solo productos del proveedor)
  - Mejor Vendedor (`vendedores.Empresa` con mayor monto vendido de productos del proveedor)
- [ ] Tarjetas muestran `N/A` en Mejor Vendedor si no hay ventas en el rango
- [ ] Grid 5:7 (responsive: colapsa a 1 columna en pantallas pequeñas)
- [ ] Tabla de Compras (izquierda): columnas IdFactura, Fecha, Monto (agrupado por factura mastercomp)
- [ ] Tabla de Ventas (derecha): columnas Vendedor, Fecha, Monto (solo productos del proveedor)
- [ ] Ambas tablas con paginación server-side (Anterior/Siguiente, "Página X de Y")
- [ ] Ambas tablas con spinner de carga y mensaje "Sin datos"
- [ ] Al hacer clic en una fila de la tabla de compras, se abre PurchaseDetailModal (sub-modal `md`)
- [ ] PurchaseDetailModal muestra: cabecera con IdFactura y Fecha, tabla de productos (Descripción, Cantidad, Precio unitario, Subtotal), total al pie
- [ ] Toggle showNoe: al cambiar el toggle del navbar, la tabla de ventas y stats de ventas se recargan; compras no cambian
- [ ] Al cerrar el modal y abrir otro proveedor, el estado se resetea (fechas default, página 1)
- [ ] Endpoints implementados y con tests:
  - `GET /api/providers/:id/summary?from=&to=&showNoe=` → `{ totalCompras, numCompras, totalVentas, numVentas, bestSeller }`
  - `GET /api/providers/:id/sales?from=&to=&page=&limit=&showNoe=` → `{ data: [{ vendedor, fecha, monto }], total, page, limit }`
  - `GET /api/providers/:id/purchases?from=&to=&page=&limit=` → `{ data: [{ idFactura, fecha, monto }], total, page, limit }`
  - `GET /api/providers/:id/purchases/:invoiceId` → `{ idFactura, fecha, productos: [{ descripcion, cantidad, precio, subtotal }], total }`
- [ ] Tests de componentes: ProviderDashboardModal (abre/cierra, stats, tablas), PurchaseDetailModal (productos, subtotales)

## Blocked by

- 01-provider-list-table-page (necesita la tabla de proveedores funcionando para conectar el onClick al modal)
