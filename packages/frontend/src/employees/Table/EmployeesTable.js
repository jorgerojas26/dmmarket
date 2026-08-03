import Table from 'components/Table';
import { DateTime } from 'luxon';
import pdfMake from 'pdfmake/build/pdfmake';
import pdfFonts from 'pdfmake/build/vfs_fonts';
import { useCallback, useMemo } from 'react';
import { sortRows } from 'utils/sortRows';
import columns from './columns';

pdfMake.vfs = pdfFonts.pdfMake.vfs;

const EmployeeSales = ({ data, loading, onRowSelect }) => {
    const memoizedColumns = useMemo(() => columns, []);

    const handlePrint = useCallback(
        (config) => {
            const selectedColumns = config?.columns?.length ? config.columns : columns;
            const widths = selectedColumns.map((col) => (col.accessor === 'name' ? '*' : 'auto'));
            const body = sortRows(data, config?.sortBy).map((row) =>
                selectedColumns.map((col) => String(row[col.accessor] ?? '')),
            );

            pdfMake
                .createPdf({
                    content: [
                        { text: 'ALIMENTOS DM MARKET, C.A.', style: 'header' },
                        { text: 'Listado de Vendedores', style: 'subheader' },
                        {
                            text: `Generado el ${DateTime.now().toFormat('dd/MM/yyyy HH:mm')} · ${data.length} ${
                                data.length === 1 ? 'vendedor' : 'vendedores'
                            }`,
                            style: 'meta',
                        },
                        {
                            style: 'table',
                            table: {
                                widths,
                                body: [
                                    selectedColumns.map((col) => ({
                                        text: typeof col.Header === 'string' ? col.Header : String(col.accessor ?? ''),
                                        style: 'th',
                                    })),
                                    ...body,
                                ],
                            },
                        },
                    ],
                    styles: {
                        header: { alignment: 'center', fontSize: 10, bold: true },
                        subheader: { alignment: 'center', fontSize: 9, margin: [0, 4, 0, 2], bold: true },
                        meta: {
                            alignment: 'center',
                            fontSize: 8,
                            italics: true,
                            color: '#666',
                            margin: [0, 0, 0, 10],
                        },
                        th: { bold: true, fontSize: 8, fillColor: '#f3f4f6' },
                        table: { margin: [0, 10, 0, 0], fontSize: 8 },
                    },
                    pageMargins: 30,
                    pageSize: 'LETTER',
                    pageOrientation: config?.orientation || 'portrait',
                })
                .open();
        },
        [data],
    );

    return (
        <div className="card">
            <div className="card-header">
                <h2>Vendedores</h2>
            </div>
            <div className="card-body">
                <Table
                    data={data}
                    columns={memoizedColumns}
                    loading={loading}
                    onRowSelect={onRowSelect}
                    print={{
                        enabled: true,
                        onGlobalPrint: handlePrint,
                    }}
                />
            </div>
        </div>
    );
};

export default EmployeeSales;
