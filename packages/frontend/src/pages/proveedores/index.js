import { useAuth } from 'auth/context';
import DateRangePicker from 'components/DateRangePicker';
import ProviderDashboardModal from 'components/ProviderDashboardModal';
import ProvidersTable from 'components/ProvidersTable';
import Sidebar from 'components/Sidebar';
import usePrivateState from 'hooks/usePrivateState';
import { DateTime } from 'luxon';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Container from 'react-bootstrap/Container';
import { useHistory, useLocation } from 'react-router-dom';

const ProveedoresPage = () => {
    const { session, can } = useAuth();
    const analytics = can('purchases.read') || session.permissions.some((grant) => grant.capability === 'sales.read');
    const history = useHistory(),
        location = useLocation();
    const params = new URLSearchParams(location.search);
    const [desgloseDateRange, setDesgloseDateRange] = useState({
        from: params.get('from') || DateTime.now().startOf('year').toISODate(),
        to: params.get('to') || DateTime.now().toISODate(),
    });
    const [selectedProvider, setSelectedProvider] = usePrivateState('provider-profile', null);
    const [modalKey, setModalKey] = useState(0);
    const activeView = 'providers';
    useEffect(() => {
        const parameters = new URLSearchParams(window.location.search);
        parameters.set('from', desgloseDateRange.from);
        parameters.set('to', desgloseDateRange.to);
        history.replace({ search: parameters.toString() });
    }, [desgloseDateRange, history]);
    const handleDesgloseDateRangeChange = useCallback(({ from, to }) => {
        setDesgloseDateRange({ from, to });
    }, []);

    const handleProviderSelect = useCallback((provider) => {
        setSelectedProvider(provider);
        setModalKey((k) => k + 1);
        setShowModal(true);
    }, []);

    const sidebarItems = useMemo(
        () => [
            {
                eventKey: 'providers',
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
        <Container as="section" aria-label="Proveedores" fluid className="clientes-layout p-0">
            <div className="clientes-row">
                <Sidebar activeKey={activeView} onSelect={() => {}} items={sidebarItems} />
                <div className="clientes-content p-4">
                    {activeView === 'providers' && (
                        <div>
                            <div className="clients-content-wrapper d-flex flex-column flex-sm-row justify-content-between align-items-start align-items-sm-center gap-3 mb-3">
                                <h4 className="m-0 text-light">Desglose de Proveedores</h4>
                                {analytics && (
                                    <DateRangePicker
                                        initialFrom={desgloseDateRange.from}
                                        initialTo={desgloseDateRange.to}
                                        onChange={handleDesgloseDateRangeChange}
                                    />
                                )}
                            </div>
                            <div className="clients-content-wrapper">
                                <ProvidersTable onRowSelect={handleProviderSelect} dateRange={desgloseDateRange} />
                            </div>
                        </div>
                    )}
                </div>
            </div>
            {selectedProvider && (
                <ProviderDashboardModal
                    key={modalKey}
                    show
                    onClose={() => setSelectedProvider(null)}
                    provider={selectedProvider}
                />
            )}
        </Container>
    );
};

export default ProveedoresPage;
