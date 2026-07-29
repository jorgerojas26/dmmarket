import { ResponsiveBar } from '@nivo/bar';
import { ResponsiveLine } from '@nivo/line';
import { ResponsivePie } from '@nivo/pie';
import { useClientsDashboard } from 'hooks/useClients';
import { DateTime } from 'luxon';
import { useMemo } from 'react';
import { formatCurrency, formatNumber, formatPercent } from 'utils/format';
import KpiCard from './KpiCard';
import RankedList from './RankedList';

const nivoTheme = {
    axis: {
        ticks: { text: { fill: '#adb5bd', fontSize: 11 }, line: { stroke: '#2f3338' } },
        domain: { line: { stroke: '#2f3338' } },
    },
    grid: { line: { stroke: '#2f3338', strokeDasharray: '4 4' } },
    legends: { text: { fill: '#adb5bd', fontSize: 11 } },
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

const ClientsDashboard = ({ dateRange, showNoe }) => {
    const { data, error, isLoading } = useClientsDashboard(dateRange, showNoe);

    // ── Derived chart data ──

    const monthlyActiveChart = useMemo(() => {
        if (!data?.monthlyActive) return [];
        return [
            {
                id: 'Clientes Activos',
                data: data.monthlyActive.map((d) => ({
                    x: DateTime.fromISO(`${d.month}-01`).toFormat('MMM yy', { locale: 'es' }),
                    y: d.count,
                })),
            },
        ];
    }, [data?.monthlyActive]);

    const segmentPieData = useMemo(() => {
        if (!data?.revenueBySegment) return [];
        return data.revenueBySegment.map((s) => ({
            id: s.segment,
            label: s.segment,
            value: s.revenue,
        }));
    }, [data?.revenueBySegment]);

    const inactiveBucketData = useMemo(() => {
        if (!data?.inactiveBuckets) return [];
        return data.inactiveBuckets.map((b) => ({
            bucket: b.bucket,
            Clientes: b.count,
            'Revenue ($)': b.revenue,
        }));
    }, [data?.inactiveBuckets]);

    const kpis = data?.kpis;

    if (error) {
        return <div className="alert alert-danger">Error al cargar el dashboard: {error.message}</div>;
    }

    const renderWaterfall = () => {
        const w = data?.waterfall;
        if (!w) return null;

        const maxVal = Math.max(w.previous, w.current);
        const barHeight = 32;

        const bars = [
            { label: 'Anterior', value: w.previous, color: '#3b82f6', isTotal: true, x: 0, width: 100 },
            {
                label: 'Retenidos',
                value: w.retained,
                color: '#22c55e',
                isTotal: false,
                x: 0,
                width: maxVal > 0 ? (w.retained / maxVal) * 100 : 0,
            },
            {
                label: 'Perdidos',
                value: -w.lost,
                color: '#ef4444',
                isTotal: false,
                x: maxVal > 0 ? ((w.retained - w.lost) / maxVal) * 100 : 0,
                width: maxVal > 0 ? Math.abs(-w.lost / maxVal) * 100 : 0,
            },
            {
                label: 'Ganados',
                value: w.gained,
                color: '#06b6d4',
                isTotal: false,
                x: maxVal > 0 ? (w.retained / maxVal) * 100 : 0,
                width: maxVal > 0 ? (w.gained / maxVal) * 100 : 0,
            },
            {
                label: 'Actual',
                value: w.current,
                color: '#a855f7',
                isTotal: true,
                x: 0,
                width: maxVal > 0 ? (w.current / maxVal) * 100 : 0,
            },
        ];

        return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {bars.map((bar) => (
                    <div key={bar.label} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span
                            style={{
                                width: 70,
                                fontSize: 12,
                                color: bar.isTotal ? '#e4e6ea' : '#94a3b8',
                                fontWeight: bar.isTotal ? 600 : 400,
                                textAlign: 'right',
                                flexShrink: 0,
                            }}
                        >
                            {bar.label}
                        </span>
                        <div style={{ flex: 1, position: 'relative', height: barHeight }}>
                            <div
                                style={{
                                    position: 'absolute',
                                    left: `${bar.x}%`,
                                    height: '100%',
                                    width: `${bar.width}%`,
                                    minWidth: 3,
                                    background: bar.color,
                                    borderRadius: 4,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'flex-end',
                                    paddingRight: bar.width > 10 ? 8 : 0,
                                    fontSize: 12,
                                    fontWeight: 600,
                                    color: '#fff',
                                    transition: 'width 0.4s ease',
                                }}
                            >
                                {bar.width > 10 ? formatNumber(Math.abs(bar.value)) : ''}
                            </div>
                        </div>
                        {bar.width <= 10 && (
                            <span style={{ width: 50, fontSize: 12, color: '#94a3b8', flexShrink: 0 }}>
                                {formatNumber(Math.abs(bar.value))}
                            </span>
                        )}
                    </div>
                ))}
                <div style={{ fontSize: 12, color: '#64748b', textAlign: 'center', marginTop: 4 }}>
                    Neto: {w.gained - w.lost >= 0 ? '+' : ''}
                    {w.gained - w.lost} clientes
                </div>
            </div>
        );
    };

    return (
        <div style={{ position: 'relative' }}>
            {isLoading && (
                <div
                    style={{
                        position: 'absolute',
                        inset: 0,
                        zIndex: 10,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        backdropFilter: 'blur(4px)',
                        WebkitBackdropFilter: 'blur(4px)',
                        background: 'rgba(33,37,41,0.4)',
                        borderRadius: 8,
                    }}
                >
                    <span
                        className="spinner-border"
                        role="status"
                        style={{ width: '3rem', height: '3rem', color: '#e4e6ea' }}
                    />
                </div>
            )}

            {/* KPIs */}
            <div className="row g-3 mb-4">
                <div className="col-12">
                    <div className="dashboard-kpi-grid h-100">
                        <div>
                            <KpiCard
                                label="Total Clientes"
                                value={formatNumber(kpis?.totalClients)}
                                icon="user"
                                accent="blue"
                            />
                        </div>
                        <div>
                            <KpiCard
                                label="Activos Periodo"
                                value={formatNumber(kpis?.activeClients)}
                                icon="user"
                                accent="green"
                            />
                        </div>
                        <div>
                            <KpiCard
                                label="Concentración Top 5"
                                value={formatPercent(kpis?.concentration?.top5)}
                                icon="chart"
                                accent="orange"
                            />
                        </div>
                        <div>
                            <KpiCard
                                label="Retención ($)"
                                value={formatPercent(kpis?.retention?.rate)}
                                icon="percent"
                                accent="purple"
                            />
                        </div>
                        <div>
                            <KpiCard
                                label="Frecuencia Prom."
                                value={formatNumber(kpis?.avgFrequency)}
                                icon="receipt"
                                accent="cyan"
                            />
                        </div>
                        <div>
                            <KpiCard
                                label="Revenue en Riesgo"
                                value={formatCurrency(kpis?.revenueAtRisk?.amount)}
                                icon="money"
                                accent="pink"
                            />
                        </div>
                    </div>
                </div>
            </div>

            {/* Charts Row 1: Monthly Active + Segments */}
            <div className="row g-3 mb-4">
                <div className="col-12 col-lg-8">
                    <div className="dashboard-panel" style={{ padding: '16px 20px' }}>
                        <div className="dashboard-inline-title">Clientes Activos por Mes</div>
                        <div style={{ height: 300 }}>
                            {monthlyActiveChart.length > 0 && monthlyActiveChart[0].data.length > 0 ? (
                                <ResponsiveLine
                                    data={monthlyActiveChart}
                                    theme={nivoTheme}
                                    margin={{ top: 10, right: 20, bottom: 40, left: 50 }}
                                    xScale={{ type: 'point' }}
                                    yScale={{ type: 'linear', min: 0, max: 'auto' }}
                                    curve="monotoneX"
                                    axisBottom={{
                                        tickSize: 5,
                                        tickPadding: 5,
                                        tickRotation: -30,
                                    }}
                                    axisLeft={{
                                        tickSize: 5,
                                        tickPadding: 5,
                                    }}
                                    colors={['#3b82f6']}
                                    pointSize={6}
                                    pointColor="#3b82f6"
                                    pointBorderWidth={2}
                                    pointBorderColor="#1e2126"
                                    enableArea={true}
                                    areaOpacity={0.1}
                                    useMesh={true}
                                    enableGridX={false}
                                />
                            ) : (
                                <div className="d-flex align-items-center justify-content-center h-100 text-muted">
                                    Sin datos
                                </div>
                            )}
                        </div>
                    </div>
                </div>
                <div className="col-12 col-lg-4">
                    <div className="dashboard-panel" style={{ padding: '16px 20px', height: '100%' }}>
                        <div className="dashboard-inline-title">Revenue por Segmento</div>
                        <div style={{ height: 300 }}>
                            {segmentPieData.length > 0 ? (
                                <ResponsivePie
                                    data={segmentPieData}
                                    theme={nivoTheme}
                                    margin={{ top: 20, right: 20, bottom: 20, left: 20 }}
                                    innerRadius={0.5}
                                    padAngle={1}
                                    cornerRadius={3}
                                    colors={['#3b82f6', '#22c55e', '#f59e0b', '#06b6d4', '#64748b']}
                                    borderWidth={1}
                                    borderColor="#1e2126"
                                    enableArcLabels={true}
                                    arcLabelsSkipAngle={15}
                                    arcLabelsTextColor="#e4e6ea"
                                    arcLinkLabelsColor="#adb5bd"
                                    arcLinkLabelsThickness={1}
                                    valueFormat={(v) => formatCurrency(v)}
                                />
                            ) : (
                                <div className="d-flex align-items-center justify-content-center h-100 text-muted">
                                    Sin datos
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Charts Row 2: Waterfall + Inactive Buckets */}
            <div className="row g-3 mb-4">
                <div className="col-12 col-lg-6">
                    <div className="dashboard-panel" style={{ padding: '16px 20px' }}>
                        <div className="dashboard-inline-title">Waterfall de Retención</div>
                        <div style={{ minHeight: 200, paddingTop: 10 }}>{renderWaterfall()}</div>
                    </div>
                </div>
                <div className="col-12 col-lg-6">
                    <div className="dashboard-panel" style={{ padding: '16px 20px' }}>
                        <div className="dashboard-inline-title">Inactividad por Días</div>
                        <div style={{ height: 280 }}>
                            {inactiveBucketData.length > 0 ? (
                                <ResponsiveBar
                                    data={inactiveBucketData}
                                    theme={nivoTheme}
                                    keys={['Clientes']}
                                    indexBy="bucket"
                                    margin={{ top: 10, right: 10, bottom: 40, left: 50 }}
                                    colors={['#f59e0b']}
                                    borderRadius={4}
                                    axisBottom={{
                                        tickSize: 5,
                                        tickPadding: 5,
                                        tickRotation: -25,
                                    }}
                                    axisLeft={{
                                        tickSize: 5,
                                        tickPadding: 5,
                                    }}
                                    labelSkipWidth={20}
                                    labelSkipHeight={16}
                                    enableGridY={true}
                                />
                            ) : (
                                <div className="d-flex align-items-center justify-content-center h-100 text-muted">
                                    Sin datos
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* ABC Pareto */}
            {data?.abc?.summary && (
                <div className="row g-3 mb-4">
                    <div className="col-12">
                        <div className="dashboard-panel" style={{ padding: '16px 20px' }}>
                            <div className="dashboard-inline-title">
                                ABC Clientes{' '}
                                <span style={{ fontWeight: 400, fontSize: 12, color: '#64748b' }}>
                                    (A: {data.abc.summary.classA.count} clientes &middot;{' '}
                                    {formatPercent(data.abc.summary.classA.revenuePercent)} &middot; B:{' '}
                                    {data.abc.summary.classB.count} clientes &middot;{' '}
                                    {formatPercent(data.abc.summary.classB.revenuePercent)} &middot; C:{' '}
                                    {data.abc.summary.classC.count} clientes &middot;{' '}
                                    {formatPercent(data.abc.summary.classC.revenuePercent)})
                                </span>
                            </div>
                            <div style={{ height: 300 }}>
                                {data.abc.clients.length > 0 ? (
                                    <ResponsiveBar
                                        data={data.abc.clients}
                                        theme={nivoTheme}
                                        keys={['total_usd']}
                                        indexBy="name"
                                        margin={{ top: 10, right: 50, bottom: 50, left: 50 }}
                                        colors={(d) => {
                                            const client = d.data;
                                            if (client.abcClass === 'A') return '#22c55e';
                                            if (client.abcClass === 'B') return '#f59e0b';
                                            return '#64748b';
                                        }}
                                        borderRadius={2}
                                        axisBottom={null}
                                        axisLeft={{
                                            tickSize: 5,
                                            tickPadding: 5,
                                        }}
                                        label={(d) => `${d.data.abcClass}`}
                                        labelTextColor="#fff"
                                        tooltip={({ data: d }) => (
                                            <div
                                                style={{
                                                    background: '#1a1d21',
                                                    padding: '6px 12px',
                                                    border: '1px solid #2f3338',
                                                    borderRadius: 6,
                                                    fontSize: 12,
                                                    color: '#e9ecef',
                                                }}
                                            >
                                                <strong>{d.name}</strong>
                                                <br />
                                                {formatCurrency(d.total_usd)} &middot; {d.cumulativePercent}% acum
                                                <br />
                                                Clase {d.abcClass}
                                            </div>
                                        )}
                                        enableGridY={true}
                                    />
                                ) : (
                                    <div className="d-flex align-items-center justify-content-center h-100 text-muted">
                                        Sin datos
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Top 50 Treemap + Segment Table */}
            <div className="row g-3 mb-4">
                <div className="col-12 col-lg-6">
                    <div className="dashboard-panel" style={{ padding: '16px 20px' }}>
                        <div className="dashboard-inline-title">Top 50 Clientes</div>
                        <div style={{ height: 340, overflowY: 'auto' }}>
                            <RankedList
                                data={(data?.treemapTop50 || []).map((d) => ({
                                    ...d,
                                    client: d.name,
                                    netProfit: d.value,
                                }))}
                                nameKey="client"
                                valueKey="netProfit"
                                valueFormat={formatCurrency}
                            />
                        </div>
                    </div>
                </div>
                <div className="col-12 col-lg-6">
                    <div className="dashboard-panel" style={{ padding: '16px 20px' }}>
                        <div className="dashboard-inline-title">Segmentos</div>
                        <div style={{ overflowX: 'auto' }}>
                            <table className="table table-dark table-sm" style={{ margin: 0 }}>
                                <thead>
                                    <tr>
                                        <th>Segmento</th>
                                        <th className="text-end">Clientes</th>
                                        <th className="text-end">Revenue</th>
                                        <th className="text-end">%</th>
                                        <th className="text-end">Frec. Prom</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {(data?.revenueBySegment || []).map((s) => (
                                        <tr key={s.segment}>
                                            <td style={{ fontWeight: 600 }}>{s.segment}</td>
                                            <td className="text-end">{formatNumber(s.num_clients)}</td>
                                            <td className="text-end">{formatCurrency(s.revenue)}</td>
                                            <td className="text-end">{formatPercent(s.revenue_pct)}</td>
                                            <td className="text-end">{formatNumber(s.avg_invoices)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ClientsDashboard;
