import { useState } from 'react';
import useSWR from 'swr';
import { fetcher } from 'swr-config';
import CommissionEditor from './commission-editor';
import { useAuth } from './context';
import { AccessForm, Field } from './forms';

export default function Commissions() {
    const { session, can } = useAuth();
    const sales = session.permissions.some((grant) => grant.capability === 'sales.read');
    const [employeeId, setEmployee] = useState('');
    const [kind, setKind] = useState('rates');
    const today = new Date().toISOString().slice(0, 10);
    const [from, setFrom] = useState(`${today.slice(0, 7)}-01`);
    const [to, setTo] = useState(today);
    const [query, setQuery] = useState(null);
    const [page, setPage] = useState(1);
    const { data, error, mutate } = useSWR(
        query
            ? `/api/employees/${query.kind === 'rates' ? 'commissionInfo' : 'sales'}/${encodeURIComponent(query.employeeId)}${query.kind === 'sales' ? `?${new URLSearchParams({ from: query.from, to: query.to, page, limit: 20 })}` : ''}`
            : null,
        fetcher,
    );
    const { data: readiness, error: readinessError } = useSWR(
        query?.kind === 'rates' && can('commissions.update')
            ? `/api/employees/commissionInfo/${encodeURIComponent(query.employeeId)}/status`
            : null,
        fetcher,
    );
    const financial = data?.data?.some((row) => Object.hasOwn(row, 'utilidad'));
    return (
        <section aria-label="Consulta autorizada de comisiones">
            <AccessForm
                title="Consultar comisiones autorizadas"
                button="Consultar comisiones"
                onSubmit={async () => {
                    setPage(1);
                    setQuery({ employeeId, kind, from, to });
                }}
            >
                <Field
                    label="ID del vendedor para comisiones"
                    value={employeeId}
                    onChange={setEmployee}
                    maxLength={32}
                />
                <label htmlFor="commission-view">Vista de comisiones</label>
                <select
                    id="commission-view"
                    className="form-select"
                    value={kind}
                    onChange={(event) => setKind(event.target.value)}
                >
                    <option value="rates">Porcentajes actuales</option>
                    {sales && <option value="sales">Ventas e histórico capturado</option>}
                </select>
                {kind === 'sales' && (
                    <>
                        <Field label="Comisiones desde" type="date" value={from} onChange={setFrom} />
                        <Field label="Comisiones hasta" type="date" value={to} onChange={setTo} />
                    </>
                )}
            </AccessForm>
            <p>
                La edición requiere permiso explícito y almacenamiento preparado. El histórico disponible corresponde
                únicamente al sistema Facturas; no se reutiliza para notas de entrega.
            </p>
            <p>
                La comisión se calcula con el histórico capturado y el grupo actual del producto. Si falta información o
                hay registros ambiguos, se muestra como no disponible, no como cero.
            </p>
            {query && !data && !error && <p role="status">Consultando comisiones…</p>}
            {error && <p role="alert">No se pudieron consultar las comisiones para este vendedor y alcance.</p>}
            {data &&
                !error &&
                (query.kind === 'rates' ? (
                    <table aria-label="Porcentajes autorizados de comisión" className="table table-dark">
                        <thead>
                            <tr>
                                <th>Grupo</th>
                                <th>Porcentaje actual</th>
                            </tr>
                        </thead>
                        <tbody>
                            {data.map((row) => (
                                <tr key={row.groupId}>
                                    <td>{row.group}</td>
                                    <td>{row.commission ?? 'No disponible'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                ) : (
                    <>
                        <p role="status">Ventas autorizadas con comisiones: {data.pagination.total}</p>
                        <div className="table-responsive">
                            <table aria-label="Histórico autorizado de comisiones" className="table table-dark">
                                <thead>
                                    <tr>
                                        <th>Documento</th>
                                        <th>Cliente</th>
                                        <th>Fecha</th>
                                        <th>Total Ventas autorizado</th>
                                        <th>Comisión calculada</th>
                                        {financial && <th>Utilidad autorizada</th>}
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.data.map((row) => (
                                        <tr key={row.invoiceId}>
                                            <td>{row.invoiceId}</td>
                                            <td>{row.client}</td>
                                            <td>{row.createdAt}</td>
                                            <td>{row.invoiceTotal ?? 'No disponible'}</td>
                                            <td>{row.commissionTotal ?? 'No disponible'}</td>
                                            {financial && <td>{row.utilidad ?? 'No disponible'}</td>}
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
                            Comisiones: página anterior
                        </button>
                        <button
                            type="button"
                            className="btn btn-outline-light"
                            disabled={page * data.pagination.limit >= data.pagination.total}
                            onClick={() => setPage(page + 1)}
                        >
                            Comisiones: página siguiente
                        </button>
                    </>
                ))}
            {query?.kind === 'rates' &&
                data &&
                !error &&
                can('commissions.update') &&
                (readiness?.writesAvailable && !readinessError ? (
                    <CommissionEditor employeeId={query.employeeId} groups={data} onSaved={() => mutate()} />
                ) : (
                    <p>
                        La edición de porcentajes no está disponible porque no se ha validado su almacenamiento
                        transaccional.
                    </p>
                ))}
        </section>
    );
}
