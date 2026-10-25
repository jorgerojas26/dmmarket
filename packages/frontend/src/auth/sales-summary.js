import useSWR from 'swr';
import { fetcher } from 'swr-config';

export default function SalesSummary({ query }) {
    const { data, error } = useSWR(
        `/api/dashboard/sales?${new URLSearchParams({ ...query.parameters, ...query.comparison })}`,
        fetcher,
    );
    const financial = Object.hasOwn(data?.kpis || {}, 'totalNetProfit');
    return (
        <section aria-label="Resumen de ventas" className="card bg-dark border-secondary p-4 my-3">
            <h2 className="h4">Resumen autorizado de ventas</h2>
            {error && <p role="alert">No se pudo consultar el resumen autorizado.</p>}
            {!data && !error && <p role="status">Consultando resumen…</p>}
            {data && !error && (
                <>
                    <p>Total ventas: {data.kpis.totalRawProfit}</p>
                    <p>Documentos: {data.kpis.totalInvoices}</p>
                    <p>Cantidad: {data.kpis.totalQuantity}</p>
                    <p>Promedio por documento: {data.kpis.avgTicket}</p>
                    {financial && (
                        <>
                            <p>Utilidad total: {data.kpis.totalNetProfit}</p>
                            <p>Margen promedio: {data.kpis.avgMarginPercent}</p>
                        </>
                    )}
                    {data.kpis.compareRawProfit !== null && (
                        <p>Ventas del período comparado: {data.kpis.compareRawProfit}</p>
                    )}
                    {financial && data.kpis.compareNetProfit !== null && (
                        <p>Utilidad del período comparado: {data.kpis.compareNetProfit}</p>
                    )}
                    <h3 className="h5">Ventas por grupo</h3>
                    <table className="table table-dark">
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
                                    <td>{group.rawProfit}</td>
                                    {financial && <td>{group.netProfit}</td>}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </>
            )}
        </section>
    );
}
