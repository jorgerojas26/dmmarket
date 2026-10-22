import { ResponsivePie } from '@nivo/pie';
import ChartTooltip from 'components/ChartTooltip';
import DonutOverview from 'components/DonutOverview';
import { formatCurrency } from 'utils/format';

const GroupSales = ({ chartData = [], compact = false, title, help }) => {
    if (compact) {
        return (
            <DonutOverview
                data={chartData}
                title={title}
                help={help}
                ariaLabel="Categorías de ventas"
                detailsId="sales-categories-title"
                detailsTitle="Ventas por categoría"
                detailsSubtitle="Participación sobre la venta bruta del periodo."
                tooltip={({ datum }) => (
                    <ChartTooltip title={datum.label} color={datum.color}>
                        <span>Bruto</span>
                        <strong>{formatCurrency(datum.value)}</strong>
                        <span>Utilidad</span>
                        <strong>{formatCurrency(datum.data.netProfit)}</strong>
                    </ChartTooltip>
                )}
            />
        );
    }

    if (chartData.length === 0) {
        return <div className="group-sales-empty text-muted small">Sin datos para el periodo seleccionado</div>;
    }

    return (
        <div style={{ width: '100%', height: '100%', position: 'relative' }}>
            <ResponsivePie
                data={chartData}
                colors={{ scheme: 'nivo' }}
                margin={{ top: 30, right: 20, bottom: 20, left: 20 }}
                animate
                innerRadius={0.5}
                padAngle={0.7}
                cornerRadius={3}
                activeOuterRadiusOffset={8}
                arcLabel={(e) => `${e.value} (${e.data.netProfit})`}
                enableArcLabels
                enableArcLinkLabels
                borderWidth={1}
                arcLinkLabelsSkipAngle={10}
                arcLinkLabelsTextColor="#9ca3af"
                arcLinkLabelsThickness={2}
                arcLinkLabelsColor={{ from: 'color' }}
                arcLabelsSkipAngle={10}
                arcLabelsTextColor={{ from: 'color', modifiers: [['darker', 2]] }}
                tooltip={({ datum }) => (
                    <ChartTooltip title={datum.label} color={datum.color}>
                        <span>Bruto</span>
                        <strong>{formatCurrency(datum.value)}</strong>
                        <span>Utilidad</span>
                        <strong>{formatCurrency(datum.data.netProfit)}</strong>
                    </ChartTooltip>
                )}
            />
        </div>
    );
};

export default GroupSales;
