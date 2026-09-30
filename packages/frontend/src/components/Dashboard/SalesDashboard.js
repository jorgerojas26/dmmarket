import { fetchDashboardPareto } from 'api/dashboard';
import GroupSales from 'components/Cards/GroupSales';
import { useDashboardParetoRaw, useDashboardSalesRaw } from 'hooks/useDashboard';
import { DateTime } from 'luxon';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { computeComparison, formatCurrency, formatNumber, formatPercent } from 'utils/format';
import KpiCard from './KpiCard';
import PanelHelpTitle from './PanelHelpTitle';
import ParetoChart from './ParetoChart';
import RankedList from './RankedList';

const SALES_PARETO_CONFIG = { inventoryValueKey: 'inventoryValue' };

// Config del Pareto para el modo "compras sin vender": productos comprados en el
// rango sin ninguna venta en el mismo rango, rankeados por inversión.
const PURCHASES_PARETO_CONFIG = {
    inventoryValueKey: 'inventoryValue',
    nameKey: 'product',
    valueKey: 'totalPurchased',
    quantityKey: 'quantity',
    entityLabel: 'Producto',
    valueLabel: 'Inversión',
    valueAxisLabel: 'Inversión en Compras',
    axisLegend: 'Productos comprados sin vender (ordenados por inversión)',
    summaryValueKey: 'purchasedPercent',
    summaryPctLabel: 'de inversión',
    summaryTotalKey: 'totalProducts',
    summaryTotalLabel: 'Total SKUs',
    summaryTotalUnit: 'productos',
    title: 'Análisis Pareto (ABC)',
    subtitle: 'Compras sin vender: 80% del capital atascado en el 20% de los productos',
    pdfTitle: 'Análisis Pareto (ABC) de Compras sin Vender',
    allFilterLabel: 'Todos los productos',
    emptyTableMessage: 'Sin productos en esta clase',
};

const NEW_PAGE_SIZE = 20;

const PARETO_MODES = [
    { key: 'ventas', label: 'Ganancia (Ventas)', color: '#3b82f6' },
    { key: 'compras-sin-vender', label: 'Compras sin vender', color: '#f59e0b' },
];

function buildCompareRange(dateRange) {
    const fromDt = DateTime.fromISO(dateRange.from);
    const toDt = DateTime.fromISO(dateRange.to);
    const days = toDt.diff(fromDt, 'days').days;
    const compareTo = fromDt.minus({ days: 1 }).toISODate();
    const compareFrom = DateTime.fromISO(compareTo).minus({ days }).toISODate();
    return { compareFrom, compareTo };
}

