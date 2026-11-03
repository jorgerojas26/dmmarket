import Sidebar from 'components/Sidebar';
import { useEffect, useRef, useState } from 'react';
import { Prompt, useHistory, useLocation } from 'react-router-dom';
import useSWR from 'swr';
import { fetcher } from 'swr-config';
import AccessEditor from './access-editor';
import { useDiscardChanges } from './access-ui';
import Users from './access-users';
import Audit from './audit';
import AuditEvent from './audit-event';
import { useAuth } from './context';
import { DisableMfaForm, EnrollmentForm, PasswordForm } from './forms';
import './access.css';

export function Account() {
    const { session } = useAuth();
    const [changePassword, setChangePassword] = useState(false);
    const [configuringMfa, setConfiguringMfa] = useState(false);
    const { data: profile, error } = useSWR('/api/auth/profile', fetcher);
    useEffect(() => {
        setConfiguringMfa(false);
    }, [session.mfaEnabled]);
    const name = session.user.displayName || session.user.username;
    const initials = name
        .trim()
        .split(/\s+/)
        .map((part) => Array.from(part)[0])
        .filter(Boolean)
        .slice(0, 2)
        .join('')
        .toLocaleUpperCase();
    const roles = profile
        ? profile.roles.map((role) => role.name).join(' · ') || 'Sin rol asignado'
        : error
          ? 'Rol no disponible'
          : '';
    const mfaAction = session.mfaEnabled ? 'Desactivar MFA' : 'Activar MFA';
    return (
        <div className="access-workspace account">
            <h2 className="account-title">Mi cuenta</h2>
            <div className="account-identity">
                <span className="access-avatar" aria-hidden="true">
                    {initials}
                </span>
                <div className="access-identity-body">
                    <h3>{name}</h3>
                    <p className="access-muted">@{session.user.username}</p>
                    {roles && <p className="access-muted">{roles}</p>}
                </div>
            </div>
            <section className="access-card account-card" aria-labelledby="account-password">
                <div className="account-card-head">
                    <div>
                        <h3 id="account-password">Contraseña</h3>
                        <p className="access-muted">La clave con la que entras a DMMarket.</p>
                    </div>
                    <button
                        type="button"
                        className="btn btn-outline-light"
                        aria-expanded={changePassword}
                        onClick={() => setChangePassword(!changePassword)}
                    >
                        {changePassword ? 'Cancelar' : 'Cambiar mi contraseña'}
                    </button>
                </div>
                {changePassword && (
                    <div className="account-card-body">
                        <PasswordForm />
                    </div>
                )}
            </section>
            <section className="access-card account-card" aria-labelledby="account-mfa">
                <div className="account-card-head">
                    <div>
                        <h3 id="account-mfa">Segundo factor (MFA)</h3>
                        <div className="account-mfa-status">
                            <span className={`access-status${session.mfaEnabled ? ' is-enabled' : ''}`}>
                                {session.mfaEnabled ? 'Activado' : 'Desactivado'}
                            </span>
                            {session.mfaRequired && <span className="access-chip">Requerido</span>}
                        </div>
                    </div>
                    {(!session.mfaEnabled || !session.mfaRequired) && (
                        <button
                            type="button"
                            className="btn btn-outline-light"
                            aria-expanded={configuringMfa}
                            onClick={() => setConfiguringMfa(!configuringMfa)}
                        >
                            {configuringMfa ? 'Cancelar' : mfaAction}
                        </button>
                    )}
                </div>
                {configuringMfa && (
                    <div className="account-card-body">
                        {session.mfaEnabled ? <DisableMfaForm /> : <EnrollmentForm />}
                    </div>
                )}
            </section>
        </div>
    );
}

