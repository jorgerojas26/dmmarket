import { fetchClientExport } from 'api/clients';
import { useAuth } from 'auth/context';
import Table from 'components/Table';
import { CurrencyRateContext } from 'context/currency_rate';
import { ShowNoeContext } from 'context/show_noe';
import { useClientsList } from 'hooks/useClients';
import { DateTime } from 'luxon';
import pdfMake from 'pdfmake/build/pdfmake';
import pdfFonts from 'pdfmake/build/vfs_fonts';
import { useCallback, useContext, useMemo, useState } from 'react';
import { formatMoney, formatNumber, formatReportId } from 'utils/format';
import { sortRows } from 'utils/sortRows';

pdfMake.vfs = pdfFonts.pdfMake.vfs;

const LIMIT = 20;

const ClientsTable = ({ onRowSelect, ruta, dateRange }) => {
    const { session, can } = useAuth();
    const analytics = session.permissions.some((grant) => grant.capability === 'sales.read');
    const [printError, setPrintError] = useState('');
    const { showNoe } = useContext(ShowNoeContext);
    const { currencyRate } = useContext(CurrencyRateContext);
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const [sort, setSort] = useState({ sortBy: analytics ? 'total_ventas' : 'Empresa', sortDir: 'desc' });

    const { data: result, isLoading } = useClientsList({
        search,
        ruta,
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
                const allResult = await fetchClientExport({
                    search: config.search ?? search,
                    ruta,
                    from: dateRange?.from,
                    to: dateRange?.to,
                    sortBy: sort.sortBy,
                    sortDir: sort.sortDir,
                    showNoe,
                });
                // Column metadata for the PDF, keyed by accessor (order defines layout).
                const currency = config?.currency;
                const rate = currencyRate?.Cambio;
                if (currency === 'BsS' && !(Number(rate) > 0 && Number.isFinite(Number(rate))))
                    throw new Error('Tasa no disponible.');
                const pdfColumns = [
                    {
                        accessor: 'IdCliente',
                        Header: 'ID',
                        width: 'auto',
                        render: (c) => String(formatReportId(c.IdCliente) ?? ''),
                    },
                    { accessor: 'Empresa', Header: 'Empresa', width: '*', render: (c) => c.Empresa ?? '' },
                    {
                        accessor: 'total_ventas',
                        Header: 'Total Ventas',
                        width: 'auto',
                        render: (c) => formatMoney(c.total_ventas ?? 0, currency, rate),
                    },
                    {
                        accessor: 'utilidad',
                        Header: 'Utilidad',
                        width: 'auto',
                        render: (c) => formatMoney(c.utilidad ?? 0, currency, rate),
                    },
                    {
                        accessor: 'num_ventas',
                        Header: '# Ventas',
                        width: 'auto',
                        render: (c) => formatNumber(c.num_ventas ?? 0),
                    },
                ];
                const serverColumns = new Set(allResult.columns.map((column) => column.key));
                const selectedAccessors = new Set((config?.columns || []).map((col) => col.accessor));
                const selected = pdfColumns.filter(
                    (col) => selectedAccessors.has(col.accessor) && serverColumns.has(col.accessor),
                );
                if (!selected.length) throw new Error('Selecciona columnas autorizadas.');
                const rows = sortRows(allResult.data || [], config?.sortBy).map((c) =>
                    selected.map((col) => col.render(c)),
                );

                const subtitleParts = [];
                if (dateRange) {
                    subtitleParts.push(
                        `Período: ${DateTime.fromISO(dateRange.from).toFormat('dd/MM/yyyy')} - ${DateTime.fromISO(dateRange.to).toFormat('dd/MM/yyyy')}`,
                    );
                }
                if (search) subtitleParts.push(`Búsqueda: "${search}"`);
                if (ruta) subtitleParts.push(`Ruta: "${ruta}"`);
                const subtitle =
                    subtitleParts.length > 0
                        ? `Listado de Clientes — ${subtitleParts.join(' · ')}`
                        : 'Listado de Clientes';

                const docDef = {
                    content: [
                        { text: 'ALIMENTOS DM MARKET, C.A.', style: 'header' },
                        {
                            text: 'CALLE ILUSTRES PROCERES LOCAL NRO S/N SECTOR CENTRO ALTAGRACIA DE ORITUCO DE ORITUCO ZONA POSTAL 2320.',
                            style: 'header',
                        },
                        { text: 'R.I.F.: J-41270446-0', style: 'header' },
                        { text: subtitle, style: 'subheader' },
                        {
                            style: 'table',
                            table: {
                                widths: selected.map((col) => col.width),
                                body: [selected.map((col) => col.Header), ...rows],
                            },
                        },
                    ],
                    styles: {
                        header: { alignment: 'center', fontSize: 9 },
                        subheader: {
                            alignment: 'center',
                            fontSize: 8,
                            margin: [0, 4, 0, 2],
                            bold: true,
                        },
                        table: { margin: [0, 10, 0, 0], fontSize: 7 },
                    },
                    pageMargins: 30,
                    pageSize: 'LETTER',
                    pageOrientation: config?.orientation || 'portrait',
                };

                pdfMake.createPdf(docDef).open();
            } catch (err) {
                if (err.name !== 'AbortError') setPrintError('No se pudo imprimir el reporte autorizado de clientes.');
            }
        },
        [search, ruta, total, sort, showNoe, currencyRate, dateRange],
    );

    const totalPages = Math.ceil(total / LIMIT);
    const summaries = useMemo(
        () => (result?.totals ? { utilidad: formatMoney(result.totals.utilidad ?? 0) } : null),
        [result],
    );

    const columns = useMemo(
        () => [
            { Header: 'IdCliente', accessor: 'IdCliente', Cell: ({ value }) => formatReportId(value) },
            { Header: 'Empresa', accessor: 'Empresa' },
            ...(analytics
                ? [
                      {
                          Header: 'Total Ventas',
                          accessor: 'total_ventas',
                          Cell: ({ value }) => `$${Number(value).toFixed(2)}`,
                      },
                  ]
                : []),
            ...(Object.hasOwn(result?.totals || {}, 'utilidad')
                ? [
                      {
                          Header: 'Utilidad',
                          accessor: 'utilidad',
                          Cell: ({ value }) => `$${Number(value).toFixed(2)}`,
                      },
                  ]
                : []),
            ...(analytics ? [{ Header: '# Ventas', accessor: 'num_ventas' }] : []),
        ],
        [analytics, result?.totals],
    );

    return (
        <div className="dashboard-panel h-100 d-flex flex-column">
            <div className="dashboard-panel-body flex-grow-1" style={{ minHeight: 0 }}>
                {printError && <p role="alert">{printError}</p>}
                <Table
                    data={dataArr}
                    columns={columns}
                    loading={isLoading}
                    showFooter={!!summaries}
                    summaries={summaries}
                    onRowClick={analytics ? onRowSelect : undefined}
                    emptyMessage="Sin datos"
                    fillHeight
                    sorting={{
                        enabled: true,
                        sortBy: [{ id: sort.sortBy, desc: sort.sortDir === 'desc' }],
                        onSort: handleSort,
                    }}
                    search={{
                        enabled: true,
                        placeholder: 'Buscar por empresa...',
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
                        enabled: can('clients.export') && Boolean(result),
                        onGlobalPrint: handlePrintAll,
                        storageKey: 'clientes',
                    }}
                />
            </div>
        </div>
    );
};

export default ClientsTable;
