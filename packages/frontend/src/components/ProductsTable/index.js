import Table from 'components/Table';
import pdfMake from 'pdfmake/build/pdfmake';
import pdfFonts from 'pdfmake/build/vfs_fonts';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Card } from 'react-bootstrap';
import { formatCurrency, formatQuantity, getReportCurrency } from 'utils/format';
import { sortRows } from 'utils/sortRows';
import pdf from './pdf';

pdfMake.vfs = pdfFonts.pdfMake.vfs;

// Spanish-aware alphabetical sort: handles accents, ñ and case
// (react-table's default alphanumeric compares raw UTF-16 code units).
const textSortType = (rowA, rowB, columnId) => {
    const a = String(rowA.values[columnId] ?? '');
    const b = String(rowB.values[columnId] ?? '');
    return a.localeCompare(b, 'es', { sensitivity: 'base', ignorePunctuation: true });
};

const normalizeSearch = (value) =>
    String(value ?? '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();

const ProductsTable = ({ data: products, totalSummary: invoicesTotalSummary, printStorageKey }) => {
    const [search, setSearch] = useState('');
    const searchTerm = normalizeSearch(search);

    const data = useMemo(() => {
        if (!searchTerm) return products;
        return (products || []).filter((item) =>
            [item.product, item.productId, item.group].some((value) => normalizeSearch(value).includes(searchTerm)),
        );
    }, [products, searchTerm]);

    const totalSummary = useMemo(
        () => (searchTerm ? data.reduce((total, item) => total + Number(item.total || 0), 0) : invoicesTotalSummary),
        [data, searchTerm, invoicesTotalSummary],
    );

    // Rows in the table's current sort order (for PDF export).
    const sortedRowsRef = useRef([]);
    const handleSortedRowsChange = useCallback((rows) => {
        sortedRowsRef.current = rows;
    }, []);

    const quantityTotal = useMemo(() => {
        if (!data) return 0;
        return data.reduce((acc, item) => acc + item.quantity, 0);
    }, [data]);

    const pesoTotal = useMemo(() => {
        if (!data) return 0;
        return data.reduce((acc, item) => acc + (item.peso || 0), 0);
    }, [data]);

    const utilidadTotal = useMemo(() => {
        if (!data) return 0;
        return data.reduce((acc, item) => acc + (item.utilidad || 0), 0);
    }, [data]);

    const memoizedColumns = useMemo(
        () => [
            { Header: 'Categoría', accessor: 'group', sortType: textSortType },
            { Header: 'ID', accessor: 'productId' },
            { Header: 'Producto', accessor: 'product', sortType: textSortType },
            { Header: 'Cantidad', accessor: 'quantity' },
            {
                Header: 'Peso',
                accessor: 'peso',
                Cell: ({ value }) => formatQuantity(value),
            },
            { Header: 'Total', accessor: 'total' },
            {
                Header: 'Utilidad',
                accessor: 'utilidad',
                Cell: ({ value }) => (value != null ? formatCurrency(value) : ''),
            },
        ],
        [],
    );

    const summaries = useMemo(
        () => ({
            quantity: quantityTotal ? formatQuantity(quantityTotal) : '',
            peso: formatQuantity(pesoTotal),
            total: totalSummary != null ? formatCurrency(totalSummary) : '',
            utilidad: utilidadTotal ? formatCurrency(utilidadTotal) : '',
        }),
        [quantityTotal, pesoTotal, totalSummary, utilidadTotal],
    );

    const handlePrint = useCallback(
        (config) => {
            const productsData = sortRows(sortedRowsRef.current, config?.sortBy);
            const pdfData = pdf(
                productsData,
                { quantityTotal, totalSummary, pesoTotal, currency: getReportCurrency(), utilidadTotal },
                config,
            );

            pdfMake.createPdf(pdfData).open();
        },
        [quantityTotal, pesoTotal, totalSummary, utilidadTotal],
    );

    return (
        <Card className="h-100 mb-0">
            <Card.Header>
                <h3>Productos</h3>
            </Card.Header>
            <Card.Body style={{ minHeight: 0 }}>
                <Table
                    data={data}
                    columns={memoizedColumns}
                    showFooter
                    summaries={summaries}
                    fillHeight
                    search={{
                        enabled: true,
                        placeholder: 'Buscar por producto, ID o categoría...',
                        onSearch: setSearch,
                    }}
                    onSortedRowsChange={handleSortedRowsChange}
                    print={{
                        enabled: true,
                        onGlobalPrint: handlePrint,
                        storageKey: printStorageKey,
                    }}
                    sorting={{
                        enabled: true,
                        sortBy: [{ id: 'product', desc: false }],
                        resetOnDataChange: false,
                    }}
                    // Info bar only (no page controls): matches the invoices table chrome
                    // so both tables end up exactly the same height.
                    pagination={{
                        enabled: true,
                        totalRows: data?.length || 0,
                    }}
                />
            </Card.Body>
        </Card>
    );
};

export default ProductsTable;
