# 03 — Mejores Proveedores report card

**Status:** `done`

## What to build

Agregar una card de "Mejores Proveedores" en la columna derecha de la página Proveedores (panel "Reportes"), con un DateRangePicker arriba que filtra el ranking por rango de fechas. La card tiene un selector toggle "Compras / Ventas" que alterna entre ranking por monto de compras al proveedor y ranking por monto de ventas de sus productos.

Sigue el mismo patrón del ClientReportCard existente: lista rankeada con búsqueda local client-side.

## Acceptance criteria

- [ ] ProviderReportCard visible en la columna derecha, debajo de un DateRangePicker (mismo patrón que ClientReportCard)
- [ ] DateRangePicker filtra el ranking al cambiar fechas
- [ ] Selector toggle "Compras" / "Ventas" en la card
- [ ] Modo "Compras": ranking por `SUM(mastercomp/slavecomp)` agrupado por proveedor. Muestra Empresa y monto total comprado
- [ ] Modo "Ventas": ranking por `SUM(masterfact/slavefact)` filtrando productos por `productos.Proveedor`. Respeta showNoe. Muestra Empresa y monto total vendido
- [ ] Al cambiar el toggle, se recarga el ranking (llama a endpoint con `?mode=compras` o `?mode=ventas`)
- [ ] Búsqueda client-side sobre los resultados del ranking (filtra por Empresa, debounced)
- [ ] Spinner durante carga
- [ ] Mensaje "Sin datos" cuando no hay resultados
- [ ] Se integra correctamente en la pestaña "Reportes" del sidebar de Proveedores (alterna con la pestaña "Proveedores" que muestra la tabla del issue 01)
- [ ] Endpoint `GET /api/providers/best?from=&to=&showNoe=&mode=` implementado y con tests
  - `mode=compras`: agrupado por `mastercomp.IdProveedor`, excluye `Anulada = 0`, rango de fechas
  - `mode=ventas`: agrupado por `productos.Proveedor`, filtra por rango de fechas, respeta showNoe
- [ ] Tests del componente ProviderReportCard (renderiza ranking, toggle cambia datos, búsqueda funciona)

## Blocked by

- 01-provider-list-table-page (necesita la página Proveedores y el layout sidebar/tabs para montar la card en el panel "Reportes")
