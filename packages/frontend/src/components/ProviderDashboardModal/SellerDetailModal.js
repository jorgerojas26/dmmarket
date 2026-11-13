import { fetchProviderExport } from 'api/providers';
import { useAuth } from 'auth/context';
import InvoiceDetailModal from 'components/InvoiceDetailModal';
import Modal from 'components/Modal';
import Table from 'components/Table';
import { CurrencyRateContext } from 'context/currency_rate';
import usePrivateState from 'hooks/usePrivateState';
import { useProviderClients, useProviderProducts, useProviderSales } from 'hooks/useProviders';
import { DateTime } from 'luxon';
import pdfMake from 'pdfmake/build/pdfmake';
import pdfFonts from 'pdfmake/build/vfs_fonts';
import { useCallback, useContext, useEffect, useState } from 'react';
import { Alert, Button } from 'react-bootstrap';
import { useSWRConfig } from 'swr';
import { formatCurrency as formatCurrencyValue, formatMoney } from 'utils/format';
import { sortRows } from 'utils/sortRows';

pdfMake.vfs = pdfFonts.pdfMake ? pdfFonts.pdfMake.vfs : pdfMake.vfs;

const formatCurrency = (value) => (value == null ? 'No disponible' : formatCurrencyValue(value));

const LIMIT = 20;
const DEFAULT_CLIENT_SORT = [{ id: 'totalVentas', desc: true }];
const DEFAULT_PRODUCT_SORT = [{ id: 'totalVentas', desc: true }];
const DEFAULT_SALES_SORT = [{ id: 'fecha', desc: true }];
const moneyColumn = (Header, accessor) => ({
    Header,
    accessor,
    Cell: ({ value }) => formatCurrency(value),
    Footer: ({ summary }) => (summary === null ? 'No disponible' : formatCurrency(summary ?? 0)),
});
const CLIENT_COLUMNS = [
    { Header: 'Cliente', accessor: 'cliente' },
    moneyColumn('Total Ventas', 'totalVentas'),
    moneyColumn('Utilidad', 'utilidad'),
    {
        Header: 'Unidades',
        accessor: 'cantidad',
        Cell: ({ value }) => (value == null ? 'No disponible' : Number(value).toLocaleString()),
    },
    { Header: '# Ventas', accessor: 'numVentas' },
];
const SALES_COLUMNS = [
    { Header: 'Documento', accessor: 'idFactura' },
    { Header: 'Fecha', accessor: 'fecha', Cell: ({ value }) => DateTime.fromISO(value).toFormat('dd/MM/yyyy') },
    moneyColumn('Total Ventas', 'monto'),
    moneyColumn('Utilidad', 'utilidad'),
];
const PRODUCT_COLUMNS = [
    { Header: 'Producto', accessor: 'producto' },
    {
        Header: 'Cantidad',
        accessor: 'cantidad',
        Cell: ({ value }) => (value == null ? 'No disponible' : Number(value).toLocaleString()),
        Footer: ({ summary }) => (summary == null ? 'No disponible' : Number(summary).toLocaleString()),
    },
    moneyColumn('Total Ventas', 'totalVentas'),
    moneyColumn('Utilidad', 'utilidad'),
];

