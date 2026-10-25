import { fetchSellersExport } from 'api/sellers';
import { useAuth } from 'auth/context';
import Table from 'components/Table';
import { CurrencyRateContext } from 'context/currency_rate';
import { ShowNoeContext } from 'context/show_noe';
import { useSellersList } from 'hooks/useSellers';
import { DateTime } from 'luxon';
import pdfMake from 'pdfmake/build/pdfmake';
import pdfFonts from 'pdfmake/build/vfs_fonts';
import { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { formatCurrency, formatMoney, formatNumber, formatPercent } from 'utils/format';
import { sortRows } from 'utils/sortRows';

pdfMake.vfs = pdfFonts.pdfMake ? pdfFonts.pdfMake.vfs : pdfMake.vfs;

const LIMIT = 20;

const SELLER_COLUMNS = [
    { Header: 'Vendedor', accessor: 'name' },
    { Header: 'Ventas', accessor: 'sales' },
    { Header: 'Utilidad', accessor: 'profit' },
    { Header: 'Margen', accessor: 'marginPercent' },
    { Header: '# Facturas', accessor: 'invoiceCount' },
    { Header: '# Clientes', accessor: 'clientCount' },
    { Header: 'Ticket Prom.', accessor: 'avgTicket' },
    { Header: 'Última Venta', accessor: 'lastSale' },
    { Header: 'Días Sin Vender', accessor: 'daysInactive' },
    { Header: '% del Total', accessor: 'sharePercent' },
];

const formatDate = (value) =>
    value && DateTime.fromISO(value).isValid ? DateTime.fromISO(value).toFormat('dd/MM/yyyy') : '—';

const SellersTable = ({ onRowSelect, dateRange }) => {
    const { session } = useAuth();
    const analytics = session.permissions.some((grant) => grant.capability === 'sales.read');
    const exporting = session.permissions.some((grant) => grant.capability === 'sellers.export');
    const [printError, setPrintError] = useState('');
    const { showNoe } = useContext(ShowNoeContext);
    const { currencyRate } = useContext(CurrencyRateContext);
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const [sort, setSort] = useState({ sortBy: analytics ? 'sales' : 'name', sortDir: 'desc' });

    const { data: result, isLoading } = useSellersList({
        search,
        from: dateRange?.from,
        to: dateRange?.to,
        page,
        limit: LIMIT,
        sortBy: sort.sortBy,
        sortDir: sort.sortDir,
        showNoe,
    });

    const dataArr = result?.data || [];
    const total = result?.total || 0;

    useEffect(() => setPage(1), [dateRange?.from, dateRange?.to, showNoe]);

    const handleSearch = useCallback((term) => {
        setSearch(term);
        setPage(1);
    }, []);

    const handleSort = useCallback((sortBy) => {
        if (sortBy && sortBy.length > 0) {
            setSort({ sortBy: sortBy[0].id, sortDir: sortBy[0].desc ? 'desc' : 'asc' });
            setPage(1);
        }
    }, []);

    const handlePrintAll = useCallback(
        async (config) => {
            try {
                const allResult = await fetchSellersExport({
                    search: config.search ?? search,
                    from: dateRange?.from,
                    to: dateRange?.to,
                    sortBy: sort.sortBy,
                    sortDir: sort.sortDir,
                    showNoe,
                });
                const currency = config?.currency;
                const rate = currencyRate?.Cambio;
                if (currency === 'BsS' && !(Number(rate) > 0 && Number.isFinite(Number(rate))))
                    throw new Error('Tasa no disponible.');
                const pdfColumns = [
                    { accessor: 'name', Header: 'Vendedor', width: '*', render: (row) => row.name ?? '' },
                    {
                        accessor: 'sales',
                        Header: 'Ventas',
                        width: 'auto',
                        render: (row) => formatMoney(row.sales ?? 0, currency, rate),
                    },
                    {
                        accessor: 'profit',
                        Header: 'Utilidad',
                        width: 'auto',
                        render: (row) => formatMoney(row.profit ?? 0, currency, rate),
                    },
                    {
                        accessor: 'marginPercent',
                        Header: 'Margen',
                        width: 'auto',
                        render: (row) => formatPercent(row.marginPercent ?? 0),
                    },
                    {
                        accessor: 'invoiceCount',
                        Header: '# Facturas',
                        width: 'auto',
                        render: (row) => formatNumber(row.invoiceCount ?? 0),
                    },
                    {
                        accessor: 'clientCount',
                        Header: '# Clientes',
                        width: 'auto',
                        render: (row) => formatNumber(row.clientCount ?? 0),
                    },
                    {
                        accessor: 'avgTicket',
                        Header: 'Ticket Prom.',
                        width: 'auto',
                        render: (row) => formatMoney(row.avgTicket ?? 0, currency, rate),
                    },
                    {
                        accessor: 'lastSale',
                        Header: 'Última Venta',
                        width: 'auto',
                        render: (row) => formatDate(row.lastSale),
                    },
                    {
                        accessor: 'daysInactive',
                        Header: 'Días Sin Vender',
                        width: 'auto',
                        render: (row) => (row.daysInactive == null ? '—' : formatNumber(row.daysInactive)),
                    },
                    {
                        accessor: 'sharePercent',
                        Header: '% del Total',
                        width: 'auto',
                        render: (row) => formatPercent(row.sharePercent ?? 0),
                    },
                ];
                const selectedAccessors = new Set((config?.columns || []).map((column) => column.accessor));
                const selected = pdfColumns.filter(
                    (column) =>
                        selectedAccessors.has(column.accessor) &&
                        allResult.columns.some((server) => server.key === column.accessor),
                );
                if (!selected.length) throw new Error('Selecciona columnas autorizadas.');
                const rows = sortRows(allResult.data || [], config?.sortBy).map((row) =>
                    selected.map((column) => column.render(row)),
                );

                pdfMake
                    .createPdf({
                        content: [
                            { text: 'ALIMENTOS DM MARKET, C.A.', style: 'header' },
                            { text: 'R.I.F.: J-41270446-0', style: 'header' },
                            {
                                text: [
                                    'Desglose de Vendedores',
                                    ...(dateRange
                                        ? [
                                              ` — Período: ${DateTime.fromISO(dateRange.from).toFormat('dd/MM/yyyy')} - ${DateTime.fromISO(dateRange.to).toFormat('dd/MM/yyyy')}`,
                                          ]
                                        : []),
                                    ...(search ? [` — Búsqueda: "${search}"`] : []),
                                    ` · ${showNoe ? 'Notas de entrega' : 'Facturas'}`,
                                ].join(''),
                                style: 'subheader',
                            },
                            {
                                style: 'table',
                                table: {
                                    headerRows: 1,
                                    widths: selected.map((column) => column.width),
                                    body: [selected.map((column) => column.Header), ...rows],
                                },
                            },
                        ],
                        styles: {
                            header: { alignment: 'center', fontSize: 9 },
                            subheader: { alignment: 'center', fontSize: 8, margin: [0, 4, 0, 2], bold: true },
                            table: { margin: [0, 10, 0, 0], fontSize: 7 },
                        },
                        pageMargins: 30,
                        pageSize: 'LETTER',
                        pageOrientation: config?.orientation || 'portrait',
                    })
                    .open();
            } catch (err) {
                if (err.name !== 'AbortError')
                    setPrintError('No se pudo imprimir el reporte autorizado de vendedores.');
            }
        },
        [search, total, sort, showNoe, currencyRate, dateRange],
    );

    const totalPages = Math.ceil(total / LIMIT);

    const summaries = useMemo(
        () =>
            result?.totals
                ? {
                      sales: formatCurrency(result.totals.sales),
                      ...(Object.hasOwn(result.totals, 'profit')
                          ? { profit: formatCurrency(result.totals.profit) }
                          : {}),
                      invoiceCount: formatNumber(result.totals.invoiceCount || 0),
                  }
                : null,
        [result],
    );

    const columns = useMemo(
        () =>
            SELLER_COLUMNS.filter(
                (column) =>
                    column.accessor === 'name' ||
                    (analytics &&
                        (!['profit', 'marginPercent'].includes(column.accessor) ||
                            Object.hasOwn(result?.totals || {}, 'profit'))),
            ).map((column) => {
                switch (column.accessor) {
                    case 'sales':
                    case 'profit':
                    case 'avgTicket':
                        return { ...column, Cell: ({ value }) => (value != null ? formatCurrency(value) : '') };
                    case 'marginPercent':
                    case 'sharePercent':
                        return { ...column, Cell: ({ value }) => (value != null ? formatPercent(value) : '') };
                    case 'invoiceCount':
                    case 'clientCount':
                        return { ...column, Cell: ({ value }) => formatNumber(value || 0) };
                    case 'lastSale':
                        return { ...column, Cell: ({ value }) => formatDate(value) };
                    case 'daysInactive':
                        return { ...column, Cell: ({ value }) => (value == null ? '—' : formatNumber(value)) };
                    default:
                        return column;
                }
            }),
        [analytics, result],
    );

    return (
        <section className="providers-table-panel">
            {printError && <p role="alert">{printError}</p>}
            <div className="providers-table__body">
                <Table
                    data={dataArr}
                    columns={columns}
                    loading={isLoading}
                    onRowClick={onRowSelect}
                    emptyMessage="Sin vendedores"
                    showFooter={!!summaries}
                    summaries={summaries}
                    maxHeight="min(620px, calc(100vh - 251px))"
                    sorting={{
                        enabled: true,
                        sortBy: [{ id: sort.sortBy, desc: sort.sortDir === 'desc' }],
                        onSort: handleSort,
                    }}
                    search={{
                        enabled: true,
                        placeholder: 'Buscar por vendedor...',
                        onSearch: handleSearch,
                    }}
                    pagination={{
                        enabled: true,
                        page,
                        totalPages,
                        totalRows: total,
                        pageSize: LIMIT,
                        onPageChange: setPage,
                    }}
                    print={{
                        enabled: exporting && result?.exportAllowed === true,
                        onGlobalPrint: handlePrintAll,
                        storageKey: 'vendedores',
                    }}
                />
            </div>
        </section>
    );
};

export default SellersTable;
