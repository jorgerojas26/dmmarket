import { ResponsivePie } from '@nivo/pie';
import ChartTooltip from 'components/ChartTooltip';
import { formatCurrency } from 'utils/format';

const ProductChart = ({ chartData = [], loading }) => {
    return (
        <div className="card">
            <div className="card-header">
                <h3>Productos más vendidos</h3>
            </div>
            <div className="card-body">
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
                        arcLinkLabelsTextColor="#333333"
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
                {loading && (
                    <div className="position-absolute top-50 start-50 translate-middle">
                        <span className="spinner-border spinner-border-md" role="status" aria-hidden="true" />
                    </div>
                )}
            </div>
        </div>
    );
};

export default ProductChart;
