import CurrencyModal from 'components/Modals/CurrencyModal';
import Table from 'components/Table';
import pdfMake from 'pdfmake/build/pdfmake';
import pdfFonts from 'pdfmake/build/vfs_fonts';
import { useCallback, useContext, useMemo, useRef, useState } from 'react';
import { Card } from 'react-bootstrap';
import { CurrencyRateContext } from '../../context/currency_rate';
import pdf from './pdf';

pdfMake.vfs = pdfFonts.pdfMake.vfs;

const formatPeso = (value) => {
    const num = Number(value);
    if (Number.isNaN(num) || num === 0) return '';
    return num.toLocaleString(undefined, { maximumFractionDigits: 3 });
};

// Spanish-aware alphabetical sort: handles accents, ñ and case
// (react-table's default alphanumeric compares raw UTF-16 code units).
const textSortType = (rowA, rowB, columnId) => {
    const a = String(rowA.values[columnId] ?? '');
    const b = String(rowB.values[columnId] ?? '');
    return a.localeCompare(b, 'es', { sensitivity: 'base', ignorePunctuation: true });
};

const ProductsTable = ({ data, totalSummary, maxHeight }) => {
    const { currencyRate } = useContext(CurrencyRateContext);

    const [showCurrencyModal, setShowCurrencyModal] = useState(false);

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

    const memoizedColumns = useMemo(
        () => [
            { Header: 'Categoría', accessor: 'group', sortType: textSortType },
            { Header: 'ID', accessor: 'productId' },
            { Header: 'Producto', accessor: 'product', sortType: textSortType },
            { Header: 'Cantidad', accessor: 'quantity' },
            {
                Header: 'Peso',
                accessor: 'peso',
                Cell: ({ value }) => formatPeso(value),
            },
            { Header: 'Total', accessor: 'total' },
        ],
        [],
    );

    const summaries = useMemo(
        () => ({
            quantity: quantityTotal ? quantityTotal.toFixed(2) : '',
            peso: formatPeso(pesoTotal),
            total: totalSummary ? `$${totalSummary.toFixed(2)}` : '',
        }),
        [quantityTotal, pesoTotal, totalSummary],
    );

    return (
        <Card className="h-100">
            <Card.Header>
                <h3>Productos</h3>
            </Card.Header>
            <Card.Body>
                <Table
                    data={data}
                    columns={memoizedColumns}
                    showFooter
                    summaries={summaries}
                    fillHeight
                    onSortedRowsChange={handleSortedRowsChange}
                    print={{
                        enabled: true,
                        onGlobalPrint: () => setShowCurrencyModal(true),
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
            {showCurrencyModal && (
                <CurrencyModal
                    show={showCurrencyModal}
                    onClose={() => setShowCurrencyModal(false)}
                    onSubmit={async (currency) => {
                        let productsData = sortedRowsRef.current;

                        if (currency === 'Bs') {
                            productsData = productsData.map((item) => {
                                return {
                                    ...item,
                                    total: Number(item.price * item.quantity * currencyRate?.Cambio).toFixed(2),
                                };
                            });
                        }

                        const pdfData = pdf(productsData, quantityTotal, totalSummary, pesoTotal, currency);

                        pdfMake.createPdf(pdfData).open();
                    }}
                />
            )}
        </Card>
    );
};

export default ProductsTable;
