import SalesDashboard from "components/Dashboard/SalesDashboard";
import DateRangePicker from "components/DateRangePicker";
import { ShowNoeContext } from "context/show_noe";
import { DateTime } from "luxon";
import { useCallback, useContext, useMemo, useState } from "react";
import Container from "react-bootstrap/Container";
import Nav from "react-bootstrap/Nav";
import DesgloseView from "./DesgloseView";
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
    despacho: (
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
            <rect x="1" y="3" width="15" height="13" />
            <polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
            <circle cx="5.5" cy="18.5" r="2.5" />
            <circle cx="18.5" cy="18.5" r="2.5" />
        </svg>
    ),
    desglose: (
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
            <line x1="8" y1="6" x2="21" y2="6" />
            <line x1="8" y1="12" x2="21" y2="12" />
            <line x1="8" y1="18" x2="21" y2="18" />
            <line x1="3" y1="6" x2="3.01" y2="6" />
            <line x1="3" y1="12" x2="3.01" y2="12" />
            <line x1="3" y1="18" x2="3.01" y2="18" />
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
            desglose: {
                heading: "Desglose de Ventas",
                render: () => (
                    <DesgloseView isActive={activeView === "desglose"} />
                ),
            },
            despacho: {
                heading: "Despacho",
                render: () => (
                    <InvoicesView
                        dateRange={dateRange}
                        showNoe={showNoe}
                        isActive={activeView === "despacho"}
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
                            <Nav.Link eventKey="desglose">
                                <NavIcon>{ICONS.desglose}</NavIcon> Desglose
                            </Nav.Link>
                        </Nav.Item>
                        <Nav.Item>
                            <Nav.Link eventKey="despacho">
                                <NavIcon>{ICONS.despacho}</NavIcon> Despacho
                            </Nav.Link>
                        </Nav.Item>
                    </Nav>
                </div>

                {/* Content area */}
                <div className="clientes-content p-4 w-0">
                    {activeView !== "desglose" && (
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
                    )}

                    {currentView.render()}
                </div>
            </div>
        </Container>
    );
};

export default VentasPage;
