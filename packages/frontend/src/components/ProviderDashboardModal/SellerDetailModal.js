import { fetchProviderClients, fetchProviderSales } from 'api/providers';
import Table from 'components/Table';
import { CurrencyRateContext } from 'context/currency_rate';
import { useProviderClients, useProviderSales } from 'hooks/useProviders';
import { DateTime } from 'luxon';
import { useCallback, useContext, useState } from 'react';
import pdfMake from 'pdfmake/build/pdfmake';
import pdfFonts from 'pdfmake/build/vfs_fonts';
import { Alert, Button, Modal } from 'react-bootstrap';
import { formatCurrency, formatMoney } from 'utils/format';
import { sortRows } from 'utils/sortRows';

pdfMake.vfs = pdfFonts.pdfMake ? pdfFonts.pdfMake.vfs : pdfMake.vfs;

const LIMIT = 20;
const DEFAULT_CLIENT_SORT = [{ id: 'totalVentas', desc: true }];
const DEFAULT_SALES_SORT = [{ id: 'fecha', desc: true }];
const moneyColumn = (Header, accessor) => ({
    Header,
    accessor,
    Cell: ({ value }) => formatCurrency(value),
    Footer: ({ summary }) => formatCurrency(summary ?? 0),
});
const CLIENT_COLUMNS = [
    { Header: 'Cliente', accessor: 'cliente' },
    moneyColumn('Total Ventas', 'totalVentas'),
    moneyColumn('Utilidad', 'utilidad'),
    { Header: 'Unidades', accessor: 'cantidad', Cell: ({ value }) => Number(value).toLocaleString() },
    { Header: '# Ventas', accessor: 'numVentas' },
];
const SALES_COLUMNS = [
    { Header: 'Documento', accessor: 'idFactura' },
    { Header: 'Fecha', accessor: 'fecha', Cell: ({ value }) => DateTime.fromISO(value).toFormat('dd/MM/yyyy') },
    moneyColumn('Total Ventas', 'monto'),
    moneyColumn('Utilidad', 'utilidad'),
];

const SellerDetailModal = ({ show, onClose, seller, provider, dateRange, showNoe }) => {
    const { currencyRate } = useContext(CurrencyRateContext);
    const [printError, setPrintError] = useState('');
    const [clientPage, setClientPage] = useState(1);
    const [clientSearch, setClientSearch] = useState('');
    const [clientSort, setClientSort] = useState(DEFAULT_CLIENT_SORT);
    const [selectedClient, setSelectedClient] = useState(null);
    const [salesPage, setSalesPage] = useState(1);
    const [salesSort, setSalesSort] = useState(DEFAULT_SALES_SORT);
    const params = { ...dateRange, showNoe, sellerId: seller.sellerId, limit: LIMIT };
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
        show,
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

    const handlePrint = async (type, config) => {
        setPrintError('');
        try {
            const isClients = type === 'clients';
            const fetchRows = isClients ? fetchProviderClients : fetchProviderSales;
            const result = await fetchRows(provider.IdProveedor, {
                ...params,
                page: 1,
                limit: (isClients ? clients?.total : sales?.total) || LIMIT,
                search: isClients ? clientSearch || undefined : undefined,
                clientId: isClients ? undefined : selectedClient?.clientId,
                sortBy: (isClients ? clientSort : salesSort)[0]?.id,
                sortDir: (isClients ? clientSort : salesSort)[0]?.desc ? 'desc' : 'asc',
            });
            const rows = sortRows(result.data || [], config?.sortBy);
            const columns = config?.columns?.length ? config.columns : isClients ? CLIENT_COLUMNS : SALES_COLUMNS;
            const moneyKeys = ['totalVentas', 'monto', 'utilidad'];
            const formatValue = (key, value) => {
                if (moneyKeys.includes(key)) return formatMoney(value, config?.currency, currencyRate?.Cambio);
                if (key === 'fecha') return DateTime.fromISO(value).toFormat('dd/MM/yyyy');
                if (key === 'cantidad' || key === 'numVentas') return Number(value).toLocaleString();
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
                        {
                            text: isClients ? 'Clientes del vendedor' : `Ventas de ${selectedClient.cliente}`,
                            style: 'subtitle',
                        },
                        {
                            text: `Período: ${DateTime.fromISO(dateRange.from).toFormat('dd/MM/yyyy')} — ${DateTime.fromISO(dateRange.to).toFormat('dd/MM/yyyy')} · ${showNoe ? 'Notas de entrega' : 'Facturas'}`,
                            style: 'subtitle',
                        },
                        ...(isClients && clientSearch
                            ? [{ text: `Búsqueda: ${clientSearch}`, style: 'subtitle' }]
                            : []),
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
        } catch (error) {
            console.error('Failed to print seller detail:', error);
            setPrintError('No se pudo generar la impresión. Intenta nuevamente.');
        }
    };

    return (
        <Modal show={show} onHide={onClose} size="xl" scrollable className="provider-dashboard-modal">
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
                {clientsError && (
                    <Alert variant="danger">No se pudieron cargar los clientes. Intenta nuevamente.</Alert>
                )}
                <h5>Clientes</h5>
                <p>Selecciona un cliente para consultar sus ventas con este vendedor.</p>
                <Table
                    columns={CLIENT_COLUMNS}
                    data={clients?.data || []}
                    loading={clientsLoading}
                    showFooter={!!clients?.totals}
                    summaries={clients?.totals}
                    emptyMessage={clientsError ? 'Error al cargar clientes' : 'Sin clientes en este período'}
                    onRowClick={handleClientClick}
                    print={{
                        enabled: true,
                        onGlobalPrint: (config) => handlePrint('clients', config),
                        storageKey: 'proveedor-vendedor-clientes',
                    }}
                    pagination={pagination(clients, clientPage, setClientPage)}
                    search={{ enabled: true, onSearch: handleClientSearch, placeholder: 'Buscar por cliente...' }}
                    sorting={{ enabled: true, sortBy: clientSort, onSort: handleClientSort }}
                />
                {selectedClient && (
                    <section className="mt-4" key={selectedClient.clientId}>
                        <div className="d-flex align-items-center justify-content-between mb-3">
                            <h5 className="mb-0">Ventas de {selectedClient.cliente}</h5>
                            <Button variant="outline-secondary" size="sm" onClick={() => setSelectedClient(null)}>
                                Ocultar ventas
                            </Button>
                        </div>
                        {salesError && (
                            <Alert variant="danger">No se pudieron cargar las ventas. Intenta nuevamente.</Alert>
                        )}
                        <Table
                            print={{
                                enabled: true,
                                onGlobalPrint: (config) => handlePrint('sales', config),
                                storageKey: 'proveedor-vendedor-cliente-ventas',
                            }}
                            columns={SALES_COLUMNS}
                            data={sales?.data || []}
                            loading={salesLoading}
                            showFooter={!!sales?.totals}
                            summaries={sales?.totals}
                            emptyMessage={salesError ? 'Error al cargar ventas' : 'Sin ventas en este período'}
                            pagination={pagination(sales, salesPage, setSalesPage)}
                            sorting={{ enabled: true, sortBy: salesSort, onSort: handleSalesSort }}
                        />
                    </section>
                )}
            </Modal.Body>
        </Modal>
    );
};

export default SellerDetailModal;
