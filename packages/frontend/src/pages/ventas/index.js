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
