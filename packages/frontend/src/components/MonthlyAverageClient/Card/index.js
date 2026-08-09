import { ResponsiveLine } from '@nivo/line';
import ChartTooltip from 'components/ChartTooltip';
import ClientSearch from 'components/ClientSearch';
import { ShowNoeContext } from 'context/show_noe';
import { useMonthlyAverage } from 'hooks/useClients';
import { useContext, useState } from 'react';
import { formatCurrency } from 'utils/format';

const MonthlyAverageClient = () => {
    const [selectedClient, setSelectedClient] = useState(null);
    const { showNoe } = useContext(ShowNoeContext);

    const { data: response, isLoading } = useMonthlyAverage(selectedClient?.IdCliente, showNoe, !!selectedClient);

    const data = response && Object.keys(response).length > 0 ? [response] : [];

    return (
        <div className="card h-100">
            <div className="card-header">
                <h3>Promedio mensual</h3>
            </div>
            <div className="card-body">
                <ClientSearch onSelect={setSelectedClient} />
                {data && (
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
                        pointSize={10}
                        pointColor={{ theme: 'background' }}
                        pointBorderWidth={2}
                        pointBorderColor={{ from: 'serieColor' }}
                        pointLabelYOffset={-12}
                        useMesh={true}
                        tooltip={({ point }) => (
                            <ChartTooltip title={String(point.data.x)}>
                                <span>Promedio mensual</span>
                                <strong>{formatCurrency(point.data.y)}</strong>
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

export default MonthlyAverageClient;
