import { ResponsiveLine } from '@nivo/line';
import { fetchInvoiceDetail } from 'api/invoice';
import { fetchSalesExport } from 'api/sales';
import { useAuth } from 'auth/context';
import DateRangePicker from 'components/DateRangePicker';
import Modal from 'components/Modal';
import Table from 'components/Table';
import { CurrencyRateContext } from 'context/currency_rate';
import { ShowNoeContext } from 'context/show_noe';
import { useClientSales, useClientSummary } from 'hooks/useClients';
import { DateTime } from 'luxon';
import pdfMake from 'pdfmake/build/pdfmake';
import pdfFonts from 'pdfmake/build/vfs_fonts';
import { useCallback, useContext, useMemo, useState } from 'react';
import { Alert, Badge, Spinner } from 'react-bootstrap';
import { formatCurrency, formatMoney, formatReportId } from 'utils/format';
import { sortRows } from 'utils/sortRows';
import SaleDetailModal from '../ProviderDashboardModal/SaleDetailModal';
import './styles.css';

pdfMake.vfs = pdfFonts.pdfMake ? pdfFonts.pdfMake.vfs : pdfMake.vfs;

const DEFAULT_SORT = [{ id: 'fecha', desc: true }];
const LIMIT = 50;

const SALES_COLUMNS = [
    { Header: 'Documento', accessor: 'idFactura' },
    { Header: 'Vendedor', accessor: 'vendedor' },
    {
        Header: 'Fecha',
        accessor: 'fecha',
        Cell: ({ value }) => DateTime.fromISO(value).toFormat('dd MMM yyyy', { locale: 'es' }),
    },
    {
        Header: 'Monto',
        accessor: 'monto',
        Cell: ({ value }) => formatCurrency(value),
        Footer: ({ data, summary }) =>
            formatCurrency(
                summary != null ? Number(summary) : data.reduce((sum, row) => sum + Number(row.monto || 0), 0),
            ),
    },
    {
        Header: 'Utilidad',
        accessor: 'utilidad',
        Cell: ({ value }) => formatCurrency(value),
        Footer: ({ data, summary }) =>
            formatCurrency(
                summary != null ? Number(summary) : data.reduce((sum, row) => sum + Number(row.utilidad || 0), 0),
            ),
    },
];

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
const IconCalendar = () => (
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
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
        <line x1="16" y1="2" x2="16" y2="6" />
        <line x1="8" y1="2" x2="8" y2="6" />
        <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
);

const StatCard = ({ label, value, variant, icon: Icon, loading }) => (
    <div className={`stat-card ${variant}`}>
        <div className="stat-icon">
            <Icon />
        </div>
        <div className="stat-label">{label}</div>
        <div className="stat-value">{loading ? <Spinner animation="border" size="sm" /> : value}</div>
    </div>
);

const aggregateSalesByMonth = (sales) => {
    const buckets = new Map();
    sales.forEach((sale) => {
        const month = DateTime.fromISO(sale.fecha).toFormat('yyyy-MM');
        buckets.set(month, (buckets.get(month) || 0) + Number(sale.monto));
    });
    return Array.from(buckets.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([month, amount]) => ({
            x: DateTime.fromISO(`${month}-01`).toFormat('MMM yyyy', { locale: 'es' }),
            y: Number(amount.toFixed(2)),
        }));
};

