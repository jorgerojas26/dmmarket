import ClientDashboardModal from 'components/ClientDashboardModal';
import ClientsTable from 'components/ClientsTable';
import ClientsDashboard from 'components/Dashboard/ClientsDashboard';
import DateRangePicker from 'components/DateRangePicker';
import { ShowNoeContext } from 'context/show_noe';
import { DateTime } from 'luxon';
import { useCallback, useContext, useState } from 'react';
import Container from 'react-bootstrap/Container';
import Nav from 'react-bootstrap/Nav';

const ClientesPage = () => {
    const [dateRange, setDateRange] = useState({
        from: DateTime.now().startOf('month').toISODate(),
        to: DateTime.now().toISODate(),
    });
    const [dashboardRefreshKey, setDashboardRefreshKey] = useState(0);
    const [selectedClient, setSelectedClient] = useState(null);
    const [showModal, setShowModal] = useState(false);
    const [modalKey, setModalKey] = useState(0);
    const [activeView, setActiveView] = useState('dashboard');

    const { showNoe } = useContext(ShowNoeContext);

    const handleDateRangeChange = useCallback(({ from, to }) => {
        setDateRange({ from, to });
        setDashboardRefreshKey((k) => k + 1);
    }, []);

    const handleRowSelect = useCallback((client) => {
        setSelectedClient(client);
        setModalKey((k) => k + 1);
        setShowModal(true);
    }, []);

    return (
        <Container fluid className="clientes-layout p-0">
            <div className="clientes-row">
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
                            <Nav.Link eventKey="clients">Desglose</Nav.Link>
                        </Nav.Item>
                    </Nav>
                </div>
                <div className="clientes-content p-4">
                    <div className={activeView === 'clients' ? '' : 'd-none'}>
                        <div className="clients-content-wrapper">
                            <ClientsTable onRowSelect={handleRowSelect} />
                        </div>
                    </div>
                    <section className={activeView === 'dashboard' ? 'd-flex flex-column gap-3' : 'd-none'}>
                        <div className="clients-content-wrapper d-flex flex-column flex-sm-row justify-content-between align-items-start align-items-sm-center gap-3">
                            <h4 className="m-0 text-light">Dashboard de Clientes</h4>
                            <DateRangePicker
                                initialFrom={DateTime.now().startOf('month').toISODate()}
                                initialTo={DateTime.now().toISODate()}
                                onChange={handleDateRangeChange}
                            />
                        </div>
                        <ClientsDashboard key={dashboardRefreshKey} dateRange={dateRange} showNoe={showNoe} />
                    </section>
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
