import PurchasesDashboard from 'components/Dashboard/PurchasesDashboard';
import DateRangePicker from 'components/DateRangePicker';
import Sidebar from 'components/Sidebar';
import { DateTime } from 'luxon';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Container from 'react-bootstrap/Container';
import { useHistory, useLocation } from 'react-router-dom';
import DesgloseView from './DesgloseView';

const VALID_VIEWS = ['dashboard', 'desglose'];
const DEFAULT_FROM_BY_VIEW = {
    dashboard: DateTime.now().startOf('year').toISODate(),
    desglose: DateTime.now().startOf('day').toISODate(),
};
const DEFAULT_TO = DateTime.now().toISODate();

const ComprasPage = () => {
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
        if (VALID_VIEWS.includes(view)) {
            setDateRange({
                from: DEFAULT_FROM_BY_VIEW[view] || DEFAULT_TO,
                to: DEFAULT_TO,
            });
        }
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
        ],
        [ICONS],
    );

    const VIEWS = useMemo(
        () => ({
            dashboard: {
                heading: 'Dashboard de Compras',
                render: () => <PurchasesDashboard dateRange={dateRange} />,
            },
            desglose: {
                heading: 'Desglose de Compras',
                render: () => <DesgloseView isActive={activeView === 'desglose'} />,
            },
        }),
        [dateRange, activeView],
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

export default ComprasPage;
