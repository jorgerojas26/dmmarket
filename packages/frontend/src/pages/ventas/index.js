import SalesDashboard from 'components/Dashboard/SalesDashboard';
import DateRangePicker from 'components/DateRangePicker';
import Sidebar from 'components/Sidebar';
import { ShowNoeContext } from 'context/show_noe';
import { DateTime } from 'luxon';
import { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import Container from 'react-bootstrap/Container';
import { useHistory, useLocation } from 'react-router-dom';
import DesgloseView from './DesgloseView';
import InvoicesView from './InvoicesView';

const VALID_VIEWS = ['dashboard', 'desglose', 'despacho'];
const DEFAULT_FROM_BY_VIEW = {
    dashboard: DateTime.now().startOf('year').toISODate(),
    desglose: DateTime.now().startOf('day').toISODate(),
    despacho: DateTime.now().startOf('day').toISODate(),
};
const DEFAULT_TO = DateTime.now().toISODate();

const VentasPage = () => {
    const { showNoe } = useContext(ShowNoeContext);
    const history = useHistory();
    const location = useLocation();

    // --- Parse state from URL query params ---
    const searchParams = new URLSearchParams(location.search);
    const urlView = searchParams.get('view');
    const urlFrom = searchParams.get('from');
    const urlTo = searchParams.get('to');

    const initialView = VALID_VIEWS.includes(urlView) ? urlView : 'dashboard';
    const initialDateRange = {
        from: urlFrom || DEFAULT_FROM_BY_VIEW[initialView] || DEFAULT_TO,
        to: urlTo || DEFAULT_TO,
    };

    const [activeView, setActiveView] = useState(initialView);
    const [dateRange, setDateRange] = useState(initialDateRange);

    // --- Sync state back to URL ---
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        params.set('view', activeView);
        params.set('from', dateRange.from);
        params.set('to', dateRange.to);
        history.replace({ search: params.toString() });
    }, [activeView, dateRange, history]);

    const handleViewChange = useCallback((view) => {
        setActiveView(view);
    }, []);

    const handleDateRangeChange = useCallback(({ from, to }) => {
        setDateRange({ from, to });
    }, []);

    const ICONS = useMemo(
        () => ({
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
        }),
        [],
    );

    const sidebarItems = useMemo(
        () => [
            { eventKey: 'dashboard', label: 'Dashboard', icon: ICONS.dashboard },
            { eventKey: 'desglose', label: 'Desglose', icon: ICONS.desglose },
            { eventKey: 'despacho', label: 'Despacho', icon: ICONS.despacho },
        ],
        [ICONS],
    );

    const VIEWS = useMemo(
        () => ({
            dashboard: {
                heading: 'Dashboard de Ventas',
                render: () => <SalesDashboard dateRange={dateRange} showNoe={showNoe} />,
            },
            desglose: {
                heading: 'Desglose de Ventas',
                render: () => <DesgloseView isActive={activeView === 'desglose'} />,
            },
            despacho: {
                heading: 'Despacho',
                render: () => (
                    <InvoicesView dateRange={dateRange} showNoe={showNoe} isActive={activeView === 'despacho'} />
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
                <Sidebar activeKey={activeView} onSelect={handleViewChange} items={sidebarItems} />

                {/* Content area */}
                <div className="clientes-content p-4 w-0">
                    {activeView !== 'desglose' && (
                        <div className="d-flex flex-column flex-sm-row justify-content-between align-items-start align-items-sm-center gap-3 mb-4">
                            <h4 className="m-0 p-0 bg-red text-light">{currentView.heading}</h4>
                            <DateRangePicker
                                initialFrom={dateRange.from}
                                initialTo={dateRange.to}
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
