## What to build

Crear el endpoint `GET /api/clients/list` en el backend y la tabla de clientes con búsqueda server-side y paginación en el frontend. La tabla se coloca en la columna izquierda de la página Clientes, con las 3 cards existentes en la columna derecha.

### Backend

Nuevo endpoint `GET /api/clients/list` con query params: `search`, `page`, `limit`, `showNoe`. El endpoint agrega totales de ventas por cliente usando JOIN con las tablas master/slave correspondientes según el toggle showNoe, excluye facturas anuladas, permite búsqueda por nombre de empresa, ordena por total de ventas descendente, y pagina los resultados.

Respuesta: `{ data: [{ IdCliente, Empresa, total_ventas, num_ventas }], total, page, limit }`

### Frontend

Nuevo componente `ClientsTable` con búsqueda server-side y paginación con números de página. Las columnas son: IdCliente, Empresa, Total Ventas, # Ventas. El orden es all-time por total de ventas descendente. La tabla respeta el toggle showNoe del navbar. Al hacer clic en una fila queda seleccionada (placeholder para futuro modal).

Layout de 2 columnas en ClientesPage: tabla a la izquierda, las 3 cards existentes apiladas a la derecha.

## Acceptance criteria

- [ ] `GET /api/clients/list?search=&page=1&limit=20&showNoe=true` devuelve clientes con totales de ventas de `masternoe`/`slavenoe`
- [ ] `GET /api/clients/list?search=&page=1&limit=20&showNoe=false` devuelve clientes con totales de ventas de `masterfact`/`slavefact`
- [ ] `GET /api/clients/list?search=acme` filtra por Empresa LIKE '%acme%'
- [ ] Los clientes se ordenan por total_ventas DESC
- [ ] La respuesta incluye `total` para calcular número de páginas
- [ ] Las facturas con Anulada=1 se excluyen del cálculo de totales
- [ ] La tabla en el frontend muestra las 4 columnas correctamente
- [ ] El input de búsqueda en la tabla dispara requests al backend (debounced 500ms)
- [ ] Los controles de paginación cambian de página correctamente
- [ ] Cambiar el toggle showNoe en el navbar recarga la tabla con los datos correspondientes
- [ ] La página Clientes mantiene el DatePicker y las 3 cards en layout de 2 columnas
- [ ] Spinner visible mientras se cargan los datos
- [ ] Mensaje "Sin datos" cuando no hay resultados

## Blocked by

None — can start immediately.
