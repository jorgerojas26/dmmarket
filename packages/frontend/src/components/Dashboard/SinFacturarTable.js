import { fetchClientExport } from 'api/clients';
import { useAuth } from 'auth/context';
import Table from 'components/Table';
import { CurrencyRateContext } from 'context/currency_rate';
import { ShowNoeContext } from 'context/show_noe';
import { useClientsSinFacturar } from 'hooks/useClients';
import { DateTime } from 'luxon';
import pdfMake from 'pdfmake/build/pdfmake';
import pdfFonts from 'pdfmake/build/vfs_fonts';
import { useCallback, useContext, useMemo, useState } from 'react';
import { formatCurrency, formatMoney, formatNumber } from 'utils/format';
import { sortRows } from 'utils/sortRows';

pdfMake.vfs = pdfFonts.pdfMake.vfs;

const LIMIT = 50;

/**
 * Server-side table of clients without any invoice in [from, to].
 * Search, sort and pagination hit /api/clients/sin-facturar; global print
 * fetches all matching rows and exports them via pdfMake.
 */
const SinFacturarTable = ({ from, to, ruta, onRowSelect }) => {
    const { can } = useAuth();
    const [printError, setPrintError] = useState('');
    const { showNoe } = useContext(ShowNoeContext);
    const { currencyRate } = useContext(CurrencyRateContext);
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const [sort, setSort] = useState({ sortBy: 'revenue_historico', sortDir: 'desc' });

    const { data: result, isLoading } = useClientsSinFacturar({
        from,
        to,
        search,
        ruta,
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
                    kind: 'inactive',
                    from,
                    to,
                    search: config.search ?? search,
                    ruta,
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
                    { accessor: 'IdCliente', Header: 'ID', width: 'auto', render: (c) => String(c.IdCliente ?? '') },
                    { accessor: 'Empresa', Header: 'Empresa', width: '*', render: (c) => c.Empresa ?? '' },
                    { accessor: 'ruta', Header: 'Ruta', width: 'auto', render: (c) => c.ruta ?? '' },
                    {
                        accessor: 'last_factura',
                        Header: 'Última Factura',
                        width: 'auto',
                        render: (c) => (c.last_factura ? DateTime.fromISO(c.last_factura).toFormat('dd/MM/yyyy') : '—'),
                    },
                    {
                        accessor: 'dias_inactivo',
                        Header: 'Días Inactivo',
                        width: 'auto',
                        render: (c) => (c.dias_inactivo != null ? formatNumber(c.dias_inactivo) : '—'),
                    },
                    {
                        accessor: 'revenue_historico',
                        Header: 'Revenue Histórico',
                        width: 'auto',
                        render: (c) => formatMoney(c.revenue_historico ?? 0, currency, rate),
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

                const subtitleParts = [`Periodo: ${from} a ${to}`];
                if (search) subtitleParts.push(`Búsqueda: "${search}"`);
                if (ruta) subtitleParts.push(`Ruta: "${ruta}"`);
                const subtitle = `Clientes Sin Facturar — ${subtitleParts.join(' · ')}`;

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
                if (err.name !== 'AbortError') setPrintError('No se pudo imprimir el reporte autorizado.');
            }
        },
        [from, to, search, ruta, total, sort, showNoe, currencyRate],
    );

    const totalPages = Math.ceil(total / LIMIT);

    const columns = useMemo(
        () => [
            { Header: 'IdCliente', accessor: 'IdCliente' },
            { Header: 'Empresa', accessor: 'Empresa' },
            {
                Header: 'Ruta',
                accessor: 'ruta',
                Cell: ({ value }) => value || '—',
            },
            {
                Header: 'Última Factura',
                accessor: 'last_factura',
                Cell: ({ value }) => (value ? DateTime.fromISO(value).toFormat('dd/MM/yyyy') : '—'),
            },
            {
                Header: 'Días Inactivo',
                accessor: 'dias_inactivo',
                Cell: ({ value }) => (value != null ? formatNumber(value) : '—'),
            },
            {
                Header: 'Revenue Histórico',
                accessor: 'revenue_historico',
                Cell: ({ value }) => formatCurrency(value),
            },
        ],
        [],
    );

    return (
        <div className="dashboard-panel-body">
            {printError && <p role="alert">{printError}</p>}
            <Table
                data={dataArr}
                columns={columns}
                loading={isLoading}
                onRowClick={onRowSelect}
                emptyMessage="Sin datos"
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
                    storageKey: 'sin-facturar',
                }}
                maxHeight={500}
            />
        </div>
    );
};

export default SinFacturarTable;
