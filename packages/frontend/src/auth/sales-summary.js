import GroupSales from 'components/Cards/GroupSales';
import KpiCard from 'components/Dashboard/KpiCard';
import RankedList from 'components/Dashboard/RankedList';
import useSWR from 'swr';
import { fetcher } from 'swr-config';
import { computeComparison, formatCurrency, formatNumber, formatPercent } from 'utils/format';

const display = (value, format) => (value === null || value === undefined ? 'No disponible' : format(value));

export default function SalesSummary({ query }) {
    const { data, error } = useSWR(
        `/api/dashboard/sales?${new URLSearchParams({ ...query.parameters, ...query.comparison })}`,
        fetcher,
    );
    const financial = Object.hasOwn(data?.kpis || {}, 'totalNetProfit');
    const indicators = data
        ? [
              ['totalRawProfit', 'Total ventas', formatCurrency, 'money', 'blue', 'compareRawProfit'],
              ['totalInvoices', 'Documentos', formatNumber, 'receipt', 'purple', 'compareInvoices'],
              ['totalQuantity', 'Cantidad', formatNumber, 'package', 'cyan', 'compareQuantity'],
              ['avgTicket', 'Promedio por documento', formatCurrency, 'ticket', 'amber'],
              ...(financial
                  ? [
                        ['totalNetProfit', 'Utilidad total', formatCurrency, 'chart', 'green', 'compareNetProfit'],
                        ['avgMarginPercent', 'Margen promedio', formatPercent, 'percent', 'pink'],
                    ]
                  : []),
          ]
        : [];
    const chartData = (data?.groupSalesChart || []).map((group) => ({
        id: JSON.stringify(group.groupId),
        label: group.categoria,
        value: group.rawProfit,
        ...(financial ? { netProfit: group.netProfit } : {}),
    }));
    const chartAvailable =
        chartData.length > 0 &&
        chartData.every(
            (group) => group.value !== null && Number.isFinite(Number(group.value)) && Number(group.value) >= 0,
        ) &&
        chartData.some((group) => Number(group.value) > 0);
    return (
        <section aria-label="Resumen de ventas" className="card bg-dark border-secondary p-4 my-3">
            <h2 className="h4">Resumen autorizado de ventas</h2>
            {error && <p role="alert">No se pudo consultar el resumen autorizado.</p>}
            {!data && !error && <p role="status">Consultando resumen…</p>}
            {data && !error && (
                <>
                    <div className="dashboard-kpi-grid mb-4">
                        {indicators.map(([key, label, format, icon, accent, compare]) => (
                            <fieldset className="border-0 p-0 m-0" aria-label={label} key={key}>
                                <KpiCard
                                    label={label}
                                    value={display(data.kpis[key], format)}
                                    icon={icon}
                                    accent={accent}
                                    comparison={
                                        compare && data.kpis[key] !== null
                                            ? computeComparison(data.kpis[key], data.kpis[compare])
                                            : null
                                    }
                                />
                            </fieldset>
                        ))}
                    </div>
                    {data.kpis.compareRawProfit !== null && (
                        <p>Ventas del período comparado: {data.kpis.compareRawProfit}</p>
                    )}
                    {financial && data.kpis.compareNetProfit !== null && (
                        <p>Utilidad del período comparado: {data.kpis.compareNetProfit}</p>
                    )}
                    <section aria-label="Vendedor destacado en ventas autorizadas" className="dashboard-panel mb-4">
                        <h3 className="h5">Vendedor destacado en ventas autorizadas</h3>
                        {data.bestEmployee ? (
                            <>
                                <p>{data.bestEmployee.name}</p>
                                <p>{display(data.bestEmployee.totalSales, formatCurrency)}</p>
                            </>
                        ) : (
                            <p>Sin ventas autorizadas en el período.</p>
                        )}
                    </section>
                    <div className="row g-3 mb-4">
                        <section aria-label="Ranking autorizado de productos vendidos" className="col-lg-6">
                            <div className="dashboard-panel p-3">
                                <h3 className="h5">
                                    {financial
                                        ? 'Productos por utilidad autorizada'
                                        : 'Productos por ventas autorizadas'}
                                </h3>
                                <RankedList
                                    data={data.topProducts}
                                    nameKey="product"
                                    idKey="productId"
                                    valueKey={financial ? 'netProfit' : 'rawProfit'}
                                    valueFormat={formatCurrency}
                                />
                            </div>
                        </section>
                        <section aria-label="Ranking autorizado de clientes compradores" className="col-lg-6">
                            <div className="dashboard-panel p-3">
                                <h3 className="h5">
                                    {financial ? 'Clientes por utilidad autorizada' : 'Clientes por ventas autorizadas'}
                                </h3>
                                <RankedList
                                    data={data.topClients}
                                    nameKey="client"
                                    idKey="clientId"
                                    valueKey={financial ? 'netProfit' : 'total_USD'}
                                    valueFormat={formatCurrency}
                                />
                            </div>
                        </section>
                    </div>
                    {chartAvailable ? (
                        <div className="dashboard-panel p-3 mb-4">
                            <GroupSales chartData={chartData} compact title="Ventas por grupo" />
                        </div>
                    ) : (
                        <p>
                            No se muestra un gráfico de participación sin una base completa, no negativa y mayor que
                            cero.
                        </p>
                    )}
                    <h3 className="h5">Desglose de ventas por grupo</h3>
                    <div className="table-responsive">
                        <table aria-label="Ventas autorizadas por grupo" className="table table-dark">
                            <thead>
                                <tr>
                                    <th>Grupo</th>
                                    <th>Total ventas</th>
                                    {financial && <th>Utilidad</th>}
                                </tr>
                            </thead>
                            <tbody>
                                {data.groupSalesChart.map((group) => (
                                    <tr key={JSON.stringify(group.groupId)}>
                                        <td>{group.categoria}</td>
                                        <td>{group.rawProfit ?? 'No disponible'}</td>
                                        {financial && <td>{group.netProfit ?? 'No disponible'}</td>}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </>
            )}
        </section>
    );
}
