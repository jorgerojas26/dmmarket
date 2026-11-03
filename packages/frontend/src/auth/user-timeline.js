import { Link } from 'react-router-dom';
import useSWR from 'swr';
import { fetcher } from 'swr-config';
import { auditActivity } from './audit-events';

const LIMIT = 8;
const day = 86400000;
const to = new Date().toISOString().slice(0, 10);
const from = new Date(Date.now() - 365 * day).toISOString().slice(0, 10);
const outcomes = { success: 'Correcto', failure: 'Fallido' };
const clock = new Intl.DateTimeFormat('es-VE', { hour: 'numeric', minute: '2-digit', hour12: true });
const shortDate = new Intl.DateTimeFormat('es-VE', { day: 'numeric', month: 'short' });
const longDate = new Intl.DateTimeFormat('es-VE', { day: 'numeric', month: 'short', year: 'numeric' });

function friendlyDate(timestamp) {
    const date = new Date(Number(timestamp));
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    const time = clock.format(date);
    if (date.toDateString() === today.toDateString()) return `Hoy, ${time}`;
    if (date.toDateString() === yesterday.toDateString()) return `Ayer, ${time}`;
    const day = date.getFullYear() === today.getFullYear() ? shortDate : longDate;
    return `${day.format(date)}, ${time}`;
}

function context(event, user) {
    const parts = [];
    if (event.actorId && event.actorId !== user.id)
        parts.push(`por ${event.actorName || event.actorUsername || 'cuenta no disponible'}`);
    if (event.roleId) parts.push(`rol ${event.roleName || 'no disponible'}`);
    return parts.join(' · ');
}

export default function UserTimeline({ user }) {
    const { data, error, isLoading } = useSWR(
        `/api/auth/audit?from=${from}&to=${to}&limit=${LIMIT}&targetId=${user.id}`,
        fetcher,
    );
    const events = data?.data || [];
    return (
        <section className="access-timeline" aria-labelledby="user-timeline-title">
            <header className="access-section-head">
                <div>
                    <h3 id="user-timeline-title">Actividad</h3>
                </div>
                <Link
                    className="btn btn-outline-light"
                    to={{
                        pathname: '/acceso',
                        hash: '#auditoria',
                        state: {
                            audit: {
                                filters: { targetId: user.id },
                                labels: { targetId: user.display_name || user.username },
                            },
                        },
                    }}
                >
                    Ver en auditoría
                </Link>
            </header>
            {isLoading ? (
                <p className="access-timeline-empty" role="status">
                    Cargando actividad…
                </p>
            ) : error ? (
                <p className="access-timeline-empty" role="alert">
                    No se pudo cargar la actividad de esta cuenta.
                </p>
            ) : events.length ? (
                <ol className="access-timeline-list">
                    {events.map((event) => {
                        const detail = context(event, user);
                        return (
                            <li key={event.id} className="access-timeline-item" data-outcome={event.outcome}>
                                <span className="visually-hidden">{outcomes[event.outcome] || event.outcome}. </span>
                                <p className="access-timeline-row">
                                    <Link className="access-timeline-link" to={`/acceso/auditoria/${event.id}`}>
                                        {auditActivity(event.action)}
                                    </Link>
                                    <time dateTime={new Date(Number(event.occurredMs)).toISOString()}>
                                        {friendlyDate(event.occurredMs)}
                                    </time>
                                </p>
                                {detail && <p className="access-timeline-context">{detail}</p>}
                            </li>
                        );
                    })}
                </ol>
            ) : (
                <p className="access-timeline-empty">Sin actividad registrada en el último año.</p>
            )}
        </section>
    );
}
