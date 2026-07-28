import CurrencyModal from 'components/Modals/CurrencyModal';
import Table from 'components/Table';
import pdfMake from 'pdfmake/build/pdfmake';
import pdfFonts from 'pdfmake/build/vfs_fonts';
import { useContext, useMemo, useState } from 'react';
import { Button, Card } from 'react-bootstrap';
import { CurrencyRateContext } from '../../context/currency_rate';
import pdf from './pdf';

pdfMake.vfs = pdfFonts.pdfMake.vfs;

const ProductsTable = ({ data, totalSummary, maxHeight }) => {
    const { currencyRate } = useContext(CurrencyRateContext);

    const [showCurrencyModal, setShowCurrencyModal] = useState(false);

    const quantityTotal = useMemo(() => {
        if (!data) return 0;
        return data.reduce((acc, item) => acc + item.quantity, 0);
    }, [data]);

    const sortedData = useMemo(() => {
        if (!data) return [];
        return [...data].sort((a, b) => {
            return (
                a.group.toLowerCase().localeCompare(b.group.toLowerCase()) ||
                a.product.toLowerCase().localeCompare(b.product.toLowerCase())
            );
        });
    }, [data]);

    const memoizedColumns = useMemo(
        () => [
            { Header: 'Categoría', accessor: 'group' },
            { Header: 'ID', accessor: 'productId' },
            { Header: 'Producto', accessor: 'product' },
            { Header: 'Cantidad', accessor: 'quantity' },
            { Header: 'Total', accessor: 'total' },
        ],
        [],
    );

    const summaries = useMemo(
        () => ({
            quantity: quantityTotal ? quantityTotal.toFixed(2) : '',
            total: totalSummary ? `$${totalSummary.toFixed(2)}` : '',
        }),
        [quantityTotal, totalSummary],
    );

    return (
        <Card>
            <Card.Header>
                <div className="d-flex w-100 justify-content-between">
                    <h3>Productos</h3>
                    <Button onClick={() => setShowCurrencyModal(true)}>Imprimir</Button>
                </div>
            </Card.Header>
            <Card.Body>
                <Table
                    data={sortedData}
                    columns={memoizedColumns}
                    showFooter
                    summaries={summaries}
                    maxHeight={maxHeight}
                />
            </Card.Body>
            {showCurrencyModal && (
                <CurrencyModal
                    show={showCurrencyModal}
                    onClose={() => setShowCurrencyModal(false)}
                    onSubmit={async (currency) => {
                        let productsData = sortedData;

                        if (currency === 'Bs') {
                            productsData = productsData.map((item) => {
                                return {
                                    ...item,
                                    total: Number(item.price * item.quantity * currencyRate?.Cambio).toFixed(2),
                                };
                            });
                        }

                        const pdfData = pdf(productsData, quantityTotal, totalSummary, currency);

                        pdfMake.createPdf(pdfData).open();
                    }}
                />
            )}
        </Card>
    );
};

export default ProductsTable;
