import { ResponsiveBar } from '@nivo/bar';
import { ResponsiveLine } from '@nivo/line';
import { ResponsivePie } from '@nivo/pie';
import ChartTooltip from 'components/ChartTooltip';
import { useClientsDashboard } from 'hooks/useClients';
import { DateTime } from 'luxon';
import { useMemo, useState } from 'react';
import { formatCurrency, formatNumber, formatPercent } from 'utils/format';
import KpiCard from './KpiCard';
import PanelHelpTitle from './PanelHelpTitle';
import ParetoChart from './ParetoChart';
import RankedList from './RankedList';
import SinFacturarTable from './SinFacturarTable';

// Qué significa cada etiqueta de segmento (clasificación por venta del cliente en el periodo).
// Debe coincidir con los SEGMENT_THRESHOLDS del backend (controllers/clients/dashboard.js).
const SEGMENT_DESCRIPTIONS = {
    'A: >100K': 'Clientes que compraron más de $100K en el periodo',
    'B: 20K-100K': 'Clientes que compraron entre $20K y $100K',
    'C: 5K-20K': 'Clientes que compraron entre $5K y $20K',
    'D: 1K-5K': 'Clientes que compraron entre $1K y $5K',
    'E: <1K': 'Clientes que compraron menos de $1K',
};

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

// Waterfall row with hover tooltip (same styling as ChartTooltip).
const WaterfallBar = ({ bar, barHeight }) => {
    const [hovered, setHovered] = useState(false);

    return (
        <div
            style={{ display: 'flex', alignItems: 'center', gap: 10, position: 'relative' }}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
        >
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
            {hovered && (
                <div
                    style={{
                        position: 'absolute',
                        left: 80,
                        bottom: barHeight + 6,
                        zIndex: 10,
                        pointerEvents: 'none',
                    }}
                >
                    <ChartTooltip title={bar.label} color={bar.color}>
                        <span>Clientes</span>
                        <strong>{formatNumber(Math.abs(bar.value))}</strong>
                    </ChartTooltip>
                </div>
            )}
        </div>
    );
};

