import { ResponsivePie } from '@nivo/pie';
import ChartTooltip from 'components/ChartTooltip';
import { formatCurrency } from 'utils/format';

const GroupSales = ({ chartData = [] }) => {
    if (chartData.length === 0) {
        return (
            <div className="d-flex align-items-center justify-content-center h-100 text-muted small">
                Sin datos para el periodo seleccionado
            </div>
        );
    }

    return (
        <div style={{ width: '100%', height: '100%', position: 'relative' }}>
            {chartData.length > 0 && (
                <ResponsivePie
                    data={chartData}
                    margin={{ top: 30, right: 20, bottom: 20, left: 20 }}
                    innerRadius={0.5}
                    padAngle={0.7}
                    cornerRadius={3}
                    activeOuterRadiusOffset={8}
                    arcLabel={(e) => `${e.value} (${e.data.netProfit})`}
                    borderWidth={1}
                    arcLinkLabelsSkipAngle={10}
                    arcLinkLabelsTextColor="#9ca3af"
                    arcLinkLabelsThickness={2}
                    arcLinkLabelsColor={{ from: 'color' }}
                    arcLabelsSkipAngle={10}
                    arcLabelsTextColor={{
                        from: 'color',
                        modifiers: [['darker', 2]],
                    }}
                    tooltip={({ datum }) => (
                        <ChartTooltip title={datum.label} color={datum.color}>
                            <span>Bruto</span>
                            <strong>{formatCurrency(datum.value)}</strong>
                            <span>Utilidad</span>
                            <strong>{formatCurrency(datum.data.netProfit)}</strong>
                        </ChartTooltip>
                    )}
                />
            )}
        </div>
    );
};

export default GroupSales;
