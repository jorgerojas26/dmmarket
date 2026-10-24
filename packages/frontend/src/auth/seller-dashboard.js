import { useState } from 'react';
import useSWR from 'swr';
import { fetcher } from 'swr-config';
import { AccessForm, Field } from './forms';

export default function SellerDashboard() {
    const today = new Date().toISOString().slice(0, 10);
    const [from, setFrom] = useState(`${today.slice(0, 7)}-01`);
    const [to, setTo] = useState(today);
    const [showNoe, setShowNoe] = useState('false');
    const [query, setQuery] = useState(null);
    const { data, error } = useSWR(query ? `/api/sellers/dashboard?${new URLSearchParams(query)}` : null, fetcher);
    const indicators = [
        ['totalSellers', 'Vendedores en alcance'],
        ['activeSellers', 'Con documentos autorizados'],
        ['inactiveSellers', 'Sin documentos autorizados'],
        ['coveragePercent', 'Cobertura de documentos autorizados (%)'],
        ['totalSales', 'Ventas autorizadas del equipo'],
        ['totalInvoices', 'Documentos autorizados del equipo'],
        ['compareSales', 'Ventas autorizadas del período anterior'],
        ['avgSalesPerSeller', 'Venta promedio por vendedor activo en el alcance'],
        ['avgInvoicesPerSeller', 'Documentos promedio por vendedor activo en el alcance'],
        ['improvedSellers', 'Vendedores que aumentaron sus ventas autorizadas'],
        ['staleSellers', 'Última venta autorizada hace más de 30 días'],
        ['marginPercent', 'Margen autorizado del equipo (%)'],
        ['lowMarginSellers', 'Vendedores por debajo del margen autorizado del equipo'],
    ];
    const financial = data && Object.hasOwn(data.kpis, 'marginPercent');
    const contacts = data?.inactiveSellers.some((row) => Object.hasOwn(row, 'phone'));
    return (
        <section aria-label="Panel de vendedores" className="my-4">
            <AccessForm
                title="Panel autorizado de vendedores"
                button="Consultar panel de vendedores"
                onSubmit={async () => setQuery({ from, to, showNoe })}
            >
                <Field label="Panel de vendedores desde" type="date" value={from} onChange={setFrom} />
                <Field label="Panel de vendedores hasta" type="date" value={to} onChange={setTo} />
                <label htmlFor="seller-dashboard-system">Sistema del panel de vendedores</label>
                <select
                    id="seller-dashboard-system"
                    className="form-select"
                    value={showNoe}
                    onChange={(event) => setShowNoe(event.target.value)}
                >
                    <option value="false">Facturas</option>
                    <option value="true">Notas de entrega</option>
                </select>
            </AccessForm>
            <p>
                El panel sólo considera ventas autorizadas. Sin documentos autorizados no significa que el vendedor no
                haya vendido fuera de tu alcance.
            </p>
            {query && !data && !error && <p role="status">Consultando panel de vendedores…</p>}
            {error && <p role="alert">No se pudo consultar el panel autorizado de vendedores.</p>}
            {data && (
                <>
                    <dl>
                        {indicators
                            .filter(([key]) => Object.hasOwn(data.kpis, key))
                            .map(([key, label]) => (
                                <div key={key}>
                                    <dt>{label}</dt>
                                    <dd>{data.kpis[key]}</dd>
                                </div>
                            ))}
                    </dl>
                    <h2 className="h5">Ranking de ventas autorizadas</h2>
                    <div className="table-responsive">
                        <table aria-label="Ranking autorizado de vendedores" className="table table-dark">
                            <thead>
                                <tr>
                                    <th>Vendedor</th>
                                    <th>Ventas autorizadas</th>
                                    <th>Período anterior</th>
                                    <th>Cambio (%)</th>
                                    <th>Participación autorizada (%)</th>
                                    <th>Documentos</th>
                                    {financial && (
                                        <>
                                            <th>Utilidad autorizada</th>
                                            <th>Margen autorizado (%)</th>
                                        </>
                                    )}
                                </tr>
                            </thead>
                            <tbody>
                                {data.ranking.map((row) => (
                                    <tr key={row.sellerId}>
                                        <td>{row.name}</td>
                                        <td>{row.sales}</td>
                                        <td>{row.previousSales}</td>
                                        <td>{row.changePercent ?? 'Sin base comparable'}</td>
                                        <td>{row.sharePercent}</td>
                                        <td>{row.invoiceCount}</td>
                                        {financial && (
                                            <>
                                                <td>{row.profit}</td>
                                                <td>{row.marginPercent}</td>
                                            </>
                                        )}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <h2 className="h5">Tendencia autorizada</h2>
                    <table aria-label="Tendencia autorizada de vendedores" className="table table-dark">
                        <thead>
                            <tr>
                                <th>Mes</th>
                                <th>Ventas autorizadas</th>
                                <th>Documentos</th>
                            </tr>
                        </thead>
                        <tbody>
                            {data.monthlyTrend.map((row) => (
                                <tr key={row.month}>
                                    <td>{row.month}</td>
                                    <td>{row.sales}</td>
                                    <td>{row.invoiceCount}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    <h2 className="h5">Sin documentos autorizados en el período</h2>
                    <table aria-label="Vendedores sin documentos autorizados" className="table table-dark">
                        <thead>
                            <tr>
                                <th>Vendedor</th>
                                {contacts && <th>Teléfono autorizado</th>}
                            </tr>
                        </thead>
                        <tbody>
                            {data.inactiveSellers.map((row) => (
                                <tr key={row.sellerId}>
                                    <td>{row.name}</td>
                                    {contacts && <td>{row.phone ?? '—'}</td>}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </>
            )}
        </section>
    );
}
