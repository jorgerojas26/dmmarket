# 04 — Compras: vista de Desglose

**What to build:** La vista de Desglose del módulo de Compras. Muestra dos tablas lado a lado: facturas de compra (número, proveedor, fecha, monto, unidades) y productos comprados (producto, unidades, monto, costo promedio). Ambas se filtran por proveedor y por grupo de producto, con paginación, ordenamiento y búsqueda por texto, y los filtros quedan persistidos en la URL. Incluye export a PDF del desglose con la tasa de cambio vigente, igual que el desglose de ventas.

**Blocked by:** 02 — API de compras: desglose (facturas y productos)

**Status:** ready-for-agent

- [ ] La vista Desglose muestra las dos tablas (facturas de compra y productos comprados) consumiendo los endpoints de desglose de compras.
- [ ] Los filtros de proveedor (buscable, usando el buscador de proveedores existente) y de grupo de producto aplican a ambas tablas simultáneamente.
- [ ] Ambas tablas soportan paginación, ordenamiento por columna y búsqueda por texto, con el rango de fechas compartido del módulo.
- [ ] Los filtros y fechas del desglose quedan persistidos en la URL (proveedor, grupo, fechas propias) y se restauran al recargar o compartir.
- [ ] Cambiar cualquier filtro o rango reinicia la paginación a la página 1 en ambas tablas.
- [ ] El botón de export genera un PDF con ambas tablas (o la activa), las fechas y los filtros aplicados, formateando montos con la tasa de cambio vigente del sistema, igual que el desglose de ventas.
- [ ] Estados de carga y error visibles en ambas tablas.
- [ ] El layout es responsive (tablas se apilan en móvil).
