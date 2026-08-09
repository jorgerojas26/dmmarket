import DateRangePicker from 'components/DateRangePicker';
import ProviderDashboardModal from 'components/ProviderDashboardModal';
import ProviderReportCard from 'components/ProviderReportCard';
import ProvidersTable from 'components/ProvidersTable';
import Sidebar from 'components/Sidebar';
import { ShowNoeContext } from 'context/show_noe';
import { useBestProviders } from 'hooks/useProviders';
import debounce from 'lodash.debounce';
import { DateTime } from 'luxon';
import { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import Container from 'react-bootstrap/Container';

const ProveedoresPage = () => {
    const [dateRange, setDateRange] = useState({
        from: DateTime.now().startOf('month').toISODate(),
        to: DateTime.now().toISODate(),
    });
    const [desgloseDateRange, setDesgloseDateRange] = useState({
        from: DateTime.now().startOf('year').toISODate(),
        to: DateTime.now().toISODate(),
    });
    const [activeView, setActiveView] = useState('providers');
    const [mode, setMode] = useState('ventas');
    const [selectedProvider, setSelectedProvider] = useState(null);
    const [showModal, setShowModal] = useState(false);
    const [modalKey, setModalKey] = useState(0);
    const [filteredData, setFilteredData] = useState([]);

    const { showNoe } = useContext(ShowNoeContext);

    const { data: bestProviders = [], isLoading } = useBestProviders(dateRange, showNoe, mode);

    const onFilter = debounce((searchTerm) => {
        if (!searchTerm) {
            setFilteredData(bestProviders);
            return;
        }
        const filtered = bestProviders.filter((f) => f.proveedor.toLowerCase().includes(searchTerm.toLowerCase()));
        setFilteredData(filtered);
    }, 500);

    const handleDateRangeChange = useCallback(({ from, to }) => {
        setDateRange({ from, to });
    }, []);

    const handleDesgloseDateRangeChange = useCallback(({ from, to }) => {
        setDesgloseDateRange({ from, to });
    }, []);

    const handleModeChange = useCallback((newMode) => {
        setMode(newMode);
    }, []);

    const onFilterCallback = useCallback(
        (searchTerm) => {
            onFilter(searchTerm);
        },
        [onFilter],
    );

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
        <Container fluid className="clientes-layout p-0">
            <div className="clientes-row">
                <Sidebar activeKey={activeView} onSelect={setActiveView} items={sidebarItems} />
                <div className="clientes-content p-4">
                    <div className={activeView === 'providers' ? '' : 'd-none'}>
                        <div className="clients-content-wrapper d-flex flex-column flex-sm-row justify-content-between align-items-start align-items-sm-center gap-3 mb-3">
                            <h4 className="m-0 text-light">Desglose de Proveedores</h4>
                            <DateRangePicker
                                initialFrom={DateTime.now().startOf('year').toISODate()}
                                initialTo={DateTime.now().toISODate()}
                                onChange={handleDesgloseDateRangeChange}
                            />
                        </div>
                        <div className="clients-content-wrapper">
                            <ProvidersTable onRowSelect={handleProviderSelect} dateRange={desgloseDateRange} />
                        </div>
                    </div>
                    <section className={activeView === 'reports' ? 'd-flex flex-column gap-3' : 'd-none'}>
                        <div className="clients-content-wrapper d-flex flex-column flex-sm-row justify-content-between align-items-start align-items-sm-center gap-3">
                            <h4 className="m-0 text-light">Reportes de proveedores</h4>
                            <DateRangePicker
                                initialFrom={DateTime.now().startOf('month').toISODate()}
                                initialTo={DateTime.now().toISODate()}
                                onChange={handleDateRangeChange}
                            />
                        </div>
                        <div className="clients-content-wrapper">
                            <div className="row justify-content-center g-3">
                                <div className="col-12">
                                    <ProviderReportCard
                                        data={filteredData.length ? filteredData : bestProviders}
                                        onFilter={onFilterCallback}
                                        loading={isLoading}
                                        mode={mode}
                                        onModeChange={handleModeChange}
                                    />
                                </div>
                            </div>
                        </div>
                    </section>
                </div>
            </div>
            {showModal && (
                <ProviderDashboardModal
                    key={modalKey}
                    show={showModal}
                    onClose={() => setShowModal(false)}
                    provider={selectedProvider}
                />
            )}
        </Container>
    );
};

export default ProveedoresPage;
