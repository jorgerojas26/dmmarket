# PRD: Dashboard de Proveedores con Tabla Listado y Modal de Detalle

**Status:** `ready-for-agent`

## Problem Statement

Actualmente no existe una pestaña "Proveedores" en la aplicación. Los analistas no pueden buscar un proveedor específico en una lista, ver el historial de compras realizadas a ese proveedor, consultar las ventas de los productos que suministra, ni ver métricas agregadas por proveedor desde una sola vista.

## Solution

Agregar una pestaña "Proveedores" en el navbar principal con un layout de dos columnas (sidebar con tabs Reportes/Proveedores, tabla de listado a la izquierda, report card a la derecha). Al hacer clic en un proveedor, se abre un modal con un mini-dashboard que incluye tarjetas de métricas, una tabla de compras (con drill-down a detalle de factura), y una tabla de ventas de los productos de ese proveedor, todo filtrable por rango de fechas.

---

## User Stories

1. Como analista de compras/ventas, quiero ver una lista paginada de todos los proveedores con métricas de compras y ventas, para identificar rápidamente los proveedores más relevantes.

2. Como analista de compras/ventas, quiero buscar proveedores por nombre de empresa en la tabla, para encontrar un proveedor específico sin tener que recorrer páginas manualmente.

3. Como analista de compras/ventas, quiero ver el total de compras (monto), número de compras, total de ventas de sus productos (monto) y número de ventas directamente en la tabla principal, para comparar proveedores sin abrir un detalle.

4. Como analista de compras/ventas, quiero alternar entre facturas y notas de entrega (toggle showNoe) y que las métricas de ventas reflejen los datos correspondientes, para mantener consistencia con el resto de la aplicación. Las métricas de compras no se ven afectadas por el toggle (mastercomp/slavecomp no tienen equivalente NOE).

5. Como analista de compras/ventas, quiero hacer clic en un proveedor de la tabla y que se abra un modal con información detallada, para profundizar en el análisis de ese proveedor.

6. Como analista de compras/ventas, quiero ver tarjetas resumen en el modal con: total compras en monto, número de compras, total ventas de productos del proveedor en monto, y nombre del mejor vendedor de productos del proveedor, para entender la relación comercial de un vistazo.

7. Como analista de compras/ventas, quiero seleccionar un rango de fechas en el modal mediante un date range picker intuitivo, para filtrar los datos del dashboard a un período específico.

8. Como analista de compras/ventas, quiero que el date range picker del modal haga auto-submit al cambiar las fechas (sin necesidad de presionar un botón), para una experiencia más fluida.

9. Como analista de compras/ventas, quiero que el date range picker del modal tenga como valor por defecto el último año (hoy - 365 días a hoy), para ver datos relevantes sin configuración adicional.

10. Como analista de compras/ventas, quiero ver una tabla de compras dentro del modal con: número de factura de compra, fecha, y monto total (agrupado por factura), para entender qué y cuándo se le compró al proveedor.

11. Como analista de compras/ventas, quiero hacer clic en una fila de la tabla de compras y que se abra un sub-modal con el detalle completo de la factura de compra (productos, cantidades, precios unitarios, subtotales), para inspeccionar compras específicas.

12. Como analista de compras/ventas, quiero ver una tabla de ventas dentro del modal con: nombre del vendedor, fecha de la venta, y monto total de productos del proveedor en esa factura/NOE, para entender quién vendió los productos del proveedor, cuándo y por cuánto.

13. Como analista de compras/ventas, quiero que las tablas de compras y ventas en el modal tengan paginación server-side, para manejar proveedores con muchas transacciones sin problemas de rendimiento.

14. Como analista de compras/ventas, quiero ver una card de "Mejores Proveedores" en la columna derecha de la página, con un selector que permita alternar entre ranking por compras y ranking por ventas, para tener visibilidad rápida de los proveedores más importantes.

