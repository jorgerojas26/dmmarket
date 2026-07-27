# 03 — Dashboard: KPIs, gráficos y tablas

**Status:** ready-for-agent

**Blocked by:** 01 (backend endpoint), 02 (sidebar layout).

## What to build

Implementar la vista "Dashboard" del sidebar de Ventas. Reemplaza el stub de Dashboard con un panel completo que muestra: grid 4×2 con 6 KPIs (4 con indicador ▲/▼ vs período anterior) + tarjeta de Mejor Vendedor, top 10 productos (tabla), top 10 clientes (tabla), y gráfico de torta por categoría. Todo cableado al endpoint `GET /api/dashboard/sales` y al `DateRangePicker` global de la página.

## Acceptance criteria

- [ ] Al seleccionar "Dashboard" en el sidebar, se renderiza el dashboard completo con datos reales.
- [ ] El grid de KPIs es de 4 columnas × 2 filas (8 celdas totales). Se llena así:
  - Fila 1: Venta Bruta, Ganancia Neta, Ticket Promedio, Margen Promedio % (4 KPIs con comparativa)
  - Fila 2: Unidades Vendidas, # Transacciones (2 KPIs con comparativa), Mejor Vendedor (tarjeta con nombre + total ventas, sin comparativa), y la 8va celda queda vacía.

  Total: 6 KpiCards + 1 tarjeta de Mejor Vendedor + 1 celda vacía = 8 celdas en grid 4×2.
- [ ] Cada KPI con formato: `$` + separadores de miles para montos, `%` para márgenes, número entero para unidades/transacciones.
- [ ] KPIs de Venta Bruta, Ganancia Neta, Unidades y # Transacciones muestran indicador ▲ verde `+X%` o ▼ rojo `-X%` si hay datos comparativos.
- [ ] Top 10 Productos (tabla): producto, cantidad, venta bruta, ganancia neta, margen %. Ordenado por ganancia neta DESC.
- [ ] Top 10 Clientes (tabla): cliente, total USD. Ordenado DESC.
- [ ] Gráfico de torta por categoría usando `GroupSales`.
- [ ] Al cambiar DateRangePicker, todo el dashboard se recarga.
- [ ] Respeta showNoe.
- [ ] Spinner mientras carga. Mensaje de error si falla. KPIs en $0 si no hay datos.
- [ ] Responsive: KPIs 4 columnas en desktop, 2 en tablet, 1 en mobile.

## Implementation details

### 1. Crear `packages/frontend/src/api/dashboard/index.js`

```js
const BASE_URL = '/api/dashboard';

export const fetchDashboardSales = async ({ from, to, showNoe, compareFrom, compareTo }) => {
  let url = `${BASE_URL}/sales?from=${from}&to=${to}&showNoe=${showNoe}`;
  if (compareFrom && compareTo) {
    url += `&compareFrom=${compareFrom}&compareTo=${compareTo}`;
  }
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Dashboard API error: ${response.status}`);
  return response.json();
};
```

### 2. Crear `packages/frontend/src/components/Dashboard/KpiCard.js`

**Props:** `label` (string), `value` (string), `comparison` ({ current: number, previous: number } | null), `loading` (boolean).

```jsx
const KpiCard = ({ label, value, comparison, loading }) => {
  let comparisonEl = null;
  if (comparison && comparison.previous > 0) {
    const pct = ((comparison.current - comparison.previous) / comparison.previous) * 100;
    const isPositive = pct >= 0;
    comparisonEl = (
      <div className={`small ${isPositive ? 'text-success' : 'text-danger'}`}>
        {isPositive ? '▲' : '▼'} {Math.abs(pct).toFixed(1)}% vs anterior
      </div>
    );
  }

  return (
    <div className="card h-100">
      <div className="card-body text-center">
        <div className="text-muted small text-uppercase">{label}</div>
        <div className="h4 mb-1">{value}</div>
        {comparisonEl}
        {loading && <span className="spinner-border spinner-border-sm mt-1" />}
      </div>
    </div>
  );
};

