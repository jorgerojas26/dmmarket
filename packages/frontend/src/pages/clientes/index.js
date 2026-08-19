import ClientDashboardModal from 'components/ClientDashboardModal';
import ClientsTable from 'components/ClientsTable';
import ClientsDashboard from 'components/Dashboard/ClientsDashboard';
import DateRangePicker from 'components/DateRangePicker';
import Sidebar from 'components/Sidebar';
import { darkSelectStyles } from 'components/selectStyles';
import { ShowNoeContext } from 'context/show_noe';
import { useClientRoutes } from 'hooks/useClients';
import { DateTime } from 'luxon';
import { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import Container from 'react-bootstrap/Container';
import { useHistory, useLocation } from 'react-router-dom';
import Select from 'react-select';

const VALID_VIEWS = ['dashboard', 'clients'];

const ClientesPage = () => {
    const history = useHistory();
    const location = useLocation();

    // --- Parse active view from URL query params ---
    const searchParams = new URLSearchParams(location.search);
    const urlView = searchParams.get('view');
    const initialView = VALID_VIEWS.includes(urlView) ? urlView : 'dashboard';

    const [dateRange, setDateRange] = useState({
        from: DateTime.now().startOf('month').toISODate(),
        to: DateTime.now().toISODate(),
    });
    const [desgloseDateRange, setDesgloseDateRange] = useState({
        from: DateTime.now().startOf('year').toISODate(),
        to: DateTime.now().toISODate(),
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
        history.replace({ search: params.toString() });
    }, [activeView, history]);

    const { data: routes = [], isLoading: routesLoading } = useClientRoutes(showNoe);

    const routeOptions = useMemo(
        () =>
            routes.map((route) => ({
                value: route.Id_Ruta,
                label:
                    route.Nombre && route.Nombre !== route.Id_Ruta
                        ? `${route.Nombre} (${route.Id_Ruta})`
                        : route.Id_Ruta,
            })),
        [routes],
    );

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
        ],
        [],
    );

    return (
        <Container fluid className="clientes-layout p-0">
            <div className="clientes-row">
                <Sidebar activeKey={activeView} onSelect={setActiveView} items={sidebarItems} />
                <div className="clientes-content p-4">
                    {activeView === 'clients' && (
                        <div className="report-page">
                            <div className="clients-content-wrapper d-flex flex-column flex-sm-row justify-content-between align-items-start align-items-sm-center gap-3 mb-3">
                                <h4 className="m-0 text-light">Desglose de Clientes</h4>
                            </div>
                            <div className="clients-content-wrapper">
                                <div className="d-flex flex-wrap justify-content-between align-items-center gap-3 mb-3">
                                    <div style={{ minWidth: '220px' }}>
                                        <Select
                                            options={routeOptions}
                                            value={selectedRuta}
                                            onChange={handleRutaChange}
                                            placeholder="Todas las rutas"
                                            isClearable
                                            isLoading={routesLoading}
                                            styles={darkSelectStyles}
                                            classNamePrefix="search-select"
                                            menuPortalTarget={document.body}
                                            menuPlacement="auto"
                                            loadingMessage={() => 'Cargando...'}
                                            noOptionsMessage={() => 'Sin resultados'}
                                        />
                                    </div>
                                    <DateRangePicker
                                        initialFrom={desgloseDateRange.from}
                                        initialTo={desgloseDateRange.to}
                                        onChange={handleDesgloseDateRangeChange}
                                    />
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
                            <div className="clients-content-wrapper d-flex flex-column flex-sm-row justify-content-between align-items-start align-items-sm-center gap-3">
                                <h4 className="m-0 text-light">Dashboard de Clientes</h4>
                                <div className="d-flex flex-wrap gap-3">
                                    <div style={{ minWidth: '220px' }}>
                                        <Select
                                            options={routeOptions}
                                            value={selectedRuta}
                                            onChange={handleRutaChange}
                                            placeholder="Todas las rutas"
                                            isClearable
                                            isLoading={routesLoading}
                                            styles={darkSelectStyles}
                                            classNamePrefix="search-select"
                                            menuPortalTarget={document.body}
                                            menuPlacement="auto"
                                            loadingMessage={() => 'Cargando...'}
                                            noOptionsMessage={() => 'Sin resultados'}
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
