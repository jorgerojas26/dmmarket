import { useState } from 'react';
import useSWR from 'swr';
import { fetcher } from 'swr-config';
import { useAuth } from './context';
import { AccessForm, Field } from './forms';

function Summary({ selection }) {
    const { data, error } = useSWR(
        `/api/${selection.kind}/${encodeURIComponent(selection.id)}/summary?${new URLSearchParams(selection.parameters)}`,
        fetcher,
    );
    const totals = error ? undefined : selection.kind === 'clients' ? data : data?.totals;
    return (
        <section aria-label="Resumen de cliente o vendedor" className="card bg-dark border-secondary p-3 my-3">
            <h2 className="h5">Resumen autorizado: {selection.name}</h2>
            {error && <p role="alert">No se pudo consultar el resumen autorizado.</p>}
            {!data && !error && <p role="status">Consultando resumen…</p>}
            {totals && (
                <>
                    <p>Ventas autorizadas: {totals.totalAmount ?? totals.sales}</p>
                    <p>Documentos autorizados: {totals.totalCount ?? totals.invoices}</p>
                    {Object.hasOwn(totals, 'profit') && <p>Utilidad autorizada: {totals.profit}</p>}
                    {data.compare && <p>Ventas autorizadas del período anterior: {data.compare.sales}</p>}
                    {data.seller &&
                        ['rif', 'ci', 'phone', 'email']
                            .filter((field) => Object.hasOwn(data.seller, field))
                            .map((field) => (
                                <p key={field}>
                                    {field}: {data.seller[field]}
                                </p>
                            ))}
                </>
            )}
        </section>
    );
}

