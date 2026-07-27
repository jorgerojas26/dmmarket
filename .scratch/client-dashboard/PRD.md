# PRD: Dashboard de Clientes con Tabla Listado y Modal de Detalle

**Status:** `ready-for-agent`

## Problem Statement

La pestaña "Clientes" actualmente solo muestra tres reportes agregados (mejores clientes, cliente por producto, promedio mensual). Los usuarios no pueden buscar un cliente específico en una lista, ver su historial de ventas, ni consultar métricas individuales por cliente desde una sola vista.

## Solution

Agregar una tabla de clientes con búsqueda server-side y paginación en la pestaña Clientes, posicionada a la izquierda en un layout de dos columnas. Al hacer clic en un cliente, se abre un modal con un mini-dashboard que incluye tarjetas de métricas globales y una tabla de ventas detallada con búsqueda server-side, todo filtrable por rango de fechas.

---

## User Stories

1. Como analista de ventas, quiero ver una lista paginada de todos los clientes ordenada por total de ventas descendente, para identificar rápidamente a los clientes más importantes.

2. Como analista de ventas, quiero buscar clientes por nombre de empresa en la tabla, para encontrar un cliente específico sin tener que recorrer páginas manualmente.

3. Como analista de ventas, quiero ver el total de ventas (en monto) y el número de ventas de cada cliente directamente en la tabla, para comparar clientes sin abrir un detalle.

4. Como analista de ventas, quiero alternar entre facturas y notas de entrega (toggle showNoe) y que la tabla de clientes refleje los datos correspondientes, para mantener consistencia con el resto de la aplicación.

5. Como analista de ventas, quiero hacer clic en un cliente de la tabla y que se abra un modal con información detallada, para profundizar en el análisis de ese cliente.

6. Como analista de ventas, quiero ver tarjetas resumen en el modal con: total de ventas en monto, total de número de ventas, promedio de ticket, y promedio de días entre ventas consecutivas, para entender el comportamiento de compra del cliente de un vistazo.

7. Como analista de ventas, quiero seleccionar un rango de fechas en el modal mediante un date range picker intuitivo, para filtrar los datos del dashboard a un período específico.

8. Como analista de ventas, quiero que el date range picker del modal haga auto-submit al cambiar las fechas (sin necesidad de presionar un botón), para una experiencia más fluida.

9. Como analista de ventas, quiero que el date range picker del modal tenga como valor por defecto el último año (hoy - 365 días a hoy), para ver datos relevantes sin configuración adicional.

10. Como analista de ventas, quiero ver una tabla de ventas dentro del modal con: nombre del vendedor, fecha de la venta, y monto (Precio * Cantidad en moneda original), para entender quién vendió, cuándo y por cuánto.

11. Como analista de ventas, quiero que la tabla de ventas en el modal tenga paginación server-side, para manejar clientes con muchas ventas sin problemas de rendimiento.

12. Como analista de ventas, quiero que las tres cards de reportes existentes (Mejores Clientes, Cliente por Producto, Promedio Mensual) sigan visibles en la columna derecha de la página, para mantener el acceso a esos reportes.

13. Como analista de ventas, quiero ver indicadores de carga (spinner) mientras se cargan los datos de la tabla y el modal, para saber que el sistema está procesando mi solicitud.

14. Como analista de ventas, quiero ver un mensaje "Sin datos" en las tarjetas y tablas cuando no haya información para mostrar, para entender que el resultado vacío es válido y no un error.

---

## Implementation Decisions

### Layout

- La página Clientes adopta un layout de **dos columnas** debajo del DatePicker existente:
  - **Columna izquierda (8/12):** nueva tabla de listado de clientes.
  - **Columna derecha (4/12):** las tres cards existentes (ClientReportCard, ClientPerProductCard, MonthlyAverageClientCard) apiladas verticalmente.
- El DatePicker actual de la página se mantiene arriba a full-width y **solo afecta las tres cards de la columna derecha** (comportamiento existente sin cambios).

### Tabla de Clientes (columna izquierda)

- **Datos:** all-time (sin filtro de fecha), respetando el toggle Facturas/Notas de entrega (showNoe).
- **Columnas:** IdCliente, Empresa, Total Ventas (monto), # Ventas.
- **Orden:** Total Ventas descendente (clientes con mayor monto primero).
- **Búsqueda:** server-side. El backend recibe `?search=` y filtra por `Empresa LIKE '%search%'`.
- **Paginación:** server-side con offset/limit. Parámetros `?page=&limit=`. El backend responde `{ data: [...], total: N, page, limit }`.
- **Interacción:** al hacer clic en una fila se abre el modal del dashboard de ese cliente.
- **Componente:** extender el patrón del `Table` existente (react-table v7) o crear un wrapper que consuma la API paginada.
- **Toggle showNoe:** la tabla se recarga al cambiar el toggle del navbar, usando el contexto `ShowNoeContext`.

### Modal de Dashboard del Cliente

- **Tamaño:** Bootstrap Modal `lg`.
- **Contenido, en orden vertical:**
  1. **DateRangePicker** — nuevo componente con selección intuitiva de rango (librería `react-date-range`). Auto-submit al cambiar from o to. Default: desde hace 1 año hasta hoy.
  2. **4 tarjetas de métricas** (Cards en una fila horizontal):
     - Total ventas monto — `SUM(Precio * Cantidad)`.
     - Total número de ventas — `COUNT(DISTINCT IdFactura/IdNoe)`.
     - Promedio de ticket — total monto / total número de ventas.
     - Promedio de días entre ventas consecutivas — `AVG(diferencias en días entre fechas de ventas ordenadas)`.
  3. **Tabla de ventas** — server-side paginada. Columnas: Vendedor (nombre desde `vendedores.Empresa`), Fecha, Monto (`Precio * Cantidad`).
