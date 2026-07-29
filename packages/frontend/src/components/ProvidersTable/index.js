import { fetchProvidersList } from 'api/providers';
import Table from 'components/Table';
import { ShowNoeContext } from 'context/show_noe';
import { useProvidersList } from 'hooks/useProviders';
import pdfMake from 'pdfmake/build/pdfmake';
import pdfFonts from 'pdfmake/build/vfs_fonts';
import { useCallback, useContext, useMemo, useState } from 'react';
import { formatCurrency, formatNumber } from 'utils/format';
import './styles.css';

pdfMake.vfs = pdfFonts.pdfMake.vfs;

const LIMIT = 20;

const ProvidersTable = ({ onRowSelect }) => {
    const { showNoe } = useContext(ShowNoeContext);
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const [sort, setSort] = useState({ sortBy: 'total_ventas', sortDir: 'desc' });

    const { data: result, isLoading } = useProvidersList({
        search,
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

    const handlePrintAll = useCallback(async () => {
        try {
            const allResult = await fetchProvidersList({
                search,
                page: 1,
                limit: total || 9999,
                sortBy: sort.sortBy,
                sortDir: sort.sortDir,
                showNoe,
            });
            const rows = (allResult.data || []).map((p) => [
                String(p.IdProveedor ?? ''),
                p.Empresa ?? '',
                formatCurrency(p.total_compras ?? 0),
                formatNumber(p.num_compras ?? 0),
                formatCurrency(p.total_ventas ?? 0),
                formatNumber(p.num_ventas ?? 0),
            ]);

            const docDef = {
                content: [
                    { text: 'ALIMENTOS DM MARKET, C.A.', style: 'header' },
                    {
                        text: 'CALLE ILUSTRES PROCERES LOCAL NRO S/N SECTOR CENTRO ALTAGRACIA DE ORITUCO DE ORITUCO ZONA POSTAL 2320.',
                        style: 'header',
                    },
                    { text: 'R.I.F.: J-41270446-0', style: 'header' },
                    {
                        text: search ? `Listado de Proveedores — Búsqueda: "${search}"` : 'Listado de Proveedores',
                        style: 'subheader',
                    },
                    {
                        style: 'table',
                        table: {
                            widths: ['auto', '*', 'auto', 'auto', 'auto', 'auto'],
                            body: [
                                ['ID', 'Empresa', 'Total Compras', '# Compras', 'Total Ventas', '# Ventas'],
                                ...rows,
                            ],
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
                pageOrientation: 'landscape',
            };

            pdfMake.createPdf(docDef).open();
        } catch (err) {
            console.error('Failed to print providers list:', err);
        }
    }, [search, total, sort, showNoe]);

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
            <header className="providers-table__header">
                <h3>Proveedores</h3>
            </header>
            <div className="providers-table__body">
                <Table
                    data={dataArr}
                    columns={columns}
                    loading={isLoading}
                    onRowClick={onRowSelect}
                    className="providers-table"
                    emptyMessage="Sin datos"
                    maxHeight={620}
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
                />
            </div>
        </section>
    );
};

export default ProvidersTable;
