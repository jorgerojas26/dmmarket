import { fetchInvoiceDetail } from 'api/invoice';
import { fetchFacturas, fetchProductos } from 'api/sales';
import ClientSearch from 'components/ClientSearch';
import DateRangePicker from 'components/DateRangePicker';
import FacturaDetailModal from 'components/FacturaDetailModal';
import facturasColumns from 'components/FacturasTable/columns';
import GroupSearch from 'components/GroupSearch';
import SaleReportTable from 'components/SaleReportTable';
import productosColumns from 'components/SaleReportTable/productosColumns';
import ProveedorSearch from 'components/ProveedorSearch';
import { darkSelectStyles } from 'components/selectStyles';
import { ShowNoeContext } from 'context/show_noe';
import EmployeeSearch from 'employees/Search/EmployeeSearch';
import { useClientRoutes } from 'hooks/useClients';
import { useFacturas, useProductos } from 'hooks/useSales';
import { DateTime } from 'luxon';
import pdfMake from 'pdfmake/build/pdfmake';
import pdfFonts from 'pdfmake/build/vfs_fonts';
import { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useHistory, useLocation } from 'react-router-dom';
import Select from 'react-select';

pdfMake.vfs = pdfFonts.pdfMake.vfs;

const formatCurrency = (value) => {
    const num = Number(value);
    if (Number.isNaN(num)) return '$0.00';
    return `$${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

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
    const urlRutaId = searchParams.get('rutaId');
    const urlRutaName = searchParams.get('rutaName');
    const urlProveedorId = searchParams.get('proveedorId');
    const urlProveedorName = searchParams.get('proveedorName');

    const today = DateTime.now().toISODate();

    const initialDateRange = {
        from: urlDFrom || today,
        to: urlDTo || today,
    };

    const initialClient = urlClientId ? { IdCliente: urlClientId, name: urlClientName || '' } : null;
    const initialGroup = urlGroupId ? { groupId: urlGroupId, name: urlGroupName || '' } : null;
    const initialEmployee = urlEmployeeId ? { id: urlEmployeeId, name: urlEmployeeName || '' } : null;
    const initialRuta = urlRutaId ? { value: urlRutaId, label: urlRutaName || urlRutaId } : null;
    const initialProveedor = urlProveedorId ? { IdProveedor: urlProveedorId, name: urlProveedorName || '' } : null;

    // Date range — defaults to today
    const [dateRange, setDateRange] = useState(initialDateRange);

    // Filters (shared)
    const [selectedClient, setSelectedClient] = useState(initialClient);
    const [selectedGroup, setSelectedGroup] = useState(initialGroup);
    const [selectedEmployee, setSelectedEmployee] = useState(initialEmployee);
    const [selectedRuta, setSelectedRuta] = useState(initialRuta);
    const [selectedProveedor, setSelectedProveedor] = useState(initialProveedor);

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

        if (selectedRuta?.value) {
            params.set('rutaId', selectedRuta.value);
            params.set('rutaName', selectedRuta.label || '');
        } else {
            params.delete('rutaId');
            params.delete('rutaName');
        }

        if (selectedProveedor?.IdProveedor) {
            params.set('proveedorId', selectedProveedor.IdProveedor);
            params.set('proveedorName', selectedProveedor.name || '');
        } else {
            params.delete('proveedorId');
            params.delete('proveedorName');
        }

        history.replace({ search: params.toString() });
    }, [dateRange, selectedClient, selectedGroup, selectedEmployee, selectedRuta, selectedProveedor, history]);

    // --- SWR hooks ---
    const { data: facturasRes, isLoading: facturasLoading } = useFacturas(
        {
            from: dateRange.from,
            to: dateRange.to,
            clientId: selectedClient?.IdCliente,
            categoryId: selectedGroup?.groupId,
            employeeId: selectedEmployee?.id,
            ruta: selectedRuta?.value,
            proveedorId: selectedProveedor?.IdProveedor,
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
            ruta: selectedRuta?.value,
            proveedorId: selectedProveedor?.IdProveedor,
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

    const proveedorDefaultValue = useMemo(
        () =>
            selectedProveedor
                ? { key: selectedProveedor.IdProveedor, label: selectedProveedor.name || '', value: selectedProveedor }
                : null,
        [selectedProveedor],
    );

    // --- Routes (for the route filter) ---
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

    const handleRutaSelect = useCallback((option) => {
        setSelectedRuta(option);
        setFacturasPage(1);
        setProductosPage(1);
    }, []);

    const handleProveedorSelect = useCallback((proveedor) => {
        setSelectedProveedor(proveedor);
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

    // ---- Print handlers ----
    const facturasTotal = facturasRes?.pagination?.total || 0;
    const productosTotal = productosRes?.pagination?.total || 0;

    const handlePrintAllFacturas = useCallback(
        async (config) => {
            try {
                const result = await fetchFacturas({
                    from: dateRange.from,
                    to: dateRange.to,
                    clientId: selectedClient?.IdCliente,
                    categoryId: selectedGroup?.groupId,
                    employeeId: selectedEmployee?.id,
                    ruta: selectedRuta?.value,
                    proveedorId: selectedProveedor?.IdProveedor,
                    page: 1,
                    limit: facturasTotal || 9999,
                    sortBy: facturasSort.sortBy,
                    sortDir: facturasSort.sortDir,
                    search: facturasSearch || undefined,
                    showNoe,
                });
                const data = result?.data || [];
                const total = data.reduce((s, r) => s + (r.monto || 0), 0);
                // Column metadata for the PDF, keyed by accessor (order defines layout).
                const pdfColumns = [
                    { accessor: 'invoiceId', Header: 'Factura', width: 'auto', render: (r) => String(r.invoiceId) },
                    {
                        accessor: 'fecha',
                        Header: 'Fecha',
                        width: 'auto',
                        render: (r) => (r.fecha ? DateTime.fromISO(r.fecha).toFormat('dd/MM/yyyy') : ''),
                    },
                    { accessor: 'cliente', Header: 'Cliente', width: '*', render: (r) => r.cliente || '' },
                    { accessor: 'vendedor', Header: 'Vendedor', width: '*', render: (r) => r.vendedor || '' },
                    { accessor: 'monto', Header: 'Monto', width: 'auto', render: (r) => formatCurrency(r.monto) },
                    {
                        accessor: 'utilidad',
                        Header: 'Utilidad',
                        width: 'auto',
                        render: (r) => formatCurrency(r.utilidad),
                    },
                    {
                        accessor: 'promedio',
                        Header: '%',
                        width: 'auto',
                        render: (r) => (r.promedio != null ? `${r.promedio}%` : ''),
                    },
                ];
                const selectedAccessors = new Set((config?.columns || []).map((col) => col.accessor));
                const selected =
                    selectedAccessors.size > 0
                        ? pdfColumns.filter((col) => selectedAccessors.has(col.accessor))
                        : pdfColumns;
                const allColumnsSelected = selected.length === pdfColumns.length;
                const body = [
                    selected.map((col) => ({ text: col.Header, style: 'th' })),
                    ...data.map((r) => selected.map((col) => col.render(r))),
                ];

                const filterLabel = [
                    dateRange.from && dateRange.to ? `${dateRange.from} — ${dateRange.to}` : '',
                    selectedRuta?.label ? `Ruta: ${selectedRuta.label}` : '',
                    selectedClient?.name ? `Cliente: ${selectedClient.name}` : '',
                    selectedGroup?.name ? `Categoría: ${selectedGroup.name}` : '',
                    selectedEmployee?.name ? `Vendedor: ${selectedEmployee.name}` : '',
                    selectedProveedor?.name ? `Proveedor: ${selectedProveedor.name}` : '',
                ]
                    .filter(Boolean)
                    .join(' | ');

                pdfMake
                    .createPdf({
                        content: [
                            { text: 'ALIMENTOS DM MARKET, C.A.', style: 'header' },
                            { text: 'Desglose de Ventas — Facturas', style: 'subheader' },
                            { text: filterLabel || 'Sin filtros', style: 'filterLabel', margin: [0, 0, 0, 12] },
                            {
                                style: 'table',
                                table: {
                                    widths: selected.map((col) => col.width),
                                    body: allColumnsSelected
                                        ? [
                                              ...body,
                                              [
                                                  { text: '', colSpan: 4, border: [false, true, false, false] },
                                                  {},
                                                  {},
                                                  {},
                                                  {
                                                      text: `Total: ${formatCurrency(total)}`,
                                                      style: 'total',
                                                      colSpan: 3,
                                                  },
                                                  {},
                                                  {},
                                              ],
                                          ]
                                        : body,
                                },
                            },
                        ],
                        styles: {
                            header: { alignment: 'center', fontSize: 10, bold: true },
                            subheader: { alignment: 'center', fontSize: 9, margin: [0, 4, 0, 2] },
                            filterLabel: { alignment: 'center', fontSize: 8, italics: true, color: '#666' },
                            th: { bold: true, fontSize: 8, fillColor: '#f3f4f6' },
                            total: { bold: true, fontSize: 8 },
                            table: { margin: [0, 10, 0, 0], fontSize: 8 },
                        },
                        pageMargins: 30,
                        pageSize: 'LETTER',
                        pageOrientation: config?.orientation || 'portrait',
                    })
                    .open();
            } catch (err) {
                console.error('Error printing all facturas:', err);
            }
        },
        [
            dateRange,
            selectedClient,
            selectedGroup,
            selectedEmployee,
            selectedRuta,
            selectedProveedor,
            facturasSort,
            facturasSearch,
            facturasTotal,
            showNoe,
        ],
    );

    const handlePrintAllProductos = useCallback(
        async (config) => {
            try {
                const result = await fetchProductos({
                    from: dateRange.from,
                    to: dateRange.to,
                    clientId: selectedClient?.IdCliente,
                    categoryId: selectedGroup?.groupId,
                    employeeId: selectedEmployee?.id,
                    ruta: selectedRuta?.value,
                    proveedorId: selectedProveedor?.IdProveedor,
                    page: 1,
                    limit: productosTotal || 9999,
                    sortBy: productosSort.sortBy,
                    sortDir: productosSort.sortDir,
                    search: productosSearch || undefined,
                    showNoe,
                });
                const data = result?.data || [];
                const totalBruto = data.reduce((s, r) => s + (r.rawProfit || 0), 0);
                const totalUtilidad = data.reduce((s, r) => s + (r.netProfit || 0), 0);
                const totalPeso = data.reduce((s, r) => s + (r.peso || 0), 0);
                const formatPeso = (value) => {
                    const num = Number(value);
                    return Number.isNaN(num) || num === 0
                        ? ''
                        : num.toLocaleString(undefined, { maximumFractionDigits: 3 });
                };
                // Column metadata for the PDF, keyed by accessor (order defines layout).
                const pdfColumns = [
                    { accessor: 'product', Header: 'Producto', width: '*', render: (r) => r.product || '' },
                    {
                        accessor: 'quantity',
                        Header: 'Cantidad',
                        width: 'auto',
                        render: (r) => String(r.quantity != null ? Number(r.quantity).toFixed(2) : ''),
                    },
                    { accessor: 'peso', Header: 'Peso', width: 'auto', render: (r) => formatPeso(r.peso) },
                    {
                        accessor: 'rawProfit',
                        Header: 'Bruto',
                        width: 'auto',
                        render: (r) => formatCurrency(r.rawProfit),
                    },
                    {
                        accessor: 'netProfit',
                        Header: 'Utilidad',
                        width: 'auto',
                        render: (r) => formatCurrency(r.netProfit),
                    },
                    {
                        accessor: 'averageProfitPercent',
                        Header: '%',
                        width: 'auto',
                        render: (r) => (r.averageProfitPercent != null ? `${r.averageProfitPercent}%` : ''),
                    },
                ];
                const selectedAccessors = new Set((config?.columns || []).map((col) => col.accessor));
                const selected =
                    selectedAccessors.size > 0
                        ? pdfColumns.filter((col) => selectedAccessors.has(col.accessor))
                        : pdfColumns;
                const allColumnsSelected = selected.length === pdfColumns.length;
                const body = [
                    selected.map((col) => ({ text: col.Header, style: 'th' })),
                    ...data.map((r) => selected.map((col) => col.render(r))),
                ];

                const filterLabel = [
                    dateRange.from && dateRange.to ? `${dateRange.from} — ${dateRange.to}` : '',
                    selectedRuta?.label ? `Ruta: ${selectedRuta.label}` : '',
                    selectedClient?.name ? `Cliente: ${selectedClient.name}` : '',
                    selectedGroup?.name ? `Categoría: ${selectedGroup.name}` : '',
                    selectedEmployee?.name ? `Vendedor: ${selectedEmployee.name}` : '',
                    selectedProveedor?.name ? `Proveedor: ${selectedProveedor.name}` : '',
                ]
                    .filter(Boolean)
                    .join(' | ');

                pdfMake
                    .createPdf({
                        content: [
                            { text: 'ALIMENTOS DM MARKET, C.A.', style: 'header' },
                            { text: 'Desglose de Ventas — Productos', style: 'subheader' },
                            { text: filterLabel || 'Sin filtros', style: 'filterLabel', margin: [0, 0, 0, 12] },
                            {
                                style: 'table',
                                table: {
                                    widths: selected.map((col) => col.width),
                                    body: allColumnsSelected
                                        ? [
                                              ...body,
                                              [
                                                  { text: 'Total', style: 'total' },
                                                  '',
                                                  { text: formatPeso(totalPeso), style: 'total' },
                                                  { text: formatCurrency(totalBruto), style: 'total' },
                                                  { text: formatCurrency(totalUtilidad), style: 'total' },
                                                  '',
                                              ],
                                          ]
                                        : body,
                                },
                            },
                        ],
                        styles: {
                            header: { alignment: 'center', fontSize: 10, bold: true },
                            subheader: { alignment: 'center', fontSize: 9, margin: [0, 4, 0, 2] },
                            filterLabel: { alignment: 'center', fontSize: 8, italics: true, color: '#666' },
                            th: { bold: true, fontSize: 8, fillColor: '#f3f4f6' },
                            total: { bold: true, fontSize: 8 },
                            table: { margin: [0, 10, 0, 0], fontSize: 8 },
                        },
                        pageMargins: 30,
                        pageSize: 'LETTER',
                        pageOrientation: config?.orientation || 'portrait',
                    })
                    .open();
            } catch (err) {
                console.error('Error printing all productos:', err);
            }
        },
        [
            dateRange,
            selectedClient,
            selectedGroup,
            selectedEmployee,
            selectedRuta,
            selectedProveedor,
            productosSort,
            productosSearch,
            productosTotal,
            showNoe,
        ],
    );

    const handlePrintFacturaRow = useCallback(
        async (factura) => {
            try {
                const detail = await fetchInvoiceDetail(factura.invoiceId, showNoe);
                const productos = detail?.productos || [];
                const rows = productos.map((p) => [
                    p.descripcion || p.product || '',
                    String(Number(p.cantidad || p.quantity || 0)),
                    formatCurrency(p.precio || p.price || 0),
                    formatCurrency(p.subtotal || (p.precio || p.price || 0) * (p.cantidad || p.quantity || 0)),
                ]);

                pdfMake
                    .createPdf({
                        content: [
                            { text: 'ALIMENTOS DM MARKET, C.A.', style: 'header' },
                            {
                                text: 'CALLE ILUSTRES PROCERES LOCAL NRO S/N SECTOR CENTRO ALTAGRACIA DE ORITUCO DE ORITUCO ZONA POSTAL 2320.',
                                style: 'header',
                            },
                            { text: 'R.I.F.: J-41270446-0', style: 'header' },
                            {
                                text: factura.fecha ? DateTime.fromISO(factura.fecha).toFormat('dd/MM/yyyy') : '',
                                style: 'header',
                            },
                            { text: `Factura: ${factura.invoiceId}`, style: 'subheader' },
                            { text: `Cliente: ${factura.cliente || ''}`, style: 'subheader', margin: [0, 0, 0, 12] },
                            {
                                style: 'table',
                                table: {
                                    widths: ['*', 'auto', 'auto', 'auto'],
                                    body: [
                                        ['Descripción', 'Cantidad', 'Precio', 'Subtotal'],
                                        ...rows,
                                        [
                                            '',
                                            '',
                                            { text: 'Total', bold: true },
                                            { text: formatCurrency(detail.total || factura.monto || 0), bold: true },
                                        ],
                                    ],
                                },
                            },
                        ],
                        styles: {
                            header: { alignment: 'center', fontSize: 10 },
                            subheader: { alignment: 'center', fontSize: 9, margin: [0, 4, 0, 2] },
                            table: { margin: [0, 10, 0, 0], fontSize: 8 },
                        },
                        pageMargins: 40,
                        pageSize: 'LETTER',
                    })
                    .open();
            } catch (err) {
                console.error('Error printing factura:', err);
            }
        },
        [showNoe],
    );

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
    const productosData = productosRes?.data || [];

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
                    <Select
                        options={routeOptions}
                        value={selectedRuta}
                        onChange={handleRutaSelect}
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
                <div style={{ minWidth: '220px' }}>
                    <ClientSearch onSelect={handleClientSelect} defaultValue={clientDefaultValue} />
                </div>
                <div style={{ minWidth: '220px' }}>
                    <GroupSearch onSelect={handleGroupSelect} defaultValue={groupDefaultValue} />
                </div>
                <div style={{ minWidth: '220px' }}>
                    <EmployeeSearch onSelect={handleEmployeeSelect} defaultValue={employeeDefaultValue} />
                </div>
                <div style={{ minWidth: '220px' }}>
                    <ProveedorSearch onSelect={handleProveedorSelect} defaultValue={proveedorDefaultValue} />
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
                                print={{
                                    enabled: true,
                                    onGlobalPrint: handlePrintAllFacturas,
                                    perRowPrint: true,
                                    onRowPrint: handlePrintFacturaRow,
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
                                columns={productosColumns}
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
                                print={{
                                    enabled: true,
                                    onGlobalPrint: handlePrintAllProductos,
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
