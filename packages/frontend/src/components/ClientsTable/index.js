import { fetchClientsList } from 'api/clients';
import Table from 'components/Table';
import { CurrencyRateContext } from 'context/currency_rate';
import { ShowNoeContext } from 'context/show_noe';
import { useClientsList } from 'hooks/useClients';
import pdfMake from 'pdfmake/build/pdfmake';
import pdfFonts from 'pdfmake/build/vfs_fonts';
import { useCallback, useContext, useMemo, useState } from 'react';
import { formatMoney, formatNumber } from 'utils/format';
import { sortRows } from 'utils/sortRows';

pdfMake.vfs = pdfFonts.pdfMake.vfs;

const LIMIT = 20;

const ClientsTable = ({ onRowSelect, ruta }) => {
    const { showNoe } = useContext(ShowNoeContext);
    const { currencyRate } = useContext(CurrencyRateContext);
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const [sort, setSort] = useState({ sortBy: 'total_ventas', sortDir: 'desc' });

    const { data: result, isLoading } = useClientsList({
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
                const allResult = await fetchClientsList({
                    search,
                    ruta,
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
                    { accessor: 'IdCliente', Header: 'ID', width: 'auto', render: (c) => String(c.IdCliente ?? '') },
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
                const selectedAccessors = new Set((config?.columns || []).map((col) => col.accessor));
                const selected =
                    selectedAccessors.size > 0
                        ? pdfColumns.filter((col) => selectedAccessors.has(col.accessor))
                        : pdfColumns;
                const rows = sortRows(allResult.data || [], config?.sortBy).map((c) =>
                    selected.map((col) => col.render(c)),
                );

                const subtitleParts = [];
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
                console.error('Failed to print clients list:', err);
            }
        },
        [search, ruta, total, sort, showNoe, currencyRate],
    );

    const totalPages = Math.ceil(total / LIMIT);

    const columns = useMemo(
        () => [
            { Header: 'IdCliente', accessor: 'IdCliente' },
            { Header: 'Empresa', accessor: 'Empresa' },
            {
                Header: 'Total Ventas',
                accessor: 'total_ventas',
                Cell: ({ value }) => `$${Number(value).toFixed(2)}`,
            },
            {
                Header: 'Utilidad',
                accessor: 'utilidad',
                Cell: ({ value }) => `$${Number(value).toFixed(2)}`,
            },
            { Header: '# Ventas', accessor: 'num_ventas' },
        ],
        [],
    );

    return (
        <div className="dashboard-panel">
            <div className="dashboard-panel-body">
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
                        enabled: true,
                        onGlobalPrint: handlePrintAll,
                        globalPrintLabel: 'Imprimir',
                    }}
                    maxHeight={700}
                />
            </div>
        </div>
    );
};

export default ClientsTable;