const usersIcon = (
    <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        aria-hidden="true"
    >
        <circle cx="9" cy="8" r="3" />
        <path d="M3 21v-2a6 6 0 0 1 12 0v2M16 5a3 3 0 0 1 0 6M17 15a5 5 0 0 1 4 5v1" />
    </svg>
);
const rolesIcon = (
    <svg
        width="18"
        height="18"
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

const auditIcon = (
    <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
    >
        <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
        <path d="M3 3v5h5M12 7v5l3 2" />
    </svg>
);

export default function AccessWorkspace() {
    const { can } = useAuth();
    const location = useLocation();
    const history = useHistory();
    const [dirty, setDirty] = useState(false);
    const [busy, setBusy] = useState(false);
    const allowNavigation = useRef(false);
    const { requestClose, confirmation } = useDiscardChanges(dirty || busy);
    const userId = location.pathname.match(/^\/acceso\/usuarios\/([^/]+)\/?$/)?.[1] || null;
    const auditEventId = location.pathname.match(/^\/acceso\/auditoria\/([^/]+)\/?$/)?.[1] || null;
    const creating =
        !userId && location.hash === '#nuevo-usuario' && can('access.users.create') && can('access.roles.assign');
    const users = ['access.users.read', 'access.profile.read', 'access.recovery.read'].some(can);
    const items = [
        ...(users ? [{ eventKey: 'usuarios', label: 'Usuarios', icon: usersIcon }] : []),
        ...(can('access.roles.read') ? [{ eventKey: 'roles', label: 'Roles', icon: rolesIcon }] : []),
        ...(can('audit.read') ? [{ eventKey: 'auditoria', label: 'Auditoría', icon: auditIcon }] : []),
    ];
    const view = userId
        ? 'usuarios'
        : auditEventId
          ? 'auditoria'
          : items.find((item) => location.hash === `#${item.eventKey}`)?.eventKey || items[0]?.eventKey;
    useEffect(() => {
        if (!userId && !auditEventId && !creating && location.hash !== `#${view}`)
            history.replace({ ...location, hash: `#${view}` });
    }, [view, location, history, creating, userId, auditEventId]);
    const navigate = (hash) => {
        if (busy) return;
        requestClose(() => {
            allowNavigation.current = dirty;
            setDirty(false);
            history.push({ pathname: '/acceso', search: location.search, hash });
        });
    };
    return (
        <section aria-label="Acceso" className="clientes-layout access-layout p-0">
            <Prompt
                when={dirty || busy}
                message={() => {
                    if (busy) return false;
                    if (allowNavigation.current) {
                        allowNavigation.current = false;
                        return true;
                    }
                    return 'Hay cambios sin guardar. ¿Quieres salir y descartarlos?';
                }}
            />
            <div className="clientes-row">
                <Sidebar
                    activeKey={view}
                    items={items}
                    onSelect={(next) => {
                        if (next !== view || userId) navigate(`#${next}`);
                    }}
                />
                <div className="clientes-content access-content">
                    <div className="access-workspace">
                        {view === 'usuarios' ? (
                            <Users
                                onDirtyChange={setDirty}
                                onBusyChange={setBusy}
                                userId={userId}
                                onReturn={() => navigate('#usuarios')}
                                creating={creating}
                                onCreate={() => history.push({ pathname: '/acceso', hash: '#nuevo-usuario' })}
                                onCancelCreate={() => navigate('#usuarios')}
                                onCreated={() => {
                                    allowNavigation.current = dirty;
                                    setDirty(false);
                                    history.replace({ ...location, hash: '#usuarios' });
                                }}
                            />
                        ) : view === 'auditoria' && auditEventId ? (
                            <AuditEvent
                                eventId={auditEventId}
                                context={location.state?.audit}
                                onBack={() =>
                                    history.push({
                                        pathname: '/acceso',
                                        search: location.search,
                                        hash: '#auditoria',
                                        state: location.state,
                                    })
                                }
                                onContinue={(audit) =>
                                    history.push({ pathname: '/acceso', hash: '#auditoria', state: { audit } })
                                }
                            />
                        ) : view === 'auditoria' ? (
                            <Audit
                                initial={location.state?.audit}
                                onOpenEvent={(event, filters, labels) =>
                                    history.push({
                                        pathname: `/acceso/auditoria/${event.id}`,
                                        state: { audit: { filters, labels } },
                                    })
                                }
                            />
                        ) : (
                            <AccessEditor onDirtyChange={setDirty} />
                        )}
                    </div>
                </div>
            </div>
            {confirmation}
        </section>
    );
}
