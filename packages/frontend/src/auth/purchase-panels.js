import GroupPurchases from 'components/Cards/GroupPurchases';
import KpiCard from 'components/Dashboard/KpiCard';
import RankedList from 'components/Dashboard/RankedList';
import { computeComparison, formatCurrency, formatNumber } from 'utils/format';

export default function PurchasePanels({ data, costs }) {
    const indicators = [
        ['totalInvoices', 'Documentos de compras', formatNumber, 'receipt', 'purple', 'compareInvoices'],
        ['totalQuantity', 'Unidades compradas', formatNumber, 'package', 'cyan', 'compareQuantity'],
        ...(costs
            ? [
                  ['totalPurchased', 'Total Compras autorizado', formatCurrency, 'money', 'blue', 'comparePurchased'],
                  ['avgTicket', 'Promedio autorizado por documento', formatCurrency, 'ticket', 'amber'],
                  ['avgUnitCost', 'Costo unitario promedio autorizado', formatCurrency, 'chart', 'green'],
              ]
            : []),
    ];
    const metric = costs ? 'totalPurchased' : 'quantity';
    const valueFormat = costs ? formatCurrency : formatNumber;
    const chartData = data.groupPurchasesChart.map((group) => ({
        id: JSON.stringify(group.groupId),
        label: group.categoria,
        value: group[metric],
    }));
    const chartAvailable =
        chartData.length > 0 &&
        chartData.every(
            (group) => group.value !== null && Number.isFinite(Number(group.value)) && Number(group.value) >= 0,
        ) &&
        chartData.some((group) => Number(group.value) > 0);
    const best = data.bestProvider;
    return (
        <>
            <div className="dashboard-kpi-grid my-4">
                {indicators.map(([key, label, format, icon, accent, compare]) => (
                    <fieldset className="border-0 p-0 m-0" aria-label={label} key={key}>
                        <KpiCard
                            label={label}
                            value={data.kpis[key] == null ? 'No disponible' : format(data.kpis[key])}
                            icon={icon}
                            accent={accent}
                            comparison={
                                compare && data.kpis[key] != null
                                    ? computeComparison(data.kpis[key], data.kpis[compare])
                                    : null
                            }
                        />
                    </fieldset>
                ))}
            </div>
            {Object.hasOwn(data, 'bestProvider') && (
                <section aria-label="Proveedor destacado en compras autorizadas" className="dashboard-panel p-3 my-3">
                    <h3 className="h5">
                        Proveedor destacado entre valores disponibles, por {costs ? 'importe autorizado' : 'unidades'}
                    </h3>
                    {best && best[metric] != null ? (
                        <>
                            <p>{best.name}</p>
                            <p>{valueFormat(best[metric])}</p>
                        </>
                    ) : (
                        <p>Sin base disponible para destacar un proveedor.</p>
                    )}
                </section>
            )}
            <div className="row g-3 my-3 mx-0">
                <section aria-label="Ranking visual de productos comprados" className="col-lg-6">
                    <div className="dashboard-panel p-3">
                        <h3 className="h5">Productos por {costs ? 'importe autorizado' : 'unidades'}</h3>
                        <RankedList
                            data={data.topProducts}
                            idKey="productId"
                            nameKey="product"
                            valueKey={metric}
                            valueFormat={valueFormat}
                        />
                    </div>
                </section>
                {Object.hasOwn(data, 'topProviders') && (
                    <section aria-label="Ranking visual de proveedores de compras" className="col-lg-6">
                        <div className="dashboard-panel p-3">
                            <h3 className="h5">Proveedores por {costs ? 'importe autorizado' : 'unidades'}</h3>
                            <RankedList
                                data={data.topProviders}
                                nameKey="name"
                                valueKey={metric}
                                valueFormat={valueFormat}
                            />
                        </div>
                    </section>
                )}
            </div>
            {chartAvailable ? (
                <div className="dashboard-panel p-3 my-3">
                    <GroupPurchases
                        chartData={chartData}
                        compact
                        monetary={costs}
                        title={costs ? 'Compras por grupo' : 'Unidades compradas por grupo'}
                    />
                </div>
            ) : (
                <p>No se muestra participación de compras sin una base completa, no negativa y mayor que cero.</p>
            )}
        </>
    );
}