const ClientsDashboard = ({ dateRange, showNoe, ruta, onClientSelect }) => {
    const { data, error, isLoading } = useClientsDashboard(dateRange, showNoe, ruta);

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
            numClients: s.num_clients,
        }));
    }, [data?.revenueBySegment]);

    const segmentTotal = useMemo(
        () => segmentPieData.reduce((sum, s) => sum + Number(s.value || 0), 0),
        [segmentPieData],
    );

    const inactiveBucketData = useMemo(() => {
        if (!data?.inactiveBuckets) return [];
        return data.inactiveBuckets.map((b) => ({
            bucket: b.bucket,
            Clientes: b.count,
            'Revenue ($)': b.revenue,
        }));
    }, [data?.inactiveBuckets]);

    const coverageRoutes = useMemo(
        () =>
            (data?.coverage?.routes || []).map((r) => ({
                ...r,
                Asignados: r.asignados,
                Activos: r.activos,
            })),
        [data?.coverage?.routes],
    );

    const kpis = data?.kpis;

    // ParetoChart config for clients — stable reference so internal memoization holds.
    const paretoConfig = useMemo(
        () => ({
            nameKey: 'name',
            valueKey: 'total_usd',
            quantityKey: null,
            entityLabel: 'Cliente',
            valueLabel: 'Ventas',
            valueAxisLabel: 'Ventas',
            axisLegend: 'Clientes (ordenados por ventas)',
            summaryValueKey: 'revenuePercent',
            summaryPctLabel: 'de ventas',
            summaryTotalKey: 'totalClients',
            summaryTotalLabel: 'Total Clientes',
            summaryTotalUnit: 'clientes',
            title: 'Análisis Pareto (ABC) de Clientes',
            subtitle: '80% de las ventas viene del 20% de los clientes',
            pdfTitle: 'Análisis Pareto (ABC) de Clientes',
            allFilterLabel: 'Todos los clientes',
            emptyTableMessage: 'Sin clientes en esta clase',
        }),
        [],
    );

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
                    <WaterfallBar key={bar.label} bar={bar} barHeight={barHeight} />
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
                                help={{
                                    que: 'Cuántos clientes tiene registrados la empresa (o cuántos tiene la ruta seleccionada).',
                                    leer: 'Es el tamaño de la cartera y la base de los demás indicadores.',
                                    servir: 'Ver si la base de clientes crece o se mantiene.',
                                }}
                            />
                        </div>
                        <div>
                            <KpiCard
                                label="Activos Periodo"
                                value={formatNumber(kpis?.activeClients)}
                                icon="user"
                                accent="green"
                                help={{
                                    que: 'Clientes que compraron al menos una vez dentro del periodo elegido.',
                                    leer: 'Si es muy inferior al Total Clientes, hay parte de la cartera que no está comprando.',
                                    servir: 'Conocer la base real de clientes que generan movimiento.',
                                }}
                            />
                        </div>
                        <div>
                            <KpiCard
                                label={ruta ? 'Cobertura Ruta' : 'Cobertura Periodo'}
                                value={formatPercent(kpis?.activePercent)}
                                icon="percent"
                                accent="cyan"
                                help={{
                                    que: 'Porcentaje de clientes que compraron en el periodo sobre el total (Activos / Total).',
                                    leer: '70% = 7 de cada 10 clientes compraron. Con una ruta seleccionada, mide la cobertura de esa ruta.',
                                    servir: 'Es el indicador más accionable: cobertura baja = clientes que nadie está atendiendo.',
                                    accion: 'Entra al Desglose con esa ruta y retoma a los clientes que no compraron.',
                                }}
                            />
                        </div>
                        <div>
                            <KpiCard
                                label="Sin Facturar Periodo"
                                value={formatNumber(kpis?.sinFacturar)}
                                icon="ticket"
                                accent="amber"
                                help={{
                                    que: 'Clientes de la cartera que no emitieron ninguna factura dentro del periodo elegido.',
                                    leer: 'Número alto = gran parte de la cartera sin mover. No es exactamente Total − Activos: hay facturas de clientes sin ficha en la cartera (huérfanos) que cuentan como activos, así que este número se calcula directo de los clientes sin facturas.',
                                    servir: 'Ver el tamaño de la oportunidad de recuperación en un vistazo.',
                                    accion: 'Baja al panel "Clientes Sin Facturar" para ver quiénes son y retomarlos.',
                                }}
                            />
                        </div>
                        <div>
                            <KpiCard
                                label="Concentración Top 5"
                                value={formatPercent(kpis?.concentration?.top5)}
                                icon="chart"
                                accent="orange"
                                help={{
                                    que: 'Qué porcentaje de las ventas del periodo viene de los 5 clientes que más compran.',
                                    leer: '40% = 5 clientes generan 40 de cada 100 dólares vendidos.',
                                    servir: 'Mide la dependencia: número alto = la empresa depende de pocos clientes (frágil); número bajo = cartera más repartida y sana.',
                                }}
                            />
                        </div>
                        <div>
                            <KpiCard
                                label="Retención ($)"
                                value={formatPercent(kpis?.retention?.rate)}
                                icon="percent"
                                accent="purple"
                                help={{
                                    que: 'Qué porcentaje del dinero vendido en el periodo anterior se mantiene en el actual (clientes que ya compraban y siguen comprando).',
                                    leer: '90% = se conservan 90 de cada 100 pesos del periodo anterior; lo que falta es dinero perdido por clientes que dejaron de comprar.',
                                    servir: 'Destapa pérdida de clientes aunque las ventas se mantengan.',
                                }}
                            />
                        </div>
                        <div>
                            <KpiCard
                                label="Frecuencia Prom."
                                value={formatNumber(kpis?.avgFrequency)}
                                icon="receipt"
                                accent="cyan"
                                help={{
                                    que: 'Cuántas facturas emite en promedio cada cliente en el periodo.',
                                    leer: '2,5 = un cliente típico compra entre 2 y 3 veces en el periodo.',
                                    servir: 'Frecuencia baja con clientes activos = venta esporádica; hay espacio para más visitas y pedidos.',
                                }}
                            />
                        </div>
                        <div>
                            <KpiCard
                                label="Revenue en Riesgo"
                                value={formatCurrency(kpis?.revenueAtRisk?.amount)}
                                icon="money"
                                accent="pink"
                                help={{
                                    que: 'Cuánto facturaron, en sus últimos 12 meses de actividad, los clientes que llevan más de 60 días sin comprar.',
                                    leer: 'Es el dinero "dormido" medido por lo que vendía el cliente en el año previo a dejar de comprar (no toda su historia). Número alto = clientes que movían dinero real y se fueron.',
                                    servir: 'Priorizar la recuperación de clientes antes de que se pierdan.',
                                    accion: 'Combínalo con el gráfico "Inactividad por Días" para ubicar y contactar a esos clientes.',
                                }}
                            />
                        </div>
                        {!ruta && (
                            <div>
                                <KpiCard
                                    label="Clientes Sin Ruta"
                                    value={formatNumber(kpis?.withoutRoute)}
                                    icon="user"
                                    accent="orange"
                                    help={{
                                        que: 'Cuántos clientes no tienen ninguna ruta asignada.',
                                        leer: 'Se oculta cuando hay una ruta seleccionada en el filtro, porque no aplica a una ruta en particular.',
                                        servir: 'Un cliente sin ruta es un cliente que ningún vendedor visita de forma planificada.',
                                        accion: 'Asignarles ruta: es higiene de datos que se traduce directamente en ventas.',
                                    }}
                                />
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Charts Row 1: Monthly Active + Segments */}
            <div className="row g-3 mb-4">
                <div className="col-12 col-lg-8">
                    <div className="dashboard-panel" style={{ padding: '16px 20px' }}>
                        <PanelHelpTitle
                            title="Clientes Activos por Mes"
                            help={{
                                que: 'Evolución mes a mes de cuántos clientes compraron, dentro del periodo elegido.',
                                leer: 'Cada punto es un mes: si la línea baja, menos clientes están comprando.',
                                servir: 'Ver la tendencia: ¿la base activa crece, se estanca o se encoge?',
                                accion: 'Con una ruta seleccionada, compara la tendencia de esa ruta contra la global.',
                            }}
                        />
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
                                    tooltip={({ point }) => (
                                        <ChartTooltip title={String(point.data.x)}>
                                            <span>Clientes activos</span>
                                            <strong>{formatNumber(point.data.y)}</strong>
                                        </ChartTooltip>
                                    )}
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
                        <PanelHelpTitle
                            title="Revenue por Segmento"
                            help={{
                                que: 'Reparte las ventas del periodo según el tamaño de cada cliente: A (>$100K), B ($20K-$100K), C ($5K-$20K), D ($1K-$5K), E (<$1K).',
                                leer: 'Cada porción es un segmento; cuanto más grande, más dinero aporta. Una porción del 60% = ese segmento genera 60 de cada 100 dólares vendidos. Pasa el cursor por una porción para ver cuántos clientes tiene y cuánto vende en promedio cada uno.',
                                servir: 'Ver de dónde viene el dinero: si la torta depende de un solo segmento, la cartera es frágil.',
                            }}
                        />
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
                                    tooltip={({ datum }) => (
                                        <ChartTooltip
                                            title={datum.label}
                                            color={datum.color}
                                            description={
                                                SEGMENT_DESCRIPTIONS[datum.label] ||
                                                'Clientes agrupados por cuánto compraron en el periodo'
                                            }
                                        >
                                            <span>Clientes</span>
                                            <strong>{formatNumber(datum.data?.numClients ?? 0)}</strong>
                                            <span>Revenue</span>
                                            <strong>{formatCurrency(datum.value)}</strong>
                                            <span>% del total</span>
                                            <strong>
                                                {segmentTotal > 0
                                                    ? ((datum.value / segmentTotal) * 100).toFixed(1)
                                                    : '0.0'}
                                                %
                                            </strong>
                                            <span>Prom. por cliente</span>
                                            <strong>
                                                {formatCurrency(
                                                    datum.data?.numClients > 0
                                                        ? datum.value / datum.data.numClients
                                                        : 0,
                                                )}
                                            </strong>
                                        </ChartTooltip>
                                    )}
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

            {/* Route coverage: cartera by route */}
            {coverageRoutes.length > 0 && (
                <div className="row g-3 mb-4">
                    <div className="col-12">
                        <div className="dashboard-panel" style={{ padding: '16px 20px' }}>
                            <PanelHelpTitle
                                title="Cartera por Ruta"
                                help={{
                                    que: 'Para cada ruta: clientes asignados (azul) y clientes que compraron en el periodo (verde). "Asignado" = el cliente tiene esa ruta en su registro: el vendedor de la ruta es quien debe atenderlo, haya comprado o no.',
                                    leer: 'Cada ruta tiene dos barras: azul = su cartera (asignados) y verde = cuántos de esos compraron. Pasa el mouse sobre una barra para ver el nombre de la ruta, su cobertura (verdes ÷ azules) y qué % del total de clientes de la empresa representa.',
                                    servir: 'Es el gráfico de la oportunidad: mucha barra azul y poca verde = una cartera grande que no está comprando.',
                                    accion: 'Selecciona esa ruta en el filtro para ver sus números completos.',
                                }}
                            />
                            <div style={{ height: 300 }}>
                                <ResponsiveBar
                                    data={coverageRoutes}
                                    theme={nivoTheme}
                                    keys={['Asignados', 'Activos']}
                                    indexBy="Id_Ruta"
                                    margin={{ top: 10, right: 110, bottom: 40, left: 50 }}
                                    colors={['#3b82f6', '#22c55e']}
                                    borderRadius={3}
                                    axisBottom={{
                                        tickSize: 5,
                                        tickPadding: 5,
                                        tickRotation: -25,
                                    }}
                                    axisLeft={{
                                        tickSize: 5,
                                        tickPadding: 5,
                                    }}
                                    labelSkipWidth={16}
                                    labelSkipHeight={14}
                                    enableGridY={true}
                                    legends={[
                                        {
                                            dataFrom: 'keys',
                                            anchor: 'right',
                                            direction: 'column',
                                            translateX: 100,
                                            itemWidth: 80,
                                            itemHeight: 18,
                                            itemsSpacing: 4,
                                            symbolSize: 12,
                                            symbolShape: 'square',
                                            itemTextColor: '#adb5bd',
                                        },
                                    ]}
                                    tooltip={({ id, value, data }) => (
                                        <ChartTooltip title={data.Nombre}>
                                            <span>
                                                {id === 'Asignados'
                                                    ? 'Clientes asignados (cartera)'
                                                    : 'Compraron en el periodo'}
                                            </span>
                                            <strong>{formatNumber(value)}</strong>
                                            <span>Cobertura (verdes ÷ azules)</span>
                                            <strong>{formatPercent(data.coberturaPct ?? 0)}</strong>
                                            <span>% del total de clientes</span>
                                            <strong>{formatPercent(data.sharePct ?? 0)}</strong>
                                        </ChartTooltip>
                                    )}
                                />
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Charts Row 2: Waterfall + Inactive Buckets */}
            <div className="row g-3 mb-4">
                <div className="col-12 col-lg-6">
                    <div className="dashboard-panel" style={{ padding: '16px 20px' }}>
                        <PanelHelpTitle
                            title="Waterfall de Retención"
                            help={{
                                que: 'Compara el periodo actual contra el anterior en número de clientes: retenidos (siguen comprando), perdidos y nuevos.',
                                leer: 'Se lee de arriba hacia abajo: Anterior → Retenidos → Perdidos → Ganados → Actual. El "Neto" final dice si la cartera crece o se encoge.',
                                servir: 'Responde: ¿estoy ganando o perdiendo clientes, y de dónde viene cada número?',
                            }}
                        />
                        <div style={{ minHeight: 200, paddingTop: 10 }}>{renderWaterfall()}</div>
                    </div>
                </div>
                <div className="col-12 col-lg-6">
                    <div className="dashboard-panel" style={{ padding: '16px 20px' }}>
                        <PanelHelpTitle
                            title="Inactividad por Días"
                            help={{
                                que: 'Clasifica a los clientes según cuántos días llevan sin comprar: 0-7, 8-15, 16-30, 31-60, 61-90 y más de 90 días.',
                                leer: 'Cada barra es un rango de días; mientras más clientes en 61-90 y +90 días, más cartera se está perdiendo. El revenue de cada barra es lo que facturaba el cliente en sus últimos 12 meses de actividad.',
                                servir: 'Es el semáforo de abandono: actuar antes de que los clientes se pierdan definitivamente.',
                                accion: 'Combínalo con "Revenue en Riesgo" para saber cuánto dinero está dormido.',
                            }}
                        />
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
                                    tooltip={({ id, value, data }) => (
                                        <ChartTooltip title={String(data.bucket)}>
                                            <span>{id}</span>
                                            <strong>{formatNumber(value)}</strong>
                                            <span>Revenue (últimos 12m de actividad)</span>
                                            <strong>{formatCurrency(data['Revenue ($)'] ?? 0)}</strong>
                                        </ChartTooltip>
                                    )}
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

            {/* Clientes sin facturar en el periodo */}
            <div className="row g-3 mb-4">
                <div className="col-12">
                    <div className="dashboard-panel" style={{ padding: '16px 20px' }}>
                        <PanelHelpTitle
                            title="Clientes Sin Facturar"
                            help={{
                                que: 'Clientes sin ninguna factura dentro del periodo elegido (o de la ruta seleccionada).',
                                leer: 'Ordenados por su venta histórica: los que más dinero han movido aparecen primero. "Nunca" = jamás han facturado.',
                                servir: 'Es la lista de acción: a quién llamar o visitar para recuperar venta.',
                                accion: 'Haz clic en una fila para abrir el dashboard del cliente y retomarlo.',
                            }}
                        />
                        <SinFacturarTable
                            from={dateRange.from}
                            to={dateRange.to}
                            ruta={ruta}
                            onRowSelect={onClientSelect}
                        />
                    </div>
                </div>
            </div>

            {/* ABC Pareto */}
            {data?.abc?.summary && (
                <div className="row g-3 mb-4">
                    <div className="col-12">
                        <ParetoChart products={data.abc.clients} summary={data.abc.summary} config={paretoConfig} />
                    </div>
                </div>
            )}

            {/* Top 50 Treemap + Segment Table */}
            <div className="row g-3 mb-4">
                <div className="col-12 col-lg-6">
                    <div className="dashboard-panel" style={{ padding: '16px 20px' }}>
                        <PanelHelpTitle
                            title="Top 50 Clientes"
                            help={{
                                que: 'Lista de los 50 clientes que más venden en el periodo, ordenados de mayor a menor.',
                                servir: 'La foto rápida de quién sostiene la empresa.',
                            }}
                        />
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
                        <PanelHelpTitle
                            title="Segmentos"
                            help={{
                                que: 'La clasificación A-E en tabla: cuántos clientes hay en cada segmento, cuánto venden, qué % representan y con qué frecuencia compran.',
                                servir: 'Analizar cada segmento con detalle.',
                            }}
                        />
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
