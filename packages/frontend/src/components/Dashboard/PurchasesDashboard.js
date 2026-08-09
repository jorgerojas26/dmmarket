import GroupPurchases from 'components/Cards/GroupPurchases';
import { usePurchasesDashboard, usePurchasesPareto } from 'hooks/usePurchases';
import { useMemo } from 'react';
import { computeComparison, formatCurrency, formatNumber } from 'utils/format';
import KpiCard from './KpiCard';
import PanelHelpTitle from './PanelHelpTitle';
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
                                help={{
                                    que: 'El total invertido en mercancía en el periodo, según las facturas de compra.',
                                    leer: 'Es el costo de lo que entró al inventario, sin importar si ya se vendió.',
                                    servir: 'Ver cuánto dinero sale hacia los proveedores.',
                                    accion: 'Compáralo con la Venta Bruta: comprar mucho sin vender acumula inventario.',
                                }}
                            />
                        </div>
                        <div>
                            <KpiCard
                                label="Unidades"
                                value={formatNumber(kpis?.totalQuantity)}
                                comparison={computeComparison(kpis?.totalQuantity, kpis?.compareQuantity)}
                                icon="package"
                                accent="cyan"
                                help={{
                                    que: 'Total de unidades compradas en el periodo.',
                                    leer: 'Complementa al dinero: muchas unidades con poco monto = mercancía barata (abarrote).',
                                    servir: 'Medir el volumen físico de las compras.',
                                }}
                            />
                        </div>
                        <div>
                            <KpiCard
                                label="Transacciones"
                                value={formatNumber(kpis?.totalInvoices)}
                                comparison={computeComparison(kpis?.totalInvoices, kpis?.compareInvoices)}
                                icon="receipt"
                                accent="pink"
                                help={{
                                    que: 'Número de facturas de compra recibidas en el periodo.',
                                    leer: 'Cada factura es una compra a un proveedor.',
                                    servir: 'Ver cuántas operaciones de compra se generan, independiente de su tamaño.',
                                }}
                            />
                        </div>
                        <div>
                            <KpiCard
                                label="Ticket Prom."
                                value={formatCurrency(kpis?.avgTicket)}
                                icon="ticket"
                                accent="purple"
                                help={{
                                    que: 'Cuánto se compra en promedio por factura (Total Comprado ÷ número de facturas).',
                                    leer: 'Ticket alto = compras grandes y concentradas; ticket bajo = compras pequeñas y frecuentes.',
                                    servir: 'Entender el patrón de abastecimiento.',
                                }}
                            />
                        </div>
                        <div>
                            <KpiCard
                                label="Costo Prom/Unidad"
                                value={formatCurrency(kpis?.avgUnitCost)}
                                icon="percent"
                                accent="amber"
                                help={{
                                    que: 'Costo promedio por unidad comprada (Total Comprado ÷ unidades).',
                                    leer: 'Es el precio de compra promedio ponderado del periodo.',
                                    servir: 'Referencia para negociar con proveedores y detectar subidas de costos.',
                                    accion: 'Si sube sin cambio de mezcla, negocia precios o busca otro proveedor.',
                                }}
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
                        <PanelHelpTitle
                            title="Categorías"
                            help={{
                                que: 'Reparte el total comprado del periodo según la categoría de producto.',
                                leer: 'Cada porción es una categoría; mientras más grande, más dinero invertido en ella.',
                                servir: 'Ver dónde se concentra la inversión en mercancía.',
                            }}
                        />
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
                        <PanelHelpTitle
                            title="Top Productos"
                            help={{
                                que: 'Los productos que más monto comprado acumulan en el periodo, ordenados de mayor a menor.',
                                leer: 'Incluye unidades y el costo promedio por unidad de cada producto.',
                                servir: 'Identificar los productos donde se concentra la inversión.',
                                accion: 'Revisa el Pareto para clasificarlos A/B/C y priorizar la negociación con proveedores.',
                            }}
                        />
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
                        <PanelHelpTitle
                            title="Top Proveedores"
                            help={{
                                que: 'Los proveedores a los que más se les compra en el periodo, ordenados de mayor a menor.',
                                leer: 'Mientras más grande el monto, más depende la empresa de ese proveedor.',
                                servir: 'Ver la concentración del abastecimiento: depender de pocos proveedores es un riesgo.',
                            }}
                        />
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
