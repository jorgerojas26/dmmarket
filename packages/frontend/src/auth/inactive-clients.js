import { useState } from 'react';
import useSWR from 'swr';
import { fetcher } from 'swr-config';
import { AccessForm, Field } from './forms';

export default function InactiveClients() {
    const today = new Date().toISOString().slice(0, 10);
    const [from, setFrom] = useState(`${today.slice(0, 7)}-01`);
    const [to, setTo] = useState(today);
    const [showNoe, setShowNoe] = useState('false');
    const [search, setSearch] = useState('');
    const [ruta, setRuta] = useState('');
    const [sortBy, setSortBy] = useState('revenue_historico');
    const [query, setQuery] = useState(null);
    const [page, setPage] = useState(1);
    const { data: routes, error: routesError } = useSWR('/api/clients/routes', fetcher);
    const { data, error } = useSWR(
        query ? `/api/clients/sin-facturar?${new URLSearchParams({ ...query, page, limit: 20 })}` : null,
        fetcher,
    );
    return (
        <section aria-label="Clientes sin documentos autorizados" className="my-4">
            <AccessForm
                title="Clientes sin documentos autorizados en el período"
                button="Consultar clientes sin documentos"
                onSubmit={async () => {
                    setPage(1);
                    setQuery({ from, to, showNoe, search, sortBy, ...(ruta ? { ruta } : {}) });
                }}
            >
                <Field label="Sin documentos desde" type="date" value={from} onChange={setFrom} />
                <Field label="Sin documentos hasta" type="date" value={to} onChange={setTo} />
                <Field
                    label="Buscar cliente sin documentos"
                    value={search}
                    onChange={setSearch}
                    required={false}
                    maxLength={128}
                />
                <label htmlFor="inactive-route">Ruta de clientes sin documentos</label>
                <select
                    id="inactive-route"
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
                <label htmlFor="inactive-system">Sistema de clientes sin documentos</label>
                <select
                    id="inactive-system"
                    className="form-select"
                    value={showNoe}
                    onChange={(event) => setShowNoe(event.target.value)}
                >
                    <option value="false">Facturas</option>
                    <option value="true">Notas de entrega</option>
                </select>
                <label htmlFor="inactive-sort">Orden de clientes sin documentos</label>
                <select
                    id="inactive-sort"
                    className="form-select"
                    value={sortBy}
                    onChange={(event) => setSortBy(event.target.value)}
                >
                    <option value="revenue_historico">Histórico autorizado</option>
                    <option value="Empresa">Nombre del cliente</option>
                    <option value="dias_inactivo">Días sin actividad autorizada</option>
                </select>
            </AccessForm>
            <p>
                No ver documentos autorizados no implica que el cliente no haya comprado fuera de tu alcance. La última
                actividad y el histórico sólo incluyen documentos autorizados hasta la fecha de corte.
            </p>
            {query && !data && !error && <p role="status">Consultando clientes sin documentos autorizados…</p>}
            {error && <p role="alert">No se pudo consultar el reporte autorizado.</p>}
            {data && (
                <>
                    <p role="status">Clientes sin documentos autorizados: {data.total}</p>
                    <div className="table-responsive">
                        <table aria-label="Resultado de clientes sin documentos" className="table table-dark">
                            <thead>
                                <tr>
                                    <th>Cliente</th>
                                    <th>Ruta</th>
                                    <th>Última actividad autorizada</th>
                                    <th>Días sin actividad autorizada</th>
                                    <th>Histórico autorizado</th>
                                </tr>
                            </thead>
                            <tbody>
                                {data.data.map((row) => (
                                    <tr key={row.IdCliente}>
                                        <td>{row.Empresa}</td>
                                        <td>{row.ruta_nombre ?? 'Sin ruta'}</td>
                                        <td>{row.last_factura ?? 'Sin actividad autorizada hasta el corte'}</td>
                                        <td>{row.dias_inactivo ?? 'Sin base autorizada'}</td>
                                        <td>{row.revenue_historico}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <button
                        type="button"
                        className="btn btn-outline-light"
                        disabled={page === 1}
                        onClick={() => setPage(page - 1)}
                    >
                        Sin documentos: página anterior
                    </button>
                    <button
                        type="button"
                        className="btn btn-outline-light"
                        disabled={page * data.limit >= data.total}
                        onClick={() => setPage(page + 1)}
                    >
                        Sin documentos: página siguiente
                    </button>
                </>
            )}
        </section>
    );
}
