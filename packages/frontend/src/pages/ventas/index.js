import SalesDashboard from "components/Dashboard/SalesDashboard";
import DateRangePicker from "components/DateRangePicker";
import { ShowNoeContext } from "context/show_noe";
import { DateTime } from "luxon";
import { useCallback, useContext, useMemo, useState } from "react";
import Container from "react-bootstrap/Container";
import Nav from "react-bootstrap/Nav";
import CategoriesView from "./CategoriesView";
import EmployeesView from "./EmployeesView";
import InvoicesView from "./InvoicesView";

const NavIcon = ({ children }) => <span className="nav-icon">{children}</span>;

const ICONS = {
    dashboard: (
        <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <rect x="3" y="3" width="7" height="7" />
            <rect x="14" y="3" width="7" height="7" />
            <rect x="14" y="14" width="7" height="7" />
            <rect x="3" y="14" width="7" height="7" />
        </svg>
    ),
    categories: (
        <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <path d="M21.21 15.89A10 10 0 1 1 8 2.83" />
            <path d="M22 12A10 10 0 0 0 12 2v10z" />
        </svg>
    ),
    employees: (
        <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
    ),
    invoices: (
        <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
            <polyline points="10 9 9 9 8 9" />
        </svg>
    ),
};

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

    const VIEWS = useMemo(
        () => ({
            dashboard: {
                heading: "Dashboard de Ventas",
                render: () => (
                    <SalesDashboard dateRange={dateRange} showNoe={showNoe} />
                ),
            },
            categories: {
                heading: "Ventas por Categoría",
                render: () => (
                    <CategoriesView
                        dateRange={dateRange}
                        showNoe={showNoe}
                        isActive={activeView === "categories"}
                    />
                ),
            },
            employees: {
                heading: "Ventas por Vendedor",
                render: () => (
                    <EmployeesView
                        dateRange={dateRange}
                        showNoe={showNoe}
                        isActive={activeView === "employees"}
                    />
                ),
            },
            invoices: {
                heading: "Facturas",
                render: () => (
                    <InvoicesView
                        dateRange={dateRange}
                        showNoe={showNoe}
                        isActive={activeView === "invoices"}
                    />
                ),
            },
        }),
        [dateRange, showNoe, activeView],
    );

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
                            <Nav.Link eventKey="dashboard">
                                <NavIcon>{ICONS.dashboard}</NavIcon> Dashboard
                            </Nav.Link>
                        </Nav.Item>
                        <Nav.Item>
                            <Nav.Link eventKey="categories">
                                <NavIcon>{ICONS.categories}</NavIcon> Por
                                Categoría
                            </Nav.Link>
                        </Nav.Item>
                        <Nav.Item>
                            <Nav.Link eventKey="employees">
                                <NavIcon>{ICONS.employees}</NavIcon> Por
                                Vendedor
                            </Nav.Link>
                        </Nav.Item>
                        <Nav.Item>
                            <Nav.Link eventKey="invoices">
                                <NavIcon>{ICONS.invoices}</NavIcon> Facturas
                            </Nav.Link>
                        </Nav.Item>
                    </Nav>
                </div>

                {/* Content area */}
                <div className="clientes-content p-4 w-0">
                    <div className="d-flex flex-column flex-sm-row justify-content-between align-items-start align-items-sm-center gap-3 mb-4">
                        <h4 className="m-0 p-0 bg-red text-light">
                            {currentView.heading}
                        </h4>
                        <DateRangePicker
                            initialFrom={DateTime.now()
                                .startOf("year")
                                .toISODate()}
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
