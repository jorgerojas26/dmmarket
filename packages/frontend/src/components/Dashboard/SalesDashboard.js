import { useState, useEffect, useMemo } from "react";
import { DateTime } from "luxon";
import { fetchDashboardSales } from "api/dashboard";
import { formatCurrency, formatNumber, formatPercent, computeComparison } from "utils/format";
import KpiCard from "./KpiCard";
import GroupSales from "components/Cards/GroupSales";
import Table from "components/Table";

const topProductsColumns = [
  { header: 'Producto', accessor: 'product' },
  { header: 'Cantidad', accessor: 'quantity', Cell: ({ value }) => formatNumber(value) },
  { header: 'Venta Bruta', accessor: 'rawProfit', Cell: ({ value }) => formatCurrency(value) },
  { header: 'Ganancia Neta', accessor: 'netProfit', Cell: ({ value }) => formatCurrency(value) },
  { header: 'Margen %', accessor: 'averageProfitPercent', Cell: ({ value }) => formatPercent(value) },
];

const topClientsColumns = [
  { header: 'Cliente', accessor: 'client' },
  { header: 'Total USD', accessor: 'total_USD', Cell: ({ value }) => formatCurrency(value) },
];

const SalesDashboard = ({ dateRange, showNoe }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const fromDt = DateTime.fromISO(dateRange.from);
        const toDt = DateTime.fromISO(dateRange.to);
        const days = toDt.diff(fromDt, 'days').days;
        const compareTo = fromDt.minus({ days: 1 }).toISODate();
        const compareFrom = DateTime.fromISO(compareTo).minus({ days }).toISODate();

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
    return () => { cancelled = true; };
  }, [dateRange.from, dateRange.to, showNoe]);

  const chartData = useMemo(() =>
    (data?.groupSalesChart || []).map(item => ({
      id: item.categoria,
      label: item.categoria,
      value: item.rawProfit,
      netProfit: item.netProfit,
    })),
    [data?.groupSalesChart]
  );

  if (loading && !data) {
    return (
      <div className="d-flex justify-content-center align-items-center" style={{ minHeight: 300 }}>
        <span className="spinner-border spinner-border-md" role="status" />
      </div>
    );
  }

  if (error) {
    return <div className="alert alert-danger">Error al cargar el dashboard: {error}</div>;
  }

  const kpis = data?.kpis;
  const bestEmployee = data?.bestEmployee;

  return (
    <div>
      {/* Fila 1: 4 KPIs */}
      <div className="row g-3 mb-3">
        <div className="col-12 col-sm-6 col-md-3">
          <KpiCard
            label="Venta Bruta"
            value={formatCurrency(kpis?.totalRawProfit)}
            comparison={computeComparison(kpis?.totalRawProfit, kpis?.compareRawProfit)}
            loading={loading}
          />
        </div>
        <div className="col-12 col-sm-6 col-md-3">
          <KpiCard
            label="Ganancia Neta"
            value={formatCurrency(kpis?.totalNetProfit)}
            comparison={computeComparison(kpis?.totalNetProfit, kpis?.compareNetProfit)}
            loading={loading}
          />
        </div>
        <div className="col-12 col-sm-6 col-md-3">
          <KpiCard label="Ticket Promedio" value={formatCurrency(kpis?.avgTicket)} loading={loading} />
        </div>
        <div className="col-12 col-sm-6 col-md-3">
          <KpiCard label="Margen Promedio" value={formatPercent(kpis?.avgMarginPercent)} loading={loading} />
        </div>
      </div>

      {/* Fila 2: 3 KPIs + Mejor Vendedor */}
      <div className="row g-3 mb-4">
        <div className="col-12 col-sm-6 col-md-3">
          <KpiCard
            label="Unidades Vendidas"
            value={formatNumber(kpis?.totalQuantity)}
            comparison={computeComparison(kpis?.totalQuantity, kpis?.compareQuantity)}
            loading={loading}
          />
        </div>
        <div className="col-12 col-sm-6 col-md-3">
          <KpiCard
            label="# Transacciones"
            value={formatNumber(kpis?.totalInvoices)}
            comparison={computeComparison(kpis?.totalInvoices, kpis?.compareInvoices)}
            loading={loading}
          />
        </div>
        <div className="col-12 col-sm-6 col-md-3">
          <div className="card h-100">
            <div className="card-body text-center">
              <div className="text-muted small text-uppercase">Mejor Vendedor</div>
              <div className="h5 mb-0">{bestEmployee?.name || '—'}</div>
              <div className="small text-muted">{bestEmployee ? formatCurrency(bestEmployee.totalSales) : ''}</div>
            </div>
          </div>
        </div>
        <div className="col-12 col-sm-6 col-md-3" />
      </div>

      {/* Fila 3: Gráfico + Top Productos */}
      <div className="row g-3 mb-3">
        <div className="col-12 col-lg-6">
          <GroupSales chartData={chartData} loading={loading} />
        </div>
        <div className="col-12 col-lg-6">
          <div className="card">
            <div className="card-header"><h3>Top 10 Productos</h3></div>
            <div className="card-body">
              <Table data={data?.topProducts || []} columns={topProductsColumns} loading={loading} maxHeight={400} />
            </div>
          </div>
        </div>
      </div>

      {/* Fila 4: Top Clientes */}
      <div className="row g-3">
        <div className="col-12">
          <div className="card">
            <div className="card-header"><h3>Top 10 Clientes</h3></div>
            <div className="card-body">
              <Table data={data?.topClients || []} columns={topClientsColumns} loading={loading} maxHeight={400} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SalesDashboard;
