import DateRangePicker from 'components/DateRangePicker';
import Table from 'components/Table';
import { ShowNoeContext } from 'context/show_noe';
import { DateTime } from 'luxon';
import { useCallback, useContext, useMemo, useState } from 'react';
import Badge from 'react-bootstrap/Badge';
import Modal from 'react-bootstrap/Modal';
import Nav from 'react-bootstrap/Nav';
import Spinner from 'react-bootstrap/Spinner';
import { formatCurrency } from 'utils/format';
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
import PurchaseDetailModal from './PurchaseDetailModal';
import SaleDetailModal from './SaleDetailModal';

pdfMake.vfs = pdfFonts.pdfMake ? pdfFonts.pdfMake.vfs : pdfMake.vfs;

const LIMIT = 20;

const IconSales = () => (
    <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
    >
        <line x1="12" y1="1" x2="12" y2="23" />
        <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </svg>
);
const IconHash = () => (
    <svg
        width="20"
        height="20"
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
const IconShoppingCart = () => (
    <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
    >
        <circle cx="9" cy="21" r="1" />
        <circle cx="20" cy="21" r="1" />
        <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
    </svg>
);
const IconUser = () => (
    <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
    >
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
    </svg>
);

const StatCard = ({ label, value, variant, icon: Icon, loading }) => (
    <div className="stat-card">
        <div className="stat-card-icon-wrapper">
            <div className={`stat-card-icon stat-card-icon--${variant}`}>
                {loading ? <Spinner animation="border" size="sm" /> : <Icon />}
            </div>
        </div>
        <div className="stat-card-body">
            <div className="stat-card-label">{label}</div>
            <div className="stat-card-value">{value}</div>
        </div>
    </div>
);

const ProviderDashboardModal = ({ show, onClose, provider }) => {
    const { showNoe } = useContext(ShowNoeContext);

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

    // ── SWR hooks — each one active only when modal is shown ──
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

    const handlePurchasesSort = useCallback((sortBy) => {
        setPurchasesSort(sortBy.length ? sortBy : [{ id: 'fecha', desc: true }]);
    }, []);
    const handleSalesSort = useCallback((sortBy) => {
        setSalesSort(sortBy.length ? sortBy : [{ id: 'fecha', desc: true }]);
    }, []);
    const handleClientsSort = useCallback((sortBy) => {
        setClientsSort(sortBy.length ? sortBy : [{ id: 'totalVentas', desc: true }]);
    }, []);
    const handleProductsSort = useCallback((sortBy) => {
        setProductsSort(sortBy.length ? sortBy : [{ id: 'totalVentas', desc: true }]);
    }, []);

    // Imperative detail fetches (one-shot)
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
                const { fetchProviderPurchases } = await import('api/providers');
                const detail = await fetchPurchaseDetail(provider.IdProveedor, purchase.idFactura);
                const rows = detail.productos.map((p) => [
                    p.descripcion,
                    String(Number(p.cantidad)),
                    formatCurrency(p.precio),
                    formatCurrency(p.subtotal),
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
                            text: DateTime.fromISO(detail.fecha).toFormat('dd/MM/yyyy'),
                            style: 'header',
                        },
                        {
                            text: `Factura de compra: ${detail.idFactura}`,
                            style: 'subheader',
                        },
                        {
                            text: `Proveedor: ${provider.Empresa}`,
                            style: 'subheader',
                            margin: [0, 0, 0, 12],
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
                                        {
                                            text: formatCurrency(detail.total),
                                            bold: true,
                                        },
                                    ],
                                ],
                            },
                        },
                    ],
                    styles: {
                        header: { alignment: 'center', fontSize: 10 },
                        subheader: {
                            alignment: 'center',
                            fontSize: 9,
                            margin: [0, 4, 0, 2],
                        },
                        table: { margin: [0, 10, 0, 0], fontSize: 8 },
                    },
                    pageMargins: 40,
                    pageSize: 'LETTER',
                };
                pdfMake.createPdf(docDef).open();
            } catch (err) {
                console.error('Failed to print purchase:', err);
            }
        },
        [provider?.IdProveedor, provider?.Empresa],
    );

    const handlePrintAllPurchases = useCallback(async () => {
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
            for (const inv of invoices) {
                const detail = await fetchPurchaseDetail(provider.IdProveedor, inv.idFactura);
                const rows = detail.productos.map((p) => [
                    p.descripcion,
                    String(Number(p.cantidad)),
                    formatCurrency(p.precio),
                    formatCurrency(p.subtotal),
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
                                    {
                                        text: formatCurrency(detail.total),
                                        bold: true,
                                    },
                                ],
                            ],
                        },
                    },
                );
            }

            const docDef = {
                content: [
                    { text: 'ALIMENTOS DM MARKET, C.A.', style: 'header' },
                    {
                        text: 'CALLE ILUSTRES PROCERES LOCAL NRO S/N SECTOR CENTRO ALTAGRACIA DE ORITUCO DE ORITUCO ZONA POSTAL 2320.',
                        style: 'header',
                    },
                    { text: 'R.I.F.: J-41270446-0', style: 'header' },
                    {
                        text: `Compras a: ${provider.Empresa}`,
                        style: 'subheader',
                    },
                    {
                        text: `Período: ${DateTime.fromISO(dateRange.from).toFormat('dd/MM/yyyy')} — ${DateTime.fromISO(dateRange.to).toFormat('dd/MM/yyyy')}`,
                        style: 'subheader',
                        margin: [0, 0, 0, 12],
                    },
                    ...tables,
                ],
                styles: {
                    header: { alignment: 'center', fontSize: 10 },
                    subheader: {
                        alignment: 'center',
                        fontSize: 9,
                        margin: [0, 4, 0, 2],
                    },
                    invoiceTitle: { fontSize: 9, bold: true },
                    table: { margin: [0, 4, 0, 10], fontSize: 8 },
                },
                pageMargins: 40,
                pageSize: 'LETTER',
            };
            pdfMake.createPdf(docDef).open();
        } catch (err) {
            console.error('Failed to print all purchases:', err);
        }
    }, [provider?.IdProveedor, provider?.Empresa, dateRange, purchasesSearch, purchasesData?.total]);

    const handlePrintAllSales = useCallback(async () => {
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
            for (const inv of invoices) {
                const detail = await fetchSaleDetail(provider.IdProveedor, inv.idFactura, showNoe);
                const rows = detail.productos.map((p) => [
                    p.descripcion,
                    String(Number(p.cantidad)),
                    formatCurrency(p.precio),
                    formatCurrency(p.subtotal),
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
                                    {
                                        text: formatCurrency(detail.total),
                                        bold: true,
                                    },
                                ],
                            ],
                        },
                    },
                );
            }

            const docDef = {
                content: [
                    { text: 'ALIMENTOS DM MARKET, C.A.', style: 'header' },
                    {
                        text: 'CALLE ILUSTRES PROCERES LOCAL NRO S/N SECTOR CENTRO ALTAGRACIA DE ORITUCO DE ORITUCO ZONA POSTAL 2320.',
                        style: 'header',
                    },
                    { text: 'R.I.F.: J-41270446-0', style: 'header' },
                    {
                        text: `Ventas de: ${provider.Empresa}`,
                        style: 'subheader',
                    },
                    {
                        text: `Período: ${DateTime.fromISO(dateRange.from).toFormat('dd/MM/yyyy')} — ${DateTime.fromISO(dateRange.to).toFormat('dd/MM/yyyy')}`,
                        style: 'subheader',
                        margin: [0, 0, 0, 12],
                    },
                    ...tables,
                ],
                styles: {
                    header: { alignment: 'center', fontSize: 10 },
                    subheader: {
                        alignment: 'center',
                        fontSize: 9,
                        margin: [0, 4, 0, 2],
                    },
                    invoiceTitle: { fontSize: 9, bold: true },
                    table: { margin: [0, 4, 0, 10], fontSize: 8 },
                },
                pageMargins: 40,
                pageSize: 'LETTER',
            };
            pdfMake.createPdf(docDef).open();
        } catch (err) {
            console.error('Failed to print all sales:', err);
        }
    }, [provider?.IdProveedor, provider?.Empresa, dateRange, salesSearch, salesData?.total, showNoe]);

    const stats = useMemo(
        () => [
            {
                label: 'Total Compras',
                value: formatCurrency(summary?.totalCompras ?? 0),
                variant: 'primary',
                icon: IconShoppingCart,
            },
            {
                label: '# Compras',
                value: String(summary?.numCompras ?? '0'),
                variant: 'success',
                icon: IconHash,
            },
            {
                label: 'Total Ventas',
                value: formatCurrency(summary?.totalVentas ?? 0),
                variant: 'info',
                icon: IconSales,
            },
            {
                label: '# Ventas',
                value: String(summary?.numVentas ?? '0'),
                variant: 'warning',
                icon: IconHash,
            },
            {
                label: 'Mejor Vendedor',
                value: summary?.bestSeller ?? '\u2014',
                variant: 'purple',
                icon: IconUser,
            },
        ],
        [summary],
    );

    const avatarLetter = provider?.Empresa ? provider.Empresa.charAt(0).toUpperCase() : 'P';

    const renderTabContent = () => {
        switch (activeTab) {
            case 'ventas':
                return (
                    <Table
                        data={salesData?.data || []}
                        columns={[
                            {
                                Header: 'Fecha',
                                accessor: 'fecha',
                                Cell: ({ value }) => DateTime.fromISO(value).toFormat('dd/MM/yyyy'),
                            },
                            { Header: 'Cliente', accessor: 'empresa' },
                            { Header: 'Vendedor', accessor: 'vendedor' },
                            { Header: 'Total', accessor: 'monto', Cell: ({ value }) => formatCurrency(value) },
                        ]}
                        loading={salesLoading}
                        emptyMessage="Sin ventas en este período"
                        pagination={{
                            enabled: true,
                            page: salesPage,
                            totalPages: Math.ceil((salesData?.total || 0) / LIMIT),
                            totalRows: salesData?.total ?? 0,
                            pageSize: LIMIT,
                            onPageChange: setSalesPage,
                        }}
                        search={{
                            enabled: true,
                            value: salesSearch,
                            onChange: handleSalesSearch,
                            placeholder: 'Buscar ventas...',
                        }}
                        sort={{
                            enabled: true,
                            value: salesSort,
                            onChange: handleSalesSort,
                        }}
                        onRowClick={handleSaleRowClick}
                        onGlobalPrint={handlePrintAllSales}
                        onRowPrint={handlePrintSale}
                    />
                );
            case 'compras':
                return (
                    <Table
                        data={purchasesData?.data || []}
                        columns={[
                            {
                                Header: 'Fecha',
                                accessor: 'fecha',
                                Cell: ({ value }) => DateTime.fromISO(value).toFormat('dd/MM/yyyy'),
                            },
                            { Header: 'Factura', accessor: 'idFactura' },
                            { Header: 'Total', accessor: 'monto', Cell: ({ value }) => formatCurrency(value) },
                        ]}
                        loading={purchasesLoading}
                        emptyMessage="Sin compras en este período"
                        pagination={{
                            enabled: true,
                            page: purchasesPage,
                            totalPages: Math.ceil((purchasesData?.total || 0) / LIMIT),
                            totalRows: purchasesData?.total ?? 0,
                            pageSize: LIMIT,
                            onPageChange: setPurchasesPage,
                        }}
                        search={{
                            enabled: true,
                            value: purchasesSearch,
                            onChange: handlePurchasesSearch,
                            placeholder: 'Buscar compras...',
                        }}
                        sort={{
                            enabled: true,
                            value: purchasesSort,
                            onChange: handlePurchasesSort,
                        }}
                        onRowClick={handlePurchaseRowClick}
                        onGlobalPrint={handlePrintAllPurchases}
                        onRowPrint={handlePrintPurchase}
                    />
                );
            case 'clientes':
                return (
                    <Table
                        data={clientsData?.data || []}
                        columns={[
                            { Header: 'Cliente', accessor: 'empresa' },
                            {
                                Header: 'Total Ventas',
                                accessor: 'totalVentas',
                                Cell: ({ value }) => formatCurrency(value),
                            },
                            { Header: '# Ventas', accessor: 'numVentas' },
                        ]}
                        loading={clientsLoading}
                        emptyMessage="Sin clientes en este período"
                        pagination={{
                            enabled: true,
                            page: clientsPage,
                            totalPages: Math.ceil((clientsData?.total || 0) / LIMIT),
                            totalRows: clientsData?.total ?? 0,
                            pageSize: LIMIT,
                            onPageChange: setClientsPage,
                        }}
                        search={{
                            enabled: true,
                            value: clientsSearch,
                            onChange: handleClientsSearch,
                            placeholder: 'Buscar clientes...',
                        }}
                        sort={{
                            enabled: true,
                            value: clientsSort,
                            onChange: handleClientsSort,
                        }}
                    />
                );
            case 'productos':
                return (
                    <Table
                        data={productsData?.data || []}
                        columns={[
                            { Header: 'Producto', accessor: 'descripcion' },
                            {
                                Header: 'Cantidad',
                                accessor: 'cantidad',
                                Cell: ({ value }) => Number(value).toLocaleString(),
                            },
                            {
                                Header: 'Total Ventas',
                                accessor: 'totalVentas',
                                Cell: ({ value }) => formatCurrency(value),
                            },
                        ]}
                        loading={productsLoading}
                        emptyMessage="Sin productos en este período"
                        pagination={{
                            enabled: true,
                            page: productsPage,
                            totalPages: Math.ceil((productsData?.total || 0) / LIMIT),
                            totalRows: productsData?.total ?? 0,
                            pageSize: LIMIT,
                            onPageChange: setProductsPage,
                        }}
                        search={{
                            enabled: true,
                            value: productsSearch,
                            onChange: handleProductsSearch,
                            placeholder: 'Buscar productos...',
                        }}
                        sort={{
                            enabled: true,
                            value: productsSort,
                            onChange: handleProductsSort,
                        }}
                    />
                );
            default:
                return null;
        }
    };

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
                const docDef = {
                    content: [
                        { text: 'ALIMENTOS DM MARKET, C.A.', style: 'header' },
                        {
                            text: 'CALLE ILUSTRES PROCERES LOCAL NRO S/N SECTOR CENTRO ALTAGRACIA DE ORITUCO DE ORITUCO ZONA POSTAL 2320.',
                            style: 'header',
                        },
                        { text: 'R.I.F.: J-41270446-0', style: 'header' },
                        {
                            text: DateTime.fromISO(detail.fecha).toFormat('dd/MM/yyyy'),
                            style: 'header',
                        },
                        {
                            text: `Factura: ${detail.idFactura}`,
                            style: 'subheader',
                        },
                        {
                            text: `Proveedor: ${provider.Empresa}`,
                            style: 'subheader',
                            margin: [0, 0, 0, 12],
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
                                        {
                                            text: formatCurrency(detail.total),
                                            bold: true,
                                        },
                                    ],
                                ],
                            },
                        },
                    ],
                    styles: {
                        header: { alignment: 'center', fontSize: 10 },
                        subheader: {
                            alignment: 'center',
                            fontSize: 9,
                            margin: [0, 4, 0, 2],
                        },
                        table: { margin: [0, 10, 0, 0], fontSize: 8 },
                    },
                    pageMargins: 40,
                    pageSize: 'LETTER',
                };
                pdfMake.createPdf(docDef).open();
            } catch (err) {
                console.error('Failed to print sale:', err);
            }
        },
        [provider?.IdProveedor, provider?.Empresa, showNoe],
    );

    return (
        <>
            <Modal
                show={show}
                size="xl"
                onHide={onClose}
                backdrop="static"
                scrollable
                className="client-dashboard-modal"
            >
                <Modal.Header closeButton>
                    <div className="d-flex align-items-center gap-3">
                        <div className="client-avatar">{avatarLetter}</div>
                        <div>
                            <Modal.Title>{provider?.Empresa}</Modal.Title>
                            <div className="modal-subtitle">Proveedor #{provider?.IdProveedor}</div>
                        </div>
                    </div>
                </Modal.Header>
                <Modal.Body>
                    <div className="date-picker-card">
                        <div className="date-picker-label">Rango de fechas</div>
                        <DateRangePicker
                            key={provider?.IdProveedor || 'picker'}
                            initialFrom={oneMonthAgo}
                            initialTo={today}
                            onChange={handleDateRangeChange}
                        />
                    </div>

                    <div className="stats-row">
                        {stats.map((stat) => (
                            <StatCard key={stat.label} {...stat} loading={summaryLoading} />
                        ))}
                    </div>

                    <Nav variant="tabs" className="mb-3" activeKey={activeTab} onSelect={setActiveTab}>
                        <Nav.Item>
                            <Nav.Link eventKey="ventas">Ventas</Nav.Link>
                        </Nav.Item>
                        <Nav.Item>
                            <Nav.Link eventKey="compras">Compras</Nav.Link>
                        </Nav.Item>
                        <Nav.Item>
                            <Nav.Link eventKey="clientes">Clientes</Nav.Link>
                        </Nav.Item>
                        <Nav.Item>
                            <Nav.Link eventKey="productos">Productos</Nav.Link>
                        </Nav.Item>
                    </Nav>

                    {renderTabContent()}
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