export default KpiCard;
```

### 3. Crear `packages/frontend/src/components/Dashboard/SalesDashboard.js`

**Props:** `dateRange` ({ from, to }), `showNoe` (boolean).

**Estado interno:** `data`, `loading`, `error`.

**useEffect:** ejecutar `fetchDashboardSales` cuando cambien `dateRange.from`, `dateRange.to`, o `showNoe`. Calcular `compareFrom`/`compareTo` así:
```js
const fromDt = DateTime.fromISO(dateRange.from);
const toDt = DateTime.fromISO(dateRange.to);
const days = toDt.diff(fromDt, 'days').days;
const compareTo = fromDt.minus({ days: 1 }).toISODate();
const compareFrom = DateTime.fromISO(compareTo).minus({ days }).toISODate();
```

**Funciones helper:**
```js
const formatCurrency = (val) => `$${Number(val).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const formatNumber = (val) => Number(val).toLocaleString('es-VE');
const formatPercent = (val) => `${Number(val).toFixed(1)}%`;
```

**Render:**
```jsx
const kpis = data?.kpis;
const bestEmployee = data?.bestEmployee;
const chartData = (data?.groupSalesChart || []).map(item => ({
  id: item.categoria, label: item.categoria, value: item.rawProfit, netProfit: item.netProfit,
}));

const topProductsColumns = [
  { header: 'Producto', accessor: 'product' },
  { header: 'Cantidad', accessor: 'quantity', format: formatNumber },
  { header: 'Venta Bruta', accessor: 'rawProfit', format: formatCurrency },
  { header: 'Ganancia Neta', accessor: 'netProfit', format: formatCurrency },
  { header: 'Margen %', accessor: 'averageProfitPercent', format: formatPercent },
];

const topClientsColumns = [
  { header: 'Cliente', accessor: 'client' },
  { header: 'Total USD', accessor: 'total_USD', format: formatCurrency },
];

// Loading state
if (loading && !data) {
  return <div className="d-flex justify-content-center align-items-center" style={{ minHeight: 300 }}>
    <span className="spinner-border spinner-border-md" role="status" />
  </div>;
}

// Error state
if (error) {
  return <div className="alert alert-danger">Error al cargar el dashboard: {error}</div>;
}

// Dashboard render
return (
  <div>
    {/* Fila 1: 4 KPIs */}
    <div className="row g-3 mb-3">
      <div className="col-6 col-md-3">
        <KpiCard label="Venta Bruta" value={formatCurrency(kpis?.totalRawProfit)}
          comparison={kpis?.compareRawProfit != null ? { current: kpis.totalRawProfit, previous: kpis.compareRawProfit } : null} loading={loading} />
      </div>
      <div className="col-6 col-md-3">
        <KpiCard label="Ganancia Neta" value={formatCurrency(kpis?.totalNetProfit)}
          comparison={kpis?.compareNetProfit != null ? { current: kpis.totalNetProfit, previous: kpis.compareNetProfit } : null} loading={loading} />
      </div>
      <div className="col-6 col-md-3">
        <KpiCard label="Ticket Promedio" value={formatCurrency(kpis?.avgTicket)} loading={loading} />
      </div>
      <div className="col-6 col-md-3">
        <KpiCard label="Margen Promedio" value={formatPercent(kpis?.avgMarginPercent)} loading={loading} />
      </div>
    </div>

    {/* Fila 2: 3 KPIs + Mejor Vendedor */}
    <div className="row g-3 mb-4">
      <div className="col-6 col-md-3">
        <KpiCard label="Unidades Vendidas" value={formatNumber(kpis?.totalQuantity)}
          comparison={kpis?.compareQuantity != null ? { current: kpis.totalQuantity, previous: kpis.compareQuantity } : null} loading={loading} />
      </div>
      <div className="col-6 col-md-3">
        <KpiCard label="# Transacciones" value={formatNumber(kpis?.totalInvoices)}
          comparison={kpis?.compareInvoices != null ? { current: kpis.totalInvoices, previous: kpis.compareInvoices } : null} loading={loading} />
      </div>
      <div className="col-6 col-md-3">
        <div className="card h-100">
          <div className="card-body text-center">
            <div className="text-muted small text-uppercase">Mejor Vendedor</div>
            <div className="h5 mb-0">{bestEmployee?.name || '—'}</div>
            <div className="small text-muted">{bestEmployee ? formatCurrency(bestEmployee.totalSales) : ''}</div>
          </div>
        </div>
      </div>
      <div className="col-6 col-md-3" />
    </div>

    {/* Fila 3: Gráfico + Top Productos */}
    <div className="row g-3 mb-3">
      <div className="col-12 col-lg-6">
        <GroupSales chartData={chartData} loading={loading} />
      </div>
      <div className="col-12 col-lg-6">
        <div className="card">
          <div className="card-header"><h3>Top 10 Productos</h3></div>
          <div className="card-body">
            <Table data={data?.topProducts || []} columns={topProductsColumns} loading={loading} maxHeight={400} />
          </div>
        </div>
      </div>
    </div>

    {/* Fila 4: Top Clientes */}
    <div className="row g-3">
      <div className="col-12">
        <div className="card">
          <div className="card-header"><h3>Top 10 Clientes</h3></div>
          <div className="card-body">
            <Table data={data?.topClients || []} columns={topClientsColumns} loading={loading} maxHeight={400} />
          </div>
        </div>
      </div>
    </div>
  </div>
);
```