const SalesDashboard = ({ dateRange, showNoe }) => {
    const { data, error, isLoading } = useDashboardSalesRaw(dateRange, showNoe);
    const [paretoMode, setParetoMode] = useState('ventas');
    const [paretoSort, setParetoSort] = useState(null); // { id, desc } | null = default del modo
    const [newSearch, setNewSearch] = useState('');
    const [newPage, setNewPage] = useState(1);
    const [newSort, setNewSort] = useState({ id: 'firstPurchaseDate', desc: true });
    const paretoConfig = paretoMode === 'compras-sin-vender' ? PURCHASES_PARETO_CONFIG : SALES_PARETO_CONFIG;
    const paretoDefaultSortId = paretoMode === 'compras-sin-vender' ? 'totalPurchased' : 'netProfit';
    const paretoSortBy = paretoSort || { id: paretoDefaultSortId, desc: true };
    const { data: paretoData, isLoading: paretoLoading } = useDashboardParetoRaw(
        dateRange,
        showNoe,
        paretoMode,
        paretoSortBy.id,
        paretoSortBy.desc ? 'desc' : 'asc',
        {
            search: newSearch,
            page: newPage,
            limit: NEW_PAGE_SIZE,
            sortBy: newSort.id,
            sortDir: newSort.desc ? 'desc' : 'asc',
        },
    );

    const handleNewSearch = useCallback((term) => {
        setNewSearch(term);
        setNewPage(1);
    }, []);
    const handleNewSort = useCallback((sortByList) => {
        const sort = sortByList?.[0];
        if (sort) {
            setNewSort(sort);
            setNewPage(1);
        }
    }, []);
    useEffect(() => setNewPage(1), [dateRange?.from, dateRange?.to, showNoe]);

    const fetchAllNewProducts = useCallback(async () => {
        const result = await fetchDashboardPareto({
            ...dateRange,
            showNoe,
            modo: paretoMode,
            newSearch,
            newSortBy: newSort.id,
            newSortDir: newSort.desc ? 'desc' : 'asc',
        });
        return result.newProducts;
    }, [dateRange?.from, dateRange?.to, showNoe, paretoMode, newSearch, newSort]);

    const handleParetoModeChange = (key) => {
        setParetoMode(key);
        setParetoSort(null); // volver al orden canónico del modo
        setNewSearch('');
        setNewPage(1);
        setNewSort({ id: 'firstPurchaseDate', desc: true });
    };

    // Compare range for KPI delta badges — computed locally, not fetched
    const compareRange = useMemo(() => {
        if (!dateRange?.from || !dateRange?.to) return null;
        return buildCompareRange(dateRange);
    }, [dateRange?.from, dateRange?.to]);

    const chartData = useMemo(
        () =>
            (data?.groupSalesChart || []).map((item) => ({
                id: item.categoria,
                label: item.categoria,
                value: item.rawProfit,
                netProfit: item.netProfit,
            })),
        [data?.groupSalesChart],
    );

    const kpis = data?.kpis;
    const bestEmployee = data?.bestEmployee;

    if (error) {
        return <div className="alert alert-danger">Error al cargar el dashboard: {error.message}</div>;
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
            <div className="sales-dashboard-overview mb-4">
                <div className="sales-dashboard-summary">
                    <div className="dashboard-kpi-grid dashboard-kpi-grid-compact sales-dashboard-kpi-grid">
                        <div>
                            <KpiCard
                                label="Venta Bruta"
                                value={formatCurrency(kpis?.totalRawProfit)}
                                comparison={computeComparison(kpis?.totalRawProfit, kpis?.compareRawProfit)}
                                icon="money"
                                accent="blue"
                                help={{
                                    que: 'El total facturado en el periodo, sin descontar el costo de la mercancía.',
                                    leer: 'Es el tamaño bruto del negocio: lo que el cliente pagó. No es ganancia.',
                                    servir: 'Ver cuánto vende la empresa en el periodo.',
                                    accion: 'Compárala con Ganancia Neta: si la bruta crece pero la neta no, la rentabilidad se está perdiendo.',
                                }}
                            />
                        </div>
                        <div>
                            <KpiCard
                                label="Ganancia Neta"
                                value={formatCurrency(kpis?.totalNetProfit)}
                                comparison={computeComparison(kpis?.totalNetProfit, kpis?.compareNetProfit)}
                                icon="chart"
                                accent="green"
                                help={{
                                    que: 'Lo que queda de la venta después de restar el costo de la mercancía vendida.',
                                    leer: 'Es la ganancia real del periodo: la Venta Bruta menos el costo.',
                                    servir: 'Medir la rentabilidad de verdad, no solo la facturación.',
                                    accion: 'Si el margen baja, revisa los costos de compra y los precios de venta.',
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
                                    que: 'Cuánto vende en promedio cada factura (Venta Bruta ÷ número de facturas).',
                                    leer: 'Ticket alto = clientes que compran más por visita; ticket bajo = ventas pequeñas y frecuentes.',
                                    servir: 'Detectar si la venta se sostiene por volumen o por ticket.',
                                }}
                            />
                        </div>
                        <div>
                            <KpiCard
                                label="Margen Prom."
                                value={formatPercent(kpis?.avgMarginPercent)}
                                icon="percent"
                                accent="amber"
                                help={{
                                    que: 'Porcentaje de la venta que queda como ganancia neta (Ganancia Neta ÷ Venta Bruta).',
                                    leer: '25% = por cada 100 dólares vendidos, 25 quedan como ganancia.',
                                    servir: 'Es la salud del negocio: margen bajo con venta alta = mucho movimiento, poca ganancia.',
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
                                    que: 'Total de unidades vendidas en el periodo.',
                                    leer: 'Complementa al dinero: muchas unidades con poco monto = productos baratos.',
                                    servir: 'Ver el volumen físico de la operación.',
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
                                    que: 'Número de facturas emitidas en el periodo.',
                                    leer: 'Cada factura es una venta cerrada; no cuenta unidades, cuenta operaciones.',
                                    servir: 'Medir cuántas ventas se concretan, independiente de su tamaño.',
                                }}
                            />
                        </div>
                    </div>
                    <div className="sales-dashboard-insights">
                        <div className="sales-dashboard-categories">
                            <PanelHelpTitle
                                title="Categorías"
                                help={{
                                    que: 'Reparte la venta bruta del periodo según la categoría de producto.',
                                    leer: 'Cada porción es una categoría; mientras más grande, más aporta a las ventas.',
                                    servir: 'Ver qué categorías concentran las ventas del periodo.',
                                    accion: 'Profundiza en el Pareto para ver los productos exactos de cada categoría.',
                                }}
                            />
                            <GroupSales chartData={chartData} compact />
                        </div>
                        <div className="sales-dashboard-best-employee">
                            <div className="sales-dashboard-seller-label">
                                <svg
                                    width="14"
                                    height="14"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    aria-hidden="true"
                                >
                                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                                    <circle cx="12" cy="7" r="4" />
                                </svg>
                                Mejor Vendedor
                            </div>
                            <div className="dashboard-best-employee-body">
                                <div className="dashboard-best-employee-name">{bestEmployee?.name || '\u2014'}</div>
                                <div className="dashboard-best-employee-sales">
                                    {bestEmployee ? formatCurrency(bestEmployee.totalSales) : ''}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Pareto Analysis */}
            <div className="row g-3 mb-4">
                <div className="col-12">
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'space-between', marginBottom: 12 }}>
                        <PanelHelpTitle
                            title="Modos del Pareto"
                            help={{
                                que: 'Ambos modos parten de productos comprados en el período. Ganancia (Ventas) incluye los que también se vendieron; Compras sin vender incluye los que no tuvieron ventas en ese período.',
                                leer: 'Son grupos distintos: un producto no puede aparecer en ambos modos para el mismo rango. «Sin vender» no significa que nunca se haya vendido; pudo tener ventas antes del período.',
                                servir: 'Separar la ganancia de los productos vendidos de la inversión en los que aún no se vendieron.',
                            }}
                        />
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                            {PARETO_MODES.map(({ key, label, color }) => (
                                <button
                                    key={key}
                                    onClick={() => handleParetoModeChange(key)}
                                    style={{
                                        padding: '6px 16px',
                                        borderRadius: 6,
                                        border:
                                            paretoMode === key ? `1.5px solid ${color}` : '1px solid rgba(255,255,255,0.1)',
                                        background: paretoMode === key ? `${color}18` : 'transparent',
                                        color: paretoMode === key ? color : '#9ca3af',
                                        fontSize: 12,
                                        fontWeight: paretoMode === key ? 600 : 400,
                                        cursor: 'pointer',
                                        transition: 'all 0.15s',
                                    }}
                                >
                                    {label}
                                </button>
                            ))}
                        </div>
                    </div>
                    <ParetoChart
                        products={paretoData?.products || []}
                        newProducts={paretoData?.newProducts || []}
                        newProductsTable={{
                            count: paretoData?.newProductsCount || 0,
                            total: paretoData?.newProductsTotal || 0,
                            inventoryTotal: paretoData?.newProductsInventoryTotal || 0,
                            page: newPage,
                            pageSize: NEW_PAGE_SIZE,
                            sort: newSort,
                            onSearch: handleNewSearch,
                            onSort: handleNewSort,
                            onPageChange: setNewPage,
                            fetchAll: fetchAllNewProducts,
                            rangeLabel: `${dateRange?.from} — ${dateRange?.to}`,
                        }}
                        summary={paretoData?.summary || null}
                        loading={paretoLoading}
                        config={paretoConfig}
                        sorting={{
                            enabled: true,
                            sortBy: [paretoSortBy],
                            onSort: (sortByList) => {
                                const s = sortByList?.[0];
                                if (s) setParetoSort({ id: s.id, desc: s.desc });
                            },
                        }}
                    />
                </div>
            </div>

            <div className="row g-3 mb-4">
                <div className="col-12 col-lg-6">
                    <div className="dashboard-panel" style={{ padding: '16px 20px' }}>
                        <PanelHelpTitle
                            title="Top Productos"
                            help={{
                                que: 'Los productos que más ganancia neta generan en el periodo, ordenados de mayor a menor.',
                                leer: 'Incluye unidades vendidas y el margen promedio de cada producto.',
                                servir: 'Identificar los productos que sostienen la rentabilidad.',
                                accion: 'Revisa el Pareto para clasificarlos A/B/C y decidir el inventario.',
                            }}
                        />
                        <div style={{ height: 340, overflowY: 'auto' }}>
                            <RankedList
                                data={data?.topProducts || []}
                                nameKey="product"
                                valueKey="netProfit"
                                valueFormat={formatCurrency}
                                secondary={{
                                    render: (item) =>
                                        `${formatNumber(item.quantity)} un \u00B7 ${formatPercent(item.averageProfitPercent)}`,
                                }}
                            />
                        </div>
                    </div>
                </div>
                <div className="col-12 col-lg-6">
                    <div className="dashboard-panel" style={{ padding: '16px 20px' }}>
                        <PanelHelpTitle
                            title="Top Clientes"
                            help={{
                                que: 'Los clientes que más ganancia neta generan en el periodo, ordenados de mayor a menor.',
                                leer: 'Se ordena por ganancia, no por facturación: un cliente que compra mucho con margen bajo puede no aparecer aquí.',
                                servir: 'Ver quiénes aportan la ganancia real de la empresa.',
                                accion: 'Cruza con el dashboard de clientes para cuidar a los que más rentan.',
                            }}
                        />
                        <div style={{ height: 340, overflowY: 'auto' }}>
                            <RankedList
                                data={data?.topClients || []}
                                nameKey="client"
                                valueKey="netProfit"
                                valueFormat={formatCurrency}
                            />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SalesDashboard;
