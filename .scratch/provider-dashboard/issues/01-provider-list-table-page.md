# 01 — Provider list + table page

**Status:** `done`

## What to build

Agregar la pestaña "Proveedores" al navbar principal (ruta `/proveedores`, al final después de "categorias") con una página que muestra una tabla paginada server-side con todos los proveedores y sus métricas agregadas all-time de compras y ventas.

El layout de la página replica el patrón de la página Clientes: sidebar con tabs "Reportes" / "Proveedores", tabla de listado ocupando el área principal, y una columna derecha (vacía por ahora, se llena en el issue 03).

Al hacer clic en una fila de la tabla, por ahora solo se hace `console.log` del proveedor seleccionado (el modal se conecta en el issue 02).

## Acceptance criteria

- [ ] Nueva ruta `/proveedores` accesible desde el navbar, después de "categorias"
- [ ] Página con sidebar de tabs: "Reportes" y "Proveedores" (mismo patrón que ClientesPage)
- [ ] Tabla server-side paginada con 6 columnas: IdProveedor, Empresa, Total Compras, # Compras, Total Ventas, # Ventas
- [ ] Orden por Total Ventas descendente
- [ ] Búsqueda server-side por Empresa (debounced 500ms, LIKE `%search%`)
- [ ] Paginación con botones Anterior/Siguiente y label "Página X de Y"
- [ ] Spinner durante carga
- [ ] Mensaje "Sin datos" cuando no hay resultados
- [ ] Las métricas de ventas (columnas Total Ventas, # Ventas) respetan el toggle showNoe y se recargan al cambiarlo
- [ ] Las métricas de compras NO se ven afectadas por el toggle showNoe
- [ ] Al hacer clic en una fila, se hace `console.log` del proveedor (el modal se conecta en issue 02)
- [ ] Endpoint `GET /api/providers/list?search=&page=&limit=&showNoe=` implementado y funcionando
- [ ] Tests del endpoint (con y sin search, con y sin paginación, con showNoe=true/false verificando que solo ventas cambian)
- [ ] Tests del componente ProvidersTable (renderiza columnas, spinner, "Sin datos", dispara onRowClick)

## Blocked by

None — can start immediately.
