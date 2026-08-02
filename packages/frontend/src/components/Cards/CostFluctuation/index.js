import { ResponsiveLine } from '@nivo/line';
import ChartTooltip from 'components/ChartTooltip';
import ProductSearch from 'components/ProductSearch';
import { useCostFluctuation } from 'hooks/useProducts';
import { useState } from 'react';
import { formatCurrency } from 'utils/format';

const CostFluctuation = () => {
    const [selectedProduct, setSelectedProduct] = useState(null);

    const { data: reportData, isLoading } = useCostFluctuation(selectedProduct?.IdProducto, !!selectedProduct);

    const data = reportData && Object.keys(reportData).length > 0 ? [reportData] : [];

    return (
        <div className="card">
            <div className="card-header">
                <h3>Promedio mensual costo</h3>
            </div>
            <div className="card-body">
                <ProductSearch onSelect={setSelectedProduct} />
                <ResponsiveLine
                    data={data}
                    margin={{ top: 20, right: 30, bottom: 80, left: 40 }}
                    xScale={{ type: 'point' }}
                    yScale={{
                        type: 'linear',
                        min: 'auto',
                        max: 'auto',
                        stacked: true,
                        reverse: false,
                    }}
                    axisTop={null}
                    axisRight={null}
                    axisLeft={{
                        legend: 'Precio',
                        legendPosition: 'middle',
                        legendOffset: -30,
                    }}
                    axisBottom={{
                        legend: 'Meses',
                        legendPosition: 'middle',
                        legendOffset: 30,
                    }}
                    pointSize={10}
                    pointColor={{ theme: 'background' }}
                    pointBorderWidth={2}
                    pointBorderColor={{ from: 'serieColor' }}
                    pointLabelYOffset={-12}
                    useMesh={true}
                    tooltip={({ point }) => (
                        <ChartTooltip title={String(point.data.x)}>
                            <span>Precio</span>
                            <strong>{formatCurrency(point.data.y)}</strong>
                        </ChartTooltip>
                    )}
                />
            </div>
            {isLoading && (
                <div className="position-absolute top-50 start-50 translate-middle">
                    <span className="spinner-border spinner-border-md" role="status" aria-hidden="true" />
                </div>
            )}
        </div>
    );
};

export default CostFluctuation;
