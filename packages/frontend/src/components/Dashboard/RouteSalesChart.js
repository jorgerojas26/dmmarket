import { ResponsiveBar } from '@nivo/bar';
import ChartTooltip from 'components/ChartTooltip';
import { useMemo } from 'react';
import { formatCurrency, getReportCurrency } from 'utils/format';
import PanelHelpTitle from './PanelHelpTitle';

const theme = {
    axis: {
        ticks: { text: { fill: '#adb5bd', fontSize: 11 }, line: { stroke: '#2f3338' } },
        domain: { line: { stroke: '#2f3338' } },
    },
    grid: { line: { stroke: '#2f3338', strokeDasharray: '4 4' } },
    legends: { text: { fill: '#adb5bd', fontSize: 11 } },
};

const axisMoney = (value) =>
    Math.abs(Number(value)) >= 1000
        ? `${getReportCurrency()} ${(Number(value) / 1000).toFixed(0)}k`
        : formatCurrency(value);

const RouteSalesChart = ({ routes }) => {
    const chartData = useMemo(
        () => [...(routes || [])].reverse().map((row) => ({ ...row, Ventas: row.sales, Utilidad: row.profit })),
        [routes],
    );

    const labelWidth = Math.max(130, ...chartData.map((row) => String(row.name).length * 7 + 20));

    return (
        <div className="dashboard-panel mb-4" style={{ padding: '12px 16px' }}>
            <PanelHelpTitle
                title="Ventas y Utilidad por Ruta"
                help={{
                    que: 'Ventas y utilidad por ruta en el período.',
                    leer: 'Azul: ventas. Verde: utilidad, ya incluida en las ventas.',
                    servir: 'Comparar el aporte de cada ruta.',
                }}
            />
            <div style={{ height: Math.max(200, chartData.length * 28 + 55) }}>
                {chartData.length > 0 ? (
                    <ResponsiveBar
                        data={chartData}
                        theme={theme}
                        keys={['Ventas', 'Utilidad']}
                        indexBy="id"
                        layout="horizontal"
                        groupMode="stacked"
                        margin={{ top: 5, right: 20, bottom: 40, left: labelWidth }}
                        padding={0.3}
                        colors={['#3b82f6', '#22c55e']}
                        borderRadius={3}
                        valueScale={{ type: 'linear' }}
                        indexScale={{ type: 'band', round: true }}
                        enableGridX={true}
                        enableGridY={false}
                        axisBottom={{ tickSize: 5, tickPadding: 5, format: axisMoney }}
                        axisLeft={{
                            tickSize: 5,
                            tickPadding: 5,
                            format: (id) => chartData.find((row) => row.id === id)?.name || id,
                        }}
                        enableLabel={false}
                        legends={[
                            {
                                dataFrom: 'keys',
                                anchor: 'bottom',
                                direction: 'row',
                                translateY: 38,
                                itemWidth: 80,
                                itemHeight: 16,
                                itemsSpacing: 8,
                                symbolSize: 10,
                                symbolShape: 'square',
                                itemTextColor: '#adb5bd',
                            },
                        ]}
                        tooltip={({ data, color }) => (
                            <ChartTooltip title={data.name} color={color}>
                                <span>Ventas totales</span>
                                <strong>{formatCurrency(data.sales)}</strong>
                                <span>Utilidad</span>
                                <strong>{formatCurrency(data.profit)}</strong>
                            </ChartTooltip>
                        )}
                        role="img"
                        ariaLabel="Ventas totales y utilidad por ruta"
                    />
                ) : (
                    <div className="d-flex align-items-center justify-content-center h-100 text-muted">
                        Sin ventas en el período
                    </div>
                )}
            </div>
        </div>
    );
};

export default RouteSalesChart;
