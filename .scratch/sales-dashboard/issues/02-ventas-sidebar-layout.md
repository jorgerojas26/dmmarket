# 02 — Ventas: migración a layout sidebar

**Status:** ready-for-agent

**Blocked by:** None — can start immediately.

## What to build

Migrar la página `/ventas` del layout actual de 2 columnas planas a un layout con sidebar lateral como el de Clientes. El sidebar tendrá 4 items de navegación con `Nav` pills de react-bootstrap: Dashboard, Por Categoría, Por Vendedor, Facturas. El DateRangePicker es único y compartido en la parte superior del área de contenido. Las vistas de Categoría, Vendedor y Facturas muestran stubs (placeholders) — se implementan en tickets 03 y 04.

## Acceptance criteria

- [ ] Al visitar `/ventas`, se ve un sidebar vertical a la izquierda con 4 items: "Dashboard", "Por Categoría", "Por Vendedor", "Facturas".
- [ ] El sidebar usa `Nav` de react-bootstrap con `variant="pills"` y `activeKey={activeView}`, con `onSelect={setActiveView}`.
- [ ] Al hacer clic en un item del sidebar, cambia el contenido del área principal.
- [ ] La vista "Dashboard" muestra un placeholder (luego reemplazado en ticket 03).
- [ ] Las vistas "Por Categoría", "Por Vendedor", "Facturas" muestran placeholders con el nombre de la vista.
- [ ] El DateRangePicker aparece en la parte superior del área de contenido (encima de las vistas) y aplica a todas las vistas.
- [ ] El DateRangePicker tiene valores iniciales: desde inicio del mes actual hasta hoy.
- [ ] El layout es responsive: en móvil (<768px) el sidebar se vuelve horizontal (`flex-row`), en desktop es vertical (`flex-column`) con ancho fijo de ~260px.
- [ ] El layout usa las mismas clases CSS que Clientes y Proveedores: `clientes-layout`, `clientes-row`, `clients-sidebar`, `clientes-content`, `clients-content-wrapper`.
- [ ] Al cambiar el DateRangePicker, se actualiza el estado `dateRange`.
- [ ] El contexto `ShowNoeContext` se consume en la página.

## Implementation details

### 1. Reescribir `packages/frontend/src/pages/ventas/index.js`

```jsx
import { ShowNoeContext } from "context/show_noe";
import DateRangePicker from "components/DateRangePicker";
import { DateTime } from "luxon";
import { useContext, useState, useCallback } from "react";
import Container from "react-bootstrap/Container";
import Nav from "react-bootstrap/Nav";

const VentasPage = () => {
  const { showNoe } = useContext(ShowNoeContext);
  const [activeView, setActiveView] = useState("dashboard");
  const [dateRange, setDateRange] = useState({
    from: DateTime.now().startOf("month").toISODate(),
    to: DateTime.now().toISODate(),
  });

  const handleDateRangeChange = useCallback(async ({ from, to }) => {
    setDateRange({ from, to });
  }, []);

  const views = {
    dashboard: <div className="p-4 text-center text-white">Dashboard — próximamente (ticket 03)</div>,
    categories: <div className="p-4 text-center text-white">Vista: Por Categoría — próximamente (ticket 04)</div>,
    employees: <div className="p-4 text-center text-white">Vista: Por Vendedor — próximamente (ticket 04)</div>,
    invoices: <div className="p-4 text-center text-white">Vista: Facturas — próximamente (ticket 04)</div>,
  };

  return (
    <Container fluid className="clientes-layout p-0">
      <div className="clientes-row">
        {/* Sidebar */}
        <div className="clients-sidebar mb-3 mb-md-0">
          <Nav
            variant="pills"
            className="flex-row flex-md-column"
            activeKey={activeView}
            onSelect={setActiveView}
          >
            <Nav.Item>
              <Nav.Link eventKey="dashboard">Dashboard</Nav.Link>
            </Nav.Item>
            <Nav.Item>
              <Nav.Link eventKey="categories">Por Categoría</Nav.Link>
            </Nav.Item>
            <Nav.Item>
              <Nav.Link eventKey="employees">Por Vendedor</Nav.Link>
            </Nav.Item>
            <Nav.Item>
              <Nav.Link eventKey="invoices">Facturas</Nav.Link>
            </Nav.Item>
          </Nav>
        </div>

        {/* Content area */}
        <div className="clientes-content p-4">
          <div className="clients-content-wrapper d-flex flex-column flex-sm-row justify-content-between align-items-start align-items-sm-center gap-3 mb-4">
            <h4 className="m-0 text-light">
              {activeView === "dashboard" && "Dashboard de Ventas"}
              {activeView === "categories" && "Ventas por Categoría"}
              {activeView === "employees" && "Ventas por Vendedor"}
              {activeView === "invoices" && "Facturas"}
            </h4>
            <DateRangePicker
              initialFrom={DateTime.now().startOf("month").toISODate()}
              initialTo={DateTime.now().toISODate()}
              onChange={handleDateRangeChange}
            />
          </div>

          {views[activeView]}
        </div>
      </div>
    </Container>
  );
};

export default VentasPage;
```

### 2. CSS

No se crea nuevo CSS. Las clases `clientes-layout`, `clientes-row`, `clients-sidebar`, `clientes-content`, `clients-content-wrapper` ya existen en `packages/frontend/src/index.css` (líneas 156-211). Se reutilizan tal cual.

### 3. Limpiar código viejo

Eliminar del archivo original:
- `import { fetchInvoiceReport } from "api/invoice"` y todos los imports que ya no se usan
- `import GroupSales from "components/Cards/GroupSales"`
- `import SaleReportCard from "components/Cards/SaleReport"`
- `import debounce from "lodash.debounce"`
- Estado `data` con `filtered_invoices_report`, `invoices_report`, `group_sales_chart`
- Función `onFilter`
- `useEffect` viejo
  
### 4. Archivos NO tocados

- `pages/categories/index.js` — intacto
- `pages/employees/index.js` — intacto
- `pages/invoices/index.js` — intacto
- `App.js` — intacto
- `index.css` — intacto
