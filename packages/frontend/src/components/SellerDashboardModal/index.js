import { ResponsiveLine } from '@nivo/line';
import { fetchSellerSales } from 'api/sellers';
import ChartTooltip from 'components/ChartTooltip';
import KpiCard from 'components/Dashboard/KpiCard';
import PanelHelpTitle from 'components/Dashboard/PanelHelpTitle';
import RankedList from 'components/Dashboard/RankedList';
import DateRangePicker from 'components/DateRangePicker';
import InvoiceDetailModal from 'components/InvoiceDetailModal';
import Modal from 'components/Modal';
import Table from 'components/Table';
import { CurrencyRateContext } from 'context/currency_rate';
import { ShowNoeContext } from 'context/show_noe';
import { useSellerSales, useSellerSummary } from 'hooks/useSellers';
import { DateTime } from 'luxon';
import pdfMake from 'pdfmake/build/pdfmake';
import pdfFonts from 'pdfmake/build/vfs_fonts';
import { useCallback, useContext, useMemo, useState } from 'react';
import { Alert, Badge } from 'react-bootstrap';
import {
    computeComparison,
    formatCurrency,
    formatMoney,
    formatNumber,
    formatPercent,
    formatReportId,
    getReportCurrency,
} from 'utils/format';
import { sortRows } from 'utils/sortRows';
import './styles.css';

pdfMake.vfs = pdfFonts.pdfMake ? pdfFonts.pdfMake.vfs : pdfMake.vfs;

const LIMIT = 50;
const DEFAULT_SORT = [{ id: 'fecha', desc: true }];

const SALES_COLUMNS = [
    { Header: 'Documento', accessor: 'invoiceId' },
    { Header: 'Cliente', accessor: 'client' },
    {
        Header: 'Fecha',
        accessor: 'fecha',
        Cell: ({ value }) =>
            value && DateTime.fromISO(value).isValid
                ? DateTime.fromISO(value).toFormat('dd MMM yyyy', { locale: 'es' })
                : '—',
    },
    {
        Header: 'Monto',
        accessor: 'monto',
        Cell: ({ value }) => formatCurrency(value),
        Footer: ({ summary }) => formatCurrency(summary ?? 0),
    },
    {
        Header: 'Utilidad',
        accessor: 'utilidad',
        Cell: ({ value }) => formatCurrency(value),
        Footer: ({ summary }) => formatCurrency(summary ?? 0),
    },
];

const PRODUCT_COLUMNS = [
    { Header: 'Producto', accessor: 'product' },
    { Header: 'Unidades', accessor: 'quantity', Cell: ({ value }) => formatNumber(value || 0) },
    { Header: 'Ventas', accessor: 'sales', Cell: ({ value }) => formatCurrency(value) },
    { Header: 'Utilidad', accessor: 'profit', Cell: ({ value }) => formatCurrency(value) },
];

const nivoTheme = {
    axis: {
        ticks: { text: { fill: '#adb5bd', fontSize: 11 }, line: { stroke: '#2f3338' } },
        domain: { line: { stroke: '#2f3338' } },
    },
    grid: { line: { stroke: '#2f3338', strokeDasharray: '4 4' } },
    tooltip: {
        container: {
            background: '#1a1d21',
            color: '#e9ecef',
            border: '1px solid #2f3338',
            borderRadius: '8px',
            fontSize: '13px',
        },
    },
};

const axisMoney = (value) =>
    Number(value) >= 1000 ? `${getReportCurrency()} ${(Number(value) / 1000).toFixed(0)}k` : formatCurrency(value);

