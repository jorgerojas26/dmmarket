import { ResponsiveLine } from '@nivo/line';
import DateRangePicker from 'components/DateRangePicker';
import Table from 'components/Table';
import { ShowNoeContext } from 'context/show_noe';
import { useClientSales, useClientSummary } from 'hooks/useClients';
import { DateTime } from 'luxon';
import { useCallback, useContext, useMemo, useState } from 'react';
import Badge from 'react-bootstrap/Badge';
import Modal from 'react-bootstrap/Modal';
import Spinner from 'react-bootstrap/Spinner';
import { formatCurrency } from 'utils/format';

const LIMIT = 20;
const CHART_LIMIT = 500;

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
const IconTicket = () => (
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
        <path d="M15 5v2" />
        <path d="M15 11v2" />
        <path d="M15 17v2" />
        <path d="M5 5h14a2 2 0 0 1 2 2v3a2 2 0 0 0 0 4v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-3a2 2 0 0 0 0-4V7a2 2 0 0 1 2-2z" />
    </svg>
);
const IconCalendar = () => (
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
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
        <line x1="16" y1="2" x2="16" y2="6" />
        <line x1="8" y1="2" x2="8" y2="6" />
        <line x1="3" y1="10" x2="21" y2="10" />
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
    const { showNoe } = useContext(ShowNoeContext);

    const today = DateTime.now().toISODate();
    const oneYearAgo = DateTime.now().minus({ years: 1 }).toISODate();

    const [dateRange, setDateRange] = useState({ from: oneYearAgo, to: today });
    const [salesPage, setSalesPage] = useState(1);
    const [chartTooltip, setChartTooltip] = useState({ visible: false, x: 0, y: 0, point: null });

    // ── SWR hooks ──
    const clientEnabled = show && !!client?.IdCliente;

    const {
        data: summary,
        error: summaryError,
        isLoading: summaryLoading,
    } = useClientSummary(client?.IdCliente, { from: dateRange.from, to: dateRange.to, showNoe }, clientEnabled);

    const { data: salesData, isLoading: salesLoading } = useClientSales(
        client?.IdCliente,
        {
            from: dateRange.from,
            to: dateRange.to,
            page: salesPage,
            limit: LIMIT,
            showNoe,
        },
        clientEnabled,
    );

    // Chart: fetch all sales (up to CHART_LIMIT)
    const chartEnabled = clientEnabled && (summary?.totalCount || 0) > 0;
    const chartLimit = Math.min(summary?.totalCount || 0, CHART_LIMIT);
    const { data: chartSalesData, isLoading: chartLoading } = useClientSales(
        client?.IdCliente,
        {
            from: dateRange.from,
            to: dateRange.to,
            page: 1,
            limit: chartLimit || 1,
            showNoe,
        },
        chartEnabled,
    );

    const chartData = useMemo(() => {
        if (!chartSalesData?.data?.length) return [];
        const aggregated = aggregateSalesByMonth(chartSalesData.data);
        return [{ id: 'Ventas', data: aggregated }];
    }, [chartSalesData]);

    const handleDateRangeChange = ({ from, to }) => {
        setDateRange({ from, to });
        setSalesPage(1);
    };

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
                            format: (v) => `$${Number(v).toLocaleString('en-US')}`,
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
                <div className="table-container">
                    <Table
                        data={salesData?.data || []}
                        columns={[
                            { Header: 'Vendedor', accessor: 'vendedor' },
                            {
                                Header: 'Fecha',
                                accessor: 'fecha',
                                Cell: ({ value }) => DateTime.fromISO(value).toFormat('dd MMM yyyy', { locale: 'es' }),
                            },
                            { Header: 'Monto', accessor: 'monto', Cell: ({ value }) => formatCurrency(value) },
                        ]}
                        loading={salesLoading}
                        className="table"
                        maxHeight={null}
                        emptyMessage="Sin ventas en este período"
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
        </div>
    );

    if (summaryError) {
        console.error('Client dashboard error:', summaryError);
    }

    return (
        <Modal show={show} size="xl" onHide={onClose} backdrop="static" scrollable className="client-dashboard-modal">
            <Modal.Header closeButton>
                <div className="d-flex align-items-center gap-3">
                    <div className="client-avatar">{avatarLetter}</div>
                    <div>
                        <Modal.Title>{client?.Empresa}</Modal.Title>
                        <div className="modal-subtitle">Cliente #{client?.IdCliente}</div>
                    </div>
                </div>
            </Modal.Header>
            <Modal.Body>
                <div className="date-picker-card">
                    <div className="date-picker-label">Rango de fechas</div>
                    <DateRangePicker
                        key={client?.IdCliente || 'picker'}
                        initialFrom={oneYearAgo}
                        initialTo={today}
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
    );
};

export default ClientDashboardModal;
