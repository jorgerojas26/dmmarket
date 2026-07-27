## What to build

Crear dos endpoints backend para obtener las ventas detalladas y el resumen de métricas de un cliente específico. Estos endpoints serán consumidos por el modal dashboard (Slice 4).

### `GET /api/clients/:clientId/sales`

Devuelve la lista paginada de ventas de un cliente, con JOIN a `vendedores` para obtener el nombre del vendedor. Filtrable por rango de fechas y respeta el toggle showNoe. Las ventas se agrupan por factura/NOE para mostrar una fila por transacción.

Query params: `from`, `to`, `page`, `limit`, `showNoe`

Respuesta: `{ data: [{ vendedor, fecha, monto }], total, page, limit }`

### `GET /api/clients/:clientId/summary`

Devuelve 4 métricas agregadas para el dashboard: total de ventas en monto, número total de ventas, promedio de ticket, y promedio de días entre ventas consecutivas. Filtrable por rango de fechas y respeta showNoe.

Query params: `from`, `to`, `showNoe`

Respuesta: `{ totalAmount, totalCount, avgTicket, avgDaysBetweenSales }`

### Cálculo de avgDaysBetweenSales

Para calcular el promedio de días entre ventas consecutivas: obtener las fechas de ventas del cliente ordenadas cronológicamente (únicas por factura), calcular la diferencia en días entre cada par consecutivo, y promediar esas diferencias. Si hay menos de 2 ventas, devolver `null`.

## Acceptance criteria

- [ ] `GET /api/clients/:clientId/sales?from=2025-01-01&to=2025-12-31&page=1&limit=20&showNoe=false` devuelve ventas del cliente filtradas por fecha, paginadas, con nombre del vendedor
- [ ] `GET /api/clients/:clientId/sales?showNoe=true` usa tablas `masternoe`/`slavenoe`
- [ ] Las ventas están agrupadas por factura/NOE (una fila = una transacción)
- [ ] El campo `vendedor` contiene el nombre (`vendedores.Empresa`), no el ID
- [ ] El campo `monto` es `SUM(Precio * Cantidad)` del slave
- [ ] Se excluyen facturas con Anulada=1
- [ ] La respuesta de sales incluye `total` para paginación
- [ ] `GET /api/clients/:clientId/summary` devuelve las 4 métricas correctamente
- [ ] `avgTicket = totalAmount / totalCount` (redondeado a 2 decimales)
- [ ] `avgDaysBetweenSales` es `null` cuando hay 0 o 1 ventas
- [ ] `avgDaysBetweenSales` se calcula como promedio de diferencias en días entre fechas de ventas consecutivas (ordenadas cronológicamente)

## Blocked by

None — can start immediately.
