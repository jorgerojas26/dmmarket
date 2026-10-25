import { useAuth } from 'auth/context';
import ClientDashboardModal from 'components/ClientDashboardModal';
import ClientsTable from 'components/ClientsTable';
import ClientsDashboard from 'components/Dashboard/ClientsDashboard';
import DateRangePicker from 'components/DateRangePicker';
import Receivables from 'components/Receivables';
import RouteFilter from 'components/RouteFilter';
import Sidebar from 'components/Sidebar';
import { ShowNoeContext } from 'context/show_noe';
import { DateTime } from 'luxon';
import { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import Container from 'react-bootstrap/Container';
import { useHistory, useLocation } from 'react-router-dom';

const ClientesPage = () => {
    const { session, can } = useAuth();
    const analytics = can('clients.read') && session.permissions.some((grant) => grant.capability === 'sales.read');
    const availableViews = [
        ...(analytics ? ['dashboard'] : []),
        ...(can('clients.read') ? ['clients'] : []),
        ...(can('receivables.read') ? ['receivables'] : []),
    ];
    const history = useHistory();
    const location = useLocation();

    // --- Parse active view from URL query params ---
    const searchParams = new URLSearchParams(location.search);
    const urlView = searchParams.get('view');
    const initialView = availableViews.includes(urlView) ? urlView : availableViews[0];

    const [dateRange, setDateRange] = useState({
        from: searchParams.get('from') || DateTime.now().startOf('month').toISODate(),
        to: searchParams.get('to') || DateTime.now().toISODate(),
    });
    const [desgloseDateRange, setDesgloseDateRange] = useState({
        from: searchParams.get('dFrom') || DateTime.now().startOf('year').toISODate(),
        to: searchParams.get('dTo') || DateTime.now().toISODate(),
    });
    const [dashboardRefreshKey, setDashboardRefreshKey] = useState(0);
    const [selectedClient, setSelectedClient] = useState(null);
    const [showModal, setShowModal] = useState(false);
    const [modalKey, setModalKey] = useState(0);
    const [activeView, setActiveView] = useState(initialView);
    const [selectedRuta, setSelectedRuta] = useState(null);

    const { showNoe } = useContext(ShowNoeContext);

    // --- Sync active view back to URL ---
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        params.set('view', activeView);
        params.set('from', dateRange.from);
        params.set('to', dateRange.to);
        params.set('dFrom', desgloseDateRange.from);
        params.set('dTo', desgloseDateRange.to);
        history.replace({ search: params.toString() });
    }, [activeView, dateRange, desgloseDateRange, history]);

    const handleRutaChange = useCallback((option) => {
        setSelectedRuta(option);
    }, []);

    const handleDateRangeChange = useCallback(({ from, to }) => {
        setDateRange({ from, to });
        setDashboardRefreshKey((k) => k + 1);
    }, []);

    const handleDesgloseDateRangeChange = useCallback(({ from, to }) => {
        setDesgloseDateRange({ from, to });
    }, []);

    const handleRowSelect = useCallback((client) => {
        setSelectedClient(client);
        setModalKey((k) => k + 1);
        setShowModal(true);
    }, []);

    const sidebarItems = useMemo(
        () => [
            {
                eventKey: 'dashboard',
                label: 'Dashboard',
                icon: (
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
                        <title>Dashboard</title>
                        <rect x="3" y="3" width="7" height="7" />
                        <rect x="14" y="3" width="7" height="7" />
                        <rect x="14" y="14" width="7" height="7" />
                        <rect x="3" y="14" width="7" height="7" />
                    </svg>
                ),
            },
            {
                eventKey: 'clients',
                label: 'Desglose',
                icon: (
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
                        <title>Desglose</title>
                        <line x1="8" y1="6" x2="21" y2="6" />
                        <line x1="8" y1="12" x2="21" y2="12" />
                        <line x1="8" y1="18" x2="21" y2="18" />
                        <line x1="3" y1="6" x2="3.01" y2="6" />
                        <line x1="3" y1="12" x2="3.01" y2="12" />
                        <line x1="3" y1="18" x2="3.01" y2="18" />
                    </svg>
                ),
            },
            {
                eventKey: 'receivables',
                label: 'Cuentas por cobrar',
                icon: <span aria-hidden="true">$</span>,
            },
        ],
        [],
    );

    return (
        <Container as="section" aria-label="Clientes" fluid className="clientes-layout p-0">
            <div className="clientes-row">
                <Sidebar
                    activeKey={activeView}
                    onSelect={setActiveView}
                    items={sidebarItems.filter((item) => availableViews.includes(item.eventKey))}
                />
                <div className="clientes-content p-4">
                    {activeView === 'receivables' && <Receivables />}
                    {activeView === 'clients' && (
                        <div className="report-page">
                            <div className="clients-content-wrapper report-page-header mb-3">
                                <h4 className="m-0 text-light">Desglose de Clientes</h4>
                                <div className="report-page-filters">
                                    <div className="clients-page-route-filter">
                                        <RouteFilter
                                            value={selectedRuta}
                                            onChange={handleRutaChange}
                                            placeholder="Todas las rutas"
                                            showNoe={showNoe}
                                        />
                                    </div>
                                    {analytics && (
                                        <DateRangePicker
                                            initialFrom={desgloseDateRange.from}
                                            initialTo={desgloseDateRange.to}
                                            onChange={handleDesgloseDateRangeChange}
                                        />
                                    )}
                                </div>
                            </div>
                            {/* La tabla absorbe el alto restante (flex) y scrollea
                                internamente; la página nunca saca scrollbar. */}
                            <div
                                className="clients-content-wrapper"
                                style={{ flex: '1 1 auto', minHeight: 0, display: 'flex', flexDirection: 'column' }}
                            >
                                <ClientsTable
                                    onRowSelect={handleRowSelect}
                                    ruta={selectedRuta?.value}
                                    dateRange={desgloseDateRange}
                                />
                            </div>
                        </div>
                    )}
                    {activeView === 'dashboard' && (
                        <section className="d-flex flex-column gap-3">
                            <div className="clients-content-wrapper report-page-header">
                                <h4 className="m-0 text-light">Dashboard de Clientes</h4>
                                <div className="report-page-filters">
                                    <div className="clients-page-route-filter">
                                        <RouteFilter
                                            value={selectedRuta}
                                            onChange={handleRutaChange}
                                            placeholder="Todas las rutas"
                                            showNoe={showNoe}
                                        />
                                    </div>
                                    <DateRangePicker
                                        initialFrom={dateRange.from}
                                        initialTo={dateRange.to}
                                        onChange={handleDateRangeChange}
                                    />
                                </div>
                            </div>
                            <ClientsDashboard
                                key={dashboardRefreshKey}
                                dateRange={dateRange}
                                showNoe={showNoe}
                                ruta={selectedRuta?.value}
                                onClientSelect={handleRowSelect}
                            />
                        </section>
                    )}
                </div>
            </div>
            {showModal && (
                <ClientDashboardModal
                    key={modalKey}
                    show={showModal}
                    onClose={() => setShowModal(false)}
                    client={selectedClient}
                />
            )}
        </Container>
    );
};

export default ClientesPage;
