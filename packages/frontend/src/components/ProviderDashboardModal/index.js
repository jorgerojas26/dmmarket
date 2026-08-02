import DateRangePicker from 'components/DateRangePicker';
import Table from 'components/Table';
import { CurrencyRateContext } from 'context/currency_rate';
import { ShowNoeContext } from 'context/show_noe';
import { DateTime } from 'luxon';
import { useCallback, useContext, useMemo, useState } from 'react';
import { Badge, Modal, Spinner } from 'react-bootstrap';
import pdfMake from 'pdfmake/build/pdfmake';
import pdfFonts from 'pdfmake/build/vfs_fonts';
import {
    fetchPurchaseDetail,
    fetchSaleDetail,
    useProviderClients,
    useProviderProducts,
    useProviderPurchases,
    useProviderSales,
    useProviderSummary,
} from 'hooks/useProviders';
import { formatCurrency, formatMoney } from 'utils/format';
import PurchaseDetailModal from './PurchaseDetailModal';
import SaleDetailModal from './SaleDetailModal';
import './styles.css';

pdfMake.vfs = pdfFonts.pdfMake ? pdfFonts.pdfMake.vfs : pdfMake.vfs;

const LIMIT = 20;

const CLIENTS_COLUMNS = [
    { Header: 'Cliente', accessor: 'cliente' },
    { Header: 'Total Ventas', accessor: 'totalVentas', Cell: ({ value }) => formatCurrency(value) },
    { Header: '# Ventas', accessor: 'numVentas' },
];

const PRODUCTS_COLUMNS = [
    { Header: 'Producto', accessor: 'producto' },
    { Header: 'Cantidad', accessor: 'cantidad', Cell: ({ value }) => Number(value).toLocaleString() },
    { Header: 'Total Ventas', accessor: 'totalVentas', Cell: ({ value }) => formatCurrency(value) },
];

/** Formats a cell value for PDF output, honoring the print currency option for money columns. */
const printCellValue = (col, row, currency, rate) => {
    const value = row[col.accessor];
    switch (col.accessor) {
        case 'totalVentas':
        case 'monto':
            return formatMoney(value, currency, rate);
        case 'cantidad':
            return Number(value).toLocaleString();
        default:
            return value;
    }
};

const IconSales = () => (
    <svg
        width="38"
        height="38"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
    >
        <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
        <line x1="3" y1="6" x2="21" y2="6" />
        <path d="M16 10a4 4 0 0 1-8 0" />
    </svg>
);

const IconHash = () => (
    <svg
        width="38"
        height="38"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
    >
        <line x1="4" y1="9" x2="20" y2="9" />
        <line x1="4" y1="15" x2="20" y2="15" />
        <line x1="10" y1="3" x2="8" y2="21" />
        <line x1="16" y1="3" x2="14" y2="21" />
    </svg>
);

const IconTicket = () => (
    <svg
        width="38"
        height="38"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
    >
        <path d="M3 9v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9" />
        <path d="M3 9V7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2" />
        <line x1="12" y1="2" x2="12" y2="22" />
    </svg>
);

const IconUserStar = () => (
    <svg
        width="38"
        height="38"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
    >
        <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="8.5" cy="7" r="4" />
        <polygon points="17 3 18.2 5.5 21 5.9 19 7.9 19.4 10.7 17 9.4 14.6 10.7 15 7.9 13 5.9 15.8 5.5 17 3" />
    </svg>
);

const StatCard = ({ label, value, variant, icon: Icon, loading }) => (
    <div className={`provider-stat-card ${variant}`}>
        <div className="provider-stat-icon">
            <Icon />
        </div>
        <div className="provider-stat-label">{label}</div>
        <div className="provider-stat-value">{loading ? <Spinner animation="border" size="sm" /> : value}</div>
    </div>
);

