import DateRangePicker from 'components/DateRangePicker';
import useSWR from 'hooks/swr-wrapper';
import { useEffect, useState } from 'react';
import { fetcher } from 'swr-config';
import { LoadState, Pagination } from './access-ui';
import { Outcome } from './audit-event';
import { auditActivities, auditActivity, auditDate } from './audit-events';
import './access.css';
import './audit.css';

const accountIcon = (
    <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        aria-hidden="true"
    >
        <circle cx="9" cy="8" r="3" />
        <path d="M3 21v-2a6 6 0 0 1 12 0v2" />
    </svg>
);

const roleIcon = (
    <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
    >
        <path d="m12 3 8 4v5c0 5-8 9-8 9s-8-4-8-9V7l8-4Z" />
        <path d="m8 12 3 3 5-6" />
    </svg>
);

function initialFilters() {
    const today = new Date().toISOString().slice(0, 10);
    return { from: `${today.slice(0, 7)}-01`, to: today, search: '', action: '', outcome: '', page: 1 };
}

export default function Audit({ initial, onOpenEvent }) {
    const [filters, setFilters] = useState(() => ({ ...initialFilters(), ...(initial?.filters || {}) }));
    const [search, setSearch] = useState(filters.search || '');
    const [entityLabels, setEntityLabels] = useState(initial?.labels || {});
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
    const { data, error, isValidating, mutate } = useSWR(
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
        <section aria-label="Consulta autorizada de auditoría" className="audit-layout audit-workspace">
            <header className="access-header audit-header">
                <div>
                    <h2>Auditoría</h2>
                </div>
                <div className="audit-header-actions">
                    <DateRangePicker
                        key={calendarKey}
                        initialFrom={filters.from}
                        initialTo={filters.to}
                        onChange={change}
                    />
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
                {(hasFilters || (isValidating && data)) && (
                    <div className="audit-results-heading">
                        {isValidating && data && <span className="access-muted">Actualizando…</span>}
                        {hasFilters && (
                            <button type="button" onClick={clear}>
                                Limpiar filtros
                            </button>
                        )}
                    </div>
                )}
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
                                        <table className="access-table audit-table" aria-label="Historial de actividad">
                                            <thead>
                                                <tr>
                                                    <th scope="col">Fecha</th>
                                                    <th scope="col">
                                                        Hora <span>UTC</span>
                                                    </th>
                                                    <th scope="col">Actividad</th>
                                                    <th scope="col">Cuenta / Rol</th>
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
                                                        <td className="audit-date">{auditDate(event.occurredMs)}</td>
                                                        <td className="audit-time">
                                                            {auditDate(event.occurredMs, true)}
                                                        </td>
                                                        <td>
                                                            <button
                                                                type="button"
                                                                className="audit-event-link"
                                                                onClick={() =>
                                                                    onOpenEvent(event, filters, entityLabels)
                                                                }
                                                            >
                                                                {auditActivity(event.action)}
                                                            </button>
                                                        </td>
                                                        <td className="audit-affected">
                                                            {event.roleId ? (
                                                                <span className="audit-target">
                                                                    {roleIcon}
                                                                    <span className="visually-hidden">Rol: </span>
                                                                    <span>{event.roleName || 'No disponible'}</span>
                                                                </span>
                                                            ) : event.targetId ? (
                                                                <span className="audit-target">
                                                                    {accountIcon}
                                                                    <span className="visually-hidden">Cuenta: </span>
                                                                    <span>
                                                                        {event.targetName ||
                                                                            event.targetUsername ||
                                                                            'No disponible'}
                                                                    </span>
                                                                </span>
                                                            ) : (
                                                                <span className="access-muted">—</span>
                                                            )}
                                                        </td>
                                                        <td className="audit-person">
                                                            {event.actorName ||
                                                                event.actorUsername ||
                                                                (event.actorId
                                                                    ? 'Cuenta no disponible'
                                                                    : 'Sin responsable identificado')}
                                                        </td>
                                                        <td>
                                                            <Outcome value={event.outcome} />
                                                        </td>
                                                        <td>
                                                            <button
                                                                type="button"
                                                                className="audit-open-detail"
                                                                aria-label={`Ver detalle: ${auditActivity(event.action)}`}
                                                                onClick={() =>
                                                                    onOpenEvent(event, filters, entityLabels)
                                                                }
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
        </section>
    );
}
