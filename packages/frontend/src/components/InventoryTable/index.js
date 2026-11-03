import { useAuth } from 'auth/context';
import Table from 'components/Table';
import { CurrencyRateContext } from 'context/currency_rate';
import { useProducts } from 'hooks/useProducts';
import pdfMake from 'pdfmake/build/pdfmake';
import pdfFonts from 'pdfmake/build/vfs_fonts';
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Card } from 'react-bootstrap';
import { fetcher } from 'swr-config';
import { convertReportAmount, formatCurrency, formatWeight, getReportCurrency } from 'utils/format';
import { sortRows } from 'utils/sortRows';
import pdf from './pdf';

pdfMake.vfs = pdfFonts.pdfMake.vfs;

const LIMIT = 20;

const formatPrice = (value) => {
    if (value == null) return 'No disponible';
    const num = Number(value);
    if (Number.isNaN(num)) return '';
    return formatCurrency(num);
};

const formatStock = (value) => {
    if (value == null) return 'No disponible';
    const num = Number(value);
    if (Number.isNaN(num)) return '';
    return num.toLocaleString('es-VE', { maximumFractionDigits: 3 });
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
    const { can } = useAuth();
    const monetary = can('inventory.costs');
    const providers = can('providers.read');
    const exporting = can('inventory.export');
    const active = useRef(true);
    const [printError, setPrintError] = useState('');
    useEffect(
        () => () => {
            active.current = false;
        },
        [],
    );
    const { currencyRate } = useContext(CurrencyRateContext);
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const [sort, setSort] = useState({ sortBy: 'Descripcion', sortDir: 'asc' });

    const {
        data: result,
        isLoading,
        error,
    } = useProducts({
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

    const stockTotal = result?.totals?.existencia;

    const memoizedColumns = useMemo(
        () => [
            { Header: 'ID', accessor: 'IdProducto' },
            { Header: 'Categoría', accessor: 'Grupo', sortType: textSortType },
            { Header: 'Producto', accessor: 'Descripcion', sortType: textSortType },
            ...(providers ? [{ Header: 'Proveedor', accessor: 'Proveedor', sortType: textSortType }] : []),
            { Header: 'Peso', accessor: 'Peso', Cell: ({ value }) => formatWeight(value), disableSortBy: true },
            ...(monetary ? [{ Header: 'Precio', accessor: 'PrecioA', Cell: ({ value }) => formatPrice(value) }] : []),
            { Header: 'Stock', accessor: 'Existencia', Cell: ({ value }) => formatStock(value) },
        ],
        [providers, monetary],
    );

    const summaries = useMemo(
        () => ({
            Existencia:
                stockTotal == null
                    ? 'No disponible'
                    : Number(stockTotal).toLocaleString('es-VE', { maximumFractionDigits: 3 }),
        }),
        [stockTotal],
    );

    const handlePrint = useCallback(
        async (config) => {
            if (!exporting) return;
            setPrintError('');
            try {
                const parameters = new URLSearchParams({ sortBy: sort.sortBy, sortDir: sort.sortDir });
                const filter = config.search ?? search;
                if (filter) parameters.set('search', filter);
                if (categoryId) parameters.set('categoryId', categoryId);
                if (providers && proveedorId) parameters.set('proveedorId', proveedorId);
                if (config?.extra?.stockOnly) parameters.set('stockOnly', 'true');
                const result = await fetcher(`/api/exports/inventory?${parameters}`);
                if (!active.current) return;
                let productsData = result.data;

                const rate = currencyRate?.Cambio;
                const sourceCurrency = getReportCurrency();
                const currency = config?.currency || sourceCurrency;
                if (currency !== sourceCurrency && !can('rates.read'))
                    throw new Error('No se dispone de una tasa autorizada.');
                if (monetary)
                    productsData = productsData.map((product) => ({
                        ...product,
                        PrecioA: convertReportAmount(product.PrecioA, currency, rate, sourceCurrency),
                    }));

                productsData = sortRows(productsData, config?.sortBy);

                const printedStockTotal = productsData.some((p) => p.Existencia == null)
                    ? null
                    : productsData.reduce((acc, p) => acc + Number(p.Existencia), 0);
                const valueTotal =
                    !monetary || productsData.some((p) => p.PrecioA == null || p.Existencia == null)
                        ? null
                        : productsData.reduce((acc, p) => acc + Number(p.PrecioA) * Number(p.Existencia), 0);

                const columns = memoizedColumns.filter((column) =>
                    config.columns.some((selected) => selected.accessor === column.accessor),
                );
                if (!columns.length) throw new Error('No hay columnas autorizadas seleccionadas.');

                const pdfData = pdf(
                    productsData,
                    { stockTotal: printedStockTotal, valueTotal, currency },
                    { ...config, columns },
                );

                pdfMake.createPdf(pdfData).open();
            } catch (err) {
                if (active.current && err.name !== 'AbortError')
                    setPrintError('No se pudo imprimir el inventario autorizado.');
            }
        },
        [
            search,
            categoryId,
            proveedorId,
            sort,
            currencyRate?.Cambio,
            exporting,
            providers,
            monetary,
            can,
            memoizedColumns,
        ],
    );

    const totalPages = Math.ceil(total / LIMIT);

    return (
        <Card className="h-100 mb-0">
            <Card.Header>
                <h3>Inventario</h3>
            </Card.Header>
            <Card.Body style={{ minHeight: 0 }}>
                {(error || printError) && (
                    <p role="alert">{printError || 'No se pudo consultar el inventario autorizado.'}</p>
                )}
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
                        enabled: exporting && Boolean(result) && !error,
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
