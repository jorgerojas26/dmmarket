import { useAuth } from 'auth/context';
import Table from 'components/Table';
import pdfMake from 'pdfmake/build/pdfmake';
import pdfFonts from 'pdfmake/build/vfs_fonts';
import { useCallback, useContext, useMemo, useState } from 'react';
import { Card } from 'react-bootstrap';
import { formatCurrency, formatQuantity } from 'utils/format';
import { sortRows } from 'utils/sortRows';
import { CurrencyRateContext } from '../../context/currency_rate';
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

const ProductsTable = ({ data: products, totalSummary: invoicesTotalSummary, printStorageKey, exportData }) => {
    const { can } = useAuth();
    const financial = products?.length
        ? products.every((row) => Object.hasOwn(row, 'utilidad'))
        : can('sales.costs') && can('sales.profit');
    const [printError, setPrintError] = useState('');
    const { currencyRate } = useContext(CurrencyRateContext);
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

    const quantityTotal = useMemo(() => {
        if (!data) return 0;
        return data.reduce((acc, item) => acc + item.quantity, 0);
    }, [data]);

    const pesoTotal = useMemo(() => {
        if (!data) return 0;
        return data.some((item) => item.peso == null) ? null : data.reduce((acc, item) => acc + item.peso, 0);
    }, [data]);

    const utilidadTotal = useMemo(() => {
        if (!data) return 0;
        return data.some((item) => item.utilidad == null) ? null : data.reduce((acc, item) => acc + item.utilidad, 0);
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
            ...(financial
                ? [
                      {
                          Header: 'Utilidad',
                          accessor: 'utilidad',
                          Cell: ({ value }) => (value != null ? formatCurrency(value) : 'No disponible'),
                      },
                  ]
                : []),
        ],
        [financial],
    );

    const summaries = useMemo(
        () => ({
            quantity: quantityTotal ? formatQuantity(quantityTotal) : '',
            peso: pesoTotal == null ? 'No disponible' : formatQuantity(pesoTotal),
            total: totalSummary != null ? formatCurrency(totalSummary) : '',
            ...(financial ? { utilidad: utilidadTotal == null ? 'No disponible' : formatCurrency(utilidadTotal) } : {}),
        }),
        [quantityTotal, pesoTotal, totalSummary, utilidadTotal, financial],
    );

    const handlePrint = useCallback(
        async (config) => {
            if (!exportData) return;
            setPrintError('');
            try {
                const report = await exportData();
                const term = normalizeSearch(config.search ?? search);
                let productsData = report.products.filter(
                    (item) =>
                        !term ||
                        [item.product, item.productId, item.group].some((value) =>
                            normalizeSearch(value).includes(term),
                        ),
                );
                const sum = (key) =>
                    productsData.some((item) => item[key] == null)
                        ? null
                        : productsData.reduce((total, item) => total + Number(item[key]), 0);
                const quantityTotal = sum('quantity');
                const pesoTotal = sum('peso');
                let totalSummary = sum('total');
                let utilidadTotalPdf = sum('utilidad');
                const rate = currencyRate?.Cambio;
                const currency = config.currency;
                if (currency === 'Bs') {
                    productsData = productsData.map((item) => ({
                        ...item,
                        total: item.total == null ? null : item.total * rate,
                        ...(Object.hasOwn(item, 'utilidad')
                            ? { utilidad: item.utilidad == null ? null : item.utilidad * rate }
                            : {}),
                    }));
                    totalSummary = totalSummary == null ? null : totalSummary * rate;
                    utilidadTotalPdf = utilidadTotalPdf == null ? null : utilidadTotalPdf * rate;
                }
                productsData = sortRows(productsData, config.sortBy);
                const columns = config.columns.filter(
                    (column) =>
                        column.accessor !== 'utilidad' || productsData.every((row) => Object.hasOwn(row, 'utilidad')),
                );
                if (!columns.length) throw new Error('No hay columnas autorizadas.');
                const pdfData = pdf(
                    productsData,
                    { quantityTotal, totalSummary, pesoTotal, currency, utilidadTotal: utilidadTotalPdf },
                    { ...config, columns },
                );
                pdfMake.createPdf(pdfData).open();
            } catch (error) {
                if (error.name !== 'AbortError') setPrintError('No se pudo imprimir la selección autorizada.');
            }
        },
        [exportData, search, currencyRate?.Cambio],
    );

    return (
        <Card className="h-100 mb-0">
            <Card.Header>
                <h3>Productos</h3>
            </Card.Header>
            <Card.Body style={{ minHeight: 0 }}>
                {printError && <p role="alert">{printError}</p>}
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
                    print={{
                        enabled: Boolean(exportData),
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
