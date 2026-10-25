import { fetchProviderExport } from 'api/providers';
import { useAuth } from 'auth/context';
import InvoiceDetailModal from 'components/InvoiceDetailModal';
import Modal from 'components/Modal';
import Table from 'components/Table';
import { CurrencyRateContext } from 'context/currency_rate';
import usePrivateState from 'hooks/usePrivateState';
import { useProviderClients, useProviderSales, useProviderSellers } from 'hooks/useProviders';
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
const moneyColumn = (Header, accessor) => ({
    Header,
    accessor,
    Cell: ({ value }) => formatCurrency(value),
    Footer: ({ summary }) => (summary === null ? 'No disponible' : formatCurrency(summary ?? 0)),
});
const quantityColumn = {
    Header: 'Unidades',
    accessor: 'cantidad',
    Cell: ({ value }) => (value == null ? 'No disponible' : Number(value).toLocaleString()),
    Footer: ({ summary }) => Number(summary ?? 0).toLocaleString(),
};
const SELLER_COLUMNS = [
    { Header: 'Vendedor', accessor: 'vendedor' },
    quantityColumn,
    moneyColumn('Total Ventas', 'totalVentas'),
    moneyColumn('Utilidad', 'utilidad'),
    { Header: 'Clientes únicos', accessor: 'numClientes' },
];
const CLIENT_COLUMNS = [
    { Header: 'Cliente', accessor: 'cliente' },
    { Header: 'Vendedor', accessor: 'vendedor' },
    quantityColumn,
    moneyColumn('Total Ventas', 'totalVentas'),
    moneyColumn('Utilidad', 'utilidad'),
    { Header: '# Documentos', accessor: 'numVentas' },
];
const SALES_COLUMNS = [
    { Header: 'Documento', accessor: 'idFactura' },
    { Header: 'Fecha', accessor: 'fecha', Cell: ({ value }) => DateTime.fromISO(value).toFormat('dd/MM/yyyy') },
    { Header: 'Vendedor', accessor: 'vendedor' },
    quantityColumn,
    moneyColumn('Total Ventas', 'monto'),
    moneyColumn('Utilidad', 'utilidad'),
];

const useTableQuery = (defaultSort, prefix) => {
    const [page, setPage] = usePrivateState(`${prefix}page`, 1);
    const [search, setSearch] = usePrivateState(`${prefix}search`, '');
    const [sort, setSort] = usePrivateState(`${prefix}sort`, [{ id: defaultSort, desc: true }]);
    const onSearch = useCallback((term) => {
        setSearch(term || '');
        setPage(1);
    }, []);
    const onSort = useCallback(
        (value) => {
            setSort(value.length ? value : [{ id: defaultSort, desc: true }]);
            setPage(1);
        },
        [defaultSort],
    );
    const reset = useCallback(() => {
        setPage(1);
        setSearch('');
        setSort([{ id: defaultSort, desc: true }]);
    }, [defaultSort]);
    return {
        page,
        setPage,
        search,
        sort,
        onSearch,
        onSort,
        reset,
        params: {
            page,
            limit: LIMIT,
            search: search || undefined,
            sortBy: sort[0]?.id,
            sortDir: sort[0]?.desc ? 'desc' : 'asc',
        },
    };
};

