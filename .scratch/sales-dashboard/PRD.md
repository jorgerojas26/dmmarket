# PRD: Dashboard de Ventas

Status: ready-for-agent

## Problem Statement

Actualmente la pantalla de Ventas (`/ventas`) es una vista plana de dos columnas (tabla de productos + gráfico de categorías). Las páginas de Categorías, Vendedores y Facturas son pantallas independientes, cada una con su propia navegación, DateRangePicker y lógica duplicada. No existe un dashboard unificado que dé una visión de alto nivel del negocio — KPIs críticos como ganancia neta, ticket promedio, mejor vendedor, o comparativa contra el período anterior no están disponibles en ningún lado.

## Solution

Migrar `/ventas` a un layout con sidebar (como ya tienen Clientes y Proveedores) que unifique las vistas de ventas bajo una sola pantalla. El primer ítem del sidebar será un Dashboard de Ventas completo con KPIs, gráficos y tablas que dan la radiografía completa del negocio en un rango de fechas. Las páginas de Categorías, Vendedores y Facturas se absorben como vistas secundarias dentro del mismo sidebar, compartiendo el DateRangePicker global. Productos, Clientes y Proveedores se mantienen como pantallas independientes (las dos últimas ya tienen su propio layout sidebar).

## User Stories

1. Como gerente, quiero ver de un vistazo la venta bruta total, ganancia neta, ticket promedio, margen %, unidades vendidas y número de transacciones para un rango de fechas, para entender la salud del negocio en segundos.
2. Como gerente, quiero ver la variación porcentual de cada KPI contra el período anterior (con indicador visual ▲ verde o ▼ rojo), para detectar tendencias sin hacer cálculos mentales.
3. Como gerente, quiero saber quién fue el mejor vendedor del período con su total de ventas, para identificar al empleado más productivo.
4. Como gerente, quiero ver el top 10 de productos por ganancia neta, para saber qué productos están generando más utilidad.
5. Como gerente, quiero ver el top 10 de clientes por ganancia neta, para identificar a mis clientes más valiosos.
6. Como gerente, quiero ver un gráfico de torta con la distribución de ventas por categoría, para entender qué categorías dominan.
7. Como usuario del sistema, quiero cambiar el rango de fechas y que TODO el dashboard (KPIs, gráficos, tablas, comparativa) se actualice junto, sin tener que recargar cada sección por separado.
8. Como usuario del sistema, quiero navegar entre Dashboard, Por Categoría, Por Vendedor y Facturas desde un sidebar lateral, para tener todas las vistas de ventas en un solo lugar.
9. Como usuario de categorías, quiero seleccionar un grupo/categoría y ver las ventas filtradas por ese grupo con tabla de productos y gráfico, igual que en la pantalla actual de Categorías.
10. Como usuario de vendedores, quiero ver la tabla de vendedores con sus ventas y poder gestionar comisiones, igual que en la pantalla actual de Vendedores.
11. Como usuario de facturas, quiero ver el listado de facturas con selección múltiple y la tabla agregada de productos, igual que en la pantalla actual de Facturas.
12. Como usuario, quiero que el toggle Facturas/Notas de Entrega (showNoe) afecte correctamente a todas las vistas del dashboard, igual que en el resto del sistema.
13. Como usuario en móvil, quiero que el dashboard sea responsive: sidebar colapsa a tabs horizontales, KPIs se apilan en vez de desaparecer.
14. Como desarrollador, quiero que el dashboard consuma UN solo endpoint agregado del backend, para minimizar llamadas de red y mantener la lógica de agregación en un solo lugar.

## Implementation Decisions

### Arquitectura

- **Nuevo endpoint backend**: `GET /api/dashboard/sales?from=&to=&compareFrom=&compareTo=&showNoe=`. Devuelve todos los datos del dashboard en una sola respuesta. Internamente usa una sola llamada `knex.raw()` con 6 statements SQL y named bindings (`:from`, `:to`) — `multipleStatements: true` ya configurado. Cero SQL injection.
- **Nuevo módulo frontend api**: `api/dashboard/index.js` con `fetchDashboardSales({ from, to, compareFrom, compareTo, showNoe })`.
- **Sidebar layout**: Se reutiliza el patrón CSS `.clientes-layout` / `.clientes-row` / `.clients-sidebar` / `.clientes-content` ya existente.
- **Vistas existentes**: Las páginas `/categorias`, `/vendedores`, `/facturas` se eliminan como rutas independientes y sus componentes se montan como vistas dentro del sidebar de Ventas. El `DateRangePicker` es compartido globalmente en la barra superior del contenido.
- **Toggle showNoe**: Se mantiene el `ShowNoeContext` existente.

### Contrato del endpoint

`GET /api/dashboard/sales?from=YYYY-MM-DD&to=YYYY-MM-DD&compareFrom=YYYY-MM-DD&compareTo=YYYY-MM-DD&showNoe=true|false`

