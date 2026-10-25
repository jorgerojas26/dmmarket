import { fetchProviderExport, fetchProviderPurchaseExport, fetchProviderSaleExport } from 'api/providers';
import { useAuth } from 'auth/context';
import DateRangePicker from 'components/DateRangePicker';
import Modal from 'components/Modal';
import Table from 'components/Table';
import { CurrencyRateContext } from 'context/currency_rate';
import { ShowNoeContext } from 'context/show_noe';
import usePrivateState from 'hooks/usePrivateState';
import {
    fetchPurchaseDetail,
    fetchSaleDetail,
    useProviderClients,
    useProviderProducts,
    useProviderPurchases,
    useProviderSales,
    useProviderSellers,
    useProviderSummary,
} from 'hooks/useProviders';
import { DateTime } from 'luxon';
import pdfMake from 'pdfmake/build/pdfmake';
import pdfFonts from 'pdfmake/build/vfs_fonts';
import { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Spinner } from 'react-bootstrap';
import { useSWRConfig } from 'swr';
import { formatCurrency as formatCurrencyValue, formatMoney, formatReportId } from 'utils/format';
import { sortRows } from 'utils/sortRows';
import ProductDetailModal from './ProductDetailModal';
import PurchaseDetailModal from './PurchaseDetailModal';
import SaleDetailModal from './SaleDetailModal';
import SellerDetailModal from './SellerDetailModal';
import './styles.css';

pdfMake.vfs = pdfFonts.pdfMake ? pdfFonts.pdfMake.vfs : pdfMake.vfs;

const formatCurrency = (value) => (value == null ? 'No disponible' : formatCurrencyValue(value));

const LIMIT = 50;

const currencyFooter =
    (accessor) =>
    ({ data, summary }) =>
        summary === null || data.some((row) => row[accessor] == null)
            ? 'No disponible'
            : formatCurrency(
                  summary != null ? Number(summary) : data.reduce((sum, row) => sum + Number(row[accessor] || 0), 0),
              );

const CLIENTS_COLUMNS = [
    { Header: 'Cliente', accessor: 'cliente' },
    {
        Header: 'Total Ventas',
        accessor: 'totalVentas',
        Cell: ({ value }) => formatCurrency(value),
        Footer: currencyFooter('totalVentas'),
    },
    { Header: '# Ventas', accessor: 'numVentas' },
    {
        Header: 'Utilidad',
        accessor: 'utilidad',
        Cell: ({ value }) => formatCurrency(value),
        Footer: currencyFooter('utilidad'),
    },
];

const SELLERS_COLUMNS = [
    { Header: 'Vendedor', accessor: 'vendedor' },
    {
        Header: 'Total Ventas',
        accessor: 'totalVentas',
        Cell: ({ value }) => formatCurrency(value),
        Footer: currencyFooter('totalVentas'),
    },
    {
        Header: 'Utilidad',
        accessor: 'utilidad',
        Cell: ({ value }) => formatCurrency(value),
        Footer: currencyFooter('utilidad'),
    },
    {
        Header: 'Unidades',
        accessor: 'cantidad',
        Cell: ({ value }) => (value == null ? 'No disponible' : Number(value).toLocaleString()),
    },
    { Header: 'Número de clientes', accessor: 'numClientes' },
];

const PRODUCTS_COLUMNS = [
    { Header: 'Producto', accessor: 'producto' },
    {
        Header: 'Cantidad',
        accessor: 'cantidad',
        Cell: ({ value }) => (value == null ? 'No disponible' : Number(value).toLocaleString()),
    },
    {
        Header: 'Total Ventas',
        accessor: 'totalVentas',
        Cell: ({ value }) => formatCurrency(value),
        Footer: currencyFooter('totalVentas'),
    },
    {
        Header: 'Utilidad',
        accessor: 'utilidad',
        Cell: ({ value }) => formatCurrency(value),
        Footer: currencyFooter('utilidad'),
    },
];

/** Formats a cell value for PDF output, honoring the print currency option for money columns. */
const printCellValue = (col, row, currency, rate) => {
    const value = row[col.accessor];
    switch (col.accessor) {
        case 'totalVentas':
        case 'monto':
        case 'utilidad':
            return value == null ? 'No disponible' : formatMoney(value, currency, rate);
        case 'cantidad':
            return value == null ? 'No disponible' : Number(value).toLocaleString();
        default:
            return value;
    }
};

