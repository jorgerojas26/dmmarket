import { useAuth } from 'auth/context';
import SellersDashboard from 'components/Dashboard/SellersDashboard';
import DateRangePicker from 'components/DateRangePicker';
import SellerDashboardModal from 'components/SellerDashboardModal';
import SellersTable from 'components/SellersTable';
import Sidebar from 'components/Sidebar';
import { ShowNoeContext } from 'context/show_noe';
import usePrivateState from 'hooks/usePrivateState';
import { DateTime } from 'luxon';
import { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import Container from 'react-bootstrap/Container';
import { useHistory, useLocation } from 'react-router-dom';

const VALID_VIEWS = ['dashboard', 'sellers'];
const initialDateRange = () => ({
    from: DateTime.now().startOf('year').toISODate(),
    to: DateTime.now().toISODate(),
});

const VendedoresPage = () => {
    const { session } = useAuth();
    const analytics = session.permissions.some((grant) => grant.capability === 'sales.read');
    const availableViews = analytics ? VALID_VIEWS : ['sellers'];
    const history = useHistory();
    const location = useLocation();
    const { showNoe } = useContext(ShowNoeContext);

    const searchParams = new URLSearchParams(location.search);
    const urlView = searchParams.get('view');
    const initialView = availableViews.includes(urlView) ? urlView : availableViews[0];

    const [activeView, setActiveView] = useState(initialView);
    const [dateRange, setDateRange] = useState(() => ({
        from: searchParams.get('from') || initialDateRange().from,
        to: searchParams.get('to') || initialDateRange().to,
    }));
    const [desgloseDateRange, setDesgloseDateRange] = useState(() => ({
        from: searchParams.get('dFrom') || initialDateRange().from,
        to: searchParams.get('dTo') || initialDateRange().to,
    }));
    const [selectedSeller, setSelectedSeller] = usePrivateState('sellers-profile', null);
    const [modalKey, setModalKey] = useState(0);

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        params.set('view', activeView);
        params.set('from', dateRange.from);
        params.set('to', dateRange.to);
        params.set('dFrom', desgloseDateRange.from);
        params.set('dTo', desgloseDateRange.to);
        history.replace({ search: params.toString() });
    }, [activeView, dateRange, desgloseDateRange, history]);

    const handleDateRangeChange = useCallback(({ from, to }) => {
        setDateRange({ from, to });
    }, []);

    const handleDesgloseDateRangeChange = useCallback(({ from, to }) => {
        setDesgloseDateRange({ from, to });
    }, []);

    const handleRowSelect = useCallback(
        (seller) => {
            setSelectedSeller(seller);
            setModalKey((key) => key + 1);
        },
        [setSelectedSeller],
    );

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
                eventKey: 'sellers',
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
        <Container as="section" aria-label="Vendedores" fluid className="clientes-layout p-0">
            <div className="clientes-row">
                <Sidebar
                    activeKey={activeView}
                    onSelect={setActiveView}
                    items={sidebarItems.filter((item) => availableViews.includes(item.eventKey))}
                />
                <div className="clientes-content p-4">
                    {activeView === 'sellers' && (
                        <div className="report-page">
                            <div className="clients-content-wrapper report-page-header mb-3">
                                <h4 className="m-0 text-light">Desglose de Vendedores</h4>
                                <div className="report-page-filters">
                                    {analytics && (
                                        <DateRangePicker
                                            initialFrom={desgloseDateRange.from}
                                            initialTo={desgloseDateRange.to}
                                            onChange={handleDesgloseDateRangeChange}
                                        />
                                    )}
                                </div>
                            </div>
                            <div
                                className="clients-content-wrapper"
                                style={{ flex: '1 1 auto', minHeight: 0, display: 'flex', flexDirection: 'column' }}
                            >
                                <SellersTable onRowSelect={handleRowSelect} dateRange={desgloseDateRange} />
                            </div>
                        </div>
                    )}
                    {activeView === 'dashboard' && (
                        <section className="d-flex flex-column gap-3">
                            <div className="clients-content-wrapper report-page-header">
                                <h4 className="m-0 text-light">Dashboard de Vendedores</h4>
                                <div className="report-page-filters">
                                    <DateRangePicker
                                        initialFrom={dateRange.from}
                                        initialTo={dateRange.to}
                                        onChange={handleDateRangeChange}
                                    />
                                </div>
                            </div>
                            <SellersDashboard
                                dateRange={dateRange}
                                showNoe={showNoe}
                                onSellerSelect={handleRowSelect}
                            />
                        </section>
                    )}
                </div>
            </div>
            {selectedSeller && (
                <SellerDashboardModal
                    key={modalKey}
                    show
                    onClose={() => setSelectedSeller(null)}
                    seller={selectedSeller}
                    initialDateRange={activeView === 'sellers' ? desgloseDateRange : dateRange}
                />
            )}
        </Container>
    );
};

export default VendedoresPage;