const ProviderDashboardModal = ({ show, onClose, provider }) => {
    const { showNoe } = useContext(ShowNoeContext);
    const { currencyRate } = useContext(CurrencyRateContext);

    const today = DateTime.now().toISODate();
    const oneMonthAgo = DateTime.now().minus({ months: 1 }).toISODate();

    const [dateRange, setDateRange] = useState({ from: oneMonthAgo, to: today });
    const [activeTab, setActiveTab] = useState('ventas');

    // Pagination
    const [purchasesPage, setPurchasesPage] = useState(1);
    const [salesPage, setSalesPage] = useState(1);
    const [clientsPage, setClientsPage] = useState(1);
    const [productsPage, setProductsPage] = useState(1);

    // Search
    const [purchasesSearch, setPurchasesSearch] = useState('');
    const [salesSearch, setSalesSearch] = useState('');
    const [clientsSearch, setClientsSearch] = useState('');
    const [productsSearch, setProductsSearch] = useState('');

    // Sort
    const [purchasesSort, setPurchasesSort] = useState([{ id: 'fecha', desc: true }]);
    const [salesSort, setSalesSort] = useState([{ id: 'fecha', desc: true }]);
    const [clientsSort, setClientsSort] = useState([{ id: 'totalVentas', desc: true }]);
    const [productsSort, setProductsSort] = useState([{ id: 'totalVentas', desc: true }]);

    // Sub-modals
    const [detailModalShow, setDetailModalShow] = useState(false);
    const [selectedPurchase, setSelectedPurchase] = useState(null);
    const [saleDetailModalShow, setSaleDetailModalShow] = useState(false);
    const [selectedSale, setSelectedSale] = useState(null);

    // ── SWR hooks ──
    const enabled = show && !!provider?.IdProveedor;

    const { data: summary, isLoading: summaryLoading } = useProviderSummary(
        provider?.IdProveedor,
        { from: dateRange.from, to: dateRange.to, showNoe },
        enabled,
    );

    const { data: purchasesData, isLoading: purchasesLoading } = useProviderPurchases(
        provider?.IdProveedor,
        {
            from: dateRange.from,
            to: dateRange.to,
            page: purchasesPage,
            limit: LIMIT,
            search: purchasesSearch || undefined,
            sortBy: purchasesSort[0]?.id,
            sortDir: purchasesSort[0]?.desc ? 'desc' : 'asc',
        },
        enabled,
    );

    const { data: salesData, isLoading: salesLoading } = useProviderSales(
        provider?.IdProveedor,
        {
            from: dateRange.from,
            to: dateRange.to,
            page: salesPage,
            limit: LIMIT,
            search: salesSearch || undefined,
            sortBy: salesSort[0]?.id,
            sortDir: salesSort[0]?.desc ? 'desc' : 'asc',
            showNoe,
        },
        enabled,
    );

    const { data: clientsData, isLoading: clientsLoading } = useProviderClients(
        provider?.IdProveedor,
        {
            from: dateRange.from,
            to: dateRange.to,
            page: clientsPage,
            limit: LIMIT,
            search: clientsSearch || undefined,
            sortBy: clientsSort[0]?.id,
            sortDir: clientsSort[0]?.desc ? 'desc' : 'asc',
            showNoe,
        },
        enabled,
    );

    const { data: productsData, isLoading: productsLoading } = useProviderProducts(
        provider?.IdProveedor,
        {
            from: dateRange.from,
            to: dateRange.to,
            page: productsPage,
            limit: LIMIT,
            search: productsSearch || undefined,
            sortBy: productsSort[0]?.id,
            sortDir: productsSort[0]?.desc ? 'desc' : 'asc',
            showNoe,
        },
        enabled,
    );

    const handleDateRangeChange = ({ from, to }) => {
        setDateRange({ from, to });
        setPurchasesPage(1);
        setSalesPage(1);
        setClientsPage(1);
        setProductsPage(1);
    };

    const handlePurchasesSearch = useCallback((term) => {
        setPurchasesSearch(term || '');
        setPurchasesPage(1);
    }, []);
    const handleSalesSearch = useCallback((term) => {
        setSalesSearch(term || '');
        setSalesPage(1);
    }, []);
    const handleClientsSearch = useCallback((term) => {
        setClientsSearch(term || '');
        setClientsPage(1);
    }, []);
    const handleProductsSearch = useCallback((term) => {
        setProductsSearch(term || '');
        setProductsPage(1);
    }, []);

    const handlePurchasesSort = useCallback((s) => {
        setPurchasesSort(s.length ? s : [{ id: 'fecha', desc: true }]);
        setPurchasesPage(1);
    }, []);
    const handleSalesSort = useCallback((s) => {
        setSalesSort(s.length ? s : [{ id: 'fecha', desc: true }]);
        setSalesPage(1);
    }, []);
    const handleClientsSort = useCallback((s) => {
        setClientsSort(s.length ? s : [{ id: 'totalVentas', desc: true }]);
        setClientsPage(1);
    }, []);
    const handleProductsSort = useCallback((s) => {
        setProductsSort(s.length ? s : [{ id: 'totalVentas', desc: true }]);
        setProductsPage(1);
    }, []);

    const handlePurchaseRowClick = useCallback(
        async (purchase) => {
            try {
                const detail = await fetchPurchaseDetail(provider.IdProveedor, purchase.idFactura);
                setSelectedPurchase(detail);
                setDetailModalShow(true);
            } catch (err) {
                console.error('Failed to fetch purchase detail:', err);
            }
        },
        [provider?.IdProveedor],
    );

    const handleSaleRowClick = useCallback(
        async (sale) => {
            try {
                const detail = await fetchSaleDetail(provider.IdProveedor, sale.idFactura, showNoe);
                setSelectedSale(detail);
                setSaleDetailModalShow(true);
            } catch (err) {
                console.error('Failed to fetch sale detail:', err);
            }
        },
        [provider?.IdProveedor, showNoe],
    );

    const handlePrintPurchase = useCallback(
        async (purchase, e) => {
            if (e?.stopPropagation) e.stopPropagation();
            try {
                const detail = await fetchPurchaseDetail(provider.IdProveedor, purchase.idFactura);
                const rows = detail.productos.map((p) => [
                    p.descripcion,
                    String(Number(p.cantidad)),
                    formatCurrency(p.precio),
                    formatCurrency(p.subtotal),
                ]);
                pdfMake
                    .createPdf({
                        content: [
                            { text: 'ALIMENTOS DM MARKET, C.A.', style: 'header' },
                            {
                                text: 'CALLE ILUSTRES PROCERES LOCAL NRO S/N SECTOR CENTRO ALTAGRACIA DE ORITUCO DE ORITUCO ZONA POSTAL 2320.',
                                style: 'header',
                            },
                            { text: 'R.I.F.: J-41270446-0', style: 'header' },
                            { text: DateTime.fromISO(detail.fecha).toFormat('dd/MM/yyyy'), style: 'header' },
                            { text: `Factura de compra: ${detail.idFactura}`, style: 'subheader' },
                            { text: `Proveedor: ${provider.Empresa}`, style: 'subheader', margin: [0, 0, 0, 12] },
                            {
                                style: 'table',
                                table: {
                                    widths: ['*', 'auto', 'auto', 'auto'],
                                    body: [
                                        ['Descripción', 'Cantidad', 'Precio', 'Subtotal'],
                                        ...rows,
                                        [
                                            '',
                                            '',
                                            { text: 'Total', bold: true },
                                            { text: formatCurrency(detail.total), bold: true },
                                        ],
                                    ],
                                },
                            },
                        ],
                        styles: {
                            header: { alignment: 'center', fontSize: 10 },
                            subheader: { alignment: 'center', fontSize: 9, margin: [0, 4, 0, 2] },
                            table: { margin: [0, 10, 0, 0], fontSize: 8 },
                        },
                        pageMargins: 40,
                        pageSize: 'LETTER',
                    })
                    .open();
            } catch (err) {
                console.error('Failed to print purchase:', err);
            }
        },
        [provider?.IdProveedor, provider?.Empresa],
    );

    const handlePrintAllPurchases = useCallback(
        async (config) => {
            try {
                const { fetchProviderPurchases } = await import('api/providers');
                const result = await fetchProviderPurchases(provider.IdProveedor, {
                    from: dateRange.from,
                    to: dateRange.to,
                    page: 1,
                    limit: purchasesData?.total || 9999,
                    search: purchasesSearch || undefined,
                });
                const invoices = result.data || [];
                const tables = [];
                const currency = config?.currency;
                const rate = currencyRate?.Cambio;
                for (const inv of invoices) {
                    const detail = await fetchPurchaseDetail(provider.IdProveedor, inv.idFactura);
                    const rows = detail.productos.map((p) => [
                        p.descripcion,
                        String(Number(p.cantidad)),
                        formatMoney(p.precio, currency, rate),
                        formatMoney(p.subtotal, currency, rate),
                    ]);
                    tables.push(
                        {
                            text: `Factura: ${detail.idFactura} — ${DateTime.fromISO(detail.fecha).toFormat('dd/MM/yyyy')}`,
                            style: 'invoiceTitle',
                            margin: [0, 14, 0, 4],
                        },
                        {
                            style: 'table',
                            table: {
                                widths: ['*', 'auto', 'auto', 'auto'],
                                body: [
                                    ['Descripción', 'Cantidad', 'Precio', 'Subtotal'],
                                    ...rows,
                                    [
                                        '',
                                        '',
                                        { text: 'Total', bold: true },
                                        { text: formatMoney(detail.total, currency, rate), bold: true },
                                    ],
                                ],
                            },
                        },
                    );
                }
                pdfMake
                    .createPdf({
                        content: [
                            { text: 'ALIMENTOS DM MARKET, C.A.', style: 'header' },
                            {
                                text: 'CALLE ILUSTRES PROCERES LOCAL NRO S/N SECTOR CENTRO ALTAGRACIA DE ORITUCO DE ORITUCO ZONA POSTAL 2320.',
                                style: 'header',
                            },
                            { text: 'R.I.F.: J-41270446-0', style: 'header' },
                            { text: `Compras a: ${provider.Empresa}`, style: 'subheader' },
                            {
                                text: `Período: ${DateTime.fromISO(dateRange.from).toFormat('dd/MM/yyyy')} — ${DateTime.fromISO(dateRange.to).toFormat('dd/MM/yyyy')}`,
                                style: 'subheader',
                                margin: [0, 0, 0, 12],
                            },
                            ...tables,
                        ],
                        styles: {
                            header: { alignment: 'center', fontSize: 10 },
                            subheader: { alignment: 'center', fontSize: 9, margin: [0, 4, 0, 2] },
                            invoiceTitle: { fontSize: 9, bold: true },
                            table: { margin: [0, 4, 0, 10], fontSize: 8 },
                        },
                        pageMargins: 40,
                        pageSize: 'LETTER',
                        pageOrientation: config?.orientation || 'portrait',
                    })
                    .open();
            } catch (err) {
                console.error('Failed to print all purchases:', err);
            }
        },
        [provider?.IdProveedor, provider?.Empresa, dateRange, purchasesSearch, purchasesData?.total, currencyRate],
    );

    const handlePrintAllSales = useCallback(
        async (config) => {
            try {
                const { fetchProviderSales } = await import('api/providers');
                const result = await fetchProviderSales(provider.IdProveedor, {
                    from: dateRange.from,
                    to: dateRange.to,
                    page: 1,
                    limit: salesData?.total || 9999,
                    search: salesSearch || undefined,
                    showNoe,
                });
                const invoices = result.data || [];
                const tables = [];
                const currency = config?.currency;
                const rate = currencyRate?.Cambio;
                for (const inv of invoices) {
                    const detail = await fetchSaleDetail(provider.IdProveedor, inv.idFactura, showNoe);
                    const rows = detail.productos.map((p) => [
                        p.descripcion,
                        String(Number(p.cantidad)),
                        formatMoney(p.precio, currency, rate),
                        formatMoney(p.subtotal, currency, rate),
                    ]);
                    tables.push(
                        {
                            text: `Factura: ${detail.idFactura} — ${DateTime.fromISO(detail.fecha).toFormat('dd/MM/yyyy')}`,
                            style: 'invoiceTitle',
                            margin: [0, 14, 0, 4],
                        },
                        {
                            style: 'table',
                            table: {
                                widths: ['*', 'auto', 'auto', 'auto'],
                                body: [
                                    ['Descripción', 'Cantidad', 'Precio', 'Subtotal'],
                                    ...rows,
                                    [
                                        '',
                                        '',
                                        { text: 'Total', bold: true },
                                        { text: formatMoney(detail.total, currency, rate), bold: true },
                                    ],
                                ],
                            },
                        },
                    );
                }
                pdfMake
                    .createPdf({
                        content: [
                            { text: 'ALIMENTOS DM MARKET, C.A.', style: 'header' },
                            {
                                text: 'CALLE ILUSTRES PROCERES LOCAL NRO S/N SECTOR CENTRO ALTAGRACIA DE ORITUCO DE ORITUCO ZONA POSTAL 2320.',
                                style: 'header',
                            },
                            { text: 'R.I.F.: J-41270446-0', style: 'header' },
                            { text: `Ventas de: ${provider.Empresa}`, style: 'subheader' },
                            {
                                text: `Período: ${DateTime.fromISO(dateRange.from).toFormat('dd/MM/yyyy')} — ${DateTime.fromISO(dateRange.to).toFormat('dd/MM/yyyy')}`,
                                style: 'subheader',
                                margin: [0, 0, 0, 12],
                            },
                            ...tables,
                        ],
                        styles: {
                            header: { alignment: 'center', fontSize: 10 },
                            subheader: { alignment: 'center', fontSize: 9, margin: [0, 4, 0, 2] },
                            invoiceTitle: { fontSize: 9, bold: true },
                            table: { margin: [0, 4, 0, 10], fontSize: 8 },
                        },
                        pageMargins: 40,
                        pageSize: 'LETTER',
                        pageOrientation: config?.orientation || 'portrait',
                    })
                    .open();
            } catch (err) {
                console.error('Failed to print all sales:', err);
            }
        },
        [provider?.IdProveedor, provider?.Empresa, dateRange, salesSearch, salesData?.total, showNoe, currencyRate],
    );

    const handlePrintAllClients = useCallback(
        async (config) => {
            try {
                const { fetchProviderClients } = await import('api/providers');
                const result = await fetchProviderClients(provider.IdProveedor, {
                    from: dateRange.from,
                    to: dateRange.to,
                    page: 1,
                    limit: clientsData?.total || 9999,
                    search: clientsSearch || undefined,
                    showNoe,
                });
                const rows = result.data || [];
                const currency = config?.currency;
                const rate = currencyRate?.Cambio;
                const cols = config?.columns?.length ? config.columns : CLIENTS_COLUMNS;
                const body = [
                    cols.map((c) => c.Header),
                    ...rows.map((r) => cols.map((c) => printCellValue(c, r, currency, rate))),
                ];
                pdfMake
                    .createPdf({
                        content: [
                            { text: 'ALIMENTOS DM MARKET, C.A.', style: 'header' },
                            {
                                text: 'CALLE ILUSTRES PROCERES LOCAL NRO S/N SECTOR CENTRO ALTAGRACIA DE ORITUCO DE ORITUCO ZONA POSTAL 2320.',
                                style: 'header',
                            },
                            { text: 'R.I.F.: J-41270446-0', style: 'header' },
                            { text: `Clientes de: ${provider.Empresa}`, style: 'subheader' },
                            {
                                text: `Período: ${DateTime.fromISO(dateRange.from).toFormat('dd/MM/yyyy')} — ${DateTime.fromISO(dateRange.to).toFormat('dd/MM/yyyy')}`,
                                style: 'subheader',
                                margin: [0, 0, 0, 12],
                            },
                            {
                                style: 'table',
                                table: {
                                    widths: cols.map((_, i) => (i === 0 ? '*' : 'auto')),
                                    body,
                                },
                            },
                        ],
                        styles: {
                            header: { alignment: 'center', fontSize: 10 },
                            subheader: { alignment: 'center', fontSize: 9, margin: [0, 4, 0, 2] },
                            table: { margin: [0, 10, 0, 0], fontSize: 8 },
                        },
                        pageMargins: 40,
                        pageSize: 'LETTER',
                        pageOrientation: config?.orientation || 'portrait',
                    })
                    .open();
            } catch (err) {
                console.error('Failed to print all clients:', err);
            }
        },
        [provider?.IdProveedor, provider?.Empresa, dateRange, clientsSearch, clientsData?.total, showNoe, currencyRate],
    );

    const handlePrintAllProducts = useCallback(
        async (config) => {
            try {
                const { fetchProviderProducts } = await import('api/providers');
                const result = await fetchProviderProducts(provider.IdProveedor, {
                    from: dateRange.from,
                    to: dateRange.to,
                    page: 1,
                    limit: productsData?.total || 9999,
                    search: productsSearch || undefined,
                    showNoe,
                });
                const rows = result.data || [];
                const currency = config?.currency;
                const rate = currencyRate?.Cambio;
                const cols = config?.columns?.length ? config.columns : PRODUCTS_COLUMNS;
                const body = [
                    cols.map((c) => c.Header),
                    ...rows.map((r) => cols.map((c) => printCellValue(c, r, currency, rate))),
                ];
                pdfMake
                    .createPdf({
                        content: [
                            { text: 'ALIMENTOS DM MARKET, C.A.', style: 'header' },
                            {
                                text: 'CALLE ILUSTRES PROCERES LOCAL NRO S/N SECTOR CENTRO ALTAGRACIA DE ORITUCO DE ORITUCO ZONA POSTAL 2320.',
                                style: 'header',
                            },
                            { text: 'R.I.F.: J-41270446-0', style: 'header' },
                            { text: `Productos de: ${provider.Empresa}`, style: 'subheader' },
                            {
                                text: `Período: ${DateTime.fromISO(dateRange.from).toFormat('dd/MM/yyyy')} — ${DateTime.fromISO(dateRange.to).toFormat('dd/MM/yyyy')}`,
                                style: 'subheader',
                                margin: [0, 0, 0, 12],
                            },
                            {
                                style: 'table',
                                table: {
                                    widths: cols.map((_, i) => (i === 0 ? '*' : 'auto')),
                                    body,
                                },
                            },
                        ],
                        styles: {
                            header: { alignment: 'center', fontSize: 10 },
                            subheader: { alignment: 'center', fontSize: 9, margin: [0, 4, 0, 2] },
                            table: { margin: [0, 10, 0, 0], fontSize: 8 },
                        },
                        pageMargins: 40,
                        pageSize: 'LETTER',
                        pageOrientation: config?.orientation || 'portrait',
                    })
                    .open();
            } catch (err) {
                console.error('Failed to print all products:', err);
            }
        },
        [
            provider?.IdProveedor,
            provider?.Empresa,
            dateRange,
            productsSearch,
            productsData?.total,
            showNoe,
            currencyRate,
        ],
    );

    const handlePrintSale = useCallback(
        async (sale, e) => {
            if (e?.stopPropagation) e.stopPropagation();
            try {
                const detail = await fetchSaleDetail(provider.IdProveedor, sale.idFactura, showNoe);
                const rows = detail.productos.map((p) => [
                    p.descripcion,
                    String(Number(p.cantidad)),
                    formatCurrency(p.precio),
                    formatCurrency(p.subtotal),
                ]);
                pdfMake
                    .createPdf({
                        content: [
                            { text: 'ALIMENTOS DM MARKET, C.A.', style: 'header' },
                            {
                                text: 'CALLE ILUSTRES PROCERES LOCAL NRO S/N SECTOR CENTRO ALTAGRACIA DE ORITUCO DE ORITUCO ZONA POSTAL 2320.',
                                style: 'header',
                            },
                            { text: 'R.I.F.: J-41270446-0', style: 'header' },
                            { text: DateTime.fromISO(detail.fecha).toFormat('dd/MM/yyyy'), style: 'header' },
                            { text: `Factura: ${detail.idFactura}`, style: 'subheader' },
                            { text: `Proveedor: ${provider.Empresa}`, style: 'subheader', margin: [0, 0, 0, 12] },
                            {
                                style: 'table',
                                table: {
                                    widths: ['*', 'auto', 'auto', 'auto'],
                                    body: [
                                        ['Descripción', 'Cantidad', 'Precio', 'Subtotal'],
                                        ...rows,
                                        [
                                            '',
                                            '',
                                            { text: 'Total', bold: true },
                                            { text: formatCurrency(detail.total), bold: true },
                                        ],
                                    ],
                                },
                            },
                        ],
                        styles: {
                            header: { alignment: 'center', fontSize: 10 },
                            subheader: { alignment: 'center', fontSize: 9, margin: [0, 4, 0, 2] },
                            table: { margin: [0, 10, 0, 0], fontSize: 8 },
                        },
                        pageMargins: 40,
                        pageSize: 'LETTER',
                    })
                    .open();
            } catch (err) {
                console.error('Failed to print sale:', err);
            }
        },
        [provider?.IdProveedor, provider?.Empresa, showNoe],
    );

    // ── Stats ──
    const stats = useMemo(
        () => [
            {
                label: 'Total Compras',
                value: formatCurrency(summary?.totalCompras ?? 0),
                variant: 'primary',
                icon: IconTicket,
            },
            { label: '# Compras', value: String(summary?.numCompras ?? '0'), variant: 'success', icon: IconHash },
            {
                label: 'Total Ventas',
                value: formatCurrency(summary?.totalVentas ?? 0),
                variant: 'info',
                icon: IconSales,
            },
            { label: '# Ventas', value: String(summary?.numVentas ?? '0'), variant: 'warning', icon: IconHash },
            { label: 'Mejor Vendedor', value: summary?.bestSeller ?? '\u2014', variant: 'primary', icon: IconUserStar },
        ],
        [summary],
    );

    const avatarLetter = provider?.Empresa ? provider.Empresa.charAt(0).toUpperCase() : 'P';

    // ── Custom tab classes ──
    const tabs = [
        { key: 'ventas', label: 'Ventas' },
        { key: 'compras', label: 'Compras' },
        { key: 'clientes', label: 'Clientes' },
        { key: 'productos', label: 'Productos' },
    ];

    // ── Render helpers ──
    const renderTable = (tab) => {
        const configs = {
            ventas: {
                data: salesData,
                loading: salesLoading,
                page: salesPage,
                setPage: setSalesPage,
                search: salesSearch,
                onSearch: handleSalesSearch,
                sort: salesSort,
                onSort: handleSalesSort,
                onRowClick: handleSaleRowClick,
                onGlobalPrint: handlePrintAllSales,
                onRowPrint: handlePrintSale,
                emptyMessage: 'Sin ventas en este período',
                searchPlaceholder: 'Buscar por factura, cliente o vendedor...',
                columns: [
                    {
                        Header: 'Fecha',
                        accessor: 'fecha',
                        Cell: ({ value }) => DateTime.fromISO(value).toFormat('dd/MM/yyyy'),
                    },
                    { Header: 'Cliente', accessor: 'cliente' },
                    { Header: 'Vendedor', accessor: 'vendedor' },
                    { Header: 'Total', accessor: 'monto', Cell: ({ value }) => formatCurrency(value) },
                ],
            },
            compras: {
                data: purchasesData,
                loading: purchasesLoading,
                page: purchasesPage,
                setPage: setPurchasesPage,
                search: purchasesSearch,
                onSearch: handlePurchasesSearch,
                sort: purchasesSort,
                onSort: handlePurchasesSort,
                onRowClick: handlePurchaseRowClick,
                onGlobalPrint: handlePrintAllPurchases,
                onRowPrint: handlePrintPurchase,
                emptyMessage: 'Sin compras en este período',
                searchPlaceholder: 'Buscar por factura...',
                columns: [
                    {
                        Header: 'Fecha',
                        accessor: 'fecha',
                        Cell: ({ value }) => DateTime.fromISO(value).toFormat('dd/MM/yyyy'),
                    },
                    { Header: 'Factura', accessor: 'idFactura' },
                    { Header: 'Total', accessor: 'monto', Cell: ({ value }) => formatCurrency(value) },
                ],
            },
            clientes: {
                data: clientsData,
                loading: clientsLoading,
                page: clientsPage,
                setPage: setClientsPage,
                search: clientsSearch,
                onSearch: handleClientsSearch,
                sort: clientsSort,
                onSort: handleClientsSort,
                onGlobalPrint: handlePrintAllClients,
                emptyMessage: 'Sin clientes en este período',
                searchPlaceholder: 'Buscar por cliente...',
                columns: CLIENTS_COLUMNS,
            },
            productos: {
                data: productsData,
                loading: productsLoading,
                page: productsPage,
                setPage: setProductsPage,
                search: productsSearch,
                onSearch: handleProductsSearch,
                sort: productsSort,
                onSort: handleProductsSort,
                onGlobalPrint: handlePrintAllProducts,
                emptyMessage: 'Sin productos en este período',
                searchPlaceholder: 'Buscar por producto...',
                columns: PRODUCTS_COLUMNS,
            },
        };
        const c = configs[tab];
        if (!c) return null;

        return (
            <Table
                data={c.data?.data || []}
                columns={c.columns}
                loading={c.loading}
                emptyMessage={c.emptyMessage}
                onRowClick={c.onRowClick}
                print={{
                    enabled: true,
                    onGlobalPrint: c.onGlobalPrint,
                    perRowPrint: Boolean(c.onRowPrint),
                    onRowPrint: c.onRowPrint,
                    defaultOrientation: 'portrait',
                }}
                pagination={{
                    enabled: true,
                    page: c.page,
                    totalPages: Math.ceil((c.data?.total || 0) / LIMIT),
                    totalRows: c.data?.total ?? 0,
                    pageSize: LIMIT,
                    onPageChange: c.setPage,
                }}
                search={{
                    enabled: true,
                    onSearch: c.onSearch,
                    placeholder: c.searchPlaceholder || `Buscar ${tab}...`,
                }}
                sorting={{ enabled: true, sortBy: c.sort, onSort: c.onSort }}
            />
        );
    };

    return (
        <>
            <Modal
                show={show}
                size="xl"
                onHide={onClose}
                backdrop="static"
                scrollable
                className="provider-dashboard-modal"
            >
                <Modal.Header closeButton>
                    <div className="d-flex align-items-center gap-3">
                        <div className="provider-avatar">{avatarLetter}</div>
                        <div>
                            <Modal.Title>{provider?.Empresa}</Modal.Title>
                            <div className="provider-modal-subtitle">Proveedor #{provider?.IdProveedor}</div>
                        </div>
                    </div>
                </Modal.Header>
                <Modal.Body>
                    <div className="provider-date-picker-card">
                        <div className="provider-date-picker-label">Rango de fechas</div>
                        <DateRangePicker
                            key={provider?.IdProveedor || 'picker'}
                            initialFrom={oneMonthAgo}
                            initialTo={today}
                            onChange={handleDateRangeChange}
                        />
                    </div>

                    <div className="provider-stats-row">
                        {stats.map((stat) => (
                            <StatCard key={stat.label} {...stat} loading={summaryLoading} />
                        ))}
                    </div>

                    <div className="provider-tabs-container">
                        <div className="provider-tab-nav">
                            {tabs.map((t) => (
                                <button
                                    key={t.key}
                                    className={`provider-tab-button${activeTab === t.key ? ' active' : ''}`}
                                    onClick={() => setActiveTab(t.key)}
                                >
                                    {t.label}
                                </button>
                            ))}
                        </div>
                        <div className="provider-tab-content">{renderTable(activeTab)}</div>
                    </div>
                </Modal.Body>
            </Modal>

            {detailModalShow && (
                <PurchaseDetailModal
                    show={detailModalShow}
                    onClose={() => setDetailModalShow(false)}
                    purchase={selectedPurchase}
                    provider={provider}
                />
            )}
            {saleDetailModalShow && (
                <SaleDetailModal
                    show={saleDetailModalShow}
                    onClose={() => setSaleDetailModalShow(false)}
                    sale={selectedSale}
                    provider={provider}
                />
            )}
        </>
    );
};

export default ProviderDashboardModal;