**Imports necesarios en SalesDashboard.js:**
```js
import { useState, useEffect, useContext } from "react";
import { DateTime } from "luxon";
import { fetchDashboardSales } from "api/dashboard";
import KpiCard from "./KpiCard";
import GroupSales from "components/Cards/GroupSales";
import Table from "components/Table";
```

### 4. Integrar en VentasPage

En `pages/ventas/index.js`:
```js
import SalesDashboard from "components/Dashboard/SalesDashboard";

// Reemplazar el stub:
dashboard: <SalesDashboard dateRange={dateRange} showNoe={showNoe} />,
```

### 5. Archivos a crear

- `packages/frontend/src/api/dashboard/index.js`
- `packages/frontend/src/components/Dashboard/KpiCard.js`
- `packages/frontend/src/components/Dashboard/SalesDashboard.js`

### 6. Archivos a modificar

- `packages/frontend/src/pages/ventas/index.js` — cambiar stub de dashboard

### 7. No tocar

`components/Table`, `components/Cards/GroupSales`, `components/Cards/SaleReport`. Sin nuevas dependencias npm.

## Tests

Usar Jest + React Testing Library. Los tests se crean junto a los componentes.

### Archivo: `packages/frontend/src/components/Dashboard/KpiCard.test.js`

```jsx
import { render, screen } from "@testing-library/react";
import KpiCard from "./KpiCard";

describe("KpiCard", () => {
  it("muestra el label y valor formateado", () => {
    render(<KpiCard label="Venta Bruta" value="$12,450,000" />);
    expect(screen.getByText("Venta Bruta")).toBeInTheDocument();
    expect(screen.getByText("$12,450,000")).toBeInTheDocument();
  });

  it("muestra ▲ verde cuando comparison es positivo", () => {
    render(<KpiCard label="Venta Bruta" value="$100" comparison={{ current: 100, previous: 80 }} />);
    const indicator = screen.getByText(/▲/);
    expect(indicator).toBeInTheDocument();
    expect(indicator).toHaveClass("text-success");
  });

  it("muestra ▼ rojo cuando comparison es negativo", () => {
    render(<KpiCard label="Venta Bruta" value="$80" comparison={{ current: 80, previous: 100 }} />);
    const indicator = screen.getByText(/▼/);
    expect(indicator).toBeInTheDocument();
    expect(indicator).toHaveClass("text-danger");
  });

  it("no muestra indicador si comparison es undefined", () => {
    render(<KpiCard label="Margen %" value="32.5%" />);
    expect(screen.queryByText(/▲/)).not.toBeInTheDocument();
    expect(screen.queryByText(/▼/)).not.toBeInTheDocument();
  });

  it("no muestra indicador si previous es 0", () => {
    render(<KpiCard label="Venta Bruta" value="$100" comparison={{ current: 100, previous: 0 }} />);
    expect(screen.queryByText(/▲/)).not.toBeInTheDocument();
    expect(screen.queryByText(/▼/)).not.toBeInTheDocument();
  });

  it("muestra spinner cuando loading es true", () => {
    render(<KpiCard label="Venta Bruta" value="$100" loading={true} />);
    expect(screen.getByRole("status")).toBeInTheDocument();
  });
});
```

### Archivo: `packages/frontend/src/components/Dashboard/SalesDashboard.test.js`

