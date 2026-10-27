import DateRangePicker from 'components/DateRangePicker';
import useSWR from 'hooks/swr-wrapper';
import { useEffect, useState } from 'react';
import { fetcher } from 'swr-config';
import { AccessDialog, LoadState, Pagination } from './access-ui';
import { auditActivities, auditActivity, auditDate } from './audit-events';
import './access.css';
import './audit.css';

function initialFilters() {
    const today = new Date().toISOString().slice(0, 10);
    return { from: `${today.slice(0, 7)}-01`, to: today, search: '', action: '', outcome: '', page: 1 };
}

function Outcome({ value }) {
    return (
        <span
            className={`audit-outcome${value === 'success' ? ' is-success' : value === 'failure' ? ' is-failure' : ''}`}
        >
            {value === 'success' ? 'Correcto' : value === 'failure' ? 'Fallido' : value}
        </span>
    );
}

function EventDetail({ event, onClose, onFilter }) {
    const reference = /^[a-f0-9-]{36}$/i.test(event.reason || '');
    return (
        <AccessDialog title="Detalle del evento" panel onClose={onClose}>
            <div className="audit-detail-heading">
                <span className="access-eyebrow">Historial de actividad</span>
                <h3>{auditActivity(event.action)}</h3>
                <Outcome value={event.outcome} />
                <p>
                    {auditDate(event.occurredMs)} · {auditDate(event.occurredMs, true)} UTC
                </p>
            </div>
            <dl className="audit-detail-fields">
                <div>
                    <dt>Responsable</dt>
                    <dd>
                        <strong>
                            {event.actorName ||
                                (event.actorId ? 'Cuenta no disponible' : 'Sin responsable identificado')}
                        </strong>
                        {event.actorUsername && <span>@{event.actorUsername}</span>}
                        {event.actorId && <code>{event.actorId}</code>}
                    </dd>
                </div>
                <div>
                    <dt>Cuenta afectada</dt>
                    <dd>
                        <strong>{event.targetName || (event.targetId ? 'Cuenta no disponible' : 'No aplica')}</strong>
                        {event.targetUsername && <span>@{event.targetUsername}</span>}
                        {event.targetId && <code>{event.targetId}</code>}
                    </dd>
                </div>
                <div>
                    <dt>Rol afectado</dt>
                    <dd>
                        <strong>{event.roleName || (event.roleId ? 'Rol no disponible' : 'No aplica')}</strong>
                        {event.roleId && <code>{event.roleId}</code>}
                    </dd>
                </div>
                <div>
                    <dt>{reference ? 'Referencia de operación' : 'Motivo registrado'}</dt>
                    <dd className="audit-reason">{event.reason || 'Sin motivo registrado'}</dd>
                </div>
            </dl>
            <p className="access-muted audit-detail-note">
                Los nombres corresponden a los registros actuales. Los identificadores permiten reconocer las cuentas y
                roles del evento original.
            </p>
            <div className="audit-detail-filters">
                <h4>Continuar la consulta</h4>
                {event.actorId && (
                    <button
                        type="button"
                        onClick={() =>
                            onFilter(
                                'actorId',
                                event.actorId,
                                event.actorName || event.actorUsername || 'Cuenta no disponible',
                            )
                        }
                    >
                        Ver actividad de esta persona <span aria-hidden="true">→</span>
                    </button>
                )}
                {event.targetId && (
                    <button
                        type="button"
                        onClick={() =>
                            onFilter(
                                'targetId',
                                event.targetId,
                                event.targetName || event.targetUsername || 'Cuenta no disponible',
                            )
                        }
                    >
                        Ver eventos de esta cuenta <span aria-hidden="true">→</span>
                    </button>
                )}
                {event.roleId && (
                    <button
                        type="button"
                        onClick={() => onFilter('roleId', event.roleId, event.roleName || 'Rol no disponible')}
                    >
                        Ver eventos de este rol <span aria-hidden="true">→</span>
                    </button>
                )}
                <button type="button" onClick={() => onFilter('action', event.action)}>
                    Ver eventos de esta actividad <span aria-hidden="true">→</span>
                </button>
            </div>
            <details className="audit-technical">
                <summary>Referencia técnica</summary>
                <dl className="audit-detail-fields">
                    <div>
                        <dt>Código de actividad</dt>
                        <dd>
                            <code>{event.action}</code>
                        </dd>
                    </div>
                    <div>
                        <dt>ID del evento</dt>
                        <dd>
                            <code>{event.id}</code>
                        </dd>
                    </div>
                    <div>
                        <dt>Fecha exacta (UTC)</dt>
                        <dd>
                            <code>{new Date(Number(event.occurredMs)).toISOString()}</code>
                        </dd>
                    </div>
                </dl>
            </details>
        </AccessDialog>
    );
}

