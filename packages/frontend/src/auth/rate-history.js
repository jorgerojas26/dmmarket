import { useState } from 'react';
import useSWR from 'swr';
import { fetcher } from 'swr-config';
import { AccessForm, Field } from './forms';

export default function RateHistory() {
    const today = new Date().toISOString().slice(0, 10);
    const [from, setFrom] = useState(today);
    const [to, setTo] = useState(today);
    const [date, setDate] = useState(today);
    const [query, setQuery] = useState(null);
    const [requested, setRequested] = useState(null);
    const { data: status, error: statusError } = useSWR('/api/currency_rates/bcv/status', fetcher);
    const { data, error } = useSWR(query ? `/api/currency_rates/bcv?${new URLSearchParams(query)}` : null, fetcher);
    const { data: lookup, error: lookupError } = useSWR(
        requested ? `/api/currency_rates/bcv/${requested}` : null,
        fetcher,
    );
    return (
        <section aria-label="Historial BCV autorizado">
            <p>
                La tasa BCV es el historial oficial capturado. No sustituye la referencia vigente del sistema de ventas
                ni aplica automáticamente tasas históricas a los abonos.
            </p>
            {statusError && <p role="alert">No se pudo validar el estado del historial BCV.</p>}
            {status && !statusError && (
                <>
                    <p>
                        Última tasa vigente:{' '}
                        {status.ultimaTasa ? `${status.ultimaTasa.tasa} — ${status.ultimaTasa.fecha}` : 'No disponible'}
                    </p>
                    <p>
                        Última tasa publicada:{' '}
                        {status.ultimaPublicada
                            ? `${status.ultimaPublicada.tasa} — ${status.ultimaPublicada.fecha}`
                            : 'No disponible'}
                    </p>
                    {!status.disponible && <p>El historial requiere preparar su tabla antes de consultar.</p>}
                </>
            )}
            <AccessForm
                title="Consultar historial BCV"
                button="Consultar historial BCV"
                onSubmit={async () => {
                    if (!status?.disponible || statusError) throw new Error('El historial BCV no está disponible.');
                    setQuery({ from, to });
                }}
            >
                <Field label="Historial BCV desde" type="date" value={from} onChange={setFrom} />
                <Field label="Historial BCV hasta" type="date" value={to} onChange={setTo} />
            </AccessForm>
            {query && !data && !error && <p role="status">Consultando historial BCV…</p>}
            {error && <p role="alert">No se pudo consultar el historial autorizado.</p>}
            {data && !error && (
                <table aria-label="Tasas BCV autorizadas" className="table table-dark">
                    <thead>
                        <tr>
                            <th>Fecha valor</th>
                            <th>Tasa BCV</th>
                        </tr>
                    </thead>
                    <tbody>
                        {data.map((row) => (
                            <tr key={row.fecha}>
                                <td>{row.fecha}</td>
                                <td>{row.tasa}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
            <AccessForm
                title="Consultar tasa vigente para una fecha"
                button="Consultar tasa por fecha"
                onSubmit={async () => setRequested(date)}
            >
                <Field label="Fecha de tasa BCV" type="date" value={date} onChange={setDate} />
            </AccessForm>
            {lookupError && <p role="alert">No hay una tasa disponible para la fecha solicitada.</p>}
            {lookup && !lookupError && (
                <p>
                    Tasa aplicable al {lookup.solicitada}: {lookup.tasa}; fecha publicada: {lookup.fecha};{' '}
                    {lookup.exacta ? 'publicación exacta' : 'última publicación anterior'}.
                </p>
            )}
        </section>
    );
}
