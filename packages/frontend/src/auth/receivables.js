import { useState } from 'react';
import useSWR from 'swr';
import { fetcher } from 'swr-config';
import { AccessForm, Field } from './forms';

function Account({ client, onClose }) {
    const [page, setPage] = useState(1);
    const [timelinePage, setTimelinePage] = useState(1);
    const [documents, setDocuments] = useState('pending');
    const { data, error } = useSWR(
        `/api/receivables/${encodeURIComponent(client.id)}?${new URLSearchParams({ page, timelinePage, documents })}`,
        fetcher,
    );
    return (
        <section aria-label="Cuenta de cobranza autorizada" className="card bg-dark border-secondary p-3 my-3">
            <h3 className="h5">{client.name}</h3>
            <button type="button" className="btn btn-outline-light" onClick={onClose}>
                Cerrar cuenta de cobranza
            </button>
            {error && <p role="alert">No se pudo consultar la cuenta autorizada.</p>}
            {!data && !error && <p role="status">Consultando cuenta de cobranza…</p>}
            {data && !error && (
                <>
                    <p>Saldo completo del cliente (USD): {data.summary.balance}</p>
                    <p>Saldo vencido (USD): {data.summary.overdue}</p>
                    {Object.hasOwn(data.client, 'rif') && <p>Identificación autorizada: {data.client.rif}</p>}
                    {data.client.unregistered && (
                        <p>
                            Cliente sin ficha actual. Se conserva la deuda histórica; no se habilitan operaciones sobre
                            esta cuenta.
                        </p>
                    )}
                    <label htmlFor="receivable-documents">Documentos de cobranza</label>
                    <select
                        id="receivable-documents"
                        className="form-select"
                        value={documents}
                        onChange={(event) => {
                            setDocuments(event.target.value);
                            setPage(1);
                        }}
                    >
                        <option value="pending">Pendientes cobrables</option>
                        <option value="all">Todos los documentos USD</option>
                    </select>
                    <div className="table-responsive">
                        <table aria-label="Documentos autorizados de cobranza" className="table table-dark">
                            <thead>
                                <tr>
                                    <th>Venta</th>
                                    <th>Vencimiento</th>
                                    <th>Original USD</th>
                                    <th>Saldo USD</th>
                                    <th>Abonado USD</th>
                                    <th>Cierre USD</th>
                                    <th>Estado</th>
                                </tr>
                            </thead>
                            <tbody>
                                {data.documents.data.map((row) => (
                                    <tr key={row.id}>
                                        <td>{row.sale}</td>
                                        <td>{row.due ?? 'Sin vencimiento'}</td>
                                        <td>{row.original}</td>
                                        <td>{row.balance}</td>
                                        <td>{row.applied}</td>
                                        <td>{row.closed}</td>
                                        <td>{row.status}</td>
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
                        Deuda: página anterior
                    </button>
                    <button
                        type="button"
                        className="btn btn-outline-light"
                        disabled={page * data.documents.limit >= data.documents.total}
                        onClick={() => setPage(page + 1)}
                    >
                        Deuda: página siguiente
                    </button>
                    <h4 className="h6">Historial de cobranza del cliente</h4>
                    <div className="table-responsive">
                        <table aria-label="Movimientos autorizados de cobranza" className="table table-dark">
                            <thead>
                                <tr>
                                    <th>Tipo</th>
                                    <th>Fecha</th>
                                    <th>Importe</th>
                                    <th>Moneda</th>
                                    <th>Equivalente USD</th>
                                    <th>Motivo</th>
                                </tr>
                            </thead>
                            <tbody>
                                {data.timeline.data.map((row) => (
                                    <tr key={row.eventId}>
                                        <td>{row.type}</td>
                                        <td>{row.date}</td>
                                        <td>{row.amount ?? row.data?.base ?? 'No aplica'}</td>
                                        <td>{row.currency ?? 'USD'}</td>
                                        <td>{row.base ?? row.data?.base ?? 'No aplica'}</td>
                                        <td>{row.voidReason || row.reason || 'Sin motivo registrado'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <button
                        type="button"
                        className="btn btn-outline-light"
                        disabled={timelinePage === 1}
                        onClick={() => setTimelinePage(timelinePage - 1)}
                    >
                        Movimientos: página anterior
                    </button>
                    <button
                        type="button"
                        className="btn btn-outline-light"
                        disabled={timelinePage * data.timeline.limit >= data.timeline.total}
                        onClick={() => setTimelinePage(timelinePage + 1)}
                    >
                        Movimientos: página siguiente
                    </button>
                </>
            )}
        </section>
    );
}

export default function Receivables() {
    const [search, setSearch] = useState('');
    const [ruta, setRoute] = useState('');
    const [state, setState] = useState('debt');
    const [due, setDue] = useState('all');
    const [query, setQuery] = useState({ state: 'debt', due: 'all' });
    const [page, setPage] = useState(1);
    const [selected, setSelected] = useState(null);
    const { data, error } = useSWR(`/api/receivables?${new URLSearchParams({ ...query, page, limit: 20 })}`, fetcher);
    return (
        <section aria-label="Cartera de cobranza autorizada">
            <AccessForm
                title="Consultar cartera autorizada"
                button="Consultar cartera"
                onSubmit={async () => {
                    setPage(1);
                    setSelected(null);
                    setQuery({ search, state, due, ...(ruta ? { ruta } : {}) });
                }}
            >
                <Field
                    label="Buscar cliente en cartera"
                    value={search}
                    onChange={setSearch}
                    required={false}
                    maxLength={100}
                />
                <Field label="Ruta de cartera" value={ruta} onChange={setRoute} required={false} maxLength={10} />
                <label htmlFor="receivables-state">Estado de cartera</label>
                <select
                    id="receivables-state"
                    className="form-select"
                    value={state}
                    onChange={(event) => setState(event.target.value)}
                >
                    <option value="debt">Con deuda</option>
                    <option value="settled">Sin saldo pendiente</option>
                    <option value="all">Todos</option>
                </select>
                <label htmlFor="receivables-due">Vencimiento de cartera</label>
                <select
                    id="receivables-due"
                    className="form-select"
                    value={due}
                    onChange={(event) => setDue(event.target.value)}
                >
                    <option value="all">Todos</option>
                    <option value="overdue">Con deuda vencida</option>
                    <option value="upcoming">Sin deuda vencida</option>
                </select>
            </AccessForm>
            <p>
                Acceso global exclusivo de cobranza autorizada. La cuenta incluye la deuda completa del cliente, aunque
                sus ventas pertenezcan a distintos vendedores. Los permisos de ventas no recortan esta cartera.
            </p>
            <p>
                Las operaciones financieras permanecen deshabilitadas hasta validar su preparación transaccional y
                habilitación explícita.
            </p>
            {!data && !error && <p role="status">Consultando cartera…</p>}
            {error && (
                <p role="alert">No se pudo consultar la cartera autorizada. No se mostrarán saldos sin validación.</p>
            )}
            {data && !error && (
                <>
                    <p>
                        Totales de cartera de la ruta seleccionada, independientes de la búsqueda: saldo USD{' '}
                        {data.summary.balance}; vencido USD {data.summary.overdue}; clientes con deuda{' '}
                        {data.summary.debtors}.
                    </p>
                    <p role="status">Cuentas autorizadas encontradas: {data.total}</p>
                    <div className="table-responsive">
                        <table aria-label="Cartera autorizada" className="table table-dark">
                            <thead>
                                <tr>
                                    <th>Cliente</th>
                                    <th>Saldo USD</th>
                                    <th>Vencido USD</th>
                                    <th>Documentos pendientes</th>
                                    <th>Último abono</th>
                                    <th>Detalle</th>
                                </tr>
                            </thead>
                            <tbody>
                                {data.data.map((row) => (
                                    <tr key={row.id}>
                                        <td>{row.name}</td>
                                        <td>{row.balance}</td>
                                        <td>{row.overdue}</td>
                                        <td>{row.pendingCount}</td>
                                        <td>{row.lastPayment ?? 'Sin abono registrado'}</td>
                                        <td>
                                            <button
                                                type="button"
                                                className="btn btn-outline-light"
                                                onClick={() => setSelected(row)}
                                            >
                                                Abrir cuenta {row.id}
                                            </button>
                                        </td>
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
                        Cartera: página anterior
                    </button>
                    <button
                        type="button"
                        className="btn btn-outline-light"
                        disabled={page * data.limit >= data.total}
                        onClick={() => setPage(page + 1)}
                    >
                        Cartera: página siguiente
                    </button>
                </>
            )}
            {selected && <Account key={selected.id} client={selected} onClose={() => setSelected(null)} />}
        </section>
    );
}