const ClientDashboardModal = ({ show, onClose, client }) => {
    const { session } = useAuth();
    const exporting = session.permissions.some((grant) => grant.capability === 'sales.export');
    const { showNoe } = useContext(ShowNoeContext);
    const { currencyRate } = useContext(CurrencyRateContext) || {};
    const [salesSearch, setSalesSearch] = useState('');
    const [salesSort, setSalesSort] = useState(DEFAULT_SORT);
    const [printError, setPrintError] = useState('');

    const today = DateTime.now().toISODate();
    const oneMonthAgo = DateTime.now().minus({ months: 1 }).toISODate();
    const initialRange =
        client?.last_factura && DateTime.fromISO(client.last_factura).isValid
            ? {
                  from: DateTime.fromISO(client.last_factura).minus({ months: 1 }).toISODate(),
                  to: DateTime.fromISO(client.last_factura).toISODate(),
              }
            : { from: oneMonthAgo, to: today };

    const [dateRange, setDateRange] = useState(initialRange);
    const [salesPage, setSalesPage] = useState(1);
    const [chartTooltip, setChartTooltip] = useState({ visible: false, x: 0, y: 0, point: null });
    const [saleDetailModalShow, setSaleDetailModalShow] = useState(false);
    const [selectedSale, setSelectedSale] = useState(null);

    // ── SWR hooks ──
    const clientEnabled = show && !!client?.IdCliente;

    const {
        data: summary,
        error: summaryError,
        isLoading: summaryLoading,
    } = useClientSummary(client?.IdCliente, { from: dateRange.from, to: dateRange.to, showNoe }, clientEnabled);

    const {
        data: salesData,
        isLoading: salesLoading,
        error: salesError,
    } = useClientSales(
        client?.IdCliente,
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
        clientEnabled,
    );

    const chartLoading = summaryLoading;
    const chartData = useMemo(
        () => (summary?.dailySales?.length ? [{ id: 'Ventas', data: aggregateSalesByMonth(summary.dailySales) }] : []),
        [summary],
    );

    const handleDateRangeChange = ({ from, to }) => {
        setDateRange({ from, to });
        setSalesPage(1);
    };

    const handleSalesSearch = useCallback((term) => {
        setSalesSearch(term || '');
        setSalesPage(1);
    }, []);

    const handleSalesSort = useCallback((sort) => {
        setSalesSort(sort.length ? sort : DEFAULT_SORT);
        setSalesPage(1);
    }, []);

    const handlePrintSales = async (config) => {
        setPrintError('');
        try {
            const result = await fetchSalesExport({
                ...dateRange,
                clientId: client.IdCliente,
                search: config.search ?? salesSearch,
                sortBy: salesSort[0]?.id,
                sortDir: salesSort[0]?.desc ? 'desc' : 'asc',
                showNoe,
            });
            if (
                config.currency === 'BsS' &&
                !(Number(currencyRate?.Cambio) > 0 && Number.isFinite(Number(currencyRate?.Cambio)))
            )
                throw new Error('Tasa no disponible.');
            const serverColumns = new Set(
                result.columns.map((column) => (column.key === 'invoiceId' ? 'idFactura' : column.key)),
            );
            const rows = sortRows(
                (result.data || []).map((row) => ({ ...row, idFactura: row.invoiceId })),
                config?.sortBy,
            );
            const columns = (config.columns || []).filter((column) => serverColumns.has(column.accessor));
            if (!columns.length) throw new Error('Selecciona columnas autorizadas.');
            const moneyKeys = ['monto', 'utilidad'];
            const formatValue = (key, value) => {
                if (moneyKeys.includes(key))
                    return value == null ? 'No disponible' : formatMoney(value, config?.currency, currencyRate?.Cambio);
                if (key === 'fecha') return DateTime.fromISO(value).toFormat('dd/MM/yyyy');
                return String(value ?? '');
            };
            pdfMake
                .createPdf({
                    content: [
                        { text: 'ALIMENTOS DM MARKET, C.A.', style: 'header' },
                        { text: 'R.I.F.: J-41270446-0', style: 'header' },
                        { text: `Ventas de: ${client.Empresa}`, style: 'subtitle' },
                        {
                            text: `Período: ${DateTime.fromISO(dateRange.from).toFormat('dd/MM/yyyy')} — ${DateTime.fromISO(dateRange.to).toFormat('dd/MM/yyyy')} · ${showNoe ? 'Notas de entrega' : 'Facturas'}`,
                            style: 'subtitle',
                        },
                        ...(salesSearch ? [{ text: `Búsqueda: ${salesSearch}`, style: 'subtitle' }] : []),
                        {
                            margin: [0, 12, 0, 0],
                            fontSize: 8,
                            table: {
                                headerRows: 1,
                                widths: columns.map((column) => (column.accessor === 'vendedor' ? '*' : 'auto')),
                                body: [
                                    columns.map((column) => ({ text: column.Header, bold: true })),
                                    ...rows.map((row) =>
                                        columns.map((column) => formatValue(column.accessor, row[column.accessor])),
                                    ),
                                    columns.map((column) => ({
                                        text: moneyKeys.includes(column.accessor)
                                            ? formatValue(
                                                  column.accessor,
                                                  rows.some((row) => row[column.accessor] == null)
                                                      ? null
                                                      : rows.reduce(
                                                            (sum, row) => sum + Number(row[column.accessor]),
                                                            0,
                                                        ),
                                              )
                                            : '',
                                        bold: true,
                                    })),
                                ],
                            },
                        },
                    ],
                    styles: {
                        header: { alignment: 'center', fontSize: 10, bold: true },
                        subtitle: { alignment: 'center', fontSize: 9, margin: [0, 4, 0, 0] },
                    },
                    pageMargins: 40,
                    pageSize: 'LETTER',
                    pageOrientation: config?.orientation || 'portrait',
                })
                .open();
        } catch (error) {
            console.error('Failed to print client sales:', error);
            setPrintError('No se pudo generar la impresión. Intenta nuevamente.');
        }
    };

    const handleSaleRowClick = useCallback(
        async (sale) => {
            try {
                const detail = await fetchInvoiceDetail(sale.idFactura, showNoe);
                setSelectedSale(detail);
                setSaleDetailModalShow(true);
            } catch (err) {
                console.error('Failed to fetch invoice detail:', err);
            }
        },
        [showNoe],
    );

    const totalPages = Math.ceil((salesData?.total || 0) / LIMIT);

    const stats = useMemo(
        () => [
            {
                label: 'Total Ventas',
                value: formatCurrency(summary?.totalAmount ?? 0),
                variant: 'primary',
                icon: IconSales,
            },
            {
                label: '# Ventas',
                value: String(summary?.totalCount || '0'),
                variant: 'success',
                icon: IconHash,
            },
            {
                label: 'Promedio Ticket',
                value:
                    summary?.avgTicket !== null && summary?.avgTicket !== undefined
                        ? formatCurrency(summary.avgTicket)
                        : 'N/A',
                variant: 'info',
                icon: IconTicket,
            },
            {
                label: 'Promedio Días',
                value:
                    summary?.avgDaysBetweenSales !== null && summary?.avgDaysBetweenSales !== undefined
                        ? `${summary.avgDaysBetweenSales} días`
                        : 'N/A',
                variant: 'warning',
                icon: IconCalendar,
            },
        ],
        [summary],
    );

    const nivoTheme = {
        axis: {
            ticks: { text: { fill: '#adb5bd', fontSize: 11 }, line: { stroke: '#2f3338' } },
            domain: { line: { stroke: '#2f3338' } },
        },
        grid: { line: { stroke: '#2f3338', strokeDasharray: '4 4' } },
        crosshair: { line: { stroke: '#0d6efd', strokeWidth: 1, strokeOpacity: 0.5 } },
        tooltip: {
            background: '#1a1d21',
            color: '#e9ecef',
            border: '1px solid #2f3338',
            borderRadius: '8px',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.4)',
            fontSize: '13px',
            container: {
                background: '#1a1d21',
                color: '#e9ecef',
                border: '1px solid #2f3338',
                borderRadius: '8px',
                fontSize: '13px',
            },
        },
    };

    const avatarLetter = client?.Empresa ? client.Empresa.charAt(0).toUpperCase() : 'C';

    const hasChartData = chartData.length > 0 && chartData[0].data.length > 0;

    const chartBlock = (
        <div className="chart-card">
            <div className="chart-title">Tendencia de ventas por mes</div>
            <div className="chart-wrapper">
                {chartLoading ? (
                    <div className="d-flex justify-content-center align-items-center h-100">
                        <Spinner animation="border" variant="primary" size="sm" />
                    </div>
                ) : hasChartData ? (
                    <ResponsiveLine
                        data={chartData}
                        theme={nivoTheme}
                        margin={{ top: 10, right: 20, bottom: 35, left: 55 }}
                        xScale={{ type: 'point' }}
                        yScale={{ type: 'linear', min: 'auto', max: 'auto', stacked: false, reverse: false }}
                        curve="monotoneX"
                        axisTop={null}
                        axisRight={null}
                        axisBottom={{
                            tickSize: 5,
                            tickPadding: 5,
                            tickRotation: -25,
                            legend: '',
                            legendOffset: 36,
                        }}
                        axisLeft={{
                            tickSize: 5,
                            tickPadding: 5,
                            tickRotation: 0,
                            legend: '',
                            legendOffset: -40,
                            format: (v) => formatCurrency(v),
                        }}
                        enableGridX={false}
                        colors={['#0d6efd']}
                        lineWidth={3}
                        pointSize={6}
                        pointColor="#0d6efd"
                        pointBorderWidth={2}
                        pointBorderColor="#1a1d21"
                        pointLabelYOffset={-12}
                        useMesh
                        enableArea
                        areaOpacity={0.15}
                        tooltip={() => null}
                        onMouseMove={(point, event) => {
                            if (point) {
                                setChartTooltip({ visible: true, x: event.clientX, y: event.clientY, point });
                            } else {
                                setChartTooltip((prev) => ({ ...prev, visible: false }));
                            }
                        }}
                        onMouseLeave={() => setChartTooltip((prev) => ({ ...prev, visible: false }))}
                    />
                ) : (
                    <div className="chart-empty">
                        <svg
                            width="40"
                            height="40"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        >
                            <path d="M3 3v18h18" />
                            <path d="M18 17V9" />
                            <path d="M13 17V5" />
                            <path d="M8 17v-3" />
                        </svg>
                        <span>Sin datos para el período</span>
                    </div>
                )}
            </div>
            {chartTooltip.visible && chartTooltip.point && (
                <div
                    style={{
                        position: 'fixed',
                        left: chartTooltip.x + 12,
                        top: chartTooltip.y - 70,
                        zIndex: 9999,
                        pointerEvents: 'none',
                        background: '#1a1d21',
                        color: '#e9ecef',
                        border: '1px solid #2f3338',
                        borderRadius: '8px',
                        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.4)',
                        padding: '8px 10px',
                        minWidth: 140,
                    }}
                >
                    <div
                        style={{ fontSize: '0.75rem', color: '#adb5bd', marginBottom: 4, textTransform: 'capitalize' }}
                    >
                        {chartTooltip.point.data.x}
                    </div>
                    <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#20c997' }}>
                        {formatCurrency(chartTooltip.point.data.y)}
                    </div>
                </div>
            )}
        </div>
    );

    const salesBlock = (
        <div className="sales-card">
            <div className="card-header">
                <h5>Ventas</h5>
                <Badge bg="secondary" pill>
                    {salesData?.total ?? 0} registros
                </Badge>
            </div>
            <div className="card-body">
                <Table
                    data={salesData?.data || []}
                    columns={SALES_COLUMNS.filter(
                        (column) =>
                            column.accessor !== 'utilidad' || Object.hasOwn(salesData?.totals || {}, 'utilidad'),
                    )}
                    loading={salesLoading}
                    showFooter={!!salesData?.totals}
                    summaries={salesData?.totals}
                    maxHeight={420}
                    emptyMessage="Sin ventas en este período"
                    onRowClick={handleSaleRowClick}
                    search={{
                        enabled: true,
                        onSearch: handleSalesSearch,
                        placeholder: 'Buscar por documento o vendedor...',
                    }}
                    sorting={{ enabled: true, sortBy: salesSort, onSort: handleSalesSort }}
                    print={{
                        enabled: exporting && salesData?.exportAllowed === true,
                        onGlobalPrint: handlePrintSales,
                        storageKey: 'cliente-ventas',
                    }}
                    pagination={{
                        enabled: true,
                        page: salesPage,
                        totalPages,
                        totalRows: salesData?.total ?? 0,
                        pageSize: LIMIT,
                        onPageChange: setSalesPage,
                    }}
                />
            </div>
        </div>
    );

    if (summaryError) {
        console.error('Client dashboard error:', summaryError);
    }

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
                            <Modal.Title>{client?.Empresa}</Modal.Title>
                            <div className="modal-subtitle">Cliente #{formatReportId(client?.IdCliente)}</div>
                        </div>
                    </div>
                </Modal.Header>
                <Modal.Body>
                    {salesError && (
                        <Alert variant="danger">No se pudieron cargar las ventas. Intenta nuevamente.</Alert>
                    )}
                    {printError && <Alert variant="danger">{printError}</Alert>}
                    <div className="date-picker-card">
                        <div className="date-picker-label">Rango de fechas</div>
                        <DateRangePicker
                            key={client?.IdCliente || 'picker'}
                            initialFrom={initialRange.from}
                            initialTo={initialRange.to}
                            onChange={handleDateRangeChange}
                        />
                    </div>

                    <div className="stats-row">
                        {stats.map((stat) => (
                            <StatCard key={stat.label} {...stat} loading={summaryLoading} />
                        ))}
                    </div>

                    <div className="dashboard-grid">
                        {chartBlock}
                        {salesBlock}
                    </div>
                </Modal.Body>
            </Modal>
            {saleDetailModalShow && (
                <SaleDetailModal
                    show={saleDetailModalShow}
                    onClose={() => setSaleDetailModalShow(false)}
                    sale={selectedSale}
                />
            )}
        </>
    );
};

export default ClientDashboardModal;