```json
{
  "kpis": {
    "totalRawProfit": 123456.00,
    "totalNetProfit": 45678.00,
    "totalQuantity": 999,
    "totalInvoices": 150,
    "avgTicket": 823.04,
    "avgMarginPercent": 32.51,
    "compareRawProfit": 110000.00,
    "compareNetProfit": 40000.00,
    "compareQuantity": 850,
    "compareInvoices": 130
  },
  "bestEmployee": {
    "id": 5,
    "name": "Juan Pérez",
    "totalSales": 45000.00
  },
  "topProducts": [{ "product": "Producto A", "quantity": 100, "rawProfit": 50000, "netProfit": 15000, "averageProfitPercent": 30 }],
  "topClients": [{ "client": "Empresa XYZ", "total_USD": 25000 }],
  "groupSalesChart": [{ "categoria": "Electrónicos", "rawProfit": 80000, "netProfit": 25000 }]
}
```

### Layout del Dashboard

```
┌──────────────────────────────────────────────────────────────┐
│  [Sidebar]  │  DateRangePicker                     [contenido]│
│             │─────────────────────────────────────────────────│
│  Dashboard  │  ┌──────────┬──────────┬──────────┬──────────┐  │
│  Por Cat.   │  │Vta Bruta │Gan. Neta│ Ticket   │ Margen % │  │
│  Por Vend.  │  │  ▲ 8.3%  │  ▲ 12%   │  ▼ 2.1%  │  ▲ 1.5%  │  │
│  Facturas   │  └──────────┴──────────┴──────────┴──────────┘  │
│             │  ┌──────────┬──────────┬──────────┬──────────┐  │
│             │  │Unidades  │# Trans.  │Mejor Vend│          │  │
│             │  │  ▲ 5.2%  │  ▲ 3.1%   │Juan P.   │          │  │
│             │  └──────────┴──────────┴──────────┴──────────┘  │
│             │─────────────────────────────────────────────────│
│             │  ┌──────────────────┬──────────────────────────┐│
│             │  │ Gráfico Categorías│  Top 10 Productos       ││
│             │  │ (torta)          │  (tabla)                ││
│             │  └──────────────────┴──────────────────────────┘│
│             │  ┌──────────────────────────────────────────────┐│
│             │  │  Top 10 Clientes (tabla)                    ││
│             │  └──────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────────────┘
```

### Sidebar de Ventas

| Item | Vista | Contenido |
|------|-------|-----------|
| Dashboard | `activeView === "dashboard"` | KPIs + mejor vendedor + top 10 productos + top 10 clientes + gráfico categorías |
| Por Categoría | `activeView === "categories"` | `GroupSearch` + `SaleReportCard` + `ProductChart` |
| Por Vendedor | `activeView === "employees"` | Tabla de vendedores + modal de comisiones + tabla de ventas |
| Facturas | `activeView === "invoices"` | `InvoicesTable` + `ProductsTable` con selección múltiple |

### Páginas afectadas (merge)

| Ruta actual | Destino |
|-------------|---------|
| `/ventas` | Se reemplaza por el nuevo layout con sidebar |
| `/categorias` | Se absorbe como vista "Por Categoría" |
| `/vendedores` | Se absorbe como vista "Por Vendedor" |
| `/facturas` | Se absorbe como vista "Facturas" |

### Páginas NO afectadas

| Ruta | Motivo |
|------|--------|
| `/clientes` | Ya tiene su propio layout sidebar |
| `/proveedores` | Ya tiene su propio layout sidebar |
| `/productos` | Foco en costos/stock, no en ventas |

### Navbar resultante

4 items: Ventas, Clientes, Productos, Proveedores.

### Componentes nuevos

- `components/Dashboard/KpiCard` — Tarjeta KPI con valor, etiqueta e indicador ▲/▼  
- `components/Dashboard/SalesDashboard` — Orquestador del dashboard

### Componentes existentes reutilizados

- `components/Cards/GroupSales`
- `components/Cards/SaleReport`
- `components/GroupSearch`
- `components/Cards/ProductGraph`
- `components/InvoicesTable`
- `components/ProductsTable`
- `employees/Table/EmployeesTable`
- `employees/Table/Sales/EmployeesSalesTable`
- `employees/Modal/Commission`

### Archivos backend

- Nuevo: `controllers/dashboard.js`, `routes/dashboard.js`
- Modificado: `index.js` (registrar ruta)

## Out of Scope

- Dashboard de Clientes o Proveedores (ya existen como modales)
- Dashboard de Productos (costos/stock)
- Exportación a PDF/Excel
- Filtros adicionales en el dashboard principal
- Alertas o notificaciones
- Gráficos de tendencia/timeline (más allá del comparativo puntual)
