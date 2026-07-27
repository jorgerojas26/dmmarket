import { ShowNoeContext } from "context/show_noe";
import DateRangePicker from "components/DateRangePicker";
import SalesDashboard from "components/Dashboard/SalesDashboard";
import CategoriesView from "./CategoriesView";
import EmployeesView from "./EmployeesView";
import InvoicesView from "./InvoicesView";
import { DateTime } from "luxon";
import { useContext, useState, useCallback, useMemo } from "react";
import Container from "react-bootstrap/Container";
import Nav from "react-bootstrap/Nav";

const VentasPage = () => {
  const { showNoe } = useContext(ShowNoeContext);
  const [activeView, setActiveView] = useState("dashboard");
  const [dateRange, setDateRange] = useState({
    from: DateTime.now().startOf("year").toISODate(),
    to: DateTime.now().toISODate(),
  });

  const handleDateRangeChange = useCallback(async ({ from, to }) => {
    setDateRange({ from, to });
  }, []);

  const VIEWS = useMemo(() => ({
    dashboard: {
      heading: 'Dashboard de Ventas',
      render: () => <SalesDashboard dateRange={dateRange} showNoe={showNoe} />,
    },
    categories: {
      heading: 'Ventas por Categoría',
      render: () => <CategoriesView dateRange={dateRange} showNoe={showNoe} isActive={activeView === "categories"} />,
    },
    employees: {
      heading: 'Ventas por Vendedor',
      render: () => <EmployeesView dateRange={dateRange} showNoe={showNoe} isActive={activeView === "employees"} />,
    },
    invoices: {
      heading: 'Facturas',
      render: () => <InvoicesView dateRange={dateRange} showNoe={showNoe} isActive={activeView === "invoices"} />,
    },
  }), [dateRange, showNoe, activeView]);

  const currentView = VIEWS[activeView];

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
            <h4 className="m-0 text-light">{currentView.heading}</h4>
            <DateRangePicker
              initialFrom={DateTime.now().startOf("year").toISODate()}
              initialTo={DateTime.now().toISODate()}
              onChange={handleDateRangeChange}
            />
          </div>

          {currentView.render()}
        </div>
      </div>
    </Container>
  );
};

export default VentasPage;
