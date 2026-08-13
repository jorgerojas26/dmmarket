import { fetchProducts } from 'api/products';
import Table from 'components/Table';
import pdfMake from 'pdfmake/build/pdfmake';
import pdfFonts from 'pdfmake/build/vfs_fonts';
import { CurrencyRateContext } from 'context/currency_rate';
import { useProducts } from 'hooks/useProducts';
import { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Card } from 'react-bootstrap';
import { sortRows } from 'utils/sortRows';
import pdf from './pdf';

pdfMake.vfs = pdfFonts.pdfMake.vfs;

const LIMIT = 20;

const formatPrice = (value) => {
    const num = Number(value);
    if (Number.isNaN(num)) return '';
    return `$${num.toFixed(2)}`;
};

const formatStock = (value) => {
    const num = Number(value);
    if (Number.isNaN(num)) return '';
    return num.toFixed(2);
};

// Spanish-aware alphabetical sort: handles accents, ñ and case
// (react-table's default alphanumeric compares raw UTF-16 code units).
const textSortType = (rowA, rowB, columnId) => {
    const a = String(rowA.values[columnId] ?? '');
    const b = String(rowB.values[columnId] ?? '');
    return a.localeCompare(b, 'es', { sensitivity: 'base', ignorePunctuation: true });
};

/**
 * Inventory table: server-side pagination, search, sorting and global print.
 *
 * @param {object} props
 * @param {string|number} [props.categoryId]  - Category filter (server-side).
 * @param {string|number} [props.proveedorId] - Provider filter (server-side).
 */
const InventoryTable = ({ categoryId, proveedorId }) => {
    const { currencyRate } = useContext(CurrencyRateContext);
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const [sort, setSort] = useState({ sortBy: 'Descripcion', sortDir: 'asc' });

    const { data: result, isLoading } = useProducts({
        search,
        categoryId,
        proveedorId,
        page,
        limit: LIMIT,
        sortBy: sort.sortBy,
        sortDir: sort.sortDir,
    });

    const dataArr = result?.data || [];
    const total = result?.total || 0;

    // Cambio de filtro de categoría/proveedor → volver a la primera página.
    useEffect(() => {
        setPage(1);
    }, [categoryId, proveedorId]);

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

    const stockTotal = useMemo(() => dataArr.reduce((acc, item) => acc + Number(item.Existencia || 0), 0), [dataArr]);

    const memoizedColumns = useMemo(
        () => [
            { Header: 'ID', accessor: 'IdProducto' },
            { Header: 'Categoría', accessor: 'Grupo', sortType: textSortType },
            { Header: 'Producto', accessor: 'Descripcion', sortType: textSortType },
            { Header: 'Proveedor', accessor: 'Proveedor', sortType: textSortType },
            { Header: 'Precio', accessor: 'PrecioA', Cell: ({ value }) => formatPrice(value) },
            { Header: 'Stock', accessor: 'Existencia', Cell: ({ value }) => formatStock(value) },
        ],
        [],
    );

    const summaries = useMemo(
        () => ({
            Existencia: stockTotal ? stockTotal.toFixed(2) : '',
        }),
        [stockTotal],
    );

    // Print: re-fetches the FULL filtered set server-side (no pagination), with
    // the stock-only toggle applied as a server filter when enabled, then
    // converts prices to the chosen currency and applies the dialog sort.
    const handlePrint = useCallback(
        async (config) => {
            try {
                const result = await fetchProducts({
                    search,
                    categoryId,
                    proveedorId,
                    stockOnly: config?.extra?.stockOnly || undefined,
                    sortBy: sort.sortBy,
                    sortDir: sort.sortDir,
                });
                let productsData = result?.data || [];

                const rate = currencyRate?.Cambio;
                const currency = config?.currency;
                if (currency === 'Bs' && rate) {
                    productsData = productsData.map((p) => ({
                        ...p,
                        PrecioA: Number(p.PrecioA * rate).toFixed(2),
                    }));
                }

                productsData = sortRows(productsData, config?.sortBy);

                const printedStockTotal = productsData.reduce((acc, p) => acc + Number(p.Existencia || 0), 0);
                const valueTotal = productsData.reduce(
                    (acc, p) => acc + Number(p.PrecioA || 0) * Number(p.Existencia || 0),
                    0,
                );

                const pdfData = pdf(
                    productsData,
                    { stockTotal: printedStockTotal, valueTotal, currency: currency || 'USD' },
                    config,
                );

                pdfMake.createPdf(pdfData).open();
            } catch (err) {
                console.error('Failed to print inventory:', err);
            }
        },
        [search, categoryId, proveedorId, sort, currencyRate?.Cambio],
    );

    const totalPages = Math.ceil(total / LIMIT);

    return (
        <Card className="h-100 mb-0">
            <Card.Header>
                <h3>Inventario</h3>
            </Card.Header>
            <Card.Body style={{ minHeight: 0 }}>
                <Table
                    data={dataArr}
                    columns={memoizedColumns}
                    loading={isLoading}
                    showFooter
                    summaries={summaries}
                    fillHeight
                    sorting={{
                        enabled: true,
                        sortBy: [{ id: sort.sortBy, desc: sort.sortDir === 'desc' }],
                        onSort: handleSort,
                    }}
                    search={{
                        enabled: true,
                        placeholder: 'Buscar producto...',
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
                        onGlobalPrint: handlePrint,
                        storageKey: 'inventory',
                        filters: [{ key: 'stockOnly', label: 'Solo productos con stock > 0' }],
                    }}
                />
            </Card.Body>
        </Card>
    );
};

export default InventoryTable;