- **Moneda:** el monto se muestra en la moneda original de cada factura (Precio * Cantidad), sin conversión a USD.
- **Toggle showNoe:** el dashboard y la tabla de ventas dentro del modal también respetan el toggle.

### Backend API — Nuevos Endpoints

1. **`GET /api/clients/list`**
   - Query params: `?search=&page=&limit=&showNoe=`
   - Respuesta: `{ data: [{ IdCliente, Empresa, total_ventas, num_ventas }], total, page, limit }`
   - Lógica: JOIN de `clientes` con master/slave (fact o noe según showNoe). GROUP BY IdCliente con `WHERE Anulada = 0`. Filtro `LIKE` sobre Empresa. Orden por total_ventas DESC. Paginación con LIMIT/OFFSET.

2. **`GET /api/clients/:clientId/summary`**
   - Query params: `?from=&to=&showNoe=`
   - Respuesta: `{ totalAmount, totalCount, avgTicket, avgDaysBetweenSales }`
   - Lógica: agregación sobre las ventas del cliente en el rango de fechas. Para avgDaysBetweenSales: calcular diferencias en días entre fechas de ventas consecutivas (ordenadas cronológicamente) y promediar.

3. **`GET /api/clients/:clientId/sales`**
   - Query params: `?from=&to=&page=&limit=&showNoe=`
   - Respuesta: `{ data: [{ vendedor, fecha, monto }], total, page, limit }`
   - Lógica: JOIN master→slave→vendedores. Agrupado por factura/NOE. Paginado.

### DateRangePicker

- **Librería:** `react-date-range` (requiere `date-fns` como peer dependency).
- **Instalación:** `npm install react-date-range date-fns`.
- **Uso inicial:** solo en el modal de dashboard de cliente. Reemplazo futuro de los inputs de fecha existentes en otras páginas fuera del alcance de este PRD.
- **Comportamiento:** emite `onChange` con `{ from, to }` al seleccionar. El componente padre escucha y dispara el fetch de datos (auto-submit).

### Edge Cases y Estados

- **Carga:** spinner de Bootstrap mientras se espera respuesta del servidor en tablas y tarjetas.
- **Sin datos:** si una query no devuelve resultados, mostrar "Sin datos" o "Sin ventas" en lugar de tabla vacía o ceros.
- **Cliente sin ventas:** las tarjetas del modal muestran `$0`, `0 ventas`, `N/A` en promedio de ticket, `N/A` en promedio de días.
- **Error de red:** manejo básico con mensaje genérico (consistente con el patrón de manejo de errores actual del proyecto).
- **Una sola venta:** el promedio de días entre ventas es `N/A` (se necesita al menos 2 ventas para calcular).

### Dependencias Nuevas

| Paquete | Versión | Propósito |
|---|---|---|
| `react-date-range` | ^1.4.0 | Date range picker intuitivo |
| `date-fns` | ^2.x | Peer dependency de react-date-range |

---

## Testing Decisions

### ¿Qué hace un buen test?

- Probar comportamiento externo (API responses, UI rendering), no detalles de implementación.
- Usar los mismos patrones de testing que ya existen en el proyecto (Jest + React Testing Library, si hay tests existentes).

### Qué probar

1. **Backend endpoints** (HTTP-level):
   - `GET /api/clients/list` con y sin search, con y sin paginación, con showNoe=true/false.
   - `GET /api/clients/:clientId/summary` con rango de fechas y showNoe.
   - `GET /api/clients/:clientId/sales` con paginación y filtro de fechas.
   - Verificar que `Anulada = 0` excluye facturas anuladas.
   - Verificar ordenamiento por total_ventas DESC.

2. **Componentes frontend** (React Testing Library):
   - ClientsTable: renderiza columnas, muestra spinner, muestra "Sin datos", dispara onRowClick.
   - ClientDashboardModal: se abre/cierra, muestra tarjetas con datos, muestra tabla de ventas.
   - DateRangePicker: emite onChange con fechas correctas.

### Prior Art

- El proyecto usa `@testing-library/react` y `@testing-library/jest-dom` ya instalados.
- Revisar tests existentes en `src/__tests__/` o junto a componentes para seguir el mismo patrón.

---

## Out of Scope

- Reemplazar los inputs de fecha del DatePicker global de la página con el nuevo DateRangePicker.
- Agregar columnas adicionales a la tabla de clientes (ej: RIF, contacto, email).
- Filtros adicionales en la tabla de clientes (por rango de monto, por grupo, etc.).
- Exportación a PDF/Excel de la tabla de clientes o del dashboard del modal.
- Gráficos o visualizaciones en el modal de dashboard.
- Modificar el comportamiento del toggle showNoe (sigue siendo binario: facturas O notas de entrega, no combinado).
- Unificar luxon y dayjs (el proyecto usa ambas librerías de fechas; no se aborda en este PRD).

## Further Notes

- La tabla `clientes` no tiene campo de fecha de creación. Se usa `IdCliente` como proxy para orden cronológico si en el futuro se requiere, pero para este PRD el orden principal es por total de ventas descendente.
- El cálculo del promedio de días entre ventas consecutivas requiere una query más compleja. Si resulta demasiado costosa en rendimiento, considerar cacheo o aproximación.
- El toggle showNoe aplica un middleware que selecciona dinámicamente `masterfact`/`slavefact` o `masternoe`/`slavenoe`. Los nuevos endpoints deben pasar por este middleware.