15. Como analista de compras/ventas, quiero ver indicadores de carga (spinner) mientras se cargan los datos de la tabla y el modal, para saber que el sistema está procesando mi solicitud.

16. Como analista de compras/ventas, quiero ver un mensaje "Sin datos" en las tarjetas y tablas cuando no haya información para mostrar, para entender que el resultado vacío es válido y no un error.

---

## Implementation Decisions

### Layout

- La página Proveedores adopta el mismo layout de dos columnas que la página Clientes, con sidebar de tabs (Reportes / Proveedores):
  - **Columna izquierda (8/12):** tabla de listado de proveedores.
  - **Columna derecha (4/12):** una card de Mejores Proveedores (con selector compras/ventas) sobre un DateRangePicker.
- El DateRangePicker de la columna derecha afecta solo la card de Mejores Proveedores.
- El modal del proveedor tiene su propio DateRangePicker interno (default: último año).

### Tabla de Proveedores (columna izquierda)

- **Datos:** all-time (sin filtro de fecha). Las métricas de ventas respetan el toggle showNoe; las métricas de compras no.
- **Columnas:** IdProveedor, Empresa, Total Compras (monto), # Compras, Total Ventas (monto de productos del proveedor), # Ventas.
- **Orden:** Total Ventas descendente por defecto.
- **Búsqueda:** server-side. El backend recibe `?search=` y filtra por `proveedores.Empresa LIKE '%search%'`.
- **Paginación:** server-side con offset/limit. Parámetros `?page=&limit=`. El backend responde `{ data: [...], total: N, page, limit }`.
- **Interacción:** al hacer clic en una fila se abre el modal del dashboard de ese proveedor.
- **Componente:** ProvidersTable, siguiendo el mismo patrón que ClientsTable.
- **Toggle showNoe:** las columnas de ventas se recargan al cambiar el toggle del navbar; las de compras permanecen igual.

### Modal de Dashboard del Proveedor

- **Tamaño:** Bootstrap Modal `xl`.
- **Contenido, en orden vertical:**
  1. **DateRangePicker** — componente existente (`react-date-range`). Auto-submit al cambiar from o to. Default: desde hace 1 año hasta hoy.
  2. **4 tarjetas de métricas** (Cards en una fila horizontal):
     - Total Compras — `SUM(slavecomp.Precio * slavecomp.Cantidad)` filtrado por `mastercomp.IdProveedor`.
     - # Compras — `COUNT(DISTINCT mastercomp.IdFactura)` del proveedor.
     - Total Ventas — `SUM(slavefact/slavenoe.Precio * Cantidad)` filtrando productos por `productos.Proveedor = proveedorId`.
     - Mejor Vendedor — `vendedores.Empresa` con mayor `SUM(monto)` de productos del proveedor en el rango.
  3. **Dos tablas en grid 5:7** (compras a la izquierda, ventas a la derecha):
     - **Tabla de Compras** — server-side paginada. Columnas: IdFactura, Fecha, Monto (agrupado por factura de mastercomp). Al hacer clic en una fila, se abre un sub-modal con el detalle de la factura de compra.
     - **Tabla de Ventas** — server-side paginada. Columnas: Vendedor (`vendedores.Empresa`), Fecha, Monto (`SUM(Precio * Cantidad)` de productos del proveedor en la factura/NOE).
- **Moneda:** montos en moneda original de cada factura, sin conversión a USD.
- **Toggle showNoe:** solo afecta la tabla de ventas y los stats de ventas y mejor vendedor. La tabla de compras y stats de compras no tienen equivalente NOE y no se ven afectados.

### Sub-modal de Detalle de Compra

- **Tamaño:** Bootstrap Modal `md`.
- **Contenido:**
  - Cabecera con IdFactura y Fecha de la compra.
  - Tabla de productos comprados: Descripción (desde `slavecomp.Descripcion` o `productos.Descripcion`), Cantidad, Precio unitario, Subtotal.
  - Total al pie de la tabla.

