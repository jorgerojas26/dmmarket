import { ResponsiveBar } from '@nivo/bar';
import { ResponsiveLine } from '@nivo/line';
import ChartTooltip from 'components/ChartTooltip';
import DonutOverview from 'components/DonutOverview';
import Table from 'components/Table';
import { useSellersDashboard } from 'hooks/useSellers';
import { DateTime } from 'luxon';
import { useMemo } from 'react';
import { computeComparison, formatCurrency, formatNumber, formatPercent } from 'utils/format';
import KpiCard from './KpiCard';
import PanelHelpTitle from './PanelHelpTitle';

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

const axisMoney = (value) =>
    Number(value) >= 1000 ? `$${(Number(value) / 1000).toFixed(0)}k` : `$${formatNumber(Number(value))}`;

const INACTIVE_COLUMNS = [
    { Header: 'Vendedor', accessor: 'name' },
    { Header: 'Teléfono', accessor: 'phone', Cell: ({ value }) => value || '—' },
];

const SellersDashboard = ({ dateRange, showNoe, onSellerSelect }) => {
    const { data, error, isLoading } = useSellersDashboard(dateRange, showNoe);

    const kpis = data?.kpis;
    const ranking = useMemo(() => data?.ranking || [], [data?.ranking]);

    const financial = Object.hasOwn(kpis || {}, 'marginPercent');
    const chartRanking = useMemo(
        () => [...ranking].reverse().map((row) => ({ ...row, Ventas: row.sales, Utilidad: row.profit })),
        [ranking],
    );

    const pieData = useMemo(
        () =>
            ranking
                .filter((row) => row.sales > 0)
                .map((row) => ({
                    id: row.name,
                    label: row.name,
                    value: row.sales,
                    sharePercent: row.sharePercent,
                    invoiceCount: row.invoiceCount,
                    profit: row.profit,
                    seller: row,
                })),
        [ranking],
    );

    const monthlyChart = useMemo(() => {
        if (!data?.monthlyTrend?.length) return [];
        return [
            {
                id: 'Ventas',
                data: data.monthlyTrend.map((row) => ({
                    x: DateTime.fromISO(`${row.month}-01`).toFormat('MMM yy', { locale: 'es' }),
                    y: row.sales,
                })),
            },
        ];
    }, [data?.monthlyTrend]);

    const concentrationTop3 = useMemo(
        () => ranking.slice(0, 3).reduce((total, row) => total + Number(row.sharePercent || 0), 0),
        [ranking],
    );

    if (error) {
        return <div className="alert alert-danger">Error al cargar el dashboard: {error.message}</div>;
    }

    const handleBarClick = (datum) => {
        const seller = ranking.find((row) => row.name === datum.indexValue);
        if (seller) onSellerSelect(seller);
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

            <div className="sellers-dashboard-overview mb-4">
                <div className="sellers-dashboard-summary">
                    <div className="dashboard-kpi-grid dashboard-kpi-grid-compact sellers-dashboard-kpi-grid">
                        <div>
                            <KpiCard
                                label="Venta del Equipo"
                                value={formatCurrency(kpis?.totalSales)}
                                comparison={computeComparison(kpis?.totalSales, kpis?.compareSales)}
                                icon="money"
                                accent="blue"
                                help={{
                                    que: 'Total facturado por todos los vendedores en el período.',
                                    leer: 'Es el mismo total que ves en el dashboard de Ventas; aquí sirve de contexto para comparar el aporte de cada vendedor.',
                                    servir: 'Ver el tamaño del negocio y cómo se reparte entre el equipo.',
                                    accion: 'Si cae respecto al período anterior, revisa el ranking para ver a quién le bajó la venta.',
                                }}
                            />
                        </div>
                        <div>
                            <KpiCard
                                label="Cobertura del Equipo"
                                value={formatPercent(kpis?.coveragePercent)}
                                icon="user"
                                accent="green"
                                help={{
                                    que: 'Porcentaje de vendedores registrados que emitieron al menos una factura en el período.',
                                    leer: `${formatNumber(kpis?.activeSellers ?? 0)} de ${formatNumber(kpis?.totalSellers ?? 0)} vendedores vendieron en el rango elegido.`,
                                    servir: 'Mide cuánto del equipo está produciendo de verdad.',
                                    accion: 'Cobertura baja = vendedores sin movimiento; el panel "Sin Ventas en el Período" te dice quiénes son.',
                                }}
                            />
                        </div>
                        <div>
                            <KpiCard
                                label="Vendedores que Mejoraron"
                                value={`${formatNumber(kpis?.improvedSellers ?? 0)} / ${formatNumber(kpis?.activeSellers ?? 0)}`}
                                icon="chart"
                                accent="purple"
                                help={{
                                    que: 'Vendedores que vendieron más que en el período anterior de igual duración.',
                                    leer: 'También cuenta a quienes no habían vendido nada antes y ahora sí.',
                                    servir: 'Saber si el equipo mejora en conjunto o solo algunos vendedores.',
                                    accion: 'Abre el ranking para ver quién creció y quién cayó.',
                                }}
                            />
                        </div>
                        <div>
                            <KpiCard
                                label="Venta Promedio por Vendedor"
                                value={formatCurrency(kpis?.avgSalesPerSeller)}
                                icon="ticket"
                                accent="cyan"
                                help={{
                                    que: 'Venta total repartida entre los vendedores que vendieron (Venta del Equipo ÷ Vendedores Activos).',
                                    leer: 'Es lo que aporta un vendedor típico del equipo en el período.',
                                    servir: 'Comparar el promedio con el mejor vendedor muestra qué tan desigual es el equipo.',
                                    accion: 'Si el promedio está muy por debajo del top, la venta depende de pocas personas.',
                                }}
                            />
                        </div>
                        <div>
                            <KpiCard
                                label="Facturas por Vendedor"
                                value={formatNumber(kpis?.avgInvoicesPerSeller)}
                                icon="receipt"
                                accent="pink"
                                help={{
                                    que: 'Cantidad promedio de facturas emitidas por cada vendedor activo en el período.',
                                    leer: 'Mide actividad: operaciones cerradas, sin importar el monto de cada una.',
                                    servir: 'Distinguir vendedores que venden mucho en pocas facturas de los que venden poco en muchas.',
                                    accion: 'Un promedio bajo con ventas altas sugiere pocas visitas y tickets grandes.',
                                }}
                            />
                        </div>
                        <div>
                            <KpiCard
                                label="Concentración Top 3"
                                value={formatPercent(concentrationTop3)}
                                icon="chart"
                                accent="amber"
                                help={{
                                    que: 'Qué parte de las ventas generan los 3 vendedores que más venden.',
                                    leer: '60% = 3 vendedores explican 60 de cada 100 dólares vendidos.',
                                    servir: 'Medir dependencia del equipo: si es muy alto, el negocio descansa en pocas personas.',
                                }}
                            />
                        </div>
                    </div>
                    <div className="sellers-dashboard-insights">
                        <div className="sellers-dashboard-categories">
                            <DonutOverview
                                data={pieData}
                                title="Participación"
                                help={{
                                    que: 'Reparte las ventas del periodo entre los vendedores que vendieron.',
                                    leer: 'Cada porción es un vendedor; cuanto más grande, más dinero aporta.',
                                    servir: 'Ver si la venta está repartida o concentrada en pocas personas.',
                                    accion: 'Haz clic en una porción para abrir el detalle del vendedor.',
                                }}
                                ariaLabel="Participación por vendedor"
                                centerLabel={pieData.length === 1 ? 'vendedor' : 'vendedores'}
                                remainingLabel={(count) =>
                                    count === 1 ? 'Otro vendedor' : `Otros ${count} vendedores`
                                }
                                detailsLabel={(count) =>
                                    count === 1 ? 'Ver el vendedor' : `Ver los ${count} vendedores`
                                }
                                detailsId="sellers-share-title"
                                detailsTitle="Participación por vendedor"
                                detailsSubtitle="Participación sobre la venta del equipo en el periodo."
                                emptyMessage="Sin datos"
                                onSliceClick={(datum) => onSellerSelect(datum.data.seller)}
                                tooltip={({ datum }) => (
                                    <ChartTooltip title={datum.label} color={datum.color}>
                                        <span>Ventas</span>
                                        <strong>{formatCurrency(datum.value)}</strong>
                                        <span>Participación</span>
                                        <strong>{formatPercent(datum.data.sharePercent)}</strong>
                                        {financial && (
                                            <>
                                                <span>Utilidad</span>
                                                <strong>
                                                    {datum.data.profit == null
                                                        ? 'No disponible'
                                                        : formatCurrency(datum.data.profit)}
                                                </strong>
                                            </>
                                        )}
                                        <span>Facturas</span>
                                        <strong>{formatNumber(datum.data.invoiceCount)}</strong>
                                    </ChartTooltip>
                                )}
                            />
                        </div>
                    </div>
                </div>
            </div>

            <div className="row g-3 mb-4">
                <div className="col-12">
                    <div className="dashboard-panel" style={{ padding: '16px 20px' }}>
                        <PanelHelpTitle
                            title="Ranking de Vendedores"
                            help={{
                                que: 'Ventas y utilidad de cada vendedor en el periodo, de mayor a menor.',
                                leer: 'Cada vendedor tiene dos barras: azul = ventas, verde = utilidad. Pasa el cursor para ver facturas, ticket, participación y cambio vs el período anterior.',
                                servir: 'Comparar el aporte de cada persona al negocio.',
                                accion: 'Haz clic en un vendedor para abrir su detalle, historial y clientes.',
                            }}
                        />
                        <div style={{ height: Math.max(320, chartRanking.length * 34) }}>
                            {chartRanking.length > 0 ? (
                                <ResponsiveBar
                                    data={chartRanking}
                                    theme={nivoTheme}
                                    keys={financial ? ['Ventas', 'Utilidad'] : ['Ventas']}
                                    indexBy="name"
                                    layout="horizontal"
                                    margin={{ top: 10, right: 70, bottom: 40, left: 150 }}
                                    padding={0.25}
                                    colors={['#3b82f6', '#22c55e']}
                                    borderRadius={3}
                                    valueScale={{ type: 'linear' }}
                                    indexScale={{ type: 'band', round: true }}
                                    enableGridX={true}
                                    enableGridY={false}
                                    axisBottom={{ tickSize: 5, tickPadding: 5, format: axisMoney }}
                                    axisLeft={{ tickSize: 5, tickPadding: 5 }}
                                    enableLabel={false}
                                    legends={[
                                        {
                                            dataFrom: 'keys',
                                            anchor: 'bottom',
                                            direction: 'row',
                                            translateY: 34,
                                            itemWidth: 80,
                                            itemHeight: 16,
                                            itemsSpacing: 8,
                                            symbolSize: 10,
                                            symbolShape: 'square',
                                            itemTextColor: '#adb5bd',
                                        },
                                    ]}
                                    onClick={handleBarClick}
                                    tooltip={({ id, value, data }) => (
                                        <ChartTooltip title={data.name} color={id === 'sales' ? '#3b82f6' : '#22c55e'}>
                                            <span>{id}</span>
                                            <strong>{formatCurrency(value)}</strong>
                                            <span>Facturas</span>
                                            <strong>{formatNumber(data.invoiceCount)}</strong>
                                            <span>Ticket promedio</span>
                                            <strong>{formatCurrency(data.avgTicket)}</strong>
                                            <span>Participación</span>
                                            <strong>{formatPercent(data.sharePercent)}</strong>
                                            <span>vs período anterior</span>
                                            <strong>
                                                {data.changePercent == null
                                                    ? 'Sin ventas antes'
                                                    : formatPercent(data.changePercent)}
                                            </strong>
                                        </ChartTooltip>
                                    )}
                                />
                            ) : (
                                <div className="d-flex align-items-center justify-content-center h-100 text-muted">
                                    Sin ventas en el período
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            <div className="row g-3 mb-4">
                <div className="col-12 col-xl-7">
                    <div className="dashboard-panel" style={{ padding: '16px 20px' }}>
                        <PanelHelpTitle
                            title="Evolución Mensual de Ventas"
                            help={{
                                que: 'Ventas totales del equipo mes a mes dentro del periodo elegido.',
                                leer: 'Cada punto es un mes: si la línea baja, el equipo está vendiendo menos.',
                                servir: 'Ver la tendencia y detectar meses flojos.',
                                accion: 'Selecciona un rango más amplio para comparar varios meses.',
                            }}
                        />
                        <div style={{ height: 300 }}>
                            {monthlyChart.length > 0 && monthlyChart[0].data.length > 0 ? (
                                <ResponsiveLine
                                    data={monthlyChart}
                                    theme={nivoTheme}
                                    margin={{ top: 10, right: 20, bottom: 40, left: 65 }}
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
                                    enableArea={true}
                                    areaOpacity={0.1}
                                    useMesh={true}
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
                                    Sin datos
                                </div>
                            )}
                        </div>
                    </div>
                </div>
                <div className="col-12 col-xl-5">
                    <div className="dashboard-panel" style={{ padding: '16px 20px', height: '100%' }}>
                        <PanelHelpTitle
                            title="Sin Ventas en el Período"
                            help={{
                                que: 'Vendedores registrados que no emitieron ninguna factura en el rango elegido.',
                                leer: 'Aparecen todos los vendedores del catálogo, incluidos los que nunca han vendido.',
                                servir: 'Saber quién no está produciendo y necesita seguimiento.',
                                accion: 'Haz clic en una fila para abrir su detalle y revisar su historial.',
                            }}
                        />
                        <Table
                            data={data?.inactiveSellers || []}
                            columns={INACTIVE_COLUMNS.filter(
                                (column) =>
                                    column.accessor !== 'phone' ||
                                    data?.inactiveSellers?.some((row) => Object.hasOwn(row, 'phone')),
                            )}
                            maxHeight={300}
                            emptyMessage="Todos los vendedores vendieron en el período"
                            onRowClick={onSellerSelect}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SellersDashboard;
