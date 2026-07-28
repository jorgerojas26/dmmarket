import { fetchInvoiceDetail } from 'api/invoice';
import { fetchFacturas, fetchProductos } from 'api/sales';
import ClientSearch from 'components/ClientSearch';
import DateRangePicker from 'components/DateRangePicker';
import FacturaDetailModal from 'components/FacturaDetailModal';
import facturasColumns from 'components/FacturasTable/columns';
import GroupSearch from 'components/GroupSearch';
import SaleReportTable from 'components/SaleReportTable';
import { ShowNoeContext } from 'context/show_noe';
import EmployeeSearch from 'employees/Search/EmployeeSearch';
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

    // ---- Facturas table state ----
    const [facturasData, setFacturasData] = useState([]);
    const [facturasLoading, setFacturasLoading] = useState(false);
    const [facturasPagination, setFacturasPagination] = useState({
        page: 1,
        limit: 20,
        total: 0,
    });
    const [facturasSort, setFacturasSort] = useState({
        sortBy: 'fecha',
        sortDir: 'desc',
    });
    const [facturasSearch, setFacturasSearch] = useState('');

    // ---- Productos table state ----
    const [productosData, setProductosData] = useState([]);
    const [productosLoading, setProductosLoading] = useState(false);
    const [productosPagination, setProductosPagination] = useState({
        page: 1,
        limit: 20,
        total: 0,
    });
    const [productosSort, setProductosSort] = useState({
        sortBy: 'rawProfit',
        sortDir: 'desc',
    });
    const [productosSearch, setProductosSearch] = useState('');

    // ---- Factura detail modal ----
    const [detailModalShow, setDetailModalShow] = useState(false);
    const [selectedInvoice, setSelectedInvoice] = useState(null);

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
        setFacturasPagination((prev) => ({ ...prev, page: 1 }));
        setProductosPagination((prev) => ({ ...prev, page: 1 }));
    }, []);

    const handleClientSelect = useCallback((client) => {
        setSelectedClient(client);
        setFacturasPagination((prev) => ({ ...prev, page: 1 }));
        setProductosPagination((prev) => ({ ...prev, page: 1 }));
    }, []);

    const handleGroupSelect = useCallback((group) => {
        setSelectedGroup(group);
        setFacturasPagination((prev) => ({ ...prev, page: 1 }));
        setProductosPagination((prev) => ({ ...prev, page: 1 }));
    }, []);

    const handleEmployeeSelect = useCallback((employee) => {
        setSelectedEmployee(employee);
        setFacturasPagination((prev) => ({ ...prev, page: 1 }));
        setProductosPagination((prev) => ({ ...prev, page: 1 }));
    }, []);

    // Facturas handlers
    const handleFacturasPageChange = useCallback((page) => {
        setFacturasPagination((prev) => ({ ...prev, page }));
    }, []);

    const handleFacturasSort = useCallback((sortBy) => {
        if (sortBy && sortBy.length > 0) {
            setFacturasSort({
                sortBy: sortBy[0].id,
                sortDir: sortBy[0].desc ? 'desc' : 'asc',
            });
            setFacturasPagination((prev) => ({ ...prev, page: 1 }));
        }
    }, []);

    const handleFacturasSearch = useCallback((value) => {
        setFacturasSearch(value || '');
        setFacturasPagination((prev) => ({ ...prev, page: 1 }));
    }, []);

    // Productos handlers
    const handleProductosPageChange = useCallback((page) => {
        setProductosPagination((prev) => ({ ...prev, page }));
    }, []);

    const handleProductosSort = useCallback((sortBy) => {
        if (sortBy && sortBy.length > 0) {
            setProductosSort({
                sortBy: sortBy[0].id,
                sortDir: sortBy[0].desc ? 'desc' : 'asc',
            });
            setProductosPagination((prev) => ({ ...prev, page: 1 }));
        }
    }, []);

    const handleProductosSearch = useCallback((value) => {
        setProductosSearch(value || '');
        setProductosPagination((prev) => ({ ...prev, page: 1 }));
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

    // ---- Effects ----

    // Fetch facturas
    useEffect(() => {
        if (!isActive) return;
        const fetchData = async () => {
            setFacturasLoading(true);
            try {
                const response = await fetchFacturas({
                    from: dateRange.from,
                    to: dateRange.to,
                    clientId: selectedClient?.IdCliente,
                    categoryId: selectedGroup?.groupId,
                    employeeId: selectedEmployee?.id,
                    page: facturasPagination.page,
                    limit: facturasPagination.limit,
                    sortBy: facturasSort.sortBy,
                    sortDir: facturasSort.sortDir,
                    search: facturasSearch || undefined,
                    showNoe,
                });
                setFacturasData(response.data || []);
                if (response.pagination) {
                    setFacturasPagination((prev) => ({
                        ...prev,
                        total: response.pagination.total,
                        page: response.pagination.page,
                    }));
                }
            } catch (err) {
                console.error(err);
            } finally {
                setFacturasLoading(false);
            }
        };
        fetchData();
    }, [
        isActive,
        dateRange.from,
        dateRange.to,
        selectedClient,
        selectedGroup,
        selectedEmployee,
        facturasPagination.page,
        facturasSort,
        facturasSearch,
        showNoe,
    ]);

    // Fetch productos
    useEffect(() => {
        if (!isActive) return;
        const fetchData = async () => {
            setProductosLoading(true);
            try {
                const response = await fetchProductos({
                    from: dateRange.from,
                    to: dateRange.to,
                    clientId: selectedClient?.IdCliente,
                    categoryId: selectedGroup?.groupId,
                    employeeId: selectedEmployee?.id,
                    page: productosPagination.page,
                    limit: productosPagination.limit,
                    sortBy: productosSort.sortBy,
                    sortDir: productosSort.sortDir,
                    search: productosSearch || undefined,
                    showNoe,
                });
                setProductosData(response.data || []);
                if (response.pagination) {
                    setProductosPagination((prev) => ({
                        ...prev,
                        total: response.pagination.total,
                        page: response.pagination.page,
                    }));
                }
            } catch (err) {
                console.error(err);
            } finally {
                setProductosLoading(false);
            }
        };
        fetchData();
    }, [
        isActive,
        dateRange.from,
        dateRange.to,
        selectedClient,
        selectedGroup,
        selectedEmployee,
        productosPagination.page,
        productosSort,
        productosSearch,
        showNoe,
    ]);

    // Build sortBy array for Table component
    const facturasSortBy = [{ id: facturasSort.sortBy, desc: facturasSort.sortDir === 'desc' }];
    const productosSortBy = [{ id: productosSort.sortBy, desc: productosSort.sortDir === 'desc' }];

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
                                    page: facturasPagination.page,
                                    totalPages: Math.ceil(facturasPagination.total / facturasPagination.limit),
                                    totalRows: facturasPagination.total,
                                    pageSize: facturasPagination.limit,
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
                                    page: productosPagination.page,
                                    totalPages: Math.ceil(productosPagination.total / productosPagination.limit),
                                    totalRows: productosPagination.total,
                                    pageSize: productosPagination.limit,
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
