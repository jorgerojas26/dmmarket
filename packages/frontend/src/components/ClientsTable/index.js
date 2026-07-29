import { fetchClientsList } from 'api/clients';
import Table from 'components/Table';
import { ShowNoeContext } from 'context/show_noe';
import { useClientsList } from 'hooks/useClients';
import pdfMake from 'pdfmake/build/pdfmake';
import pdfFonts from 'pdfmake/build/vfs_fonts';
import { useCallback, useContext, useMemo, useState } from 'react';
import { formatCurrency, formatNumber } from 'utils/format';

pdfMake.vfs = pdfFonts.pdfMake.vfs;

const LIMIT = 20;

const ClientsTable = ({ onRowSelect }) => {
    const { showNoe } = useContext(ShowNoeContext);
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);

    const { data: result, isLoading } = useClientsList({ search, page, limit: LIMIT, showNoe });

    const dataArr = result?.data || [];
    const total = result?.total || 0;

    const handleSearch = useCallback((term) => {
        setSearch(term);
        setPage(1);
    }, []);

    const handlePrintAll = useCallback(async () => {
        try {
            const allResult = await fetchClientsList({
                search,
                page: 1,
                limit: total || 9999,
                showNoe,
            });
            const rows = (allResult.data || []).map((c) => [
                String(c.IdCliente ?? ''),
                c.Empresa ?? '',
                formatCurrency(c.total_ventas ?? 0),
                formatCurrency(c.utilidad ?? 0),
                formatNumber(c.num_ventas ?? 0),
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
                        text: search ? `Listado de Clientes — Búsqueda: "${search}"` : 'Listado de Clientes',
                        style: 'subheader',
                    },
                    {
                        style: 'table',
                        table: {
                            widths: ['auto', '*', 'auto', 'auto', 'auto'],
                            body: [['ID', 'Empresa', 'Total Ventas', 'Utilidad', '# Ventas'], ...rows],
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
            console.error('Failed to print clients list:', err);
        }
    }, [search, total, showNoe]);

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
            <div className="dashboard-panel-header">
                <h3>Clientes</h3>
            </div>
            <div className="dashboard-panel-body">
                <Table
                    data={dataArr}
                    columns={columns}
                    loading={isLoading}
                    onRowClick={onRowSelect}
                    emptyMessage="Sin datos"
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