const SellerDashboardModal = ({ show, onClose, seller, initialDateRange }) => {
    const { showNoe } = useContext(ShowNoeContext);
    const { currencyRate } = useContext(CurrencyRateContext);
    const [dateRange, setDateRange] = useState(
        initialDateRange || {
            from: DateTime.now().minus({ months: 3 }).toISODate(),
            to: DateTime.now().toISODate(),
        },
    );
    const [salesPage, setSalesPage] = useState(1);
    const [salesSearch, setSalesSearch] = useState('');
    const [salesSort, setSalesSort] = useState(DEFAULT_SORT);
    const [selectedInvoiceId, setSelectedInvoiceId] = useState(null);
    const [printError, setPrintError] = useState('');

    const enabled = show && !!seller?.sellerId;

    const {
        data: summary,
        isLoading: summaryLoading,
        error: summaryError,
    } = useSellerSummary(seller?.sellerId, { from: dateRange.from, to: dateRange.to, showNoe }, enabled);

    const {
        data: salesData,
        isLoading: salesLoading,
        error: salesError,
    } = useSellerSales(
        seller?.sellerId,
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

    const totals = summary?.totals;
    const compare = summary?.compare;

    const identity = summary?.seller || seller || {};

    const daysInactive = useMemo(() => {
        if (!totals?.lastSale) return null;
        const last = DateTime.fromISO(totals.lastSale);
        if (!last.isValid) return null;
        return Math.max(0, Math.round(DateTime.now().startOf('day').diff(last.startOf('day'), 'days').days));
    }, [totals?.lastSale]);

    const monthlyChart = useMemo(() => {
        if (!summary?.monthlyTrend?.length) return [];
        return [
            {
                id: 'Ventas',
                data: summary.monthlyTrend.map((row) => ({
                    x: DateTime.fromISO(`${row.month}-01`).toFormat('MMM yy', { locale: 'es' }),
                    y: row.sales,
                })),
            },
        ];
    }, [summary?.monthlyTrend]);

    const handleDateRangeChange = useCallback(({ from, to }) => {
        setDateRange({ from, to });
        setSalesPage(1);
    }, []);

    const handleSalesSearch = useCallback((term) => {
        setSalesSearch(term || '');
        setSalesPage(1);
    }, []);

    const handleSalesSort = useCallback((sort) => {
        setSalesSort(sort.length ? sort : DEFAULT_SORT);
        setSalesPage(1);
    }, []);

    const handlePrintSales = useCallback(
        async (config) => {
            setPrintError('');
            try {
                const result = await fetchSellerSales(seller.sellerId, {
                    ...dateRange,
                    page: 1,
                    limit: salesData?.total || LIMIT,
                    search: salesSearch || undefined,
                    sortBy: salesSort[0]?.id,
                    sortDir: salesSort[0]?.desc ? 'desc' : 'asc',
                    showNoe,
                });
                const rows = sortRows(result.data || [], config?.sortBy);
                const columns = config?.columns?.length ? config.columns : SALES_COLUMNS;
                const moneyKeys = ['monto', 'utilidad'];
                const formatValue = (key, value) => {
                    if (moneyKeys.includes(key)) return formatMoney(value, config?.currency, currencyRate?.Cambio);
                    if (key === 'fecha') return DateTime.fromISO(value).toFormat('dd/MM/yyyy');
                    return String(value ?? '');
                };
                pdfMake
                    .createPdf({
                        content: [
                            { text: 'ALIMENTOS DM MARKET, C.A.', style: 'header' },
                            { text: 'R.I.F.: J-41270446-0', style: 'header' },
                            { text: `Ventas de: ${identity.name || 'Vendedor'}`, style: 'subtitle' },
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
                                    widths: columns.map((column) => (column.accessor === 'client' ? '*' : 'auto')),
                                    body: [
                                        columns.map((column) => ({ text: column.Header, bold: true })),
                                        ...rows.map((row) =>
                                            columns.map((column) => formatValue(column.accessor, row[column.accessor])),
                                        ),
                                        columns.map((column) => ({
                                            text: moneyKeys.includes(column.accessor)
                                                ? formatValue(column.accessor, result.totals?.[column.accessor] ?? 0)
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
                console.error('Failed to print seller sales:', error);
                setPrintError('No se pudo generar la impresión. Intenta nuevamente.');
            }
        },
        [seller?.sellerId, dateRange, salesData?.total, salesSearch, salesSort, showNoe, currencyRate, identity.name],
    );

    const totalPages = Math.ceil((salesData?.total || 0) / LIMIT);
    const avatarLetter = identity.name ? identity.name.charAt(0).toUpperCase() : 'V';
    const contact = [identity.ci, identity.phone, identity.email].filter(Boolean);

    return (
        <>
            <Modal
                show={show}
                size="xl"
                onHide={onClose}
                backdrop="static"
                scrollable
                className="seller-dashboard-modal"
            >
                <Modal.Header closeButton>
                    <div className="d-flex align-items-center gap-3">
                        <div className="seller-avatar">{avatarLetter}</div>
                        <div>
                            <Modal.Title>{identity.name || 'Vendedor'}</Modal.Title>
                            <div className="modal-subtitle">
                                Vendedor #{formatReportId(identity.sellerId)}
                                {contact.length > 0 ? ` · ${contact.join(' · ')}` : ''}
                            </div>
                        </div>
                    </div>
                </Modal.Header>
                <Modal.Body>
                    {summaryError && (
                        <Alert variant="danger">No se pudo cargar el resumen del vendedor. Intenta nuevamente.</Alert>
                    )}
                    {salesError && (
                        <Alert variant="danger">No se pudieron cargar las ventas. Intenta nuevamente.</Alert>
                    )}
                    {printError && <Alert variant="danger">{printError}</Alert>}

                    <div className="date-picker-card">
                        <div className="date-picker-label">Rango de fechas</div>
                        <DateRangePicker
                            key={seller?.sellerId || 'picker'}
                            initialFrom={dateRange.from}
                            initialTo={dateRange.to}
                            onChange={handleDateRangeChange}
                        />
                    </div>

                    <div className="dashboard-kpi-grid dashboard-kpi-grid-compact mb-3">
                        <div>
                            <KpiCard
                                label="Ventas"
                                value={formatCurrency(totals?.sales ?? 0)}
                                comparison={computeComparison(totals?.sales, compare?.sales)}
                                icon="money"
                                accent="blue"
                                loading={summaryLoading && !summary}
                            />
                        </div>
                        <div>
                            <KpiCard
                                label="Utilidad"
                                value={formatCurrency(totals?.profit ?? 0)}
                                comparison={computeComparison(totals?.profit, compare?.profit)}
                                icon="chart"
                                accent="green"
                                loading={summaryLoading && !summary}
                            />
                        </div>
                        <div>
                            <KpiCard
                                label="Margen"
                                value={formatPercent(totals?.marginPercent ?? 0)}
                                icon="percent"
                                accent="amber"
                                loading={summaryLoading && !summary}
                            />
                        </div>
                        <div>
                            <KpiCard
                                label="Facturas"
                                value={formatNumber(totals?.invoices ?? 0)}
                                comparison={computeComparison(totals?.invoices, compare?.invoices)}
                                icon="receipt"
                                accent="cyan"
                                loading={summaryLoading && !summary}
                            />
                        </div>
                        <div>
                            <KpiCard
                                label="Ticket Promedio"
                                value={formatCurrency(totals?.avgTicket ?? 0)}
                                icon="ticket"
                                accent="purple"
                                loading={summaryLoading && !summary}
                            />
                        </div>
                        <div>
                            <KpiCard
                                label="Clientes Atendidos"
                                value={formatNumber(totals?.clients ?? 0)}
                                icon="user"
                                accent="pink"
                                loading={summaryLoading && !summary}
                            />
                        </div>
                        <div>
                            <KpiCard
                                label="Días Sin Vender"
                                value={daysInactive == null ? '—' : `${formatNumber(daysInactive)} días`}
                                icon="chart"
                                accent="orange"
                                loading={summaryLoading && !summary}
                            />
                        </div>
                    </div>

                    <div className="row g-3 mb-3">
                        <div className="col-12">
                            <div className="dashboard-panel" style={{ padding: '16px 20px' }}>
                                <PanelHelpTitle
                                    title="Tendencia de Ventas por Mes"
                                    help={{
                                        que: 'Ventas del vendedor mes a mes dentro del rango elegido.',
                                        leer: 'Cada punto es un mes; la altura es el monto vendido.',
                                        servir: 'Ver si el vendedor sostiene el ritmo o tiene meses flojos.',
                                    }}
                                />
                                <div style={{ height: 260 }}>
                                    {monthlyChart.length > 0 && monthlyChart[0].data.length > 0 ? (
                                        <ResponsiveLine
                                            data={monthlyChart}
                                            theme={nivoTheme}
                                            margin={{ top: 10, right: 20, bottom: 35, left: 65 }}
                                            xScale={{ type: 'point' }}
                                            yScale={{ type: 'linear', min: 0, max: 'auto' }}
                                            curve="monotoneX"
                                            axisBottom={{ tickSize: 5, tickPadding: 5, tickRotation: -30 }}
                                            axisLeft={{ tickSize: 5, tickPadding: 5, format: axisMoney }}
                                            colors={['#3b82f6']}
                                            pointSize={6}
                                            pointColor="#3b82f6"
                                            pointBorderWidth={2}
                                            pointBorderColor="#1e2126"
                                            enableArea
                                            areaOpacity={0.12}
                                            useMesh
                                            enableGridX={false}
                                            tooltip={({ point }) => (
                                                <ChartTooltip title={String(point.data.x)} color="#3b82f6">
                                                    <span>Ventas</span>
                                                    <strong>{formatCurrency(point.data.y)}</strong>
                                                </ChartTooltip>
                                            )}
                                        />
                                    ) : (
                                        <div className="d-flex align-items-center justify-content-center h-100 text-muted">
                                            Sin ventas en este período
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="row g-3 mb-3">
                        <div className="col-12 col-lg-6">
                            <div className="dashboard-panel" style={{ padding: '16px 20px', height: '100%' }}>
                                <PanelHelpTitle
                                    title="Top Clientes"
                                    help={{
                                        que: 'Los clientes que más le compraron a este vendedor en el periodo.',
                                        leer: 'Se ordena por monto vendido; el texto secundario muestra facturas y margen.',
                                        servir: 'Saber de quién depende la venta del vendedor.',
                                    }}
                                />
                                <div style={{ height: 300, overflowY: 'auto' }}>
                                    <RankedList
                                        data={summary?.topClients || []}
                                        nameKey="name"
                                        valueKey="sales"
                                        valueFormat={formatCurrency}
                                        secondary={{
                                            render: (item) =>
                                                `${formatNumber(item.invoices)} facturas · ${formatPercent(
                                                    item.sales > 0 ? (item.profit / item.sales) * 100 : 0,
                                                )} margen`,
                                        }}
                                        emptyMessage="Sin clientes en este período"
                                    />
                                </div>
                            </div>
                        </div>
                        <div className="col-12 col-lg-6">
                            <div className="dashboard-panel" style={{ padding: '16px 20px', height: '100%' }}>
                                <PanelHelpTitle
                                    title="Top Productos"
                                    help={{
                                        que: 'Los productos que más vendió este vendedor en el periodo.',
                                        leer: 'Se ordena por monto vendido; incluye unidades y utilidad.',
                                        servir: 'Conocer en qué se apoya su venta.',
                                    }}
                                />
                                <Table
                                    data={summary?.topProducts || []}
                                    columns={PRODUCT_COLUMNS}
                                    maxHeight={300}
                                    emptyMessage="Sin productos en este período"
                                />
                            </div>
                        </div>
                    </div>

                    <div className="dashboard-panel" style={{ padding: '16px 20px' }}>
                        <div className="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-2">
                            <PanelHelpTitle
                                title="Historial de Ventas"
                                help={{
                                    que: 'Todas las facturas emitidas por este vendedor en el periodo.',
                                    leer: 'Puedes buscar por documento o cliente, ordenar por columna y hacer clic en una fila para ver el detalle.',
                                    servir: 'Auditar la venta del vendedor factura por factura.',
                                }}
                            />
                            <Badge bg="secondary" pill>
                                {formatNumber(salesData?.total ?? 0)} registros
                            </Badge>
                        </div>
                        <Table
                            data={salesData?.data || []}
                            columns={SALES_COLUMNS}
                            loading={salesLoading}
                            showFooter={!!salesData?.totals}
                            summaries={salesData?.totals}
                            maxHeight={420}
                            emptyMessage="Sin ventas en este período"
                            onRowClick={(sale) => setSelectedInvoiceId(sale.invoiceId)}
                            search={{
                                enabled: true,
                                onSearch: handleSalesSearch,
                                placeholder: 'Buscar por documento o cliente...',
                            }}
                            sorting={{ enabled: true, sortBy: salesSort, onSort: handleSalesSort }}
                            print={{
                                enabled: true,
                                onGlobalPrint: handlePrintSales,
                                storageKey: 'vendedor-ventas',
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
                </Modal.Body>
            </Modal>
            {show && selectedInvoiceId != null && (
                <InvoiceDetailModal
                    key={`${selectedInvoiceId}-${showNoe}`}
                    invoiceId={selectedInvoiceId}
                    showNoe={showNoe}
                    onClose={() => setSelectedInvoiceId(null)}
                />
            )}
        </>
    );
};

export default SellerDashboardModal;