const ProductDetailModal = ({ show, onClose, product, provider, dateRange, showNoe }) => {
    const prefix = `provider-product:${provider.IdProveedor}:${product.productId}:`;
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
    const { session, can } = useAuth();
    const canSellers = session.permissions.some((grant) => grant.capability === 'sellers.read');
    const canClients = can('clients.read');
    const { currencyRate } = useContext(CurrencyRateContext) || {};
    const [activeTab, setActiveTab] = usePrivateState(`${prefix}activeTab`, canSellers ? 'vendedores' : 'clientes');
    const [selectedSeller, setSelectedSeller] = usePrivateState(`${prefix}selectedSeller`, null);
    const [selectedClient, setSelectedClient] = usePrivateState(`${prefix}selectedClient`, null);
    const [selectedInvoiceId, setSelectedInvoiceId] = usePrivateState(`${prefix}selectedInvoiceId`, null);
    const [printError, setPrintError] = useState('');
    const sellersQuery = useTableQuery('totalVentas', `${prefix}sellers-`);
    const clientsQuery = useTableQuery('totalVentas', `${prefix}clients-`);
    const salesQuery = useTableQuery('fecha', `${prefix}sales-`);
    const params = { ...dateRange, showNoe, productId: product.productId };
    const sellerId = selectedSeller ? (selectedSeller.sellerId ?? '__none__') : undefined;
    const clientSellerId = selectedClient ? (selectedClient.sellerId ?? '__none__') : undefined;
    const clientId = selectedClient ? (selectedClient.clientId ?? '__none__') : undefined;
    const sellers = useProviderSellers(
        provider.IdProveedor,
        { ...params, ...sellersQuery.params },
        show && canSellers && activeTab === 'vendedores',
    );
    const clients = useProviderClients(
        provider.IdProveedor,
        {
            ...params,
            ...clientsQuery.params,
            sellerId,
        },
        show && canClients && activeTab === 'clientes',
    );
    const sales = useProviderSales(
        provider.IdProveedor,
        {
            ...params,
            ...salesQuery.params,
            sellerId: clientSellerId,
            clientId,
        },
        show && canClients && activeTab === 'clientes' && !!selectedClient,
    );

    const handleSellerClick = (seller) => {
        if (sellers.isLoading || sellers.error) return;
        setSelectedSeller(seller);
        setSelectedClient(null);
        clientsQuery.reset();
        salesQuery.reset();
        setActiveTab('clientes');
    };
    const handleClearSeller = () => {
        setSelectedSeller(null);
        setSelectedClient(null);
        clientsQuery.reset();
        salesQuery.reset();
    };
    const handleClientClick = (client) => {
        if (clients.isLoading || clients.error) return;
        setSelectedClient(client);
        salesQuery.reset();
    };
    const tables = {
        vendedores: {
            result: sellers,
            query: sellersQuery,
            columns: SELLER_COLUMNS,
            title: 'Vendedores',
            onRowClick: canClients ? handleSellerClick : undefined,
            placeholder: 'Buscar por vendedor...',
        },
        clientes: {
            result: clients,
            query: clientsQuery,
            columns: CLIENT_COLUMNS,
            title: 'Clientes',
            onRowClick: handleClientClick,
            placeholder: 'Buscar por cliente o vendedor...',
        },
        documentos: {
            result: sales,
            query: salesQuery,
            columns: SALES_COLUMNS,
            title: `Documentos de ${selectedClient?.cliente || ''}`,
            onRowClick: (sale) => setSelectedInvoiceId(sale.idFactura),
            placeholder: 'Buscar por documento o vendedor...',
        },
    };
    const handlePrint = async (type, config) => {
        setPrintError('');
        try {
            const table = tables[type];
            const filters = {
                ...params,
                ...table.query.params,
                sellerId: type === 'clientes' ? sellerId : type === 'documentos' ? clientSellerId : undefined,
                clientId: type === 'documentos' ? clientId : undefined,
            };
            const result = await fetchProviderExport(
                provider.IdProveedor,
                type === 'vendedores' ? 'sellers' : type === 'clientes' ? 'clients' : 'sales',
                { ...filters, search: config.search ?? filters.search },
            );
            if (
                config.currency === 'BsS' &&
                !(Number(currencyRate?.Cambio) > 0 && Number.isFinite(Number(currencyRate?.Cambio)))
            )
                throw new Error('Tasa no disponible.');
            const columns = (config.columns || []).filter((column) =>
                result.columns.some((server) => server.key === column.accessor),
            );
            if (!columns.length) throw new Error('Selecciona columnas autorizadas.');
            const rows = sortRows(result.data || [], config?.sortBy);
            const moneyKeys = ['totalVentas', 'monto', 'utilidad'];
            const formatValue = (key, value) => {
                if (moneyKeys.includes(key))
                    return value == null ? 'No disponible' : formatMoney(value, config?.currency, currencyRate?.Cambio);
                if (key === 'fecha') return DateTime.fromISO(value).toFormat('dd/MM/yyyy');
                if (['cantidad', 'numVentas', 'numClientes'].includes(key)) return Number(value ?? 0).toLocaleString();
                return String(value ?? '');
            };
            const seller = type === 'documentos' ? selectedClient : selectedSeller;
            pdfMake
                .createPdf({
                    content: [
                        { text: 'ALIMENTOS DM MARKET, C.A.', style: 'header' },
                        { text: 'R.I.F.: J-41270446-0', style: 'header' },
                        { text: `Proveedor: ${provider.Empresa}`, style: 'subtitle' },
                        { text: `Producto: ${product.producto}`, style: 'subtitle' },
                        { text: table.title, style: 'subtitle' },
                        ...(type !== 'vendedores' && seller
                            ? [{ text: `Vendedor: ${seller.vendedor}`, style: 'subtitle' }]
                            : []),
                        {
                            text: `Período: ${DateTime.fromISO(dateRange.from).toFormat('dd/MM/yyyy')} — ${DateTime.fromISO(dateRange.to).toFormat('dd/MM/yyyy')} · ${showNoe ? 'Notas de entrega' : 'Facturas'}`,
                            style: 'subtitle',
                        },
                        ...(table.query.search ? [{ text: `Búsqueda: ${table.query.search}`, style: 'subtitle' }] : []),
                        {
                            margin: [0, 12, 0, 0],
                            fontSize: 8,
                            table: {
                                headerRows: 1,
                                widths: columns.map((_, index) => (index === 0 ? '*' : 'auto')),
                                body: [
                                    columns.map((column) => ({ text: column.Header, bold: true })),
                                    ...rows.map((row) =>
                                        columns.map((column) => formatValue(column.accessor, row[column.accessor])),
                                    ),
                                    columns.map((column) => ({
                                        text:
                                            result.totals?.[column.accessor] != null
                                                ? formatValue(column.accessor, result.totals[column.accessor])
                                                : '',
                                        bold: true,
                                    })),
                                ],
                            },
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
    const renderTable = (type) => {
        const table = tables[type];
        const { data, isLoading, error } = table.result;
        return (
            <>
                {error && <Alert variant="danger">No se pudieron cargar los datos. Intenta nuevamente.</Alert>}
                <Table
                    key={
                        type === 'clientes'
                            ? (sellerId ?? 'all')
                            : type === 'documentos'
                              ? `${selectedClient?.clientId}-${selectedClient?.sellerId}`
                              : type
                    }
                    data={error || isLoading ? [] : data?.data || []}
                    columns={table.columns.filter(
                        (column) => column.accessor !== 'utilidad' || Object.hasOwn(data?.totals || {}, 'utilidad'),
                    )}
                    loading={isLoading}
                    summaries={data?.totals}
                    showFooter={!!data?.totals}
                    emptyMessage={`Sin ${type} en este período`}
                    onRowClick={table.onRowClick}
                    search={{ enabled: true, onSearch: table.query.onSearch, placeholder: table.placeholder }}
                    sorting={{ enabled: true, sortBy: table.query.sort, onSort: table.query.onSort }}
                    print={{
                        enabled: data?.exportAllowed === true,
                        onGlobalPrint: (config) => handlePrint(type, config),
                        storageKey: `proveedor-producto-${type}`,
                    }}
                    pagination={{
                        enabled: true,
                        page: table.query.page,
                        totalPages: Math.ceil((data?.total || 0) / LIMIT),
                        totalRows: data?.total ?? 0,
                        pageSize: LIMIT,
                        onPageChange: table.query.setPage,
                    }}
                />
            </>
        );
    };

    return (
        <>
            <Modal show={show} onHide={close} size="xl" scrollable className="provider-dashboard-modal">
                <Modal.Header closeButton>
                    <div>
                        <Modal.Title>{product.producto}</Modal.Title>
                        <div className="provider-modal-subtitle">
                            {provider.Empresa} · {DateTime.fromISO(dateRange.from).toFormat('dd/MM/yyyy')} —{' '}
                            {DateTime.fromISO(dateRange.to).toFormat('dd/MM/yyyy')} ·{' '}
                            {showNoe ? 'Notas de entrega' : 'Facturas'}
                        </div>
                    </div>
                </Modal.Header>
                <Modal.Body>
                    {printError && <Alert variant="danger">{printError}</Alert>}
                    <div className="provider-tab-nav" role="tablist" aria-label="Detalle del producto">
                        {['vendedores', 'clientes']
                            .filter((tab) => (tab === 'vendedores' ? canSellers : canClients))
                            .map((tab) => (
                                <button
                                    key={tab}
                                    type="button"
                                    id={`product-detail-${tab}-tab`}
                                    role="tab"
                                    aria-selected={activeTab === tab}
                                    aria-controls={`product-detail-${tab}-panel`}
                                    className={`provider-tab-button${activeTab === tab ? ' active' : ''}`}
                                    onClick={() => setActiveTab(tab)}
                                >
                                    {tables[tab].title}
                                </button>
                            ))}
                    </div>
                    <div
                        role="tabpanel"
                        id={`product-detail-${activeTab}-panel`}
                        aria-labelledby={`product-detail-${activeTab}-tab`}
                        className="pt-3"
                    >
                        {activeTab === 'vendedores' ? (
                            <>
                                <p>Selecciona un vendedor para consultar los clientes que compraron este producto.</p>
                                {renderTable('vendedores')}
                            </>
                        ) : (
                            <>
                                {selectedSeller && (
                                    <div className="mb-3">
                                        <Button
                                            variant="outline-secondary"
                                            size="sm"
                                            onClick={handleClearSeller}
                                            aria-label="Quitar filtro de vendedor"
                                        >
                                            Vendedor: {selectedSeller.vendedor} ×
                                        </Button>
                                    </div>
                                )}
                                <p>
                                    Selecciona un cliente para ver sus documentos. Cada fila corresponde a un cliente y
                                    vendedor.
                                </p>
                                {renderTable('clientes')}
                                {selectedClient && (
                                    <section className="mt-4">
                                        <div className="d-flex align-items-center justify-content-between gap-3 mb-3">
                                            <div>
                                                <h5 className="mb-0">Documentos de {selectedClient.cliente}</h5>
                                                <small>
                                                    Vendedor: {selectedClient.vendedor}. Importes y unidades de este
                                                    producto únicamente.
                                                </small>
                                            </div>
                                            <Button
                                                variant="outline-secondary"
                                                size="sm"
                                                onClick={() => setSelectedClient(null)}
                                            >
                                                Ocultar documentos
                                            </Button>
                                        </div>
                                        {renderTable('documentos')}
                                    </section>
                                )}
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

export default ProductDetailModal;
