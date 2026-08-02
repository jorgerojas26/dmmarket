import { ResponsivePie } from '@nivo/pie';
import ChartTooltip from 'components/ChartTooltip';
import { useCostPerGroup } from 'hooks/useProducts';
import { useEffect, useMemo, useState } from 'react';
import { formatCurrency } from 'utils/format';

const ProductCostPerGroupCard = () => {
    const { data: response, isLoading } = useCostPerGroup();

    const data = useMemo(() => {
        if (!response?.length) return [];
        return response.map((current) => ({
            id: current.group_name,
            label: current.product,
            value: current.total_cost,
        }));
    }, [response]);

    return (
        <div className="card">
            <div className="card-header">
                <h3>Inversión por categoría</h3>
            </div>
            <div className="card-body">
                {data.length > 0 && (
                    <ResponsivePie
                        data={data}
                        margin={{ top: 30, right: 20, bottom: 20, left: 20 }}
                        innerRadius={0.5}
                        padAngle={0.7}
                        cornerRadius={3}
                        valueFormat={(value) => value.toLocaleString()}
                        activeOuterRadiusOffset={8}
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
                                <span>Categoría</span>
                                <strong>{datum.id}</strong>
                                <span>Costo total</span>
                                <strong>{formatCurrency(datum.value)}</strong>
                            </ChartTooltip>
                        )}
                    />
                )}
                {isLoading && (
                    <div className="position-absolute top-50 start-50 translate-middle">
                        <span className="spinner-border spinner-border-md" role="status" aria-hidden="true" />
                    </div>
                )}
            </div>
        </div>
    );
};

export default ProductCostPerGroupCard;
