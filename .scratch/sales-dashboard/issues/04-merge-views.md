# 04 — Merge de Categorías, Vendedores y Facturas como vistas del sidebar

**Status:** ready-for-agent

**Blocked by:** 02 (sidebar layout).

## What to build

Migrar el contenido de las 3 páginas independientes — Categorías, Vendedores, Facturas — para que funcionen como vistas dentro del sidebar de Ventas. Cada vista debe ser funcionalmente idéntica a la página original. Las páginas originales NO se borran (se hace en ticket 05).

## Acceptance criteria

### Por Categoría
- [ ] `GroupSearch` con label "Categoría". Al seleccionar grupo, muestra `SaleReportCard` + `ProductChart`.
- [ ] Datos de `fetchSalesByGroup({ from, to, categoryId, showNoe })`.
- [ ] Filtro de búsqueda con debounce 500ms en SaleReportCard.
- [ ] Sin grupo seleccionado: mensaje "Seleccione una categoría...".
- [ ] Spinner mientras carga. Respeta showNoe.

### Por Vendedor
- [ ] `EmployeesTable` con `getAllEmployees()`.
- [ ] Al seleccionar vendedor, `EmployeesSalesTable` debajo con `getEmployeeSales(employeeId, dateRange, showNoe)`.
- [ ] Al hacer clic en venta, modal `CommissionModal` con `getComisionInfo` + `updateComisionInfo`.
- [ ] DateRangePicker recarga ventas del vendedor seleccionado.
- [ ] Spinner mientras carga. Respeta showNoe.

### Facturas
- [ ] `InvoicesTable` con selección múltiple (`fetchInvoiceList`).
- [ ] `ProductsTable` con resumen agregado de productos seleccionados + total general.
- [ ] DateRangePicker recarga facturas.
- [ ] Spinner mientras carga. Respeta showNoe.

### General
- [ ] Las 3 vistas comparten `dateRange` y `showNoe` del estado de VentasPage.
- [ ] Solo la vista activa dispara sus llamadas API (pasar prop `isActive` y verificar en useEffect), o alternativamente permitir que todas carguen sin importar si están activas.

## Implementation details

### 1. Crear `packages/frontend/src/pages/ventas/CategoriesView.js`

**Props:** `dateRange`, `showNoe`, `isActive`.

**Estado:** `selectedGroup` (object|null), `data` (array), `filteredData` (array), `loading` (boolean).

```jsx
import { useState, useEffect, useMemo, useCallback } from "react";
import { fetchSalesByGroup } from "api/groups";
import GroupSearch from "components/GroupSearch";
import SaleReportCard from "components/Cards/SaleReport";
import ProductChart from "components/Cards/ProductGraph";
import debounce from "lodash.debounce";

const CategoriesView = ({ dateRange, showNoe, isActive }) => {
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [data, setData] = useState([]);
  const [filteredData, setFilteredData] = useState([]);
  const [loading, setLoading] = useState(false);

  const chartData = useMemo(() => {
    const dataToUse = filteredData?.length ? filteredData : data;
    if (!Array.isArray(dataToUse)) return [];
    return dataToUse.map(item => ({
      id: item.product, label: item.product, value: item.rawProfit, netProfit: item.netProfit,
    }));
  }, [data, filteredData]);

  const onFilter = useCallback(
    debounce((searchTerm) => {
      const filtered = data.filter(f => f.product.toLowerCase().includes(searchTerm.toLowerCase()));
      setFilteredData(filtered);
    }, 500),
    [data]
  );

  useEffect(() => {
    if (!isActive || !selectedGroup) return;
    const fetchData = async () => {
      setLoading(true);
      try {
        const response = await fetchSalesByGroup({
          from: dateRange.from, to: dateRange.to, categoryId: selectedGroup.groupId, showNoe,
        });
        setData(Array.isArray(response) ? response : []);
        setFilteredData([]);
      } catch (err) { console.error(err); }
      finally { setLoading(false); }
    };
    fetchData();
  }, [dateRange.from, dateRange.to, selectedGroup, showNoe, isActive]);

  return (
    <div>
      <div className="d-flex align-items-center mb-3 gap-3">
        <span className="text-white">Categoría</span>
        <GroupSearch onSelect={setSelectedGroup} />
      </div>
      {selectedGroup ? (
        <div className="row g-3">
          <div className="col-12 col-lg-6">
            <SaleReportCard data={filteredData?.length ? filteredData : data} loading={loading} onFilter={onFilter} />
          </div>
          <div className="col-12 col-lg-6">
            <ProductChart chartData={chartData} loading={loading} />
          </div>
        </div>
      ) : (
        <div className="text-center text-muted py-5">Seleccione una categoría para ver las ventas</div>
      )}
    </div>
  );
};

export default CategoriesView;
```

### 2. Crear `packages/frontend/src/pages/ventas/EmployeesView.js`

**Props:** `dateRange`, `showNoe`, `isActive`.