export default function Audit() {
    const [filters, setFilters] = useState(initialFilters);
    const [search, setSearch] = useState('');
    const [entityLabels, setEntityLabels] = useState({});
    const [selected, setSelected] = useState(null);
    const [calendarKey, setCalendarKey] = useState(0);
    useEffect(() => {
        const timer = setTimeout(() => {
            setFilters((previous) =>
                previous.search === search.trim() ? previous : { ...previous, search: search.trim(), page: 1 },
            );
        }, 300);
        return () => clearTimeout(timer);
    }, [search]);
    const query = Object.fromEntries(Object.entries({ ...filters, limit: 20 }).filter(([, value]) => value !== ''));
    const span = Date.parse(filters.to) - Date.parse(filters.from);
    const rangeError = !Number.isFinite(span) || span < 0 || span > 366 * 86400000;
    const { data, error, isLoading, isValidating, mutate } = useSWR(
        rangeError ? null : `/api/auth/audit?${new URLSearchParams(query)}`,
        fetcher,
    );
    const change = (next) => setFilters((previous) => ({ ...previous, ...next, page: 1 }));
    const clear = () => {
        setSearch('');
        setFilters(initialFilters());
        setEntityLabels({});
        setCalendarKey((value) => value + 1);
    };
    const focused = [
        ['actorId', 'Responsable', 'Quitar filtro de responsable'],
        ['targetId', 'Cuenta', 'Quitar filtro de cuenta'],
        ['roleId', 'Rol', 'Quitar filtro de rol'],
    ];
    const defaultPeriod = initialFilters();
    const hasFilters = Boolean(
        search ||
            filters.action ||
            filters.outcome ||
            focused.some(([key]) => filters[key]) ||
            filters.from !== defaultPeriod.from ||
            filters.to !== defaultPeriod.to,
    );
    const unknownAction = filters.action && auditActivity(filters.action) === 'Evento del sistema';
    return (
        <section aria-label="Consulta autorizada de auditoría" className="clientes-layout audit-layout p-0">
            <div className="clientes-content access-content">
                <div className="access-workspace audit-workspace">
                    <header className="access-header audit-header">
                        <div>
                            <span className="access-eyebrow">Seguridad y seguimiento</span>
                            <h2>Auditoría</h2>
                            <p>Consulta quién hizo qué y cuándo. Un historial de solo lectura.</p>
                        </div>
                        <div className="audit-header-actions">
                            <DateRangePicker
                                key={calendarKey}
                                initialFrom={filters.from}
                                initialTo={filters.to}
                                onChange={change}
                            />
                            <button
                                type="button"
                                className="btn btn-outline-light audit-refresh"
                                aria-label="Actualizar historial"
                                disabled={rangeError || isValidating}
                                onClick={() => mutate()}
                            >
                                <svg
                                    width="17"
                                    height="17"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="1.8"
                                    aria-hidden="true"
                                >
                                    <path d="M20 7v5h-5M4 17v-5h5" />
                                    <path d="M6 7a7 7 0 0 1 12-2l2 3M18 17a7 7 0 0 1-12 2l-2-3" />
                                </svg>
                            </button>
                        </div>
                    </header>
                    <div className="access-card audit-card">
                        <div className="audit-toolbar">
                            <div className="audit-search">
                                <svg
                                    width="18"
                                    height="18"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="1.8"
                                    aria-hidden="true"
                                >
                                    <circle cx="10.5" cy="10.5" r="6.5" />
                                    <path d="m16 16 5 5" />
                                </svg>
                                <input
                                    type="search"
                                    className="form-control"
                                    aria-label="Buscar en el historial"
                                    placeholder="Buscar persona, usuario o motivo…"
                                    value={search}
                                    maxLength={128}
                                    onChange={(event) => setSearch(event.target.value)}
                                />
                            </div>
                            <div className="audit-filter-field">
                                <label htmlFor="audit-action">Actividad</label>
                                <select
                                    id="audit-action"
                                    className="form-select"
                                    value={filters.action}
                                    onChange={(event) => change({ action: event.target.value })}
                                >
                                    <option value="">Todas</option>
                                    {auditActivities.map((group) => (
                                        <optgroup key={group.label} label={group.label}>
                                            {Object.entries(group.actions).map(([value, label]) => (
                                                <option key={value} value={value}>
                                                    {label}
                                                </option>
                                            ))}
                                        </optgroup>
                                    ))}
                                    {unknownAction && (
                                        <option value={filters.action}>Evento del sistema ({filters.action})</option>
                                    )}
                                </select>
                            </div>
                            <div className="audit-filter-field audit-result-filter">
                                <label htmlFor="audit-outcome">Resultado</label>
                                <select
                                    id="audit-outcome"
                                    className="form-select"
                                    value={filters.outcome}
                                    onChange={(event) => change({ outcome: event.target.value })}
                                >
                                    <option value="">Todos</option>
                                    <option value="success">Correcto</option>
                                    <option value="failure">Fallido</option>
                                </select>
                            </div>
                        </div>
                        <div className="audit-results-heading">
                            <span role="status" aria-live="polite">
                                {isLoading
                                    ? 'Consultando historial…'
                                    : data
                                      ? `${data.total} ${data.total === 1 ? 'evento' : 'eventos'}`
                                      : 'Historial de actividad'}
                            </span>
                            {isValidating && data && <span className="access-muted">Actualizando…</span>}
                            {hasFilters && (
                                <button type="button" onClick={clear}>
                                    Limpiar filtros
                                </button>
                            )}
                        </div>
                        {focused.some(([key]) => filters[key]) && (
                            <div className="audit-focused-filters">
                                {focused
                                    .filter(([key]) => filters[key])
                                    .map(([key, label, ariaLabel]) => (
                                        <button
                                            key={key}
                                            type="button"
                                            className="access-chip"
                                            aria-label={ariaLabel}
                                            onClick={() => change({ [key]: '' })}
                                        >
                                            {label}: {entityLabels[key]} <span aria-hidden="true">×</span>
                                        </button>
                                    ))}
                            </div>
                        )}
                        {rangeError ? (
                            <p role="alert" className="access-empty">
                                Selecciona un período de hasta 367 días, con la fecha inicial anterior a la final.
                            </p>
                        ) : (
                            <LoadState error={error} loading={!data && !error} onRetry={mutate}>
                                {data?.total === 0 ? (
                                    <div className="access-empty audit-empty">
                                        <span aria-hidden="true">◇</span>
                                        <h3>No hay eventos que coincidan</h3>
                                        <p>Prueba otro período o ajusta los filtros de la consulta.</p>
                                        {hasFilters && (
                                            <button type="button" className="btn btn-outline-light" onClick={clear}>
                                                Restablecer consulta
                                            </button>
                                        )}
                                    </div>
                                ) : (
                                    data && (
                                        <>
                                            <div className="access-table-scroll">
                                                <table
                                                    className="access-table audit-table"
                                                    aria-label="Historial de actividad"
                                                >
                                                    <thead>
                                                        <tr>
                                                            <th scope="col">
                                                                Fecha y hora <span>UTC</span>
                                                            </th>
                                                            <th scope="col">Actividad</th>
                                                            <th scope="col">Responsable</th>
                                                            <th scope="col">Resultado</th>
                                                            <th scope="col">
                                                                <span className="visually-hidden">Detalle</span>
                                                            </th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {data.data.map((event) => (
                                                            <tr key={event.id}>
                                                                <td className="audit-timestamp">
                                                                    <time
                                                                        dateTime={new Date(
                                                                            Number(event.occurredMs),
                                                                        ).toISOString()}
                                                                    >
                                                                        {auditDate(event.occurredMs)}
                                                                    </time>
                                                                    <span>{auditDate(event.occurredMs, true)}</span>
                                                                </td>
                                                                <td>
                                                                    <button
                                                                        type="button"
                                                                        className="audit-event-link"
                                                                        onClick={() => setSelected(event)}
                                                                    >
                                                                        {auditActivity(event.action)}
                                                                    </button>
                                                                    <span className="audit-event-target">
                                                                        {event.roleId
                                                                            ? `Rol: ${event.roleName || 'No disponible'}`
                                                                            : event.targetId
                                                                              ? `Cuenta: ${event.targetName || event.targetUsername || 'No disponible'}`
                                                                              : 'Sin cuenta o rol asociado'}
                                                                    </span>
                                                                </td>
                                                                <td>
                                                                    <span className="audit-person">
                                                                        {event.actorName ||
                                                                            event.actorUsername ||
                                                                            (event.actorId
                                                                                ? 'Cuenta no disponible'
                                                                                : 'Sin responsable identificado')}
                                                                    </span>
                                                                    {event.actorUsername && (
                                                                        <span className="audit-person-username">
                                                                            @{event.actorUsername}
                                                                        </span>
                                                                    )}
                                                                </td>
                                                                <td>
                                                                    <Outcome value={event.outcome} />
                                                                </td>
                                                                <td>
                                                                    <button
                                                                        type="button"
                                                                        className="audit-open-detail"
                                                                        aria-label={`Ver detalle: ${auditActivity(event.action)}`}
                                                                        onClick={() => setSelected(event)}
                                                                    >
                                                                        <span aria-hidden="true">→</span>
                                                                    </button>
                                                                </td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                            <Pagination
                                                page={data.page}
                                                limit={data.limit}
                                                total={data.total}
                                                onChange={(page) => setFilters((previous) => ({ ...previous, page }))}
                                            />
                                        </>
                                    )
                                )}
                            </LoadState>
                        )}
                    </div>
                    <p className="audit-footnote">
                        Más recientes primero · Fechas y horas en UTC · No permite modificar ni eliminar eventos.
                    </p>
                </div>
            </div>
            {selected && (
                <EventDetail
                    event={selected}
                    onClose={() => setSelected(null)}
                    onFilter={(key, value, label) => {
                        if (label) setEntityLabels((previous) => ({ ...previous, [key]: label }));
                        change({ [key]: value });
                        setSelected(null);
                    }}
                />
            )}
        </section>
    );
}
