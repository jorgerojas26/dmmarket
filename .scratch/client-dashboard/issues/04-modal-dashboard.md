## What to build

Crear el modal de dashboard del cliente (`ClientDashboardModal`) que se abre al hacer clic en una fila de la tabla de clientes. El modal contiene:

1. **DateRangePicker** (del Slice 3) — auto-submit, default último año. Al cambiar el rango, se recargan las tarjetas y la tabla de ventas.
2. **4 tarjetas de métricas** en una fila horizontal:
   - Total ventas monto
   - Total número de ventas
   - Promedio de ticket
   - Promedio de días entre ventas
3. **Tabla de ventas** server-side paginada con columnas: Vendedor (nombre), Fecha, Monto.

Todo dentro de un `Modal` de react-bootstrap tamaño `lg`. El modal respeta el toggle showNoe y los datos se filtran por el rango de fechas del DateRangePicker.

### API modules nuevos

Agregar a `src/api/clients/index.js`:
- `fetchClientSales(clientId, { from, to, page, limit, showNoe })`
- `fetchClientSummary(clientId, { from, to, showNoe })`

### Integración

Al hacer clic en una fila de `ClientsTable` (Slice 1), se abre el modal pasando el `IdCliente`.

## Acceptance criteria

- [ ] El modal se abre al hacer clic en un cliente de la tabla (tamaño `lg`)
- [ ] El modal muestra el nombre del cliente en el título (`Modal.Title`)
- [ ] El DateRangePicker aparece al inicio del modal con default último año
- [ ] Al cambiar el rango de fechas, las 4 tarjetas y la tabla de ventas se recargan automáticamente
- [ ] Las 4 tarjetas muestran los valores correctos (formato: `$X.XX`, `N ventas`, `$X.XX`, `X días`)
- [ ] Si no hay datos, las tarjetas muestran `$0`, `0 ventas`, `N/A`, `N/A`
- [ ] La tabla de ventas muestra Vendedor (nombre), Fecha, Monto
- [ ] La tabla de ventas tiene paginación server-side con números de página
- [ ] El toggle showNoe del navbar afecta los datos del modal
- [ ] Spinner visible en tarjetas y tabla mientras se cargan los datos
- [ ] Mensaje "Sin ventas" en la tabla cuando no hay resultados
- [ ] El modal se cierra con el botón X o click fuera

## Blocked by

- `01-clients-table` (necesita la tabla y el layout para el click handler)
- `02-sales-and-summary-endpoints` (necesita los endpoints backend)
- `03-date-range-picker` (necesita el DateRangePicker)

## Notes

Las 4 tarjetas deben usar un layout horizontal responsivo (ej: `d-flex flex-wrap gap-2`). Usar `Card` de react-bootstrap con fondo oscuro para consistencia visual con el resto de la app.
