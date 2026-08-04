import GroupPurchases from 'components/Cards/GroupPurchases';
import { usePurchasesDashboard, usePurchasesPareto } from 'hooks/usePurchases';
import { useMemo } from 'react';
import { computeComparison, formatCurrency, formatNumber } from 'utils/format';
import KpiCard from './KpiCard';
import ParetoChart from './ParetoChart';
import RankedList from './RankedList';

const PurchasesDashboard = ({ dateRange }) => {
    const { data, error, isLoading } = usePurchasesDashboard(dateRange);
    const { data: paretoData, isLoading: paretoLoading } = usePurchasesPareto(dateRange);

    const chartData = useMemo(
        () =>
            (data?.groupPurchasesChart || []).map((item) => ({
                id: item.categoria,
                label: item.categoria,
                value: item.totalPurchased,
            })),
        [data?.groupPurchasesChart],
    );

    // ParetoChart config for purchases — stable reference so internal memoization holds.
    const paretoConfig = useMemo(
        () => ({
            nameKey: 'product',
            valueKey: 'totalPurchased',
            quantityKey: 'quantity',
            entityLabel: 'Producto',
            valueLabel: 'Monto Comprado',
            valueAxisLabel: 'Monto Comprado',
            axisLegend: 'Productos (ordenados por monto comprado)',
            summaryValueKey: 'profitPercent',
            summaryPctLabel: 'del monto comprado',
            summaryTotalKey: 'totalProducts',
            summaryTotalLabel: 'Total SKUs',
            summaryTotalUnit: 'productos',
            title: 'Análisis Pareto (ABC) de Compras',
            subtitle: '80% de la inversión viene del 20% de los productos',
            pdfTitle: 'Análisis Pareto (ABC) de Compras',
            allFilterLabel: 'Todos los productos',
            emptyTableMessage: 'Sin productos en esta clase',
        }),
        [],
    );

    const kpis = data?.kpis;
    const bestProvider = data?.bestProvider;

    if (error) {
        return <div className="alert alert-danger">Error al cargar el dashboard de compras: {error.message}</div>;
    }

    return (
        <div style={{ position: 'relative' }}>
            {isLoading && (
                <div
                    style={{
                        position: 'absolute',
                        inset: 0,
                        zIndex: 10,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        backdropFilter: 'blur(4px)',
                        WebkitBackdropFilter: 'blur(4px)',
                        background: 'rgba(33,37,41,0.4)',
                        borderRadius: 8,
                    }}
                >
                    <span
                        className="spinner-border"
                        role="status"
                        style={{
                            width: '3rem',
                            height: '3rem',
                            color: '#e4e6ea',
                        }}
                    />
                </div>
            )}
            <div className="row g-3 mb-4">
                <div className="col-12 col-lg-8">
                    <div className="dashboard-kpi-grid h-100">
                        <div>
                            <KpiCard
                                label="Total Comprado"
                                value={formatCurrency(kpis?.totalPurchased)}
                                comparison={computeComparison(kpis?.totalPurchased, kpis?.comparePurchased)}
                                icon="money"
                                accent="blue"
                            />
                        </div>
                        <div>
                            <KpiCard
                                label="Unidades"
                                value={formatNumber(kpis?.totalQuantity)}
                                comparison={computeComparison(kpis?.totalQuantity, kpis?.compareQuantity)}
                                icon="package"
                                accent="cyan"
                            />
                        </div>
                        <div>
                            <KpiCard
                                label="Transacciones"
                                value={formatNumber(kpis?.totalInvoices)}
                                comparison={computeComparison(kpis?.totalInvoices, kpis?.compareInvoices)}
                                icon="receipt"
                                accent="pink"
                            />
                        </div>
                        <div>
                            <KpiCard
                                label="Ticket Prom."
                                value={formatCurrency(kpis?.avgTicket)}
                                icon="ticket"
                                accent="purple"
                            />
                        </div>
                        <div>
                            <KpiCard
                                label="Costo Prom/Unidad"
                                value={formatCurrency(kpis?.avgUnitCost)}
                                icon="percent"
                                accent="amber"
                            />
                        </div>
                        <div style={{ gridColumn: '1 / -1' }}>
                            <div className="dashboard-best-employee">
                                <div className="dashboard-best-employee-icon">
                                    <svg
                                        width="20"
                                        height="20"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="2"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                    >
                                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                                        <circle cx="12" cy="7" r="4" />
                                    </svg>
                                </div>
                                <div className="dashboard-best-employee-body">
                                    <div className="dashboard-kpi-label">Mejor Proveedor</div>
                                    <div className="dashboard-best-employee-name">{bestProvider?.name || '\u2014'}</div>
                                    <div className="dashboard-best-employee-sales">
                                        {bestProvider ? formatCurrency(bestProvider.totalPurchased) : ''}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                <div className="col-12 col-lg-4">
                    <div
                        className="dashboard-panel d-flex flex-column"
                        style={{ padding: '16px 20px', height: '100%' }}
                    >
                        <div className="dashboard-inline-title">Categorías</div>
                        <div style={{ flex: 1, minHeight: 0 }}>
                            <GroupPurchases chartData={chartData} />
                        </div>
                    </div>
                </div>
            </div>

            {/* Pareto Analysis */}
            <div className="row g-3 mb-4">
                <div className="col-12">
                    <ParetoChart
                        products={paretoData?.products || []}
                        summary={paretoData?.summary || null}
                        loading={paretoLoading}
                        config={paretoConfig}
                    />
                </div>
            </div>

            <div className="row g-3 mb-4">
                <div className="col-12 col-lg-6">
                    <div className="dashboard-panel" style={{ padding: '16px 20px' }}>
                        <div className="dashboard-inline-title">Top Productos</div>
                        <div style={{ height: 340, overflowY: 'auto' }}>
                            <RankedList
                                data={data?.topProducts || []}
                                nameKey="product"
                                valueKey="totalPurchased"
                                valueFormat={formatCurrency}
                                secondary={{
                                    render: (item) =>
                                        `${formatNumber(item.quantity)} un \u00B7 ${formatCurrency(item.avgUnitCost)} c/u`,
                                }}
                            />
                        </div>
                    </div>
                </div>
                <div className="col-12 col-lg-6">
                    <div className="dashboard-panel" style={{ padding: '16px 20px' }}>
                        <div className="dashboard-inline-title">Top Proveedores</div>
                        <div style={{ height: 340, overflowY: 'auto' }}>
                            <RankedList
                                data={data?.topProviders || []}
                                nameKey="provider"
                                valueKey="totalPurchased"
                                valueFormat={formatCurrency}
                            />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default PurchasesDashboard;