export default function Parties({ kind: fixedKind }) {
    const { session } = useAuth();
    const allowed = (capability) => session.permissions.some((grant) => grant.capability === capability);
    const [kind, setKind] = useState(fixedKind || (allowed('clients.read') ? 'clients' : 'sellers'));
    const [stats, setStats] = useState(false);
    const [search, setSearch] = useState('');
    const [ruta, setRuta] = useState('');
    const { data: routes, error: routesError } = useSWR(kind === 'clients' ? '/api/clients/routes' : null, fetcher);
    const today = new Date().toISOString().slice(0, 10);
    const [from, setFrom] = useState(`${today.slice(0, 7)}-01`);
    const [to, setTo] = useState(today);
    const [showNoe, setShowNoe] = useState('false');
    const [query, setQuery] = useState(null);
    const [page, setPage] = useState(1);
    const [selection, setSelection] = useState(null);
    const parameters = query?.stats ? { ...query.parameters, page, limit: 20 } : query?.parameters;
    const path = query?.stats ? `${query.kind}/list` : query?.kind === 'clients' ? 'clients' : 'employees';
    const { data, error } = useSWR(query ? `/api/${path}?${new URLSearchParams(parameters)}` : null, fetcher);
    const rows = error ? undefined : Array.isArray(data) ? data : data?.data;
    const fields =
        query?.kind === 'clients'
            ? [
                  ['IdCliente', 'ID'],
                  [query?.stats ? 'Empresa' : 'name', 'Cliente'],
                  ['total_ventas', 'Ventas autorizadas'],
                  ['num_ventas', 'Documentos'],
                  ['utilidad', 'Utilidad'],
                  ['rif', 'Identificación'],
              ]
            : [
                  [query?.stats ? 'sellerId' : 'id', 'ID'],
                  ['name', 'Vendedor'],
                  ['sales', 'Ventas autorizadas'],
                  ['invoiceCount', 'Documentos'],
                  ['profit', 'Utilidad'],
                  ['rif', 'Identificación'],
                  ['ci', 'Cédula'],
                  ['phone', 'Teléfono'],
                  ['email', 'Correo'],
              ];
    const columns = fields.filter(([key]) => rows?.some((row) => Object.hasOwn(row, key)));
    return (
        <section aria-label="Directorio de clientes y vendedores" className="my-4">
            <AccessForm
                title={
                    fixedKind === 'clients'
                        ? 'Consultar clientes autorizados'
                        : fixedKind === 'sellers'
                          ? 'Consultar vendedores autorizados'
                          : 'Consultar clientes y vendedores autorizados'
                }
                button="Consultar directorio"
                onSubmit={async () => {
                    setPage(1);
                    setSelection(null);
                    setQuery({
                        kind,
                        stats,
                        parameters: stats
                            ? { from, to, showNoe, search, ...(kind === 'clients' && ruta ? { ruta } : {}) }
                            : { search },
                    });
                }}
            >
                <label htmlFor="party-kind">Directorio</label>
                <select
                    id="party-kind"
                    className="form-select"
                    value={kind}
                    onChange={(event) => setKind(event.target.value)}
                >
                    {allowed('clients.read') && (!fixedKind || fixedKind === 'clients') && (
                        <option value="clients">Clientes</option>
                    )}
                    {allowed('sellers.read') && (!fixedKind || fixedKind === 'sellers') && (
                        <option value="sellers">Vendedores</option>
                    )}
                </select>
                <Field
                    label="Buscar en directorio"
                    value={search}
                    onChange={setSearch}
                    maxLength={128}
                    required={false}
                />
                {allowed('sales.read') && (
                    <>
                        <div className="form-check my-3">
                            <input
                                className="form-check-input"
                                id="party-sales"
                                type="checkbox"
                                checked={stats}
                                onChange={(event) => setStats(event.target.checked)}
                            />
                            <label className="form-check-label" htmlFor="party-sales">
                                Incluir ventas autorizadas
                            </label>
                        </div>
                        {stats && (
                            <>
                                {kind === 'clients' && (
                                    <>
                                        <label htmlFor="party-route">Ruta del directorio</label>
                                        <select
                                            id="party-route"
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
                                        {routesError && (
                                            <p role="alert">No se pudieron cargar las rutas autorizadas.</p>
                                        )}
                                    </>
                                )}
                                <Field label="Directorio ventas desde" type="date" value={from} onChange={setFrom} />
                                <Field label="Directorio ventas hasta" type="date" value={to} onChange={setTo} />
                                <label htmlFor="party-system">Sistema del directorio</label>
                                <select
                                    id="party-system"
                                    className="form-select"
                                    value={showNoe}
                                    onChange={(event) => setShowNoe(event.target.value)}
                                >
                                    <option value="false">Facturas</option>
                                    <option value="true">Notas de entrega</option>
                                </select>
                            </>
                        )}
                    </>
                )}
            </AccessForm>
            <p>
                Los importes corresponden únicamente a las ventas cubiertas por tus permisos. El directorio no amplía
                ese alcance.
            </p>
            {query && !data && !error && <p role="status">Consultando directorio…</p>}
            {error && <p role="alert">No se pudo consultar el directorio autorizado.</p>}
            {rows && (
                <>
                    <table className="table table-dark">
                        <thead>
                            <tr>
                                {columns.map(([key, label]) => (
                                    <th key={key}>{label}</th>
                                ))}
                                {query.stats && <th>Resumen</th>}
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((row) => {
                                const id = query.kind === 'clients' ? row.IdCliente : (row.sellerId ?? row.id);
                                return (
                                    <tr key={JSON.stringify(id)}>
                                        {columns.map(([key]) => (
                                            <td key={key}>{row[key] ?? '—'}</td>
                                        ))}
                                        {query.stats && (
                                            <td>
                                                <button
                                                    type="button"
                                                    className="btn btn-outline-light"
                                                    onClick={() =>
                                                        setSelection({
                                                            kind: query.kind,
                                                            id,
                                                            name: row.Empresa || row.name,
                                                            parameters: {
                                                                from: query.parameters.from,
                                                                to: query.parameters.to,
                                                                showNoe: query.parameters.showNoe,
                                                            },
                                                        })
                                                    }
                                                >
                                                    Ver resumen de {id}
                                                </button>
                                            </td>
                                        )}
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                    {query.stats && (
                        <>
                            <p role="status">Registros autorizados: {data.total}</p>
                            <button
                                type="button"
                                className="btn btn-outline-light"
                                disabled={page === 1}
                                onClick={() => setPage(page - 1)}
                            >
                                Directorio: página anterior
                            </button>
                            <button
                                type="button"
                                className="btn btn-outline-light"
                                disabled={page * data.limit >= data.total}
                                onClick={() => setPage(page + 1)}
                            >
                                Directorio: página siguiente
                            </button>
                        </>
                    )}
                </>
            )}
            {selection && <Summary selection={selection} />}
        </section>
    );
}
