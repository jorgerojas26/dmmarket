import { fetchInvoiceDetail } from 'api/invoice';
import ClientSearch from 'components/ClientSearch';
import DateRangePicker from 'components/DateRangePicker';
import FacturaDetailModal from 'components/FacturaDetailModal';
import facturasColumns from 'components/FacturasTable/columns';
import GroupSearch from 'components/GroupSearch';
import SaleReportTable from 'components/SaleReportTable';
import { ShowNoeContext } from 'context/show_noe';
import EmployeeSearch from 'employees/Search/EmployeeSearch';
import { useFacturas, useProductos } from 'hooks/useSales';
import { DateTime } from 'luxon';
import { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useHistory, useLocation } from 'react-router-dom';

const DesgloseView = ({ isActive }) => {
    const { showNoe } = useContext(ShowNoeContext);
    const history = useHistory();
    const location = useLocation();

    // --- Parse filters from URL query params ---
    const searchParams = new URLSearchParams(location.search);
    const urlDFrom = searchParams.get('dFrom');
    const urlDTo = searchParams.get('dTo');
    const urlClientId = searchParams.get('clientId');
    const urlClientName = searchParams.get('clientName');
    const urlGroupId = searchParams.get('groupId');
    const urlGroupName = searchParams.get('groupName');
    const urlEmployeeId = searchParams.get('employeeId');
    const urlEmployeeName = searchParams.get('employeeName');

    const today = DateTime.now().toISODate();

    const initialDateRange = {
        from: urlDFrom || today,
        to: urlDTo || today,
    };

    const initialClient = urlClientId ? { IdCliente: urlClientId, name: urlClientName || '' } : null;
    const initialGroup = urlGroupId ? { groupId: urlGroupId, name: urlGroupName || '' } : null;
    const initialEmployee = urlEmployeeId ? { id: urlEmployeeId, name: urlEmployeeName || '' } : null;

    // Date range — defaults to today
    const [dateRange, setDateRange] = useState(initialDateRange);

    // Filters (shared)
    const [selectedClient, setSelectedClient] = useState(initialClient);
    const [selectedGroup, setSelectedGroup] = useState(initialGroup);
    const [selectedEmployee, setSelectedEmployee] = useState(initialEmployee);

    // ---- Facturas table state ----
    const [facturasPage, setFacturasPage] = useState(1);
    const [facturasSort, setFacturasSort] = useState({ sortBy: 'fecha', sortDir: 'desc' });
    const [facturasSearch, setFacturasSearch] = useState('');

    // ---- Productos table state ----
    const [productosPage, setProductosPage] = useState(1);
    const [productosSort, setProductosSort] = useState({ sortBy: 'rawProfit', sortDir: 'desc' });
    const [productosSearch, setProductosSearch] = useState('');

    // ---- Factura detail modal ----
    const [detailModalShow, setDetailModalShow] = useState(false);
    const [selectedInvoice, setSelectedInvoice] = useState(null);

    // --- Sync filters back to URL ---
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        params.set('dFrom', dateRange.from);
        params.set('dTo', dateRange.to);

        if (selectedClient?.IdCliente) {
            params.set('clientId', selectedClient.IdCliente);
            params.set('clientName', selectedClient.name || '');
        } else {
            params.delete('clientId');
            params.delete('clientName');
        }

        if (selectedGroup?.groupId) {
            params.set('groupId', selectedGroup.groupId);
            params.set('groupName', selectedGroup.name || '');
        } else {
            params.delete('groupId');
            params.delete('groupName');
        }

        if (selectedEmployee?.id) {
            params.set('employeeId', String(selectedEmployee.id));
            params.set('employeeName', selectedEmployee.name || '');
        } else {
            params.delete('employeeId');
            params.delete('employeeName');
        }

        history.replace({ search: params.toString() });
    }, [dateRange, selectedClient, selectedGroup, selectedEmployee, history]);

    // --- SWR hooks ---
    const { data: facturasRes, isLoading: facturasLoading } = useFacturas(
        {
            from: dateRange.from,
            to: dateRange.to,
            clientId: selectedClient?.IdCliente,
            categoryId: selectedGroup?.groupId,
            employeeId: selectedEmployee?.id,
            page: facturasPage,
            limit: 20,
            sortBy: facturasSort.sortBy,
            sortDir: facturasSort.sortDir,
            search: facturasSearch || undefined,
            showNoe,
        },
        isActive,
    );

    const { data: productosRes, isLoading: productosLoading } = useProductos(
        {
            from: dateRange.from,
            to: dateRange.to,
            clientId: selectedClient?.IdCliente,
            categoryId: selectedGroup?.groupId,
            employeeId: selectedEmployee?.id,
            page: productosPage,
            limit: 20,
            sortBy: productosSort.sortBy,
            sortDir: productosSort.sortDir,
            search: productosSearch || undefined,
            showNoe,
        },
        isActive,
    );

    // --- Default values for search components (reconstructed from URL) ---
    const clientDefaultValue = useMemo(
        () =>
            selectedClient
                ? { key: selectedClient.IdCliente, label: selectedClient.name || '', value: selectedClient }
                : null,
        [selectedClient],
    );

    const groupDefaultValue = useMemo(
        () =>
            selectedGroup
                ? { key: selectedGroup.groupId, label: selectedGroup.name || '', value: selectedGroup }
                : null,
        [selectedGroup],
    );

    const employeeDefaultValue = useMemo(
        () =>
            selectedEmployee
                ? { key: selectedEmployee.id, label: selectedEmployee.name || '', value: selectedEmployee }
                : null,
        [selectedEmployee],
    );

    // ---- Handlers ----

    const handleDateRangeChange = useCallback(({ from, to }) => {
        setDateRange({ from, to });
        setFacturasPage(1);
        setProductosPage(1);
    }, []);

    const handleClientSelect = useCallback((client) => {
        setSelectedClient(client);
        setFacturasPage(1);
        setProductosPage(1);
    }, []);

    const handleGroupSelect = useCallback((group) => {
        setSelectedGroup(group);
        setFacturasPage(1);
        setProductosPage(1);
    }, []);

    const handleEmployeeSelect = useCallback((employee) => {
        setSelectedEmployee(employee);
        setFacturasPage(1);
        setProductosPage(1);
    }, []);

    // Facturas handlers
    const handleFacturasPageChange = useCallback((page) => {
        setFacturasPage(page);
    }, []);

    const handleFacturasSort = useCallback((sortBy) => {
        if (sortBy && sortBy.length > 0) {
            setFacturasSort({ sortBy: sortBy[0].id, sortDir: sortBy[0].desc ? 'desc' : 'asc' });
            setFacturasPage(1);
        }
    }, []);

    const handleFacturasSearch = useCallback((value) => {
        setFacturasSearch(value || '');
        setFacturasPage(1);
    }, []);

    // Productos handlers
    const handleProductosPageChange = useCallback((page) => {
        setProductosPage(page);
    }, []);

    const handleProductosSort = useCallback((sortBy) => {
        if (sortBy && sortBy.length > 0) {
            setProductosSort({ sortBy: sortBy[0].id, sortDir: sortBy[0].desc ? 'desc' : 'asc' });
            setProductosPage(1);
        }
    }, []);

    const handleProductosSearch = useCallback((value) => {
        setProductosSearch(value || '');
        setProductosPage(1);
    }, []);

    // Factura row click → open detail modal
    const handleFacturaRowClick = useCallback(
        async (factura) => {
            try {
                const detail = await fetchInvoiceDetail(factura.invoiceId, showNoe);
                setSelectedInvoice(detail);
                setDetailModalShow(true);
            } catch (err) {
                console.error('Failed to fetch invoice detail:', err);
            }
        },
        [showNoe],
    );

    // Build sortBy array for Table component
    const facturasSortBy = [{ id: facturasSort.sortBy, desc: facturasSort.sortDir === 'desc' }];
    const productosSortBy = [{ id: productosSort.sortBy, desc: productosSort.sortDir === 'desc' }];

    const facturasData = facturasRes?.data || [];
    const facturasTotal = facturasRes?.pagination?.total || 0;
    const productosData = productosRes?.data || [];
    const productosTotal = productosRes?.pagination?.total || 0;

    return (
        <div>
            {/* Header row: heading + date range */}
            <div className="d-flex flex-column flex-sm-row justify-content-between align-items-start align-items-sm-center gap-3 mb-3">
                <h4 className="m-0 p-0 bg-red text-light">Desglose de Ventas</h4>
                <DateRangePicker
                    initialFrom={dateRange.from}
                    initialTo={dateRange.to}
                    onChange={handleDateRangeChange}
                />
            </div>

            {/* Filter selectors */}
            <div className="d-flex flex-wrap gap-3 mb-3">
                <div style={{ minWidth: '220px' }}>
                    <ClientSearch onSelect={handleClientSelect} defaultValue={clientDefaultValue} />
                </div>
                <div style={{ minWidth: '220px' }}>
                    <GroupSearch onSelect={handleGroupSelect} defaultValue={groupDefaultValue} />
                </div>
                <div style={{ minWidth: '220px' }}>
                    <EmployeeSearch onSelect={handleEmployeeSelect} defaultValue={employeeDefaultValue} />
                </div>
            </div>

            {/* Side-by-side tables */}
            <div className="row g-3">
                {/* Facturas table */}
                <div className="col-12 col-lg-6">
                    <div className="dashboard-panel">
                        <div className="dashboard-panel-header">
                            <h3>Facturas</h3>
                        </div>
                        <div className="dashboard-panel-body">
                            <SaleReportTable
                                data={facturasData}
                                loading={facturasLoading}
                                columns={facturasColumns}
                                maxHeight={620}
                                onRowClick={handleFacturaRowClick}
                                sorting={{
                                    enabled: true,
                                    sortBy: facturasSortBy,
                                    onSort: handleFacturasSort,
                                }}
                                pagination={{
                                    enabled: true,
                                    page: facturasPage,
                                    totalPages: Math.ceil(facturasTotal / 20),
                                    totalRows: facturasTotal,
                                    pageSize: 20,
                                    onPageChange: handleFacturasPageChange,
                                }}
                                search={{
                                    enabled: true,
                                    placeholder: 'Buscar por cliente o factura...',
                                    onSearch: handleFacturasSearch,
                                }}
                            />
                        </div>
                    </div>
                </div>

                {/* Productos table */}
                <div className="col-12 col-lg-6">
                    <div className="dashboard-panel">
                        <div className="dashboard-panel-header">
                            <h3>Productos</h3>
                        </div>
                        <div className="dashboard-panel-body">
                            <SaleReportTable
                                data={productosData}
                                loading={productosLoading}
                                maxHeight={620}
                                sorting={{
                                    enabled: true,
                                    sortBy: productosSortBy,
                                    onSort: handleProductosSort,
                                }}
                                pagination={{
                                    enabled: true,
                                    page: productosPage,
                                    totalPages: Math.ceil(productosTotal / 20),
                                    totalRows: productosTotal,
                                    pageSize: 20,
                                    onPageChange: handleProductosPageChange,
                                }}
                                search={{
                                    enabled: true,
                                    placeholder: 'Buscar producto...',
                                    onSearch: handleProductosSearch,
                                }}
                            />
                        </div>
                    </div>
                </div>
            </div>

            <FacturaDetailModal
                show={detailModalShow}
                onClose={() => setDetailModalShow(false)}
                invoice={selectedInvoice}
            />
        </div>
    );
};

export default DesgloseView;
