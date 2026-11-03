import { CAPABILITIES, MODULES } from '@dmmarket/permissions';
import useSWR from 'hooks/swr-wrapper';
import { useEffect, useRef } from 'react';
import { fetcher } from 'swr-config';
import { LoadState } from './access-ui';
import { auditActivity, auditDate } from './audit-events';
import './access.css';
import './audit.css';

export function Outcome({ value }) {
    return (
        <span
            className={`audit-outcome${value === 'success' ? ' is-success' : value === 'failure' ? ' is-failure' : ''}`}
        >
            {value === 'success' ? 'Correcto' : value === 'failure' ? 'Fallido' : value}
        </span>
    );
}

function Entity({ title, name, username, id, fallback }) {
    return (
        <article className="access-card audit-entity">
            <h3>{title}</h3>
            <p className="audit-entity-name">{name || fallback}</p>
            {username && <p className="access-muted">@{username}</p>}
            {id && <code className="audit-entity-id">{id}</code>}
        </article>
    );
}

function Changes({ event }) {
    const rolesAdded = event.details?.rolesAdded;
    const rolesRemoved = event.details?.rolesRemoved;
    const added = event.details?.added;
    const removed = event.details?.removed;
    if (!rolesAdded && !rolesRemoved && !added && !removed) return null;
    const names = (capability) => {
        const entry = CAPABILITIES[capability];
        const module = entry && MODULES.find((item) => item.key === entry.module);
        const resource = module?.resources.find((item) => item.resource === entry.resource);
        return entry ? `${module.label} / ${resource.label} · ${entry.label}` : capability;
    };
    return (
        <article className="access-card audit-block">
            <h3>Cambios registrados</h3>
            <dl className="audit-changes">
                {rolesAdded && (
                    <div>
                        <dt>Roles añadidos</dt>
                        <dd>
                            {rolesAdded.length ? (
                                <ul>
                                    {rolesAdded.map((role) => (
                                        <li key={role.id}>
                                            <span>{role.name}</span>
                                            <code>{role.id}</code>
                                        </li>
                                    ))}
                                </ul>
                            ) : (
                                'Ninguno'
                            )}
                        </dd>
                    </div>
                )}
                {rolesRemoved && (
                    <div>
                        <dt>Roles retirados</dt>
                        <dd>
                            {rolesRemoved.length ? (
                                <ul>
                                    {rolesRemoved.map((role) => (
                                        <li key={role.id}>
                                            <span>{role.name}</span>
                                            <code>{role.id}</code>
                                        </li>
                                    ))}
                                </ul>
                            ) : (
                                'Ninguno'
                            )}
                        </dd>
                    </div>
                )}
                {added && (
                    <div>
                        <dt>Permisos añadidos</dt>
                        <dd>
                            {added.length ? (
                                <ul>
                                    {added.map((capability) => (
                                        <li key={capability}>{names(capability)}</li>
                                    ))}
                                </ul>
                            ) : (
                                'Ninguno'
                            )}
                        </dd>
                    </div>
                )}
                {removed && (
                    <div>
                        <dt>Permisos retirados</dt>
                        <dd>
                            {removed.length ? (
                                <ul>
                                    {removed.map((capability) => (
                                        <li key={capability}>{names(capability)}</li>
                                    ))}
                                </ul>
                            ) : (
                                'Ninguno'
                            )}
                        </dd>
                    </div>
                )}
            </dl>
        </article>
    );
}

export default function AuditEvent({ eventId, context, onBack, onContinue }) {
    const { data: event, error, mutate } = useSWR(`/api/auth/audit/${eventId}`, fetcher);
    const heading = useRef(null);
    useEffect(() => {
        heading.current?.focus();
    }, [eventId]);
    const proceed = (key, value, label) => () =>
        onContinue({
            filters: { ...(context?.filters || {}), [key]: value, page: 1 },
            labels: { ...(context?.labels || {}), ...(label ? { [key]: label } : {}) },
        });
    const reference = /^[a-f0-9-]{36}$/i.test(event?.reason || '');
    return (
        <section className="audit-event" aria-label="Detalle del evento">
            <button type="button" className="access-back" onClick={onBack}>
                <span aria-hidden="true">←</span> Volver a auditoría
            </button>
            <LoadState error={error} loading={!event && !error} onRetry={mutate}>
                {event && (
                    <>
                        <header className="access-header audit-event-header">
                            <div>
                                <span className="access-eyebrow">Historial de actividad</span>
                                <div className="audit-event-title">
                                    <h2 ref={heading} tabIndex={-1}>
                                        {auditActivity(event.action)}
                                    </h2>
                                    <Outcome value={event.outcome} />
                                </div>
                                <p>
                                    {auditDate(event.occurredMs)} · {auditDate(event.occurredMs, true)} UTC
                                </p>
                            </div>
                        </header>
                        <div className="audit-entities">
                            <Entity
                                title="Responsable"
                                name={event.actorName || event.actorUsername}
                                username={event.actorName ? event.actorUsername : null}
                                id={event.actorId}
                                fallback={event.actorId ? 'Cuenta no disponible' : 'Sin responsable identificado'}
                            />
                            <Entity
                                title="Cuenta afectada"
                                name={event.targetName || event.targetUsername}
                                username={event.targetName ? event.targetUsername : null}
                                id={event.targetId}
                                fallback="No aplica"
                            />
                            {event.roleId && (
                                <Entity
                                    title="Rol afectado"
                                    name={event.roleName}
                                    id={event.roleId}
                                    fallback="Rol no disponible"
                                />
                            )}
                        </div>
                        <Changes event={event} />
                        <article className="access-card audit-block">
                            <h3>{reference ? 'Referencia de operación' : 'Motivo registrado'}</h3>
                            <p className="audit-reason">{event.reason || 'Sin motivo registrado'}</p>
                        </article>
                        <nav className="audit-continue" aria-label="Continuar la consulta">
                            <h3>Continuar la consulta</h3>
                            <div className="access-inline-actions">
                                {event.actorId && (
                                    <button
                                        type="button"
                                        className="btn btn-outline-light"
                                        onClick={proceed(
                                            'actorId',
                                            event.actorId,
                                            event.actorName || event.actorUsername || 'Cuenta no disponible',
                                        )}
                                    >
                                        Ver actividad de esta persona
                                    </button>
                                )}
                                {event.targetId && (
                                    <button
                                        type="button"
                                        className="btn btn-outline-light"
                                        onClick={proceed(
                                            'targetId',
                                            event.targetId,
                                            event.targetName || event.targetUsername || 'Cuenta no disponible',
                                        )}
                                    >
                                        Ver eventos de esta cuenta
                                    </button>
                                )}
                                {event.roleId && (
                                    <button
                                        type="button"
                                        className="btn btn-outline-light"
                                        onClick={proceed('roleId', event.roleId, event.roleName || 'Rol no disponible')}
                                    >
                                        Ver eventos de este rol
                                    </button>
                                )}
                                <button
                                    type="button"
                                    className="btn btn-outline-light"
                                    onClick={proceed('action', event.action)}
                                >
                                    Ver eventos de esta actividad
                                </button>
                            </div>
                        </nav>
                        <p className="access-muted audit-detail-note">
                            Los nombres corresponden a los registros actuales. Los identificadores permiten reconocer
                            las cuentas y roles del evento original.
                        </p>
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
                    </>
                )}
            </LoadState>
        </section>
    );
}