```jsx
import { useState, useEffect } from "react";
import { getAllEmployees, getEmployeeSales } from "api/employees";
import EmployeesTable from "employees/Table/EmployeesTable";
import EmployeesSalesTable from "employees/Table/Sales/EmployeesSalesTable";
import CommissionModal from "employees/Modal/Commission";

const EmployeesView = ({ dateRange, showNoe, isActive }) => {
  const [employees, setEmployees] = useState([]);
  const [employeesLoading, setEmployeesLoading] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [employeeSales, setEmployeeSales] = useState([]);
  const [salesLoading, setSalesLoading] = useState(false);
  const [showCommissionModal, setShowCommissionModal] = useState(false);
  const [selectedSale, setSelectedSale] = useState(null);

  useEffect(() => {
    if (!isActive) return;
    setEmployeesLoading(true);
    getAllEmployees().then(setEmployees).catch(console.error).finally(() => setEmployeesLoading(false));
  }, [isActive]);

  useEffect(() => {
    if (!isActive || !selectedEmployee) return;
    setSalesLoading(true);
    getEmployeeSales(selectedEmployee.id, dateRange, showNoe)
      .then(setEmployeeSales).catch(console.error).finally(() => setSalesLoading(false));
  }, [dateRange.from, dateRange.to, selectedEmployee, showNoe, isActive]);

  const handleRowSelect = (employee) => setSelectedEmployee(employee);
  const handleSaleClick = (sale) => { setSelectedSale(sale); setShowCommissionModal(true); };

  return (
    <div className="row g-3">
      <div className="col-12">
        <EmployeesTable data={employees} loading={employeesLoading} selectedEmployee={selectedEmployee} onRowSelect={handleRowSelect} />
      </div>
      {selectedEmployee && (
        <div className="col-12">
          <EmployeesSalesTable data={employeeSales} loading={salesLoading} />
        </div>
      )}
      {showCommissionModal && (
        <CommissionModal show={showCommissionModal} onClose={() => setShowCommissionModal(false)} employee={selectedEmployee} sale={selectedSale} />
      )}
    </div>
  );
};

export default EmployeesView;
```

### 3. Crear `packages/frontend/src/pages/ventas/InvoicesView.js`

**Props:** `dateRange`, `showNoe`, `isActive`.

```jsx
import { useState, useEffect, useMemo } from "react";
import { fetchInvoiceList } from "api/invoice";
import InvoicesTable from "components/InvoicesTable";
import ProductsTable from "components/ProductsTable";

const InvoicesView = ({ dateRange, showNoe, isActive }) => {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedRows, setSelectedRows] = useState([]);

  useEffect(() => {
    if (!isActive) return;
    setLoading(true);
    fetchInvoiceList({ from: dateRange.from, to: dateRange.to, showNoe })
      .then(setInvoices).catch(console.error).finally(() => setLoading(false));
  }, [dateRange.from, dateRange.to, showNoe, isActive]);

  const productsSummary = useMemo(() => {
    if (!selectedRows.length) return [];
    const products = {};
    selectedRows.forEach(row => {
      row.products.forEach(product => {
        if (!products[product.productId]) products[product.productId] = { ...product, quantity: 0 };
        products[product.productId].quantity += product.quantity;
        products[product.productId].total = Number((products[product.productId].quantity * products[product.productId].price).toFixed(2));
      });
    });
    return Object.values(products);
  }, [selectedRows]);

  const invoicesTotalSummary = useMemo(() =>
    selectedRows.reduce((total, inv) => total + (inv?.total || 0), 0),
  [selectedRows]);

  return (
    <div className="row g-3">
      <div className="col-12 col-xl-6">
        <InvoicesTable data={invoices} loading={loading} onRowSelect={setSelectedRows} />
      </div>
      <div className="col-12 col-xl-6">
        <ProductsTable data={productsSummary} loading={loading} totalSummary={invoicesTotalSummary} />
      </div>
    </div>
  );
};

export default InvoicesView;
```

### 4. Integrar en VentasPage

```jsx
import CategoriesView from "./CategoriesView";
import EmployeesView from "./EmployeesView";
import InvoicesView from "./InvoicesView";

// En views:
categories: <CategoriesView dateRange={dateRange} showNoe={showNoe} isActive={activeView === "categories"} />,
employees: <EmployeesView dateRange={dateRange} showNoe={showNoe} isActive={activeView === "employees"} />,
invoices: <InvoicesView dateRange={dateRange} showNoe={showNoe} isActive={activeView === "invoices"} />,
```

### 5. Archivos a crear

- `pages/ventas/CategoriesView.js`
- `pages/ventas/EmployeesView.js`
- `pages/ventas/InvoicesView.js`

### 6. Archivos a modificar

- `pages/ventas/index.js` — reemplazar stubs

### 7. No tocar

- `pages/categories/index.js`, `pages/employees/index.js`, `pages/invoices/index.js`
- Ningún componente existente
- `App.js`
