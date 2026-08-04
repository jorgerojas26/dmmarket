import { fetchPurchasesInvoices, fetchPurchasesProducts } from 'api/purchases';
import DateRangePicker from 'components/DateRangePicker';
import GroupSearch from 'components/GroupSearch';
import ProveedorSearch from 'components/ProveedorSearch';
import PurchasesReportTable from 'components/PurchasesReportTable';
import productosColumns from 'components/PurchasesReportTable/productosColumns';
import { CurrencyRateContext } from 'context/currency_rate';
import { usePurchasesInvoices, usePurchasesProducts } from 'hooks/usePurchases';
import { DateTime } from 'luxon';
import pdfMake from 'pdfmake/build/pdfmake';
import pdfFonts from 'pdfmake/build/vfs_fonts';
import { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useHistory, useLocation } from 'react-router-dom';
import { formatMoney } from 'utils/format';
import { sortRows } from 'utils/sortRows';

pdfMake.vfs = pdfFonts.pdfMake.vfs;

const DesgloseView = ({ isActive = true }) => {
    const { currencyRate } = useContext(CurrencyRateContext);
    const history = useHistory();
    const location = useLocation();

    // --- Parse filters from URL query params ---
    const searchParams = new URLSearchParams(location.search);
    const urlDFrom = searchParams.get('dFrom');
    const urlDTo = searchParams.get('dTo');
    const urlProveedorId = searchParams.get('proveedorId');
    const urlProveedorName = searchParams.get('proveedorName');
    const urlGroupId = searchParams.get('groupId');
    const urlGroupName = searchParams.get('groupName');

    const today = DateTime.now().toISODate();

    const initialDateRange = {
        from: urlDFrom || today,
        to: urlDTo || today,
    };

    const initialProveedor = urlProveedorId ? { IdProveedor: urlProveedorId, name: urlProveedorName || '' } : null;
    const initialGroup = urlGroupId ? { groupId: urlGroupId, name: urlGroupName || '' } : null;

    // Date range — defaults to today
    const [dateRange, setDateRange] = useState(initialDateRange);

    // Filters (shared by both tables)
    const [selectedProveedor, setSelectedProveedor] = useState(initialProveedor);
    const [selectedGroup, setSelectedGroup] = useState(initialGroup);

    // ---- Facturas table state ----
    const [facturasPage, setFacturasPage] = useState(1);
    const [facturasSort, setFacturasSort] = useState({ sortBy: 'fecha', sortDir: 'desc' });
    const [facturasSearch, setFacturasSearch] = useState('');

    // ---- Productos table state ----
    const [productosPage, setProductosPage] = useState(1);
    const [productosSort, setProductosSort] = useState({ sortBy: 'monto', sortDir: 'desc' });
    const [productosSearch, setProductosSearch] = useState('');

    // --- Sync filters back to URL ---
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        params.set('dFrom', dateRange.from);
        params.set('dTo', dateRange.to);

        if (selectedProveedor?.IdProveedor) {
            params.set('proveedorId', selectedProveedor.IdProveedor);
            params.set('proveedorName', selectedProveedor.Empresa || selectedProveedor.name || '');
        } else {
            params.delete('proveedorId');
            params.delete('proveedorName');
        }

        if (selectedGroup?.groupId) {
            params.set('groupId', selectedGroup.groupId);
            params.set('groupName', selectedGroup.name || '');
        } else {
            params.delete('groupId');
            params.delete('groupName');
        }

        history.replace({ search: params.toString() });
    }, [dateRange, selectedProveedor, selectedGroup, history]);

    // --- SWR hooks ---
    const {
        data: facturasRes,
        error: facturasError,
        isLoading: facturasLoading,
    } = usePurchasesInvoices(
        {
            from: dateRange.from,
            to: dateRange.to,
            proveedorId: selectedProveedor?.IdProveedor,
            groupId: selectedGroup?.groupId,
            page: facturasPage,
            limit: 20,
            sortBy: facturasSort.sortBy,
            sortDir: facturasSort.sortDir,
            search: facturasSearch || undefined,
        },
        isActive,
    );

    const {
        data: productosRes,
        error: productosError,
        isLoading: productosLoading,
    } = usePurchasesProducts(
        {
            from: dateRange.from,
            to: dateRange.to,
            proveedorId: selectedProveedor?.IdProveedor,
            groupId: selectedGroup?.groupId,
            page: productosPage,
            limit: 20,
            sortBy: productosSort.sortBy,
            sortDir: productosSort.sortDir,
            search: productosSearch || undefined,
        },
        isActive,
    );

    // --- Default values for search components (reconstructed from URL) ---
    const proveedorDefaultValue = useMemo(
        () =>
            selectedProveedor
                ? {
                      key: selectedProveedor.IdProveedor,
                      label: selectedProveedor.Empresa || selectedProveedor.name || '',
                      value: selectedProveedor,
                  }
                : null,
        [selectedProveedor],
    );

    const groupDefaultValue = useMemo(
        () =>
            selectedGroup
                ? { key: selectedGroup.groupId, label: selectedGroup.name || '', value: selectedGroup }
                : null,
        [selectedGroup],
    );

    // ---- Handlers ----

    const handleDateRangeChange = useCallback(({ from, to }) => {
        setDateRange({ from, to });
        setFacturasPage(1);
        setProductosPage(1);
    }, []);

    const handleProveedorSelect = useCallback((proveedor) => {
        setSelectedProveedor(proveedor);
        setFacturasPage(1);
        setProductosPage(1);
    }, []);

    const handleGroupSelect = useCallback((group) => {
        setSelectedGroup(group);
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
                const result = await fetchPurchasesInvoices({
                    from: dateRange.from,
                    to: dateRange.to,
                    proveedorId: selectedProveedor?.IdProveedor,
                    groupId: selectedGroup?.groupId,
                    page: 1,
                    limit: facturasTotal || 9999,
                    sortBy: facturasSort.sortBy,
                    sortDir: facturasSort.sortDir,
                    search: facturasSearch || undefined,
                });
                const data = sortRows(result?.data || [], config?.sortBy);
                const total = data.reduce((s, r) => s + (r.monto || 0), 0);
                const currency = config?.currency;
                const rate = currencyRate?.Cambio;
                // Column metadata for the PDF, keyed by accessor (order defines layout).
                const pdfColumns = [
                    { accessor: 'invoiceId', Header: 'Factura', width: 'auto', render: (r) => String(r.invoiceId) },
                    {
                        accessor: 'fecha',
                        Header: 'Fecha',
                        width: 'auto',
                        render: (r) => (r.fecha ? DateTime.fromISO(r.fecha).toFormat('dd/MM/yyyy') : ''),
                    },
                    { accessor: 'proveedor', Header: 'Proveedor', width: '*', render: (r) => r.proveedor || '' },
                    {
                        accessor: 'monto',
                        Header: 'Monto',
                        width: 'auto',
                        render: (r) => formatMoney(r.monto, currency, rate),
                    },
                    {
                        accessor: 'unidades',
                        Header: 'Unidades',
                        width: 'auto',
                        render: (r) =>
                            r.unidades != null
                                ? Number(r.unidades).toLocaleString(undefined, { maximumFractionDigits: 3 })
                                : '',
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
                    selectedProveedor?.Empresa || selectedProveedor?.name
                        ? `Proveedor: ${selectedProveedor.Empresa || selectedProveedor.name}`
                        : '',
                    selectedGroup?.name ? `Grupo: ${selectedGroup.name}` : '',
                    facturasSearch ? `Búsqueda: ${facturasSearch}` : '',
                ]
                    .filter(Boolean)
                    .join(' | ');

                pdfMake
                    .createPdf({
                        content: [
                            { text: 'ALIMENTOS DM MARKET, C.A.', style: 'header' },
                            { text: 'Desglose de Compras — Facturas', style: 'subheader' },
                            { text: filterLabel || 'Sin filtros', style: 'filterLabel', margin: [0, 0, 0, 12] },
                            {
                                style: 'table',
                                table: {
                                    widths: selected.map((col) => col.width),
                                    body: allColumnsSelected
                                        ? [
                                              ...body,
                                              [
                                                  { text: '', colSpan: 3, border: [false, true, false, false] },
                                                  {},
                                                  {},
                                                  {
                                                      text: `Total: ${formatMoney(total, currency, rate)}`,
                                                      style: 'total',
                                                      colSpan: 2,
                                                  },
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
        [dateRange, selectedProveedor, selectedGroup, facturasSort, facturasSearch, facturasTotal, currencyRate],
    );

    const handlePrintAllProductos = useCallback(
        async (config) => {
            try {
                const result = await fetchPurchasesProducts({
                    from: dateRange.from,
                    to: dateRange.to,
                    proveedorId: selectedProveedor?.IdProveedor,
                    groupId: selectedGroup?.groupId,
                    page: 1,
                    limit: productosTotal || 9999,
                    sortBy: productosSort.sortBy,
                    sortDir: productosSort.sortDir,
                    search: productosSearch || undefined,
                });
                const data = sortRows(result?.data || [], config?.sortBy);
                const totalUnidades = data.reduce((s, r) => s + (r.quantity || 0), 0);
                const totalMonto = data.reduce((s, r) => s + (r.monto || 0), 0);
                const currency = config?.currency;
                const rate = currencyRate?.Cambio;
                // Column metadata for the PDF, keyed by accessor (order defines layout).
                const pdfColumns = [
                    { accessor: 'product', Header: 'Producto', width: '*', render: (r) => r.product || '' },
                    {
                        accessor: 'quantity',
                        Header: 'Unidades',
                        width: 'auto',
                        render: (r) =>
                            r.quantity != null
                                ? Number(r.quantity).toLocaleString(undefined, { maximumFractionDigits: 3 })
                                : '',
                    },
                    {
                        accessor: 'monto',
                        Header: 'Monto',
                        width: 'auto',
                        render: (r) => formatMoney(r.monto, currency, rate),
                    },
                    {
                        accessor: 'avgUnitCost',
                        Header: 'Costo Prom.',
                        width: 'auto',
                        render: (r) => formatMoney(r.avgUnitCost, currency, rate),
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
                    selectedProveedor?.Empresa || selectedProveedor?.name
                        ? `Proveedor: ${selectedProveedor.Empresa || selectedProveedor.name}`
                        : '',
                    selectedGroup?.name ? `Grupo: ${selectedGroup.name}` : '',
                    productosSearch ? `Búsqueda: ${productosSearch}` : '',
                ]
                    .filter(Boolean)
                    .join(' | ');

                pdfMake
                    .createPdf({
                        content: [
                            { text: 'ALIMENTOS DM MARKET, C.A.', style: 'header' },
                            { text: 'Desglose de Compras — Productos', style: 'subheader' },
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
                                                  {
                                                      text: Number(totalUnidades).toLocaleString(undefined, {
                                                          maximumFractionDigits: 3,
                                                      }),
                                                      style: 'total',
                                                  },
                                                  { text: formatMoney(totalMonto, currency, rate), style: 'total' },
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
        [dateRange, selectedProveedor, selectedGroup, productosSort, productosSearch, productosTotal, currencyRate],
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
                <h4 className="m-0 p-0 bg-red text-light">Desglose de Compras</h4>
                <DateRangePicker
                    initialFrom={dateRange.from}
                    initialTo={dateRange.to}
                    onChange={handleDateRangeChange}
                />
            </div>

            {/* Filter selectors */}
            <div className="d-flex flex-wrap gap-3 mb-3">
                <div style={{ minWidth: '220px' }}>
                    <ProveedorSearch onSelect={handleProveedorSelect} defaultValue={proveedorDefaultValue} />
                </div>
                <div style={{ minWidth: '220px' }}>
                    <GroupSearch onSelect={handleGroupSelect} defaultValue={groupDefaultValue} />
                </div>
            </div>

            {/* Side-by-side tables */}
            <div className="row g-3">
                {/* Facturas table */}
                <div className="col-12 col-lg-6">
                    <div className="dashboard-panel">
                        <div className="dashboard-panel-header">
                            <h3>Facturas de Compra</h3>
                        </div>
                        <div className="dashboard-panel-body">
                            {facturasError && (
                                <div className="alert alert-danger">
                                    Error al cargar las facturas: {facturasError.message}
                                </div>
                            )}
                            <PurchasesReportTable
                                data={facturasData}
                                loading={facturasLoading}
                                maxHeight={620}
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
                                    placeholder: 'Buscar por proveedor o factura...',
                                    onSearch: handleFacturasSearch,
                                }}
                                print={{
                                    enabled: true,
                                    onGlobalPrint: handlePrintAllFacturas,
                                }}
                            />
                        </div>
                    </div>
                </div>

                {/* Productos table */}
                <div className="col-12 col-lg-6">
                    <div className="dashboard-panel">
                        <div className="dashboard-panel-header">
                            <h3>Productos Comprados</h3>
                        </div>
                        <div className="dashboard-panel-body">
                            {productosError && (
                                <div className="alert alert-danger">
                                    Error al cargar los productos: {productosError.message}
                                </div>
                            )}
                            <PurchasesReportTable
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
        </div>
    );
};

export default DesgloseView;
