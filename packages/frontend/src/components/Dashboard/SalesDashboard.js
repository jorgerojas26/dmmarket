import { fetchDashboardSales } from "api/dashboard";
import { fetchInvoiceReport } from "api/invoice";
import GroupSales from "components/Cards/GroupSales";
import SaleReportCard from "components/Cards/SaleReport";
import debounce from "lodash.debounce";
import { DateTime } from "luxon";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
    computeComparison,
    formatCurrency,
    formatNumber,
    formatPercent,
} from "utils/format";
import KpiCard from "./KpiCard";
import RankedList from "./RankedList";

const SalesDashboard = ({ dateRange, showNoe }) => {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [salesReportData, setSalesReportData] = useState([]);
    const [filteredSalesData, setFilteredSalesData] = useState([]);
    const [salesLoading, setSalesLoading] = useState(false);

    const onFilter = useCallback(
        debounce((searchTerm) => {
            const filtered = salesReportData.filter((f) =>
                f.product.toLowerCase().includes(searchTerm.toLowerCase()),
            );
            setFilteredSalesData(filtered);
        }, 500),
        [salesReportData],
    );

    useEffect(() => {
        let cancelled = false;

        const load = async () => {
            setLoading(true);
            setError(null);
            try {
                const fromDt = DateTime.fromISO(dateRange.from);
                const toDt = DateTime.fromISO(dateRange.to);
                const days = toDt.diff(fromDt, "days").days;
                const compareTo = fromDt.minus({ days: 1 }).toISODate();
                const compareFrom = DateTime.fromISO(compareTo)
                    .minus({ days })
                    .toISODate();

                const result = await fetchDashboardSales({
                    from: dateRange.from,
                    to: dateRange.to,
                    showNoe,
                    compareFrom,
                    compareTo,
                });
                if (!cancelled) setData(result);
            } catch (err) {
                if (!cancelled) setError(err.message);
            } finally {
                if (!cancelled) setLoading(false);
            }
        };

        load();
        return () => {
            cancelled = true;
        };
    }, [dateRange.from, dateRange.to, showNoe]);

    useEffect(() => {
        let cancelled = false;

        const loadSalesReport = async () => {
            setSalesLoading(true);
            try {
                const report = await fetchInvoiceReport({
                    from: dateRange.from,
                    to: dateRange.to,
                    showNoe,
                });
                if (!cancelled) {
                    setSalesReportData(report.sales_report || []);
                    setFilteredSalesData([]);
                }
            } catch (err) {
                console.error(err);
            } finally {
                if (!cancelled) setSalesLoading(false);
            }
        };

        loadSalesReport();
        return () => {
            cancelled = true;
        };
    }, [dateRange.from, dateRange.to, showNoe]);

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

    if (loading && !data) {
        return (
            <div
                className="d-flex justify-content-center align-items-center"
                style={{ minHeight: 300 }}
            >
                <span
                    className="spinner-border spinner-border-md"
                    role="status"
                />
            </div>
        );
    }

    if (error) {
        return (
            <div className="alert alert-danger">
                Error al cargar el dashboard: {error}
            </div>
        );
    }

    const kpis = data?.kpis;
    const bestEmployee = data?.bestEmployee;

    return (
        <div>
            <div className="row g-3 mb-4">
                <div className="col-12 col-lg-8 d-flex flex-column">
                    <div
                        className="dashboard-kpi-grid"
                        style={{ flex: 1 }}
                    >
                        <div>
                            <KpiCard
                                label="Venta Bruta"
                                value={formatCurrency(kpis?.totalRawProfit)}
                                comparison={computeComparison(
                                    kpis?.totalRawProfit,
                                    kpis?.compareRawProfit,
                                )}
                                loading={loading}
                                icon="money"
                                accent="blue"
                            />
                        </div>
                        <div>
                            <KpiCard
                                label="Ganancia Neta"
                                value={formatCurrency(kpis?.totalNetProfit)}
                                comparison={computeComparison(
                                    kpis?.totalNetProfit,
                                    kpis?.compareNetProfit,
                                )}
                                loading={loading}
                                icon="chart"
                                accent="green"
                            />
                        </div>
                        <div>
                            <KpiCard
                                label="Ticket Prom."
                                value={formatCurrency(kpis?.avgTicket)}
                                loading={loading}
                                icon="ticket"
                                accent="purple"
                            />
                        </div>
                        <div>
                            <KpiCard
                                label="Margen Prom."
                                value={formatPercent(kpis?.avgMarginPercent)}
                                loading={loading}
                                icon="percent"
                                accent="amber"
                            />
                        </div>
                        <div>
                            <KpiCard
                                label="Unidades"
                                value={formatNumber(kpis?.totalQuantity)}
                                comparison={computeComparison(
                                    kpis?.totalQuantity,
                                    kpis?.compareQuantity,
                                )}
                                loading={loading}
                                icon="package"
                                accent="cyan"
                            />
                        </div>
                        <div>
                            <KpiCard
                                label="Transacciones"
                                value={formatNumber(kpis?.totalInvoices)}
                                comparison={computeComparison(
                                    kpis?.totalInvoices,
                                    kpis?.compareInvoices,
                                )}
                                loading={loading}
                                icon="receipt"
                                accent="pink"
                            />
                        </div>
                        <div style={{ gridColumn: "1 / -1" }}>
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
                                    <div className="dashboard-kpi-label">
                                        Mejor Vendedor
                                    </div>
                                    <div className="dashboard-best-employee-name">
                                        {bestEmployee?.name || "\u2014"}
                                    </div>
                                    <div className="dashboard-best-employee-sales">
                                        {bestEmployee
                                            ? formatCurrency(bestEmployee.totalSales)
                                            : ""}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                <div className="col-12 col-lg-4">
                    <div
                        className="dashboard-panel"
                        style={{ padding: "16px 20px" }}
                    >
                        <div className="dashboard-inline-title">Categorías</div>
                        <div style={{ height: 340 }}>
                            <GroupSales
                                chartData={chartData}
                                loading={loading}
                            />
                        </div>
                    </div>
                </div>
            </div>

            <div className="row g-3 mb-4">
                <div className="col-12 col-lg-6">
                    <div
                        className="dashboard-panel"
                        style={{ padding: "16px 20px" }}
                    >
                        <div className="dashboard-inline-title">
                            Top Productos
                        </div>
                        <div style={{ height: 340, overflowY: "auto" }}>
                            <RankedList
                                data={data?.topProducts || []}
                                nameKey="product"
                                valueKey="rawProfit"
                                valueFormat={formatCurrency}
                                secondary={{
                                    render: (item) =>
                                        `${formatNumber(item.quantity)} un \u00B7 ${formatPercent(item.averageProfitPercent)}`,
                                }}
                                loading={loading}
                            />
                        </div>
                    </div>
                </div>
                <div className="col-12 col-lg-6">
                    <div
                        className="dashboard-panel"
                        style={{ padding: "16px 20px" }}
                    >
                        <div className="dashboard-inline-title">
                            Top Clientes
                        </div>
                        <div style={{ height: 340, overflowY: "auto" }}>
                            <RankedList
                                data={data?.topClients || []}
                                nameKey="client"
                                valueKey="total_USD"
                                valueFormat={formatCurrency}
                                loading={loading}
                            />
                        </div>
                    </div>
                </div>
            </div>

            {/* ═══ Sales Report ═══ */}
            <SaleReportCard
                data={
                    filteredSalesData?.length
                        ? filteredSalesData
                        : salesReportData
                }
                loading={salesLoading}
                onFilter={onFilter}
            />
        </div>
    );
};

export default SalesDashboard;