### Backend API — Nuevos Endpoints

1. **`GET /api/providers/list`**
   - Query params: `?search=&page=&limit=&showNoe=`
   - Respuesta: `{ data: [{ IdProveedor, Empresa, total_compras, num_compras, total_ventas, num_ventas }], total, page, limit }`
   - Lógica: LEFT JOIN de `proveedores` con mastercomp/slavecomp (compras) y con masterfact/slavefact filtrando por `productos.Proveedor` (ventas). GROUP BY IdProveedor. Filtro `LIKE` sobre Empresa. Orden por total_ventas DESC. Paginación con LIMIT/OFFSET.
   - showNoe solo afecta el lado de ventas (masterfact vs masternoe).

2. **`GET /api/providers/:providerId/summary`**
   - Query params: `?from=&to=&showNoe=`
   - Respuesta: `{ totalCompras, numCompras, totalVentas, numVentas, bestSeller }`
   - Lógica de compras: agregación sobre mastercomp/slavecomp con `WHERE mastercomp.IdProveedor = providerId AND mastercomp.Anulada = 0`.
   - Lógica de ventas: JOIN masterfact→slavefact→productos filtrando por `productos.Proveedor = providerId`. JOIN vendedores para bestSeller. Respetar showNoe.

3. **`GET /api/providers/:providerId/sales`**
   - Query params: `?from=&to=&page=&limit=&showNoe=`
   - Respuesta: `{ data: [{ vendedor, fecha, monto }], total, page, limit }`
   - Lógica: JOIN master→slave→productos→vendedores. Filtrar por `productos.Proveedor = providerId` y rango de fechas. Agrupado por factura/NOE. Paginado.

4. **`GET /api/providers/:providerId/purchases`**
   - Query params: `?from=&to=&page=&limit=`
   - Respuesta: `{ data: [{ idFactura, fecha, monto }], total, page, limit }`
   - Lógica: JOIN mastercomp→slavecomp donde `mastercomp.IdProveedor = providerId AND mastercomp.Anulada = 0`. Agrupado por IdFactura. Paginado.

5. **`GET /api/providers/:providerId/purchases/:invoiceId`**
   - Respuesta: `{ idFactura, fecha, productos: [{ descripcion, cantidad, precio, subtotal }], total }`
   - Lógica: detalle de una factura de compra específica desde slavecomp.

6. **`GET /api/providers/best`**
   - Query params: `?from=&to=&showNoe=&mode=` (mode: `ventas` | `compras`)
   - Respuesta: `[{ proveedor, Empresa, monto }]`
   - Lógica: si mode=compras, agregar mastercomp/slavecomp agrupado por IdProveedor. Si mode=ventas, agregar masterfact/slavefact filtrando productos por Proveedor. Orden por monto DESC.

### Mejores Proveedores Card

- **Componente:** ProviderReportCard, basado en ClientReportCard.
- **Selector:** toggle compras/ventas que cambia el `?mode=` del endpoint `/api/providers/best`.
- **DateRangePicker:** propio de la página (columna derecha), igual que en la página Clientes.
- **Búsqueda:** filtro local client-side sobre los resultados del ranking (mismo patrón que ClientReportCard).

### DateRangePicker

- **Librería:** `react-date-range` + `date-fns` (ya instaladas para ClientDashboardModal).
- **Ubicaciones de uso:**
  - Modal de proveedor: filtra compras y ventas. Auto-submit. Default 1 año.
  - Página (columna derecha): filtra el report card Mejores Proveedores. Mismo patrón que la página Clientes.

### Edge Cases y Estados

