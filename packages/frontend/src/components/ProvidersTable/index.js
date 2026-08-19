import { fetchProvidersList } from 'api/providers';
import Table from 'components/Table';
import { CurrencyRateContext } from 'context/currency_rate';
import { ShowNoeContext } from 'context/show_noe';
import { useProvidersList } from 'hooks/useProviders';
import { DateTime } from 'luxon';
import pdfMake from 'pdfmake/build/pdfmake';
import pdfFonts from 'pdfmake/build/vfs_fonts';
import { useCallback, useContext, useMemo, useState } from 'react';
import { formatMoney, formatNumber } from 'utils/format';
import { sortRows } from 'utils/sortRows';
import './styles.css';

pdfMake.vfs = pdfFonts.pdfMake.vfs;

const LIMIT = 20;

const ProvidersTable = ({ onRowSelect, dateRange }) => {
    const { showNoe } = useContext(ShowNoeContext);
    const { currencyRate } = useContext(CurrencyRateContext);
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const [sort, setSort] = useState({ sortBy: 'total_ventas', sortDir: 'desc' });

    const { data: result, isLoading } = useProvidersList({
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
                const allResult = await fetchProvidersList({
                    search,
                    from: dateRange?.from,
                    to: dateRange?.to,
                    page: 1,
                    limit: total || 9999,
                    sortBy: sort.sortBy,
                    sortDir: sort.sortDir,
                    showNoe,
                });
                // Column metadata for the PDF, keyed by accessor (order defines layout).
                const currency = config?.currency;
                const rate = currencyRate?.Cambio;
                const pdfColumns = [
                    {
                        accessor: 'IdProveedor',
                        Header: 'ID',
                        width: 'auto',
                        render: (p) => String(p.IdProveedor ?? ''),
                    },
                    { accessor: 'Empresa', Header: 'Empresa', width: '*', render: (p) => p.Empresa ?? '' },
                    {
                        accessor: 'total_compras',
                        Header: 'Total Compras',
                        width: 'auto',
                        render: (p) => formatMoney(p.total_compras ?? 0, currency, rate),
                    },
                    {
                        accessor: 'num_compras',
                        Header: '# Compras',
                        width: 'auto',
                        render: (p) => formatNumber(p.num_compras ?? 0),
                    },
                    {
                        accessor: 'total_ventas',
                        Header: 'Total Ventas',
                        width: 'auto',
                        render: (p) => formatMoney(p.total_ventas ?? 0, currency, rate),
                    },
                    {
                        accessor: 'num_ventas',
                        Header: '# Ventas',
                        width: 'auto',
                        render: (p) => formatNumber(p.num_ventas ?? 0),
                    },
                ];
                const selectedAccessors = new Set((config?.columns || []).map((col) => col.accessor));
                const selected =
                    selectedAccessors.size > 0
                        ? pdfColumns.filter((col) => selectedAccessors.has(col.accessor))
                        : pdfColumns;
                const rows = sortRows(allResult.data || [], config?.sortBy).map((p) =>
                    selected.map((col) => col.render(p)),
                );

                const docDef = {
                    content: [
                        { text: 'ALIMENTOS DM MARKET, C.A.', style: 'header' },
                        {
                            text: 'CALLE ILUSTRES PROCERES LOCAL NRO S/N SECTOR CENTRO ALTAGRACIA DE ORITUCO DE ORITUCO ZONA POSTAL 2320.',
                            style: 'header',
                        },
                        { text: 'R.I.F.: J-41270446-0', style: 'header' },
                        {
                            text: [
                                'Listado de Proveedores',
                                ...(dateRange
                                    ? [
                                          ` — Período: ${DateTime.fromISO(dateRange.from).toFormat('dd/MM/yyyy')} - ${DateTime.fromISO(dateRange.to).toFormat('dd/MM/yyyy')}`,
                                      ]
                                    : []),
                                ...(search ? [` — Búsqueda: "${search}"`] : []),
                            ].join(''),
                            style: 'subheader',
                        },
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
                console.error('Failed to print providers list:', err);
            }
        },
        [search, total, sort, showNoe, currencyRate, dateRange],
    );

    const totalPages = Math.ceil(total / LIMIT);

    const columns = useMemo(
        () => [
            { Header: 'IdProveedor', accessor: 'IdProveedor' },
            { Header: 'Empresa', accessor: 'Empresa' },
            { Header: 'Total Compras', accessor: 'total_compras', Cell: ({ value }) => `$${Number(value).toFixed(2)}` },
            { Header: '# Compras', accessor: 'num_compras' },
            { Header: 'Total Ventas', accessor: 'total_ventas', Cell: ({ value }) => `$${Number(value).toFixed(2)}` },
            { Header: '# Ventas', accessor: 'num_ventas' },
        ],
        [],
    );

    return (
        <section className="providers-table-panel">
            <div className="providers-table__body">
                <Table
                    data={dataArr}
                    columns={columns}
                    loading={isLoading}
                    onRowClick={onRowSelect}
                    className="providers-table"
                    emptyMessage="Sin datos"
                    // En laptops la tabla se comprime a calc(100vh - 251px) (heading
                    // + toolbar + paginación + navbar + padding) para no sacar
                    // scrollbar del contenedor padre; en pantallas altas conserva
                    // el tope fijo de 620px.
                    maxHeight="min(620px, calc(100vh - 251px))"
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
                        enabled: true,
                        onGlobalPrint: handlePrintAll,
                        globalPrintLabel: 'Imprimir',
                        storageKey: 'proveedores',
                    }}
                />
            </div>
        </section>
    );
};

export default ProvidersTable;
