import { useState } from 'react';
import useSWR from 'swr';
import { fetcher } from 'swr-config';
import { AccessForm, Field } from './forms';

export default function Audit() {
    const today = new Date().toISOString().slice(0, 10);
    const [from, setFrom] = useState(`${today.slice(0, 7)}-01`);
    const [to, setTo] = useState(today);
    const [actorId, setActor] = useState('');
    const [targetId, setTarget] = useState('');
    const [roleId, setRole] = useState('');
    const [action, setAction] = useState('');
    const [outcome, setOutcome] = useState('');
    const [query, setQuery] = useState(null);
    const [page, setPage] = useState(1);
    const { data, error } = useSWR(
        query ? `/api/auth/audit?${new URLSearchParams({ ...query, page, limit: 20 })}` : null,
        fetcher,
    );
    return (
        <section aria-label="Consulta autorizada de auditoría">
            <AccessForm
                title="Consultar historial autorizado"
                button="Consultar auditoría"
                onSubmit={async () => {
                    setPage(1);
                    setQuery({
                        from,
                        to,
                        ...Object.fromEntries(
                            Object.entries({ actorId, targetId, roleId, action, outcome }).filter(([, value]) => value),
                        ),
                    });
                }}
            >
                <Field label="Auditoría desde (UTC)" type="date" value={from} onChange={setFrom} />
                <Field label="Auditoría hasta (UTC)" type="date" value={to} onChange={setTo} />
                <Field
                    label="ID del actor de auditoría"
                    value={actorId}
                    onChange={setActor}
                    required={false}
                    maxLength={36}
                />
                <Field
                    label="ID de cuenta objetivo de auditoría"
                    value={targetId}
                    onChange={setTarget}
                    required={false}
                    maxLength={36}
                />
                <Field
                    label="ID de rol objetivo de auditoría"
                    value={roleId}
                    onChange={setRole}
                    required={false}
                    maxLength={36}
                />
                <Field
                    label="Acción exacta de auditoría"
                    value={action}
                    onChange={setAction}
                    required={false}
                    maxLength={64}
                />
                <label htmlFor="audit-outcome">Resultado de auditoría</label>
                <select
                    id="audit-outcome"
                    className="form-select"
                    value={outcome}
                    onChange={(event) => setOutcome(event.target.value)}
                >
                    <option value="">Todos</option>
                    <option value="success">Correcto</option>
                    <option value="failure">Fallido</option>
                </select>
            </AccessForm>
            <p>
                Consulta de sólo lectura. Las fechas y horas se expresan en UTC. El historial identifica cuentas y roles
                por sus IDs; no entrega contraseñas, hashes ni secretos de sesión.
            </p>
            {query && !data && !error && <p role="status">Consultando auditoría…</p>}
            {error && <p role="alert">No se pudo consultar el historial autorizado.</p>}
            {data && !error && (
                <>
                    <p role="status">Eventos autorizados: {data.total}</p>
                    <div className="table-responsive">
                        <table aria-label="Historial autorizado" className="table table-dark">
                            <thead>
                                <tr>
                                    <th>Fecha UTC</th>
                                    <th>Acción</th>
                                    <th>Resultado</th>
                                    <th>Actor</th>
                                    <th>Cuenta objetivo</th>
                                    <th>Rol objetivo</th>
                                    <th>Motivo</th>
                                </tr>
                            </thead>
                            <tbody>
                                {data.data.map((row) => (
                                    <tr key={row.id}>
                                        <td>{new Date(Number(row.occurredMs)).toISOString()}</td>
                                        <td>{row.action}</td>
                                        <td>
                                            {row.outcome === 'success'
                                                ? 'Correcto'
                                                : row.outcome === 'failure'
                                                  ? 'Fallido'
                                                  : row.outcome}
                                        </td>
                                        <td className="text-break">{row.actorId ?? 'Sin actor de cuenta'}</td>
                                        <td className="text-break">{row.targetId ?? 'Sin cuenta objetivo'}</td>
                                        <td className="text-break">{row.roleId ?? 'Sin rol objetivo'}</td>
                                        <td>{row.reason ?? 'Sin motivo registrado'}</td>
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
                        Auditoría: página anterior
                    </button>
                    <button
                        type="button"
                        className="btn btn-outline-light"
                        disabled={page * data.limit >= data.total}
                        onClick={() => setPage(page + 1)}
                    >
                        Auditoría: página siguiente
                    </button>
                </>
            )}
        </section>
    );
}
