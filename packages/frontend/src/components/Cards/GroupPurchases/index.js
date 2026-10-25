import { ResponsivePie } from '@nivo/pie';
import ChartTooltip from 'components/ChartTooltip';
import DonutOverview from 'components/DonutOverview';
import { formatCurrency } from 'utils/format';

const GroupPurchases = ({ chartData = [], compact = false, title, help }) => {
    if (compact) {
        return (
            <DonutOverview
                data={chartData}
                title={title}
                help={help}
                ariaLabel="Categorías de compras"
                detailsId="purchases-categories-title"
                detailsTitle="Compras por categoría"
                detailsSubtitle="Participación sobre el monto comprado del periodo."
                tooltip={({ datum }) => (
                    <ChartTooltip title={datum.label} color={datum.color}>
                        <span>Monto Comprado</span>
                        <strong>{formatCurrency(datum.value)}</strong>
                    </ChartTooltip>
                )}
            />
        );
    }

    if (chartData.length === 0) {
        return (
            <div className="d-flex align-items-center justify-content-center h-100 text-muted small">
                Sin datos para el periodo seleccionado
            </div>
        );
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
                arcLabel={(e) => `${e.value}`}
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
                        <span>Monto Comprado</span>
                        <strong>{formatCurrency(datum.value)}</strong>
                    </ChartTooltip>
                )}
            />
        </div>
    );
};

export default GroupPurchases;
