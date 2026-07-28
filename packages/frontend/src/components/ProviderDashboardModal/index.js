import {
    fetchProviderClients,
    fetchProviderProducts,
    fetchProviderPurchases,
    fetchProviderSales,
    fetchProviderSummary,
    fetchPurchaseDetail,
    fetchSaleDetail,
} from "api/providers";
import DateRangePicker from "components/DateRangePicker";
import Table from "components/Table";
import { ShowNoeContext } from "context/show_noe";
import { DateTime } from "luxon";
import pdfMake from "pdfmake/build/pdfmake";
import pdfFonts from "pdfmake/build/vfs_fonts";
import { useContext, useEffect, useMemo, useState, useCallback } from "react";
import { Badge, Modal, Spinner } from "react-bootstrap";
import PurchaseDetailModal from "./PurchaseDetailModal";
import SaleDetailModal from "./SaleDetailModal";
import "./styles.css";

pdfMake.vfs = pdfFonts.pdfMake.vfs;

const LIMIT = 20;

const formatCurrency = (value) => {
    const num = Number(value);
    if (isNaN(num)) return "$0.00";
    return `$${num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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
        <div className="provider-stat-value">
            {loading ? <Spinner animation="border" size="sm" /> : value}
        </div>
    </div>
);

const ProviderDashboardModal = ({ show, onClose, provider }) => {
    const { showNoe } = useContext(ShowNoeContext);

    const today = DateTime.now().toISODate();
    const oneMonthAgo = DateTime.now().minus({ months: 1 }).toISODate();

    const [dateRange, setDateRange] = useState({
        from: oneMonthAgo,
        to: today,
    });
    const [summary, setSummary] = useState({
        totalCompras: 0,
        numCompras: 0,
        totalVentas: 0,
        numVentas: 0,
        bestSeller: null,
    });
    const [purchasesData, setPurchasesData] = useState({ data: [], total: 0 });
    const [salesData, setSalesData] = useState({ data: [], total: 0 });
    const [purchasesPage, setPurchasesPage] = useState(1);
    const [salesPage, setSalesPage] = useState(1);
    const [clientsPage, setClientsPage] = useState(1);
    const [productsPage, setProductsPage] = useState(1);
    const [activeTab, setActiveTab] = useState("ventas");
    const [loading, setLoading] = useState(false);
    const [purchasesLoading, setPurchasesLoading] = useState(false);
    const [salesLoading, setSalesLoading] = useState(false);
    const [clientsData, setClientsData] = useState({ data: [], total: 0 });
    const [clientsLoading, setClientsLoading] = useState(false);
    const [productsData, setProductsData] = useState({ data: [], total: 0 });
    const [productsLoading, setProductsLoading] = useState(false);

    // Search state per table
    const [purchasesSearch, setPurchasesSearch] = useState("");
    const [salesSearch, setSalesSearch] = useState("");
    const [clientsSearch, setClientsSearch] = useState("");
    const [productsSearch, setProductsSearch] = useState("");

    // Purchase detail sub-modal
    const [detailModalShow, setDetailModalShow] = useState(false);
    const [selectedPurchase, setSelectedPurchase] = useState(null);

    // Sale detail sub-modal
    const [saleDetailModalShow, setSaleDetailModalShow] = useState(false);
    const [selectedSale, setSelectedSale] = useState(null);

    // Reset state when modal opens
    useEffect(() => {
        if (show) {
            setDateRange({ from: oneMonthAgo, to: today });
            setPurchasesPage(1);
            setSalesPage(1);
            setClientsPage(1);
            setProductsPage(1);
            setActiveTab("ventas");
            setSummary({
                totalCompras: 0,
                numCompras: 0,
                totalVentas: 0,
                numVentas: 0,
                bestSeller: null,
            });
            setPurchasesData({ data: [], total: 0 });
            setSalesData({ data: [], total: 0 });
            setClientsData({ data: [], total: 0 });
            setProductsData({ data: [], total: 0 });
            setPurchasesSearch("");
            setSalesSearch("");
            setClientsSearch("");
            setProductsSearch("");
            setDetailModalShow(false);
            setSelectedPurchase(null);
            setSaleDetailModalShow(false);
            setSelectedSale(null);
        }
    }, [show]);

    // Fetch summary
    useEffect(() => {
        if (!show || !provider?.IdProveedor) return;

        const doFetch = async () => {
            setLoading(true);
            try {
                const result = await fetchProviderSummary(
                    provider.IdProveedor,
                    {
                        from: dateRange.from,
                        to: dateRange.to,
                        showNoe,
                    },
                );
                setSummary({
                    totalCompras: result.totalCompras ?? 0,
                    numCompras: result.numCompras ?? 0,
                    totalVentas: result.totalVentas ?? 0,
                    numVentas: result.numVentas ?? 0,
                    bestSeller: result.bestSeller ?? null,
                });
            } catch (err) {
                console.error("Failed to fetch provider summary:", err);
                setSummary({
                    totalCompras: 0,
                    numCompras: 0,
                    totalVentas: 0,
                    numVentas: 0,
                    bestSeller: null,
                });
            } finally {
                setLoading(false);
            }
        };

        doFetch();
    }, [show, provider?.IdProveedor, dateRange, showNoe]);

    // Fetch purchases (paginated)
    useEffect(() => {
        if (!show || !provider?.IdProveedor) return;

        const doFetch = async () => {
            setPurchasesLoading(true);
            try {
                const result = await fetchProviderPurchases(
                    provider.IdProveedor,
                    {
                        from: dateRange.from,
                        to: dateRange.to,
                        page: purchasesPage,
                        limit: LIMIT,
                        search: purchasesSearch || undefined,
                    },
                );
                setPurchasesData({
                    data: result.data || [],
                    total: result.total || 0,
                });
            } catch (err) {
                console.error("Failed to fetch provider purchases:", err);
                setPurchasesData({ data: [], total: 0 });
            } finally {
                setPurchasesLoading(false);
            }
        };

        doFetch();
    }, [show, provider?.IdProveedor, dateRange, purchasesPage, purchasesSearch]);

    // Fetch sales (paginated)
    useEffect(() => {
        if (!show || !provider?.IdProveedor) return;

        const doFetch = async () => {
            setSalesLoading(true);
            try {
                const result = await fetchProviderSales(provider.IdProveedor, {
                    from: dateRange.from,
                    to: dateRange.to,
                    page: salesPage,
                    limit: LIMIT,
                    search: salesSearch || undefined,
                    showNoe,
                });
                setSalesData({
                    data: result.data || [],
                    total: result.total || 0,
                });
            } catch (err) {
                console.error("Failed to fetch provider sales:", err);
                setSalesData({ data: [], total: 0 });
            } finally {
                setSalesLoading(false);
            }
        };

        doFetch();
    }, [show, provider?.IdProveedor, dateRange, salesPage, salesSearch, showNoe]);

    // Fetch clients (paginated)
    useEffect(() => {
        if (!show || !provider?.IdProveedor) return;

        const doFetch = async () => {
            setClientsLoading(true);
            try {
                const result = await fetchProviderClients(provider.IdProveedor, {
                    from: dateRange.from,
                    to: dateRange.to,
                    page: clientsPage,
                    limit: LIMIT,
                    search: clientsSearch || undefined,
                    showNoe,
                });
                setClientsData({
                    data: result.data || [],
                    total: result.total || 0,
                });
            } catch (err) {
                console.error("Failed to fetch provider clients:", err);
                setClientsData({ data: [], total: 0 });
            } finally {
                setClientsLoading(false);
            }
        };

        doFetch();
    }, [show, provider?.IdProveedor, dateRange, clientsPage, clientsSearch, showNoe]);

    // Fetch products (paginated)
    useEffect(() => {
        if (!show || !provider?.IdProveedor) return;

        const doFetch = async () => {
            setProductsLoading(true);
            try {
                const result = await fetchProviderProducts(provider.IdProveedor, {
                    from: dateRange.from,
                    to: dateRange.to,
                    page: productsPage,
                    limit: LIMIT,
                    search: productsSearch || undefined,
                    showNoe,
                });
                setProductsData({
                    data: result.data || [],
                    total: result.total || 0,
                });
            } catch (err) {
                console.error("Failed to fetch provider products:", err);
                setProductsData({ data: [], total: 0 });
            } finally {
                setProductsLoading(false);
            }
        };

        doFetch();
    }, [show, provider?.IdProveedor, dateRange, productsPage, productsSearch, showNoe]);

    const handleDateRangeChange = ({ from, to }) => {
        setDateRange({ from, to });
        setPurchasesPage(1);
        setSalesPage(1);
        setClientsPage(1);
        setProductsPage(1);
    };

    const handlePurchasesSearch = useCallback((term) => {
        setPurchasesSearch(term || "");
        setPurchasesPage(1);
    }, []);
    const handleSalesSearch = useCallback((term) => {
        setSalesSearch(term || "");
        setSalesPage(1);
    }, []);
    const handleClientsSearch = useCallback((term) => {
        setClientsSearch(term || "");
        setClientsPage(1);
    }, []);
    const handleProductsSearch = useCallback((term) => {
        setProductsSearch(term || "");
        setProductsPage(1);
    }, []);

    const handlePurchaseRowClick = useCallback(async (purchase) => {
        try {
            const detail = await fetchPurchaseDetail(
                provider.IdProveedor,
                purchase.idFactura,
            );
            setSelectedPurchase(detail);
            setDetailModalShow(true);
        } catch (err) {
            console.error("Failed to fetch purchase detail:", err);
        }
    }, [provider?.IdProveedor]);

    const handleSaleRowClick = useCallback(async (sale) => {
        try {
            const detail = await fetchSaleDetail(
                provider.IdProveedor,
                sale.idFactura,
                showNoe,
            );
            setSelectedSale(detail);
            setSaleDetailModalShow(true);
        } catch (err) {
            console.error("Failed to fetch sale detail:", err);
        }
    }, [provider?.IdProveedor, showNoe]);

    const handlePrintPurchase = useCallback(async (purchase, e) => {
        if (e?.stopPropagation) e.stopPropagation();
        try {
            const detail = await fetchPurchaseDetail(
                provider.IdProveedor,
                purchase.idFactura,
            );
            const rows = detail.productos.map((p) => [
                p.descripcion,
                String(Number(p.cantidad)),
                formatCurrency(p.precio),
                formatCurrency(p.subtotal),
            ]);
            const docDef = {
                content: [
                    { text: "ALIMENTOS DM MARKET, C.A.", style: "header" },
                    {
                        text: "CALLE ILUSTRES PROCERES LOCAL NRO S/N SECTOR CENTRO ALTAGRACIA DE ORITUCO DE ORITUCO ZONA POSTAL 2320.",
                        style: "header",
                    },
                    { text: "R.I.F.: J-41270446-0", style: "header" },
                    {
                        text: DateTime.fromISO(detail.fecha).toFormat(
                            "dd/MM/yyyy",
                        ),
                        style: "header",
                    },
                    {
                        text: `Factura de compra: ${detail.idFactura}`,
                        style: "subheader",
                    },
                    {
                        text: `Proveedor: ${provider.Empresa}`,
                        style: "subheader",
                        margin: [0, 0, 0, 12],
                    },
                    {
                        style: "table",
                        table: {
                            widths: ["*", "auto", "auto", "auto"],
                            body: [
                                [
                                    "Descripción",
                                    "Cantidad",
                                    "Precio",
                                    "Subtotal",
                                ],
                                ...rows,
                                [
                                    "",
                                    "",
                                    { text: "Total", bold: true },
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
                    header: { alignment: "center", fontSize: 10 },
                    subheader: {
                        alignment: "center",
                        fontSize: 9,
                        margin: [0, 4, 0, 2],
                    },
                    table: { margin: [0, 10, 0, 0], fontSize: 8 },
                },
                pageMargins: 40,
                pageSize: "LETTER",
            };
            pdfMake.createPdf(docDef).open();
        } catch (err) {
            console.error("Failed to print purchase:", err);
        }
    }, [provider?.IdProveedor, provider?.Empresa]);

    const handlePrintAllPurchases = useCallback(async () => {
        try {
            const result = await fetchProviderPurchases(provider.IdProveedor, {
                from: dateRange.from,
                to: dateRange.to,
                page: 1,
                limit: purchasesData.total || 9999,
                search: purchasesSearch || undefined,
            });
            const invoices = result.data || [];

            const tables = [];
            for (const inv of invoices) {
                const detail = await fetchPurchaseDetail(
                    provider.IdProveedor,
                    inv.idFactura,
                );
                const rows = detail.productos.map((p) => [
                    p.descripcion,
                    String(Number(p.cantidad)),
                    formatCurrency(p.precio),
                    formatCurrency(p.subtotal),
                ]);
                tables.push(
                    {
                        text: `Factura: ${detail.idFactura} — ${DateTime.fromISO(detail.fecha).toFormat("dd/MM/yyyy")}`,
                        style: "invoiceTitle",
                        margin: [0, 14, 0, 4],
                    },
                    {
                        style: "table",
                        table: {
                            widths: ["*", "auto", "auto", "auto"],
                            body: [
                                [
                                    "Descripción",
                                    "Cantidad",
                                    "Precio",
                                    "Subtotal",
                                ],
                                ...rows,
                                [
                                    "",
                                    "",
                                    { text: "Total", bold: true },
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
                    { text: "ALIMENTOS DM MARKET, C.A.", style: "header" },
                    {
                        text: "CALLE ILUSTRES PROCERES LOCAL NRO S/N SECTOR CENTRO ALTAGRACIA DE ORITUCO DE ORITUCO ZONA POSTAL 2320.",
                        style: "header",
                    },
                    { text: "R.I.F.: J-41270446-0", style: "header" },
                    {
                        text: `Compras a: ${provider.Empresa}`,
                        style: "subheader",
                    },
                    {
                        text: `Período: ${DateTime.fromISO(dateRange.from).toFormat("dd/MM/yyyy")} — ${DateTime.fromISO(dateRange.to).toFormat("dd/MM/yyyy")}`,
                        style: "subheader",
                        margin: [0, 0, 0, 10],
                    },
                    ...tables,
                ],
                styles: {
                    header: { alignment: "center", fontSize: 10 },
                    subheader: {
                        alignment: "center",
                        fontSize: 9,
                        margin: [0, 2, 0, 2],
                    },
                    invoiceTitle: { fontSize: 9, bold: true },
                    table: { margin: [0, 4, 0, 8], fontSize: 8 },
                },
                pageMargins: 40,
                pageSize: "LETTER",
            };
            pdfMake.createPdf(docDef).open();
        } catch (err) {
            console.error("Failed to print all purchases:", err);
        }
    }, [provider?.IdProveedor, provider?.Empresa, dateRange, purchasesData.total, purchasesSearch]);

    // ── Global print: Sales ──
    const handlePrintSale = useCallback(async (sale, e) => {
        if (e?.stopPropagation) e.stopPropagation();
        try {
            const detail = await fetchSaleDetail(
                provider.IdProveedor,
                sale.idFactura,
                showNoe,
            );
            const rows = (detail.productos || []).map((p) => [
                p.descripcion,
                String(Number(p.cantidad)),
                formatCurrency(p.precio),
                formatCurrency(p.subtotal),
            ]);
            const docDef = {
                content: [
                    { text: "ALIMENTOS DM MARKET, C.A.", style: "header" },
                    {
                        text: "CALLE ILUSTRES PROCERES LOCAL NRO S/N SECTOR CENTRO ALTAGRACIA DE ORITUCO DE ORITUCO ZONA POSTAL 2320.",
                        style: "header",
                    },
                    { text: "R.I.F.: J-41270446-0", style: "header" },
                    {
                        text: DateTime.fromISO(detail.fecha).toFormat("dd/MM/yyyy"),
                        style: "header",
                    },
                    {
                        text: `Factura: ${detail.idFactura}`,
                        style: "subheader",
                    },
                    {
                        text: `Cliente: ${detail.cliente || ""}`,
                        style: "subheader",
                        margin: [0, 0, 0, 12],
                    },
                    {
                        style: "table",
                        table: {
                            widths: ["*", "auto", "auto", "auto"],
                            body: [
                                ["Descripción", "Cantidad", "Precio", "Subtotal"],
                                ...rows,
                                [
                                    "",
                                    "",
                                    { text: "Total", bold: true },
                                    { text: formatCurrency(detail.total), bold: true },
                                ],
                            ],
                        },
                    },
                ],
                styles: {
                    header: { alignment: "center", fontSize: 10 },
                    subheader: {
                        alignment: "center",
                        fontSize: 9,
                        margin: [0, 4, 0, 2],
                    },
                    table: { margin: [0, 10, 0, 0], fontSize: 8 },
                },
                pageMargins: 40,
                pageSize: "LETTER",
            };
            pdfMake.createPdf(docDef).open();
        } catch (err) {
            console.error("Failed to print sale:", err);
        }
    }, [provider?.IdProveedor, showNoe]);

    const handlePrintAllSales = useCallback(async () => {
        try {
            const result = await fetchProviderSales(provider.IdProveedor, {
                from: dateRange.from,
                to: dateRange.to,
                page: 1,
                limit: salesData.total || 9999,
                search: salesSearch || undefined,
                showNoe,
            });
            const rows = (result.data || []).map((s) => [
                String(s.idFactura ?? ""),
                s.vendedor ?? "",
                DateTime.fromISO(s.fecha).toFormat("dd/MM/yyyy"),
                formatCurrency(s.monto ?? 0),
            ]);

            const docDef = {
                content: [
                    { text: "ALIMENTOS DM MARKET, C.A.", style: "header" },
                    {
                        text: "CALLE ILUSTRES PROCERES LOCAL NRO S/N SECTOR CENTRO ALTAGRACIA DE ORITUCO DE ORITUCO ZONA POSTAL 2320.",
                        style: "header",
                    },
                    { text: "R.I.F.: J-41270446-0", style: "header" },
                    {
                        text: `Ventas de: ${provider.Empresa}`,
                        style: "subheader",
                    },
                    {
                        text: `Período: ${DateTime.fromISO(dateRange.from).toFormat("dd/MM/yyyy")} — ${DateTime.fromISO(dateRange.to).toFormat("dd/MM/yyyy")}`,
                        style: "subheader",
                        margin: [0, 0, 0, 10],
                    },
                    {
                        style: "table",
                        table: {
                            widths: ["auto", "*", "auto", "auto"],
                            body: [
                                ["Factura", "Vendedor", "Fecha", "Monto"],
                                ...rows,
                            ],
                        },
                    },
                ],
                styles: {
                    header: { alignment: "center", fontSize: 9 },
                    subheader: {
                        alignment: "center",
                        fontSize: 8,
                        margin: [0, 4, 0, 2],
                        bold: true,
                    },
                    table: { margin: [0, 10, 0, 0], fontSize: 7 },
                },
                pageMargins: 30,
                pageSize: "LETTER",
                pageOrientation: "landscape",
            };
            pdfMake.createPdf(docDef).open();
        } catch (err) {
            console.error("Failed to print all sales:", err);
        }
    }, [provider?.IdProveedor, provider?.Empresa, dateRange, salesData.total, salesSearch, showNoe]);

    // ── Global print: Clients ──
    const handlePrintAllClients = useCallback(async () => {
        try {
            const result = await fetchProviderClients(provider.IdProveedor, {
                from: dateRange.from,
                to: dateRange.to,
                page: 1,
                limit: clientsData.total || 9999,
                search: clientsSearch || undefined,
                showNoe,
            });
            const rows = (result.data || []).map((c) => [
                c.cliente ?? "",
                formatCurrency(c.totalVentas ?? 0),
                formatCurrency(c.utilidad ?? 0),
            ]);

            const docDef = {
                content: [
                    { text: "ALIMENTOS DM MARKET, C.A.", style: "header" },
                    {
                        text: "CALLE ILUSTRES PROCERES LOCAL NRO S/N SECTOR CENTRO ALTAGRACIA DE ORITUCO DE ORITUCO ZONA POSTAL 2320.",
                        style: "header",
                    },
                    { text: "R.I.F.: J-41270446-0", style: "header" },
                    {
                        text: `Clientes de: ${provider.Empresa}`,
                        style: "subheader",
                    },
                    {
                        text: `Período: ${DateTime.fromISO(dateRange.from).toFormat("dd/MM/yyyy")} — ${DateTime.fromISO(dateRange.to).toFormat("dd/MM/yyyy")}`,
                        style: "subheader",
                        margin: [0, 0, 0, 10],
                    },
                    {
                        style: "table",
                        table: {
                            widths: ["*", "auto", "auto"],
                            body: [
                                ["Cliente", "Total Ventas", "Utilidad"],
                                ...rows,
                            ],
                        },
                    },
                ],
                styles: {
                    header: { alignment: "center", fontSize: 9 },
                    subheader: {
                        alignment: "center",
                        fontSize: 8,
                        margin: [0, 4, 0, 2],
                        bold: true,
                    },
                    table: { margin: [0, 10, 0, 0], fontSize: 7 },
                },
                pageMargins: 30,
                pageSize: "LETTER",
                pageOrientation: "landscape",
            };
            pdfMake.createPdf(docDef).open();
        } catch (err) {
            console.error("Failed to print all clients:", err);
        }
    }, [provider?.IdProveedor, provider?.Empresa, dateRange, clientsData.total, clientsSearch, showNoe]);

    // ── Global print: Products ──
    const handlePrintAllProducts = useCallback(async () => {
        try {
            const result = await fetchProviderProducts(provider.IdProveedor, {
                from: dateRange.from,
                to: dateRange.to,
                page: 1,
                limit: productsData.total || 9999,
                search: productsSearch || undefined,
                showNoe,
            });
            const rows = (result.data || []).map((p) => [
                p.producto ?? "",
                formatCurrency(p.totalVentas ?? 0),
                formatCurrency(p.utilidad ?? 0),
            ]);

            const docDef = {
                content: [
                    { text: "ALIMENTOS DM MARKET, C.A.", style: "header" },
                    {
                        text: "CALLE ILUSTRES PROCERES LOCAL NRO S/N SECTOR CENTRO ALTAGRACIA DE ORITUCO DE ORITUCO ZONA POSTAL 2320.",
                        style: "header",
                    },
                    { text: "R.I.F.: J-41270446-0", style: "header" },
                    {
                        text: `Productos de: ${provider.Empresa}`,
                        style: "subheader",
                    },
                    {
                        text: `Período: ${DateTime.fromISO(dateRange.from).toFormat("dd/MM/yyyy")} — ${DateTime.fromISO(dateRange.to).toFormat("dd/MM/yyyy")}`,
                        style: "subheader",
                        margin: [0, 0, 0, 10],
                    },
                    {
                        style: "table",
                        table: {
                            widths: ["*", "auto", "auto"],
                            body: [
                                ["Producto", "Total Ventas", "Utilidad"],
                                ...rows,
                            ],
                        },
                    },
                ],
                styles: {
                    header: { alignment: "center", fontSize: 9 },
                    subheader: {
                        alignment: "center",
                        fontSize: 8,
                        margin: [0, 4, 0, 2],
                        bold: true,
                    },
                    table: { margin: [0, 10, 0, 0], fontSize: 7 },
                },
                pageMargins: 30,
                pageSize: "LETTER",
                pageOrientation: "landscape",
            };
            pdfMake.createPdf(docDef).open();
        } catch (err) {
            console.error("Failed to print all products:", err);
        }
    }, [provider?.IdProveedor, provider?.Empresa, dateRange, productsData.total, productsSearch, showNoe]);

    const purchasesTotalPages = Math.ceil(purchasesData.total / LIMIT);
    const salesTotalPages = Math.ceil(salesData.total / LIMIT);
    const clientsTotalPages = Math.ceil(clientsData.total / LIMIT);
    const productsTotalPages = Math.ceil(productsData.total / LIMIT);

    const stats = useMemo(
        () => [
            {
                label: "Total Compras",
                value: formatCurrency(summary.totalCompras),
                variant: "primary",
                icon: IconSales,
            },
            {
                label: "# Compras",
                value: String(summary.numCompras || "0"),
                variant: "success",
                icon: IconHash,
            },
            {
                label: "Total Ventas",
                value: formatCurrency(summary.totalVentas),
                variant: "info",
                icon: IconTicket,
            },
            {
                label: "Mejor Vendedor",
                value: summary.bestSeller || "N/A",
                variant: "warning",
                icon: IconUserStar,
            },
        ],
        [summary],
    );

    const avatarLetter = provider?.Empresa
        ? provider.Empresa.charAt(0).toUpperCase()
        : "P";

    // Purchases table block
    const purchasesBlock = (
        <div className="provider-sales-card">
            <div className="provider-card-body">
                <div className="provider-table-container">
                    <Table
                        data={purchasesData.data}
                        columns={[
                            { Header: 'IdFactura', accessor: 'idFactura' },
                            { Header: 'Fecha', accessor: 'fecha', Cell: ({ value }) => DateTime.fromISO(value).toFormat('dd MMM yyyy', { locale: 'es' }) },
                            { Header: 'Monto', accessor: 'monto', Cell: ({ value }) => formatCurrency(value) },
                        ]}
                        loading={purchasesLoading}
                        className='provider-table'
                        maxHeight={null}
                        onRowClick={handlePurchaseRowClick}
                        emptyMessage='Sin compras en este período'
                        search={{
                            enabled: true,
                            placeholder: "Buscar factura...",
                            onSearch: handlePurchasesSearch,
                        }}
                        print={{
                            enabled: true,
                            perRowPrint: true,
                            onRowPrint: (rowData) => handlePrintPurchase(rowData),
                            onGlobalPrint: handlePrintAllPurchases,
                            globalPrintLabel: "Imprimir",
                        }}
                        pagination={{
                            enabled: true,
                            page: purchasesPage,
                            totalPages: purchasesTotalPages,
                            totalRows: purchasesData.total,
                            pageSize: LIMIT,
                            onPageChange: setPurchasesPage,
                        }}
                    />
                </div>
            </div>
        </div>
    );

    // Sales table block
    const salesBlock = (
        <div className="provider-sales-card">
            <div className="provider-card-body">
                <div className="provider-table-container">
                    <Table
                        data={salesData.data}
                        columns={[
                            { Header: 'IdFactura', accessor: 'idFactura' },
                            { Header: 'Vendedor', accessor: 'vendedor' },
                            { Header: 'Fecha', accessor: 'fecha', Cell: ({ value }) => DateTime.fromISO(value).toFormat('dd MMM yyyy', { locale: 'es' }) },
                            { Header: 'Monto', accessor: 'monto', Cell: ({ value }) => formatCurrency(value) },
                        ]}
                        loading={salesLoading}
                        className='provider-table'
                        maxHeight={null}
                        onRowClick={handleSaleRowClick}
                        emptyMessage='Sin ventas en este período'
                        search={{
                            enabled: true,
                            placeholder: "Buscar factura o vendedor...",
                            onSearch: handleSalesSearch,
                        }}
                        print={{
                            enabled: true,
                            perRowPrint: true,
                            onRowPrint: (rowData) => handlePrintSale(rowData),
                            onGlobalPrint: handlePrintAllSales,
                            globalPrintLabel: "Imprimir",
                        }}
                        pagination={{
                            enabled: true,
                            page: salesPage,
                            totalPages: salesTotalPages,
                            totalRows: salesData.total,
                            pageSize: LIMIT,
                            onPageChange: setSalesPage,
                        }}
                    />
                </div>
            </div>
        </div>
    );

    // Clients table block
    const clientsBlock = (
        <div className="provider-sales-card">
            <div className="provider-card-body">
                <div className="provider-table-container">
                    <Table
                        data={clientsData.data}
                        columns={[
                            { Header: 'Cliente', accessor: 'cliente' },
                            { Header: 'Total Ventas', accessor: 'totalVentas', Cell: ({ value }) => formatCurrency(value) },
                            { Header: 'Utilidad', accessor: 'utilidad', Cell: ({ value }) => formatCurrency(value) },
                        ]}
                        loading={clientsLoading}
                        className='provider-table'
                        maxHeight={null}
                        emptyMessage='Sin clientes en este período'
                        search={{
                            enabled: true,
                            placeholder: "Buscar cliente...",
                            onSearch: handleClientsSearch,
                        }}
                        print={{
                            enabled: true,
                            onGlobalPrint: handlePrintAllClients,
                            globalPrintLabel: "Imprimir",
                        }}
                        pagination={{
                            enabled: true,
                            page: clientsPage,
                            totalPages: clientsTotalPages,
                            totalRows: clientsData.total,
                            pageSize: LIMIT,
                            onPageChange: setClientsPage,
                        }}
                    />
                </div>
            </div>
        </div>
    );

    // Products table block
    const productsBlock = (
        <div className="provider-sales-card">
            <div className="provider-card-body">
                <div className="provider-table-container">
                    <Table
                        data={productsData.data}
                        columns={[
                            { Header: 'Producto', accessor: 'producto' },
                            { Header: 'Total Ventas', accessor: 'totalVentas', Cell: ({ value }) => formatCurrency(value) },
                            { Header: 'Utilidad', accessor: 'utilidad', Cell: ({ value }) => formatCurrency(value) },
                        ]}
                        loading={productsLoading}
                        className='provider-table'
                        maxHeight={null}
                        emptyMessage='Sin productos en este período'
                        search={{
                            enabled: true,
                            placeholder: "Buscar producto...",
                            onSearch: handleProductsSearch,
                        }}
                        print={{
                            enabled: true,
                            onGlobalPrint: handlePrintAllProducts,
                            globalPrintLabel: "Imprimir",
                        }}
                        pagination={{
                            enabled: true,
                            page: productsPage,
                            totalPages: productsTotalPages,
                            totalRows: productsData.total,
                            pageSize: LIMIT,
                            onPageChange: setProductsPage,
                        }}
                    />
                </div>
            </div>
        </div>
    );

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
                            <div className="provider-modal-subtitle">
                                Proveedor #{provider?.IdProveedor}
                            </div>
                        </div>
                    </div>
                </Modal.Header>
                <Modal.Body>
                    <div className="provider-date-picker-card">
                        <div className="provider-date-picker-label">
                            Rango de fechas
                        </div>
                        <DateRangePicker
                            key={provider?.IdProveedor || "picker"}
                            initialFrom={oneMonthAgo}
                            initialTo={today}
                            onChange={handleDateRangeChange}
                        />
                    </div>

                    <div className="provider-stats-row">
                        {stats.map((stat) => (
                            <StatCard
                                key={stat.label}
                                {...stat}
                                loading={loading}
                            />
                        ))}
                    </div>

                    <div className="provider-tabs-container">
                        <div className="provider-tab-nav">
                            <button
                                className={`provider-tab-button ${activeTab === "ventas" ? "active" : ""}`}
                                onClick={() => setActiveTab("ventas")}
                            >
                                Ventas
                                {salesData.total > 0 && (
                                    <Badge bg="secondary" pill className="provider-tab-badge">
                                        {salesData.total}
                                    </Badge>
                                )}
                            </button>
                            <button
                                className={`provider-tab-button ${activeTab === "compras" ? "active" : ""}`}
                                onClick={() => setActiveTab("compras")}
                            >
                                Compras
                                {purchasesData.total > 0 && (
                                    <Badge bg="secondary" pill className="provider-tab-badge">
                                        {purchasesData.total}
                                    </Badge>
                                )}
                            </button>
                            <button
                                className={`provider-tab-button ${activeTab === "clientes" ? "active" : ""}`}
                                onClick={() => setActiveTab("clientes")}
                            >
                                Clientes
                                {clientsData.total > 0 && (
                                    <Badge bg="secondary" pill className="provider-tab-badge">
                                        {clientsData.total}
                                    </Badge>
                                )}
                            </button>
                            <button
                                className={`provider-tab-button ${activeTab === "productos" ? "active" : ""}`}
                                onClick={() => setActiveTab("productos")}
                            >
                                Productos
                                {productsData.total > 0 && (
                                    <Badge bg="secondary" pill className="provider-tab-badge">
                                        {productsData.total}
                                    </Badge>
                                )}
                            </button>
                        </div>
                        <div className="provider-tab-content">
                            {activeTab === "ventas" && salesBlock}
                            {activeTab === "compras" && purchasesBlock}
                            {activeTab === "clientes" && clientsBlock}
                            {activeTab === "productos" && productsBlock}
                        </div>
                    </div>
                </Modal.Body>
            </Modal>

            <PurchaseDetailModal
                show={detailModalShow}
                onClose={() => setDetailModalShow(false)}
                purchase={selectedPurchase}
            />

            <SaleDetailModal
                show={saleDetailModalShow}
                onClose={() => setSaleDetailModalShow(false)}
                sale={selectedSale}
            />
        </>
    );
};

export default ProviderDashboardModal;
