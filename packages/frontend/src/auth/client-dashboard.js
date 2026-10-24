import { useState } from 'react';
import useSWR from 'swr';
import { fetcher } from 'swr-config';
import { AccessForm, Field } from './forms';

function Classification({ value, utility = false }) {
    return (
        <table
            aria-label={utility ? 'Clasificación por utilidad autorizada' : 'Clasificación por ventas autorizadas'}
            className="table table-dark"
        >
            <thead>
                <tr>
                    <th>Cliente o identidad histórica</th>
                    <th>{utility ? 'Utilidad autorizada' : 'Ventas autorizadas'}</th>
                    <th>Acumulado (%)</th>
                    <th>Clase ABC</th>
                </tr>
            </thead>
            <tbody>
                {value.clients.map((row) => (
                    <tr key={row.clientId}>
                        <td>{row.name}</td>
                        <td>{utility ? row.utilidad : row.total_usd}</td>
                        <td>{row.cumulativePercent ?? 'Sin base válida'}</td>
                        <td>{row.abcClass ?? 'Sin clasificación válida'}</td>
                    </tr>
                ))}
            </tbody>
        </table>
    );
}

export default function ClientDashboard() {
    const today = new Date().toISOString().slice(0, 10);
    const [from, setFrom] = useState(`${today.slice(0, 7)}-01`);
    const [to, setTo] = useState(today);
    const [showNoe, setShowNoe] = useState('false');
    const [ruta, setRuta] = useState('');
    const [employeeId, setEmployeeId] = useState('');
    const [query, setQuery] = useState(null);
    const { data: routes, error: routesError } = useSWR('/api/clients/routes', fetcher);
    const { data, error } = useSWR(query ? `/api/clients/dashboard?${new URLSearchParams(query)}` : null, fetcher);
    const labels = [
        ['totalClients', 'Clientes del catálogo en el alcance'],
        ['activeClients', 'Clientes del catálogo con documentos autorizados'],
        ['unregisteredActiveClients', 'Identidades históricas con documentos y sin ficha'],
        ['activePercent', 'Actividad autorizada del catálogo (%)'],
        ['sinFacturar', 'Clientes del catálogo sin documentos autorizados'],
        ['withoutRoute', 'Clientes del catálogo sin ruta'],
        ['avgFrequency', 'Documentos autorizados por identidad activa'],
    ];
    return (
        <section aria-label="Panel de clientes" className="my-4">
            <AccessForm
                title="Panel autorizado de clientes"
                button="Consultar panel de clientes"
                onSubmit={async () =>
                    setQuery({ from, to, showNoe, ...(ruta ? { ruta } : {}), ...(employeeId ? { employeeId } : {}) })
                }
            >
                <Field label="Panel de clientes desde" type="date" value={from} onChange={setFrom} />
                <Field label="Panel de clientes hasta" type="date" value={to} onChange={setTo} />
                <Field
                    label="Vendedor del panel de clientes"
                    value={employeeId}
                    onChange={setEmployeeId}
                    required={false}
                    maxLength={32}
                />
                <label htmlFor="client-dashboard-route">Ruta del panel de clientes</label>
                <select
                    id="client-dashboard-route"
                    className="form-select"
                    value={ruta}
                    onChange={(event) => setRuta(event.target.value)}
                    disabled={!routes}
                >
                    <option value="">Todas las rutas</option>
                    {routes?.map((route) => (
                        <option key={route.Id_Ruta} value={route.Id_Ruta}>
                            {route.Nombre}
                        </option>
                    ))}
                </select>
                {routesError && <p role="alert">No se pudieron cargar las rutas autorizadas.</p>}
                <label htmlFor="client-dashboard-system">Sistema del panel de clientes</label>
                <select
                    id="client-dashboard-system"
                    className="form-select"
                    value={showNoe}
                    onChange={(event) => setShowNoe(event.target.value)}
                >
                    <option value="false">Facturas</option>
                    <option value="true">Notas de entrega</option>
                </select>
            </AccessForm>
            <p>
                Actividad, retención, concentración y rankings sólo consideran documentos autorizados. El catálogo no
                amplía el acceso a ventas. Las identidades sin ficha se muestran por separado y no aumentan el
                porcentaje de actividad del catálogo.
            </p>
            {query && !data && !error && <p role="status">Consultando panel de clientes…</p>}
            {error && <p role="alert">No se pudo consultar el panel autorizado de clientes.</p>}
            {data && !error && (
                <>
                    <dl>
                        {labels.map(([key, label]) => (
                            <div key={key}>
                                <dt>{label}</dt>
                                <dd>{data.kpis[key]}</dd>
                            </div>
                        ))}
                    </dl>
                    <section aria-label="Retención autorizada de clientes">
                        <h2 className="h5">Retención autorizada</h2>
                        <p>Ventas autorizadas del período anterior: {data.kpis.retention.prevPeriodRevenue}</p>
                        <p>Ventas anteriores de identidades retenidas: {data.kpis.retention.retainedRevenue}</p>
                        <p>Retención de ventas anteriores (%): {data.kpis.retention.rate ?? 'Sin base válida'}</p>
                        <p>
                            Identidades retenidas: {data.waterfall.retained}, perdidas: {data.waterfall.lost},
                            incorporadas: {data.waterfall.gained}
                        </p>
                    </section>
                    <h2 className="h5">Concentración autorizada</h2>
                    <dl>
                        {Object.entries(data.kpis.concentration).map(([key, value]) => (
                            <div key={key}>
                                <dt>{key}</dt>
                                <dd>{value ?? 'Sin base válida'}</dd>
                            </div>
                        ))}
                    </dl>
                    <h2 className="h5">Clasificación ABC de ventas autorizadas</h2>
                    <div className="table-responsive">
                        <Classification value={data.abc} />
                    </div>
                    {Object.hasOwn(data, 'abcUtility') && (
                        <>
                            <h2 className="h5">Clasificación ABC de utilidad autorizada</h2>
                            <div className="table-responsive">
                                <Classification value={data.abcUtility} utility />
                            </div>
                        </>
                    )}
                    <h2 className="h5">Actividad mensual autorizada</h2>
                    <table aria-label="Actividad mensual autorizada de clientes" className="table table-dark">
                        <thead>
                            <tr>
                                <th>Mes</th>
                                <th>Clientes del catálogo activos</th>
                                <th>Identidades activas sin ficha</th>
                            </tr>
                        </thead>
                        <tbody>
                            {data.monthlyActive.map((row) => (
                                <tr key={row.month}>
                                    <td>{row.month}</td>
                                    <td>{row.count}</td>
                                    <td>{row.unregistered}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    <h2 className="h5">Cobertura autorizada por ruta</h2>
                    <table aria-label="Cobertura autorizada de clientes" className="table table-dark">
                        <thead>
                            <tr>
                                <th>Ruta</th>
                                <th>Clientes del catálogo</th>
                                <th>Con documentos autorizados</th>
                                <th>Cobertura autorizada (%)</th>
                            </tr>
                        </thead>
                        <tbody>
                            {data.coverage.routes.map((row) => (
                                <tr key={row.Id_Ruta}>
                                    <td>{row.Nombre}</td>
                                    <td>{row.asignados}</td>
                                    <td>{row.activos}</td>
                                    <td>{row.coberturaPct}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    <h2 className="h5">Segmentación de ventas autorizadas</h2>
                    <table aria-label="Segmentación autorizada de clientes" className="table table-dark">
                        <thead>
                            <tr>
                                <th>Segmento</th>
                                <th>Identidades activas</th>
                                <th>Ventas autorizadas</th>
                                <th>Participación (%)</th>
                            </tr>
                        </thead>
                        <tbody>
                            {data.revenueBySegment.map((row) => (
                                <tr key={row.segment}>
                                    <td>{row.segment}</td>
                                    <td>{row.num_clients}</td>
                                    <td>{row.revenue}</td>
                                    <td>{row.revenue_pct ?? 'Sin base válida'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </>
            )}
        </section>
    );
}