const SellerDetailModal = ({ show, onClose, seller, provider, dateRange, showNoe }) => {
    const prefix = `provider-seller:${provider.IdProveedor}:${seller.sellerId}:`;
    const { mutate: mutateCache } = useSWRConfig();
    const close = useCallback(() => {
        mutateCache(
            (key) =>
                Array.isArray(key) &&
                key[0] === 'private-ui' &&
                typeof key[1] === 'string' &&
                key[1].startsWith(prefix),
            undefined,
            { revalidate: false },
        );
        onClose();
    }, [prefix, mutateCache, onClose]);
    useEffect(
        () => () => {
            if (window.location.pathname !== '/proveedores') close();
        },
        [close],
    );
    const { has } = useAuth();
    const canClients = has('providers.clients.read');
    const canProducts = has('providers.products.read');
    const { currencyRate } = useContext(CurrencyRateContext);
    const [selectedInvoiceId, setSelectedInvoiceId] = usePrivateState(`${prefix}selectedInvoiceId`, null);
    const [printError, setPrintError] = useState('');
    const [activeTab, setActiveTab] = usePrivateState(`${prefix}activeTab`, canClients ? 'clientes' : 'productos');
    const [clientPage, setClientPage] = usePrivateState(`${prefix}clientPage`, 1);
    const [clientSearch, setClientSearch] = usePrivateState(`${prefix}clientSearch`, '');
    const [clientSort, setClientSort] = usePrivateState(`${prefix}clientSort`, DEFAULT_CLIENT_SORT);
    const [selectedClient, setSelectedClient] = usePrivateState(`${prefix}selectedClient`, null);
    const [salesPage, setSalesPage] = usePrivateState(`${prefix}salesPage`, 1);
    const [salesSort, setSalesSort] = usePrivateState(`${prefix}salesSort`, DEFAULT_SALES_SORT);
    const [productPage, setProductPage] = usePrivateState(`${prefix}productPage`, 1);
    const [productSearch, setProductSearch] = usePrivateState(`${prefix}productSearch`, '');
    const [productSort, setProductSort] = usePrivateState(`${prefix}productSort`, DEFAULT_PRODUCT_SORT);
    const params = { ...dateRange, showNoe, sellerId: seller.sellerId ?? '__none__', limit: LIMIT };
    const {
        data: clients,
        isLoading: clientsLoading,
        error: clientsError,
    } = useProviderClients(
        provider.IdProveedor,
        {
            ...params,
            page: clientPage,
            search: clientSearch || undefined,
            sortBy: clientSort[0]?.id,
            sortDir: clientSort[0]?.desc ? 'desc' : 'asc',
        },
        show && has('providers.clients.read'),
    );
    const {
        data: products,
        isLoading: productsLoading,
        error: productsError,
    } = useProviderProducts(
        provider.IdProveedor,
        {
            ...params,
            page: productPage,
            search: productSearch || undefined,
            sortBy: productSort[0]?.id,
            sortDir: productSort[0]?.desc ? 'desc' : 'asc',
        },
        show && canProducts && activeTab === 'productos',
    );
    const {
        data: sales,
        isLoading: salesLoading,
        error: salesError,
    } = useProviderSales(
        provider.IdProveedor,
        {
            ...params,
            clientId: selectedClient?.clientId,
            page: salesPage,
            sortBy: salesSort[0]?.id,
            sortDir: salesSort[0]?.desc ? 'desc' : 'asc',
        },
        show && !!selectedClient,
    );
    const handleClientSearch = useCallback((term) => {
        setClientSearch(term || '');
        setClientPage(1);
        setSelectedClient(null);
    }, []);
    const handleClientSort = useCallback((sort) => {
        setClientSort(sort.length ? sort : DEFAULT_CLIENT_SORT);
        setClientPage(1);
    }, []);
    const handleSalesSort = useCallback((sort) => {
        setSalesSort(sort.length ? sort : DEFAULT_SALES_SORT);
        setSalesPage(1);
    }, []);
    const handleProductSearch = useCallback((term) => {
        setProductSearch(term || '');
        setProductPage(1);
    }, []);
    const handleProductSort = useCallback((sort) => {
        setProductSort(sort.length ? sort : DEFAULT_PRODUCT_SORT);
        setProductPage(1);
    }, []);
    const handleClientClick = useCallback((client) => {
        setSelectedClient(client);
        setSalesPage(1);
    }, []);
    const pagination = (data, page, onPageChange) => ({
        enabled: true,
        page,
        totalPages: Math.ceil((data?.total || 0) / LIMIT),
        totalRows: data?.total ?? 0,
        pageSize: LIMIT,
        onPageChange,
    });

    const printTables = {
        clients: { kind: 'clients', sort: clientSort, search: clientSearch, title: 'Clientes del vendedor' },
        products: { kind: 'products', sort: productSort, search: productSearch, title: 'Productos vendidos' },
        sales: { kind: 'sales', sort: salesSort, search: '', title: `Ventas de ${selectedClient?.cliente}` },
    };

    const handlePrint = async (type, config) => {
        setPrintError('');
        try {
            const table = printTables[type];
            const result = await fetchProviderExport(provider.IdProveedor, table.kind, {
                ...params,
                search: config.search ?? (table.search || undefined),
                clientId: table.kind === 'sales' ? selectedClient?.clientId : undefined,
                sortBy: table.sort[0]?.id,
                sortDir: table.sort[0]?.desc ? 'desc' : 'asc',
            });
            const rows = sortRows(result.data || [], config?.sortBy);
            if (
                config.currency === 'BsS' &&
                !(Number(currencyRate?.Cambio) > 0 && Number.isFinite(Number(currencyRate?.Cambio)))
            )
                throw new Error('Tasa no disponible.');
            const columns = (config.columns || []).filter((column) =>
                result.columns.some((server) => server.key === column.accessor),
            );
            if (!columns.length) throw new Error('Selecciona columnas autorizadas.');
            const moneyKeys = ['totalVentas', 'monto', 'utilidad'];
            const formatValue = (key, value) => {
                if (moneyKeys.includes(key))
                    return value == null ? 'No disponible' : formatMoney(value, config?.currency, currencyRate?.Cambio);
                if (key === 'fecha') return DateTime.fromISO(value).toFormat('dd/MM/yyyy');
                if (key === 'cantidad' || key === 'numVentas')
                    return value == null ? 'No disponible' : Number(value).toLocaleString();
                return String(value ?? '');
            };
            const body = [
                columns.map((column) => ({ text: column.Header, bold: true })),
                ...rows.map((row) => columns.map((column) => formatValue(column.accessor, row[column.accessor]))),
                columns.map((column) => ({
                    text: moneyKeys.includes(column.accessor)
                        ? formatValue(column.accessor, result.totals?.[column.accessor] ?? 0)
                        : '',
                    bold: true,
                })),
            ];
            pdfMake
                .createPdf({
                    content: [
                        { text: 'ALIMENTOS DM MARKET, C.A.', style: 'header' },
                        { text: 'R.I.F.: J-41270446-0', style: 'header' },
                        { text: `Proveedor: ${provider.Empresa}`, style: 'subtitle' },
                        { text: `Vendedor: ${seller.vendedor}`, style: 'subtitle' },
                        { text: table.title, style: 'subtitle' },
                        {
                            text: `Período: ${DateTime.fromISO(dateRange.from).toFormat('dd/MM/yyyy')} — ${DateTime.fromISO(dateRange.to).toFormat('dd/MM/yyyy')} · ${showNoe ? 'Notas de entrega' : 'Facturas'}`,
                            style: 'subtitle',
                        },
                        ...(table.search ? [{ text: `Búsqueda: ${table.search}`, style: 'subtitle' }] : []),
                        {
                            margin: [0, 12, 0, 0],
                            table: {
                                headerRows: 1,
                                widths: columns.map((_, index) => (index === 0 ? '*' : 'auto')),
                                body,
                            },
                            fontSize: 8,
                        },
                    ],
                    styles: {
                        header: { alignment: 'center', fontSize: 10, bold: true },
                        subtitle: { alignment: 'center', fontSize: 9, margin: [0, 4, 0, 0] },
                    },
                    pageMargins: 40,
                    pageSize: 'LETTER',
                    pageOrientation: config?.orientation || 'portrait',
                })
                .open();
        } catch {
            setPrintError('No se pudo generar la impresión. Intenta nuevamente.');
        }
    };

    return (
        <>
            <Modal show={show} onHide={close} size="xl" scrollable className="provider-dashboard-modal">
                <Modal.Header closeButton>
                    <div>
                        <Modal.Title>{seller.vendedor}</Modal.Title>
                        <div className="provider-modal-subtitle">
                            {provider.Empresa} · {DateTime.fromISO(dateRange.from).toFormat('dd/MM/yyyy')} —{' '}
                            {DateTime.fromISO(dateRange.to).toFormat('dd/MM/yyyy')} ·{' '}
                            {showNoe ? 'Notas de entrega' : 'Facturas'}
                        </div>
                    </div>
                </Modal.Header>
                <Modal.Body>
                    {printError && <Alert variant="danger">{printError}</Alert>}
                    <div className="provider-tab-nav" role="tablist" aria-label="Detalle del vendedor">
                        {['clientes', 'productos']
                            .filter((tab) => (tab === 'clientes' ? canClients : canProducts))
                            .map((tab) => (
                                <button
                                    key={tab}
                                    type="button"
                                    id={`seller-detail-${tab}-tab`}
                                    role="tab"
                                    aria-selected={activeTab === tab}
                                    aria-controls={`seller-detail-${tab}-panel`}
                                    className={`provider-tab-button${activeTab === tab ? ' active' : ''}`}
                                    onClick={() => setActiveTab(tab)}
                                >
                                    {tab === 'clientes' ? 'Clientes' : 'Productos'}
                                </button>
                            ))}
                    </div>
                    <div
                        role="tabpanel"
                        id={`seller-detail-${activeTab}-panel`}
                        aria-labelledby={`seller-detail-${activeTab}-tab`}
                        className="pt-3"
                    >
                        {activeTab === 'clientes' ? (
                            <>
                                {clientsError && (
                                    <Alert variant="danger">
                                        No se pudieron cargar los clientes. Intenta nuevamente.
                                    </Alert>
                                )}
                                <p>Selecciona un cliente para consultar sus ventas con este vendedor.</p>
                                <Table
                                    columns={CLIENT_COLUMNS.filter(
                                        (column) =>
                                            column.accessor !== 'utilidad' ||
                                            Object.hasOwn(clients?.totals || {}, 'utilidad'),
                                    )}
                                    data={clients?.data || []}
                                    loading={clientsLoading}
                                    showFooter={!!clients?.totals}
                                    summaries={clients?.totals}
                                    emptyMessage={
                                        clientsError ? 'Error al cargar clientes' : 'Sin clientes en este período'
                                    }
                                    onRowClick={handleClientClick}
                                    print={{
                                        enabled: clients?.exportAllowed === true,
                                        onGlobalPrint:
                                            clients?.exportAllowed === true
                                                ? (config) => handlePrint('clients', config)
                                                : undefined,
                                        storageKey: 'proveedor-vendedor-clientes',
                                    }}
                                    pagination={pagination(clients, clientPage, setClientPage)}
                                    search={{
                                        enabled: true,
                                        onSearch: handleClientSearch,
                                        initialValue: clientSearch,
                                        placeholder: 'Buscar por cliente...',
                                    }}
                                    sorting={{ enabled: true, sortBy: clientSort, onSort: handleClientSort }}
                                />
                                {selectedClient && (
                                    <section className="mt-4" key={selectedClient.clientId}>
                                        <div className="d-flex align-items-center justify-content-between mb-3">
                                            <h5 className="mb-0">Ventas de {selectedClient.cliente}</h5>
                                            <Button
                                                variant="outline-secondary"
                                                size="sm"
                                                onClick={() => setSelectedClient(null)}
                                            >
                                                Ocultar ventas
                                            </Button>
                                        </div>
                                        {salesError && (
                                            <Alert variant="danger">
                                                No se pudieron cargar las ventas. Intenta nuevamente.
                                            </Alert>
                                        )}
                                        <Table
                                            print={{
                                                enabled: sales?.exportAllowed === true,
                                                onGlobalPrint:
                                                    sales?.exportAllowed === true
                                                        ? (config) => handlePrint('sales', config)
                                                        : undefined,
                                                storageKey: 'proveedor-vendedor-cliente-ventas',
                                            }}
                                            onRowClick={(sale) => setSelectedInvoiceId(sale.idFactura)}
                                            columns={SALES_COLUMNS.filter(
                                                (column) =>
                                                    column.accessor !== 'utilidad' ||
                                                    Object.hasOwn(sales?.totals || {}, 'utilidad'),
                                            )}
                                            data={sales?.data || []}
                                            loading={salesLoading}
                                            showFooter={!!sales?.totals}
                                            summaries={sales?.totals}
                                            emptyMessage={
                                                salesError ? 'Error al cargar ventas' : 'Sin ventas en este período'
                                            }
                                            pagination={pagination(sales, salesPage, setSalesPage)}
                                            sorting={{ enabled: true, sortBy: salesSort, onSort: handleSalesSort }}
                                        />
                                    </section>
                                )}
                            </>
                        ) : (
                            <>
                                {productsError && (
                                    <Alert variant="danger">
                                        No se pudieron cargar los productos. Intenta nuevamente.
                                    </Alert>
                                )}
                                <p>Productos de este proveedor vendidos por el vendedor en el período.</p>
                                <Table
                                    columns={PRODUCT_COLUMNS.filter(
                                        (column) =>
                                            !['utilidad', 'totalVentas', 'cantidad'].includes(column.accessor) ||
                                            products?.data?.some((row) => Object.hasOwn(row, column.accessor)) ||
                                            Object.hasOwn(products?.totals || {}, column.accessor),
                                    )}
                                    data={products?.data || []}
                                    loading={productsLoading}
                                    showFooter={!!products?.totals}
                                    summaries={products?.totals}
                                    emptyMessage={
                                        productsError ? 'Error al cargar productos' : 'Sin productos en este período'
                                    }
                                    print={{
                                        enabled: products?.exportAllowed === true,
                                        onGlobalPrint:
                                            products?.exportAllowed === true
                                                ? (config) => handlePrint('products', config)
                                                : undefined,
                                        storageKey: 'proveedor-vendedor-productos',
                                    }}
                                    pagination={pagination(products, productPage, setProductPage)}
                                    search={{
                                        enabled: true,
                                        onSearch: handleProductSearch,
                                        initialValue: productSearch,
                                        placeholder: 'Buscar por producto...',
                                    }}
                                    sorting={{ enabled: true, sortBy: productSort, onSort: handleProductSort }}
                                />
                            </>
                        )}
                    </div>
                </Modal.Body>
            </Modal>
            {show && selectedInvoiceId != null && (
                <InvoiceDetailModal
                    key={`${selectedInvoiceId}-${showNoe}`}
                    invoiceId={selectedInvoiceId}
                    showNoe={showNoe}
                    collapseProfit={false}
                    onClose={() => setSelectedInvoiceId(null)}
                />
            )}
        </>
    );
};

export default SellerDetailModal;