const documentTable = (detail, format) => {
    const fields = [
        ['descripcion', 'Descripción'],
        ['cantidad', 'Cantidad'],
        ['precio', 'Precio'],
        ['subtotal', 'Subtotal'],
        ['utilidad', 'Utilidad'],
    ].filter(
        ([key]) =>
            detail.productos.every((row) => Object.hasOwn(row, key)) &&
            (detail.productos.length > 0 || ['descripcion', 'cantidad'].includes(key)),
    );
    const money = (value) => (value == null ? 'No disponible' : format(value));
    return {
        widths: fields.map(([key]) => (key === 'descripcion' ? '*' : 'auto')),
        body: [
            fields.map(([, label]) => label),
            ...detail.productos.map((row) =>
                fields.map(([key]) =>
                    key === 'descripcion'
                        ? row[key]
                        : key === 'cantidad'
                          ? row[key] == null
                              ? 'No disponible'
                              : String(Number(row[key]))
                          : money(row[key]),
                ),
            ),
            ...(Object.hasOwn(detail, 'total') && fields.some(([key]) => key === 'subtotal')
                ? [
                      fields.map(([key]) =>
                          key === 'precio'
                              ? { text: 'Total', bold: true }
                              : key === 'subtotal'
                                ? { text: money(detail.total), bold: true }
                                : key === 'utilidad'
                                  ? { text: money(detail.utilidad), bold: true }
                                  : '',
                      ),
                  ]
                : []),
        ],
    };
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

const IconProfit = () => (
    <svg
        aria-hidden="true"
        width="38"
        height="38"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
    >
        <path d="m3 17 6-6 4 4 8-8" />
        <path d="M15 7h6v6" />
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
    const { mutate: mutateCache } = useSWRConfig();
    const close = useCallback(() => {
        mutateCache(
            (key) =>
                Array.isArray(key) &&
                key[0] === 'private-ui' &&
                typeof key[1] === 'string' &&
                (key[1].endsWith(`:${provider.IdProveedor}`) ||
                    key[1].startsWith(`provider-product:${provider.IdProveedor}:`) ||
                    key[1].startsWith(`provider-seller:${provider.IdProveedor}:`)),
            undefined,
            { revalidate: false },
        );
        onClose();
    }, [mutateCache, provider.IdProveedor, onClose]);
    useEffect(
        () => () => {
            if (window.location.pathname !== '/proveedores') close();
        },
        [close],
    );
    const { session, can } = useAuth();
    const has = (cap) => session.permissions.some((grant) => grant.capability === cap);
    const canSales = has('sales.read'),
        canPurchases = can('purchases.read'),
        canClients = canSales && can('clients.read'),
        canSellers = canSales && has('sellers.read');
    const allowedTabs = [
        ...(canSales ? ['ventas'] : []),
        ...(canPurchases ? ['compras'] : []),
        ...(canClients ? ['clientes'] : []),
        ...(canSellers ? ['vendedores'] : []),
        ...(canSales ? ['productos'] : []),
    ];
    const [printError, setPrintError] = useState('');
    const { showNoe } = useContext(ShowNoeContext);
    const { currencyRate } = useContext(CurrencyRateContext);

    const today = DateTime.now().toISODate();
    const oneMonthAgo = DateTime.now().minus({ months: 1 }).toISODate();

    const [dateRange, setDateRange] = usePrivateState(`provider-range:${provider.IdProveedor}`, {
        from: oneMonthAgo,
        to: today,
    });
    const [activeTab, setActiveTab] = usePrivateState(`provider-tab:${provider.IdProveedor}`, allowedTabs[0]);
    const [selectedSeller, setSelectedSeller] = usePrivateState(
        `provider-selectedSeller:${provider.IdProveedor}`,
        null,
    );
    const [selectedProduct, setSelectedProduct] = usePrivateState(
        `provider-selectedProduct:${provider.IdProveedor}`,
        null,
    );

    // Pagination
    const [purchasesPage, setPurchasesPage] = usePrivateState(`provider-purchasesPage:${provider.IdProveedor}`, 1);
    const [salesPage, setSalesPage] = usePrivateState(`provider-salesPage:${provider.IdProveedor}`, 1);
    const [clientsPage, setClientsPage] = usePrivateState(`provider-clientsPage:${provider.IdProveedor}`, 1);
    const [sellersPage, setSellersPage] = usePrivateState(`provider-sellersPage:${provider.IdProveedor}`, 1);
    const [productsPage, setProductsPage] = usePrivateState(`provider-productsPage:${provider.IdProveedor}`, 1);

    // Search
    const [purchasesSearch, setPurchasesSearch] = usePrivateState(
        `provider-purchasesSearch:${provider.IdProveedor}`,
        '',
    );
    const [salesSearch, setSalesSearch] = usePrivateState(`provider-salesSearch:${provider.IdProveedor}`, '');
    const [clientsSearch, setClientsSearch] = usePrivateState(`provider-clientsSearch:${provider.IdProveedor}`, '');
    const [sellersSearch, setSellersSearch] = usePrivateState(`provider-sellersSearch:${provider.IdProveedor}`, '');
    const [productsSearch, setProductsSearch] = usePrivateState(`provider-productsSearch:${provider.IdProveedor}`, '');

    // Sort
    const [purchasesSort, setPurchasesSort] = usePrivateState(`provider-purchasesSort:${provider.IdProveedor}`, [
        { id: 'fecha', desc: true },
    ]);
    const [salesSort, setSalesSort] = usePrivateState(`provider-salesSort:${provider.IdProveedor}`, [
        { id: 'fecha', desc: true },
    ]);
    const [clientsSort, setClientsSort] = usePrivateState(`provider-clientsSort:${provider.IdProveedor}`, [
        { id: 'totalVentas', desc: true },
    ]);
    const [sellersSort, setSellersSort] = usePrivateState(`provider-sellersSort:${provider.IdProveedor}`, [
        { id: 'totalVentas', desc: true },
    ]);
    const [productsSort, setProductsSort] = usePrivateState(`provider-productsSort:${provider.IdProveedor}`, [
        { id: 'totalVentas', desc: true },
    ]);

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
        enabled && canPurchases && activeTab === 'compras',
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
        enabled && canSales && activeTab === 'ventas',
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
        enabled && canClients && activeTab === 'clientes',
    );

    const {
        data: sellersData,
        isLoading: sellersLoading,
        error: sellersError,
    } = useProviderSellers(
        provider?.IdProveedor,
        {
            from: dateRange.from,
            to: dateRange.to,
            page: sellersPage,
            limit: LIMIT,
            search: sellersSearch || undefined,
            sortBy: sellersSort[0]?.id,
            sortDir: sellersSort[0]?.desc ? 'desc' : 'asc',
            showNoe,
        },
        enabled && canSellers && activeTab === 'vendedores',
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
        enabled && canSales && activeTab === 'productos',
    );

    const handleDateRangeChange = ({ from, to }) => {
        setDateRange({ from, to });
        setPurchasesPage(1);
        setSalesPage(1);
        setClientsPage(1);
        setProductsPage(1);
        setSellersPage(1);
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
    const handleSellersSearch = useCallback((term) => {
        setSellersSearch(term || '');
        setSellersPage(1);
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
    const handleSellersSort = useCallback((s) => {
        setSellersSort(s.length ? s : [{ id: 'totalVentas', desc: true }]);
        setSellersPage(1);
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
                if (err.name !== 'AbortError')
                    setPrintError('No se pudo completar la operación autorizada del proveedor.');
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
                if (err.name !== 'AbortError')
                    setPrintError('No se pudo completar la operación autorizada del proveedor.');
            }
        },
        [provider?.IdProveedor, showNoe],
    );

    const handlePrintPurchase = useCallback(
        async (purchase, e) => {
            if (e?.stopPropagation) e.stopPropagation();
            try {
                const detail = await fetchProviderPurchaseExport(provider.IdProveedor, purchase.idFactura);
                const table = documentTable(detail, formatCurrency);
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
                                table,
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
                if (err.name !== 'AbortError')
                    setPrintError('No se pudo completar la operación autorizada del proveedor.');
            }
        },
        [provider?.IdProveedor, provider?.Empresa],
    );

    const handlePrintAllPurchases = useCallback(
        async (config) => {
            try {
                const result = await fetchProviderExport(provider.IdProveedor, 'purchase-documents', {
                    from: dateRange.from,
                    to: dateRange.to,
                    search: config.search ?? purchasesSearch,
                });
                const invoices = sortRows(result.data || [], config?.sortBy);
                const tables = [];
                const currency = config?.currency;
                const rate = currencyRate?.Cambio;
                if (currency === 'BsS' && !(Number(rate) > 0 && Number.isFinite(Number(rate))))
                    throw new Error('Tasa no disponible.');
                for (const inv of invoices) {
                    const detail = inv.detail;
                    const table = documentTable(detail, (value) => formatMoney(value, currency, rate));
                    tables.push(
                        {
                            text: `Factura: ${detail.idFactura} — ${DateTime.fromISO(detail.fecha).toFormat('dd/MM/yyyy')}`,
                            style: 'invoiceTitle',
                            margin: [0, 14, 0, 4],
                        },
                        {
                            style: 'table',
                            table,
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
                if (err.name !== 'AbortError')
                    setPrintError('No se pudo completar la operación autorizada del proveedor.');
            }
        },
        [provider?.IdProveedor, provider?.Empresa, dateRange, purchasesSearch, purchasesData?.total, currencyRate],
    );

    const handlePrintAllSales = useCallback(
        async (config) => {
            try {
                const result = await fetchProviderExport(provider.IdProveedor, 'sales-documents', {
                    from: dateRange.from,
                    to: dateRange.to,
                    search: config.search ?? salesSearch,
                    showNoe,
                });
                const invoices = sortRows(result.data || [], config?.sortBy);
                const tables = [];
                const currency = config?.currency;
                const rate = currencyRate?.Cambio;
                if (currency === 'BsS' && !(Number(rate) > 0 && Number.isFinite(Number(rate))))
                    throw new Error('Tasa no disponible.');
                for (const inv of invoices) {
                    const detail = inv.detail;
                    const table = documentTable(detail, (value) => formatMoney(value, currency, rate));
                    tables.push(
                        {
                            text: `Factura: ${detail.idFactura} — ${DateTime.fromISO(detail.fecha).toFormat('dd/MM/yyyy')}`,
                            style: 'invoiceTitle',
                            margin: [0, 14, 0, 4],
                        },
                        {
                            style: 'table',
                            table,
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
                if (err.name !== 'AbortError')
                    setPrintError('No se pudo completar la operación autorizada del proveedor.');
            }
        },
        [provider?.IdProveedor, provider?.Empresa, dateRange, salesSearch, salesData?.total, showNoe, currencyRate],
    );

    const handlePrintAllClients = useCallback(
        async (config) => {
            try {
                const result = await fetchProviderExport(provider.IdProveedor, 'clients', {
                    from: dateRange.from,
                    to: dateRange.to,
                    search: config.search ?? clientsSearch,
                    showNoe,
                });
                const rows = sortRows(result.data || [], config?.sortBy);
                const currency = config?.currency;
                const rate = currencyRate?.Cambio;
                if (currency === 'BsS' && !(Number(rate) > 0 && Number.isFinite(Number(rate))))
                    throw new Error('Tasa no disponible.');
                const cols = (config.columns || []).filter((column) =>
                    result.columns.some((server) => server.key === column.accessor),
                );
                if (!cols.length) throw new Error('Selecciona columnas autorizadas.');
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
                if (err.name !== 'AbortError')
                    setPrintError('No se pudo completar la operación autorizada del proveedor.');
            }
        },
        [provider?.IdProveedor, provider?.Empresa, dateRange, clientsSearch, clientsData?.total, showNoe, currencyRate],
    );

    const handlePrintAllSellers = useCallback(
        async (config) => {
            try {
                const result = await fetchProviderExport(provider.IdProveedor, 'sellers', {
                    from: dateRange.from,
                    to: dateRange.to,
                    search: config.search ?? sellersSearch,
                    showNoe,
                });
                const rows = sortRows(result.data || [], config?.sortBy);
                const currency = config?.currency;
                const rate = currencyRate?.Cambio;
                if (currency === 'BsS' && !(Number(rate) > 0 && Number.isFinite(Number(rate))))
                    throw new Error('Tasa no disponible.');
                const cols = (config.columns || []).filter((column) =>
                    result.columns.some((server) => server.key === column.accessor),
                );
                if (!cols.length) throw new Error('Selecciona columnas autorizadas.');
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
                            { text: `Vendedores de: ${provider.Empresa}`, style: 'subheader' },
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
                if (err.name !== 'AbortError')
                    setPrintError('No se pudo completar la operación autorizada del proveedor.');
            }
        },
        [provider?.IdProveedor, provider?.Empresa, dateRange, sellersSearch, sellersData?.total, showNoe, currencyRate],
    );

    const handlePrintAllProducts = useCallback(
        async (config) => {
            try {
                const result = await fetchProviderExport(provider.IdProveedor, 'products', {
                    from: dateRange.from,
                    to: dateRange.to,
                    search: config.search ?? productsSearch,
                    showNoe,
                });
                const rows = sortRows(result.data || [], config?.sortBy);
                const currency = config?.currency;
                const rate = currencyRate?.Cambio;
                if (currency === 'BsS' && !(Number(rate) > 0 && Number.isFinite(Number(rate))))
                    throw new Error('Tasa no disponible.');
                const cols = (config.columns || []).filter((column) =>
                    result.columns.some((server) => server.key === column.accessor),
                );
                if (!cols.length) throw new Error('Selecciona columnas autorizadas.');
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
                if (err.name !== 'AbortError')
                    setPrintError('No se pudo completar la operación autorizada del proveedor.');
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
                const detail = await fetchProviderSaleExport(provider.IdProveedor, sale.idFactura, showNoe);
                const table = documentTable(detail, formatCurrency);
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
                                table,
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
                if (err.name !== 'AbortError')
                    setPrintError('No se pudo completar la operación autorizada del proveedor.');
            }
        },
        [provider?.IdProveedor, provider?.Empresa, showNoe],
    );

    // ── Stats ──
    const stats = useMemo(
        () => [
            {
                label: 'Total Compras',
                value: summary?.totalCompras == null ? 'No disponible' : formatCurrency(summary.totalCompras),
                variant: 'primary',
                icon: IconTicket,
            },
            {
                label: 'Total Ventas',
                value: summary?.totalVentas == null ? 'No disponible' : formatCurrency(summary.totalVentas),
                variant: 'info',
                icon: IconSales,
            },
            {
                label: 'Utilidad',
                value: summary?.utilidad == null ? 'No disponible' : formatCurrency(summary.utilidad),
                variant: 'success',
                icon: IconProfit,
            },
            { label: '# Compras', value: String(summary?.numCompras ?? '0'), variant: 'success', icon: IconHash },
            { label: '# Ventas', value: String(summary?.numVentas ?? '0'), variant: 'warning', icon: IconHash },
            { label: 'Mejor Vendedor', value: summary?.bestSeller ?? '\u2014', variant: 'primary', icon: IconUserStar },
        ],
        [summary],
    ).filter((stat) =>
        Object.hasOwn(
            summary || {},
            {
                'Total Compras': 'totalCompras',
                'Total Ventas': 'totalVentas',
                Utilidad: 'utilidad',
                '# Compras': 'numCompras',
                '# Ventas': 'numVentas',
                'Mejor Vendedor': 'bestSeller',
            }[stat.label],
        ),
    );

    const avatarLetter = provider?.Empresa ? provider.Empresa.charAt(0).toUpperCase() : 'P';

    // ── Custom tab classes ──
    const tabs = [
        { key: 'ventas', label: 'Ventas' },
        { key: 'compras', label: 'Compras' },
        { key: 'clientes', label: 'Clientes' },
        { key: 'vendedores', label: 'Vendedores' },
        { key: 'productos', label: 'Productos' },
    ].filter((tab) => allowedTabs.includes(tab.key));

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
                    {
                        Header: 'Total',
                        accessor: 'monto',
                        Cell: ({ value }) => formatCurrency(value),
                        Footer: currencyFooter('monto'),
                    },
                    {
                        Header: 'Utilidad',
                        accessor: 'utilidad',
                        Cell: ({ value }) => formatCurrency(value),
                        Footer: currencyFooter('utilidad'),
                    },
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
            vendedores: {
                data: sellersData,
                loading: sellersLoading,
                page: sellersPage,
                setPage: setSellersPage,
                search: sellersSearch,
                onSearch: handleSellersSearch,
                sort: sellersSort,
                onSort: handleSellersSort,
                onGlobalPrint: handlePrintAllSellers,
                emptyMessage: sellersError ? 'Error al cargar vendedores' : 'Sin vendedores en este período',
                searchPlaceholder: 'Buscar por vendedor...',
                columns: SELLERS_COLUMNS,
                onRowClick: setSelectedSeller,
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
                onRowClick: setSelectedProduct,
            },
        };
        const c = configs[tab];
        if (!c) return null;

        return (
            <Table
                data={c.data?.data || []}
                columns={c.columns.filter(
                    (column) =>
                        !['utilidad', 'monto', 'totalVentas', 'cantidad', 'numClientes'].includes(column.accessor) ||
                        c.data?.data?.some((row) => Object.hasOwn(row, column.accessor)) ||
                        Object.hasOwn(c.data?.totals || {}, column.accessor),
                )}
                loading={c.loading}
                showFooter={!!c.data?.totals}
                summaries={c.data?.totals}
                emptyMessage={c.emptyMessage}
                onRowClick={
                    tab === 'vendedores' && !canClients
                        ? undefined
                        : tab === 'productos' && !canClients && !canSellers
                          ? undefined
                          : c.onRowClick
                }
                print={{
                    enabled: c.data?.exportAllowed === true || (tab === 'ventas' && has('sales.export')),
                    onGlobalPrint: c.data?.exportAllowed === true ? c.onGlobalPrint : undefined,
                    perRowPrint: Boolean(c.onRowPrint),
                    canPrintRow: (row) => (tab === 'compras' ? can('purchases.export') : row.exportAllowed === true),
                    onRowPrint: c.onRowPrint,
                    defaultOrientation: 'portrait',
                    storageKey: `proveedor-${tab}`,
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
                    initialValue: c.search,
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
                onHide={close}
                backdrop="static"
                scrollable
                className="provider-dashboard-modal"
            >
                <Modal.Header closeButton>
                    <div className="d-flex align-items-center gap-3">
                        <div className="provider-avatar">{avatarLetter}</div>
                        <div>
                            <Modal.Title>{provider?.Empresa}</Modal.Title>
                            <div className="provider-modal-subtitle">
                                Proveedor #{formatReportId(provider?.IdProveedor)}
                            </div>
                        </div>
                    </div>
                </Modal.Header>
                <Modal.Body>
                    {printError && (
                        <div role="alert" className="alert alert-danger">
                            {printError}
                        </div>
                    )}
                    {(canSales || canPurchases) && (
                        <div className="provider-date-picker-card">
                            <div className="provider-date-picker-label">Rango de fechas</div>
                            <DateRangePicker
                                key={provider?.IdProveedor || 'picker'}
                                initialFrom={dateRange.from}
                                initialTo={dateRange.to}
                                onChange={handleDateRangeChange}
                            />
                        </div>
                    )}

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
                                    type="button"
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

            {selectedProduct && (
                <ProductDetailModal
                    key={`${provider?.IdProveedor}-${selectedProduct.productId}-${dateRange.from}-${dateRange.to}-${showNoe}`}
                    show={show}
                    onClose={() => setSelectedProduct(null)}
                    product={selectedProduct}
                    provider={provider}
                    dateRange={dateRange}
                    showNoe={showNoe}
                />
            )}
            {selectedSeller && (
                <SellerDetailModal
                    key={`${provider?.IdProveedor}-${selectedSeller.sellerId}-${dateRange.from}-${dateRange.to}-${showNoe}`}
                    show={show}
                    onClose={() => setSelectedSeller(null)}
                    seller={selectedSeller}
                    provider={provider}
                    dateRange={dateRange}
                    showNoe={showNoe}
                />
            )}
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