```jsx
import { render, screen, waitFor } from "@testing-library/react";
import SalesDashboard from "./SalesDashboard";
import * as dashboardApi from "api/dashboard";

jest.mock("api/dashboard");

const mockData = {
  kpis: {
    totalRawProfit: 50000, totalNetProfit: 15000, totalQuantity: 200, totalInvoices: 50,
    avgTicket: 1000, avgMarginPercent: 30,
    compareRawProfit: 45000, compareNetProfit: 13000, compareQuantity: 180, compareInvoices: 45,
  },
  bestEmployee: { id: 1, name: "Juan Pérez", totalSales: 25000 },
  topProducts: [
    { product: "Producto A", quantity: 100, rawProfit: 20000, netProfit: 6000, averageProfitPercent: 30 },
  ],
  topClients: [
    { client: "Empresa X", total_USD: 30000 },
  ],
  groupSalesChart: [
    { categoria: "Electrónicos", rawProfit: 30000, netProfit: 9000 },
  ],
};

describe("SalesDashboard", () => {
  beforeEach(() => {
    dashboardApi.fetchDashboardSales.mockResolvedValue(mockData);
  });

  it("muestra spinner mientras carga", () => {
    render(<SalesDashboard dateRange={{ from: "2026-07-01", to: "2026-07-27" }} showNoe={false} />);
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("renderiza KPIs, tablas y gráfico al recibir datos", async () => {
    render(<SalesDashboard dateRange={{ from: "2026-07-01", to: "2026-07-27" }} showNoe={false} />);
    await waitFor(() => expect(screen.getByText("Juan Pérez")).toBeInTheDocument());
    expect(screen.getByText("Venta Bruta")).toBeInTheDocument();
    expect(screen.getByText("Producto A")).toBeInTheDocument();
    expect(screen.getByText("Empresa X")).toBeInTheDocument();
  });

  it("muestra error si el endpoint falla", async () => {
    dashboardApi.fetchDashboardSales.mockRejectedValue(new Error("Network error"));
    render(<SalesDashboard dateRange={{ from: "2026-07-01", to: "2026-07-27" }} showNoe={false} />);
    await waitFor(() => expect(screen.getByText(/Error al cargar/)).toBeInTheDocument());
  });

  it("muestra KPIs en 0 y mensaje vacío cuando no hay datos", async () => {
    dashboardApi.fetchDashboardSales.mockResolvedValue({
      kpis: { totalRawProfit: 0, totalNetProfit: 0, totalQuantity: 0, totalInvoices: 0, avgTicket: 0, avgMarginPercent: 0, compareRawProfit: null, compareNetProfit: null, compareQuantity: null, compareInvoices: null },
      bestEmployee: null,
      topProducts: [],
      topClients: [],
      groupSalesChart: [],
    });
    render(<SalesDashboard dateRange={{ from: "2000-01-01", to: "2000-01-02" }} showNoe={false} />);
    await waitFor(() => expect(screen.getByText(/Sin datos/)).toBeInTheDocument());
  });

  it("calcula compareFrom/compareTo y los envía al endpoint", async () => {
    render(<SalesDashboard dateRange={{ from: "2026-07-01", to: "2026-07-15" }} showNoe={false} />);
    await waitFor(() => {
      expect(dashboardApi.fetchDashboardSales).toHaveBeenCalledWith(
        expect.objectContaining({
          from: "2026-07-01", to: "2026-07-15",
          compareFrom: expect.any(String),
          compareTo: expect.any(String),
        })
      );
    });
  });
});
```

### Archivo: `packages/frontend/src/api/dashboard/index.test.js`

```js
import { fetchDashboardSales } from "./index";

describe("fetchDashboardSales", () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  it("construye URL sin compareFrom/compareTo", async () => {
    global.fetch.mockResolvedValue({ ok: true, json: async () => ({}) });
    await fetchDashboardSales({ from: "2026-07-01", to: "2026-07-27", showNoe: false });
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/dashboard/sales?from=2026-07-01&to=2026-07-27&showNoe=false"
    );
  });

  it("incluye compareFrom y compareTo en la URL", async () => {
    global.fetch.mockResolvedValue({ ok: true, json: async () => ({}) });
    await fetchDashboardSales({ from: "2026-07-01", to: "2026-07-27", showNoe: false, compareFrom: "2026-06-04", compareTo: "2026-06-30" });
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/dashboard/sales?from=2026-07-01&to=2026-07-27&showNoe=false&compareFrom=2026-06-04&compareTo=2026-06-30"
    );
  });

  it("lanza error si la respuesta no es ok", async () => {
    global.fetch.mockResolvedValue({ ok: false, status: 500 });
    await expect(
      fetchDashboardSales({ from: "2026-07-01", to: "2026-07-27", showNoe: false })
    ).rejects.toThrow("Dashboard API error: 500");
  });
});
```

**Setup:** Si `packages/frontend/src/setupTests.js` no existe, crearlo con:
```js
import "@testing-library/jest-dom";
```

**Para correr:** `npx jest --testPathPattern="Dashboard|dashboard"`