- **Carga:** spinner de Bootstrap mientras se espera respuesta del servidor en tablas y tarjetas.
- **Sin datos:** si una query no devuelve resultados, mostrar "Sin datos" o "Sin compras" / "Sin ventas" en lugar de tabla vacía o ceros.
- **Proveedor sin compras:** tarjetas muestran `$0`, `0 compras`, según corresponda.
- **Proveedor sin ventas de sus productos:** tarjetas de ventas muestran `$0`, `0 ventas`, `N/A` en mejor vendedor.
- **Error de red:** manejo básico con mensaje genérico (consistente con el patrón de manejo de errores actual del proyecto).
- **Sin mejor vendedor:** si no hay ventas de productos del proveedor en el rango, mostrar `N/A`.

---

## Testing Decisions

### ¿Qué hace un buen test?

- Probar comportamiento externo (API responses, UI rendering), no detalles de implementación.
- Usar los mismos patrones de testing que ya existen en el proyecto (Jest + React Testing Library).

### Qué probar

1. **Backend endpoints** (HTTP-level):
   - `GET /api/providers/list` con y sin search, con y sin paginación, con showNoe=true/false (verificando que compras no cambian y ventas sí).
   - `GET /api/providers/:id/summary` con rango de fechas y showNoe.
   - `GET /api/providers/:id/sales` con paginación y filtro de fechas. Verificar que solo incluye productos del proveedor.
   - `GET /api/providers/:id/purchases` con paginación. Verificar `Anulada = 0`.
   - `GET /api/providers/:id/purchases/:invoiceId` — verificar detalle correcto.
   - `GET /api/providers/best?mode=ventas` y `?mode=compras`.
   - Verificar que `Anulada = 0` excluye facturas anuladas.
   - Verificar que los montos de ventas solo suman productos cuyo `productos.Proveedor = providerId`.

2. **Componentes frontend** (React Testing Library):
   - ProvidersTable: renderiza 6 columnas, muestra spinner, muestra "Sin datos", dispara onRowClick.
   - ProviderDashboardModal: se abre/cierra, muestra 4 tarjetas con datos, muestra tabla de compras y tabla de ventas, abre sub-modal al hacer clic en compra.
   - PurchaseDetailModal: muestra productos de la factura de compra con cantidades y subtotales.
   - ProviderReportCard: alterna entre modo compras y ventas, renderiza ranking.

### Prior Art

- El proyecto usa `@testing-library/react` y `@testing-library/jest-dom` ya instalados.
- Seguir el mismo patrón que los tests existentes de ClientsTable y ClientDashboardModal.

---

## Out of Scope

- Filtro o búsqueda por vendedor en la tabla de ventas del modal (pospuesto para iteración futura).
- Report cards adicionales (Proveedor por Producto, Promedio Mensual Proveedor) — solo se implementa Mejores Proveedores.
- Reemplazar los inputs de fecha del DatePicker global de la página con el nuevo DateRangePicker.
- Exportación a PDF/Excel de las tablas.
- Gráficos o visualizaciones en el modal de dashboard de proveedor.
- Modificar el comportamiento del toggle showNoe.
- Unificar luxon y dayjs.

## Further Notes

- La tabla `proveedores` no tiene campo de fecha de creación. El orden principal de la tabla es por total_ventas descendente.
- La relación proveedor→productos→ventas es indirecta: `proveedores.IdProveedor = productos.Proveedor`, luego `productos.IdProducto = slavefact/slavenoe.IdProducto`. Las queries de ventas requieren este doble JOIN.
- La tabla `mastercomp`/`slavecomp` maneja las compras y tiene `IdProveedor` directamente en `mastercomp`, lo que simplifica las queries de compras.
- Los endpoints de ventas deben pasar por el middleware `showNoe` para seleccionar dinámicamente masterfact/slavefact o masternoe/slavenoe.
- Los endpoints de compras NO pasan por el middleware showNoe porque mastercomp/slavecomp no tienen variante NOE.
- El sub-modal de detalle de compra consume un endpoint separado que devuelve las líneas de slavecomp para una factura específica.
