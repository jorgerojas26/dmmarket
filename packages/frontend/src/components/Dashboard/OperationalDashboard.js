import KpiCard from './KpiCard';

export default function OperationalDashboard({ data, loading }) {
    const kpis = data?.kpis || data?.summary || {};
    const values = [
        ['Documentos', kpis.totalInvoices ?? kpis.invoices ?? kpis.totalCount, 'receipt', 'blue'],
        ['Unidades', kpis.totalQuantity ?? kpis.quantity, 'package', 'green'],
        ['Clientes', kpis.totalClients ?? kpis.clients ?? kpis.activeClients, 'user', 'purple'],
        ['Vendedores', kpis.totalSellers ?? kpis.activeSellers, 'user', 'cyan'],
    ].filter(([, value]) => value !== undefined);
    return (
        <div className="dashboard-kpi-grid">
            {values.map(([label, value, icon, accent]) => (
                <KpiCard
                    key={label}
                    label={label}
                    value={value == null ? 'No disponible' : Number(value).toLocaleString('es-VE')}
                    icon={icon}
                    accent={accent}
                    loading={loading}
                />
            ))}
        </div>
    );
}
