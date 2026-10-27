import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { fetcher } from 'swr-config';
import { Assignments } from './access-editor';
import { AccessDialog, LoadState, ManagementForm, Pagination, useDiscardChanges } from './access-ui';
import { useAuth } from './context';
import { Field } from './forms';
import { authRequest } from './transport';

function CreateUser({ onClose, onCreated, onDirtyChange }) {
    const { can } = useAuth();
    const [username, setUsername] = useState('');
    const [displayName, setDisplayName] = useState('');
    const [roleId, setRoleId] = useState('');
    const [reason, setReason] = useState('');
    const [busy, setBusy] = useState(false);
    const { data: roles, error, mutate } = useSWR(can('access.roles') ? '/api/auth/roles' : null, fetcher);
    const dirty = Boolean(username || displayName || roleId || reason);
    const { requestClose, confirmation } = useDiscardChanges(dirty);
    useEffect(() => {
        onDirtyChange(dirty);
        return () => onDirtyChange(false);
    }, [dirty, onDirtyChange]);
    const close = () => requestClose(onClose);
    return (
        <>
            <AccessDialog title="Crear usuario" panel onClose={close} busy={busy}>
                <p className="access-muted">
                    La cuenta recibirá una contraseña temporal para completar su primer ingreso.
                </p>
                <ManagementForm
                    button="Crear usuario"
                    onBusyChange={setBusy}
                    onCancel={close}
                    disabled={can('access.roles') && !roles}
                    onSubmit={async () =>
                        onCreated(
                            await authRequest('users', {
                                username,
                                displayName,
                                roleIds: roleId ? [roleId] : [],
                                reason,
                            }),
                        )
                    }
                >
                    <Field
                        label="Usuario nuevo"
                        value={username}
                        onChange={setUsername}
                        autoComplete="off"
                        maxLength={64}
                    />
                    <Field label="Nombre visible" value={displayName} onChange={setDisplayName} maxLength={128} />
                    {can('access.roles') && (
                        <LoadState error={error} loading={!roles} onRetry={mutate}>
                            <label className="form-label" htmlFor="initial-role">
                                Rol inicial
                            </label>
                            <select
                                id="initial-role"
                                className="form-select"
                                value={roleId}
                                onChange={(event) => setRoleId(event.target.value)}
                            >
                                <option value="">Sin permisos de negocio</option>
                                {roles?.data.map((role) => (
                                    <option key={role.id} value={role.id}>
                                        {role.name}
                                    </option>
                                ))}
                            </select>
                            <p className="access-muted">Podrás asignar más roles y vincular vendedores después.</p>
                        </LoadState>
                    )}
                    <Field label="Motivo del alta" value={reason} onChange={setReason} minLength={5} maxLength={64} />
                </ManagementForm>
            </AccessDialog>
            {confirmation}
        </>
    );
}

function TemporaryCredential({ credential, onClose }) {
    const [visible, setVisible] = useState(false);
    const [message, setMessage] = useState('');
    return (
        <AccessDialog title="Credencial temporal" onClose={onClose}>
            <p>
                Contraseña temporal para <strong>{credential.username}</strong>.
            </p>
            <p className="access-notice">
                Se muestra solo ahora. Entrega por un canal con identidad verificada. Vence en 30 minutos y deberá
                cambiarse al ingresar.
            </p>
            <label className="form-label" htmlFor="temporary-credential">
                Contraseña temporal emitida
            </label>
            <input
                id="temporary-credential"
                className="form-control access-secret"
                autoComplete="off"
                type={visible ? 'text' : 'password'}
                value={credential.temporaryPassword}
                readOnly
            />
            <div className="access-inline-actions">
                <button type="button" className="btn btn-outline-light" onClick={() => setVisible(!visible)}>
                    {visible ? 'Ocultar contraseña temporal' : 'Mostrar contraseña temporal'}
                </button>
                <button
                    type="button"
                    className="btn btn-outline-light"
                    onClick={async () => {
                        try {
                            await navigator.clipboard.writeText(credential.temporaryPassword);
                            setMessage('Contraseña copiada.');
                        } catch {
                            setMessage('No se pudo copiar. Muestra la contraseña y cópiala manualmente.');
                        }
                    }}
                >
                    Copiar contraseña
                </button>
            </div>
            {message && <p role="status">{message}</p>}
            <div className="access-form-actions">
                <button type="button" className="btn btn-primary" onClick={onClose}>
                    Cerrar credencial temporal
                </button>
            </div>
        </AccessDialog>
    );
}

function UserOperation({ user, operation, onClose, onDone }) {
    const [reason, setReason] = useState('');
    const [resetMfa, setResetMfa] = useState(false);
    const [busy, setBusy] = useState(false);
    const title =
        operation === 'reset' ? 'Recuperar acceso' : operation === 'enable' ? 'Habilitar cuenta' : 'Bloquear cuenta';
    return (
        <AccessDialog title={title} onClose={onClose} dirty={Boolean(reason || resetMfa)} busy={busy}>
            <p>
                {title} de <strong>{user.display_name}</strong> <span className="access-muted">@{user.username}</span>
            </p>
            <p className="access-notice">
                {operation === 'reset'
                    ? 'Se emitirá una nueva contraseña temporal y se cerrarán las sesiones del usuario. La contraseña anterior dejará de funcionar.'
                    : operation === 'disable'
                      ? 'El usuario no podrá ingresar y se cerrarán sus sesiones activas.'
                      : 'El usuario podrá volver a ingresar. Sus sesiones anteriores no se restaurarán.'}
            </p>
            <ManagementForm
                button="Confirmar operación"
                onBusyChange={setBusy}
                onSubmit={async () => {
                    const result =
                        operation === 'reset'
                            ? await authRequest(`users/${user.id}/reset`, { resetMfa, reason })
                            : await authRequest(`users/${user.id}/enabled`, {
                                  enabled: operation === 'enable',
                                  reason,
                              });
                    onDone(result);
                }}
            >
                {operation === 'reset' && (
                    <>
                        <label className="access-check">
                            <input
                                type="checkbox"
                                checked={resetMfa}
                                onChange={(event) => setResetMfa(event.target.checked)}
                            />
                            <span>Restablecer también MFA</span>
                        </label>
                        <p className="access-muted">
                            {resetMfa
                                ? 'Deberá configurar de nuevo su autenticador si su acceso exige MFA.'
                                : 'Se conservará el autenticador actual.'}
                        </p>
                    </>
                )}
                <Field
                    label="Motivo de la operación"
                    value={reason}
                    onChange={setReason}
                    minLength={5}
                    maxLength={64}
                />
            </ManagementForm>
        </AccessDialog>
    );
}

function UserPanel({ user, onClose, onDone, onDirtyChange }) {
    const { session, can } = useAuth();
    const [dirty, setDirty] = useState(false);
    const [busy, setBusy] = useState(false);
    const [operation, setOperation] = useState(null);
    const { requestClose, confirmation } = useDiscardChanges(dirty);
    useEffect(() => {
        onDirtyChange(dirty);
        return () => onDirtyChange(false);
    }, [dirty, onDirtyChange]);
    return (
        <>
            <AccessDialog
                title={`Administrar ${user.username}`}
                panel
                onClose={onClose}
                dirty={dirty}
                busy={busy || Boolean(operation)}
            >
                <div className="access-user-summary">
                    <span className="access-avatar" aria-hidden="true">
                        {(user.display_name || user.username).slice(0, 1).toLocaleUpperCase()}
                    </span>
                    <div>
                        <h3>{user.display_name}</h3>
                        <p>
                            @{user.username}
                            {user.id === session.user.id ? ' · Tu cuenta' : ''}
                        </p>
                    </div>
                    <span className={`access-status ${Number(user.enabled) ? 'is-enabled' : ''}`}>
                        {Number(user.enabled) ? 'Habilitado' : 'Bloqueado'}
                    </span>
                </div>
                <fieldset disabled={busy}>
                    <Assignments id={user.id} onDirtyChange={setDirty} onBusyChange={setBusy} />
                </fieldset>
                {!can('access.roles') && !can('access.links') && (
                    <p className="access-muted">
                        Desde aquí puedes administrar el estado y la recuperación de esta cuenta, según tus permisos.
                    </p>
                )}
                {user.id !== session.user.id && (can('access.users') || can('access.recover')) && (
                    <section className="access-assignment">
                        <h3>Acciones de la cuenta</h3>
                        <div className="access-inline-actions">
                            {can('access.recover') && (
                                <button
                                    type="button"
                                    className="btn btn-outline-light"
                                    disabled={busy}
                                    onClick={() => requestClose(() => setOperation('reset'))}
                                >
                                    Recuperar acceso
                                </button>
                            )}
                            {can('access.users') && (
                                <button
                                    type="button"
                                    className={`btn ${Number(user.enabled) ? 'btn-outline-danger' : 'btn-outline-light'}`}
                                    disabled={busy}
                                    onClick={() =>
                                        requestClose(() => setOperation(Number(user.enabled) ? 'disable' : 'enable'))
                                    }
                                >
                                    {Number(user.enabled) ? 'Bloquear cuenta' : 'Habilitar cuenta'}
                                </button>
                            )}
                        </div>
                    </section>
                )}
            </AccessDialog>
            {operation && (
                <UserOperation user={user} operation={operation} onClose={() => setOperation(null)} onDone={onDone} />
            )}
            {confirmation}
        </>
    );
}

export default function Users({ onDirtyChange }) {
    const { can } = useAuth();
    const [page, setPage] = useState(1);
    const [search, setSearch] = useState('');
    const [state, setState] = useState('all');
    const [creating, setCreating] = useState(false);
    const [selected, setSelected] = useState(null);
    const [credential, setCredential] = useState(null);
    const [message, setMessage] = useState('');
    const { data, error, mutate } = useSWR(
        `/api/auth/directory?page=${page}&search=${encodeURIComponent(search)}&state=${state}`,
        fetcher,
    );
    const done = async (result) => {
        setCreating(false);
        setSelected(null);
        if (result.temporaryPassword) {
            setCredential(result);
            setSearch(result.username);
            setState('all');
            setPage(1);
        } else setMessage('Estado de la cuenta actualizado. Se cerraron sus sesiones anteriores.');
        await mutate();
    };
    return (
        <>
            <header className="access-header">
                <div>
                    <h2>Administración de usuarios</h2>
                </div>
                {can('access.users') && (
                    <button
                        type="button"
                        className="btn btn-primary"
                        onClick={() => {
                            setMessage('');
                            setCreating(true);
                        }}
                    >
                        Crear usuario
                    </button>
                )}
            </header>
            {message && (
                <p role="status" className="access-success">
                    {message}
                </p>
            )}
            <div className="access-card">
                <div className="access-toolbar">
                    <input
                        type="search"
                        className="form-control"
                        aria-label="Buscar usuarios"
                        placeholder="Buscar por nombre o usuario…"
                        value={search}
                        maxLength={128}
                        onChange={(event) => {
                            setSearch(event.target.value);
                            setPage(1);
                        }}
                    />
                    <select
                        className="form-select"
                        aria-label="Estado de los usuarios"
                        value={state}
                        onChange={(event) => {
                            setState(event.target.value);
                            setPage(1);
                        }}
                    >
                        <option value="all">Todos los estados</option>
                        <option value="enabled">Habilitados</option>
                        <option value="disabled">Bloqueados</option>
                    </select>
                </div>
                <LoadState error={error} loading={!data} onRetry={mutate}>
                    {data?.data.length ? (
                        <div className="access-table-scroll">
                            <table className="access-table">
                                <thead>
                                    <tr>
                                        <th scope="col">Usuario</th>
                                        {can('access.roles') && <th scope="col">Roles</th>}
                                        <th scope="col">Estado</th>
                                        <th scope="col">
                                            <span className="visually-hidden">Acciones</span>
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data?.data.map((user) => (
                                        <tr key={user.id}>
                                            <td>
                                                <button
                                                    type="button"
                                                    className="access-user-link"
                                                    aria-label={`Administrar ${user.username}`}
                                                    onClick={() => setSelected(user)}
                                                >
                                                    <strong>{user.display_name}</strong>
                                                    <span>@{user.username}</span>
                                                </button>
                                            </td>
                                            {can('access.roles') && (
                                                <td>
                                                    <div className="access-role-tags">
                                                        {user.roles?.length ? (
                                                            user.roles.map((role) => (
                                                                <span key={role.id}>{role.name}</span>
                                                            ))
                                                        ) : (
                                                            <span className="access-muted">Sin roles</span>
                                                        )}
                                                    </div>
                                                </td>
                                            )}
                                            <td>
                                                <span
                                                    className={`access-status ${Number(user.enabled) ? 'is-enabled' : ''}`}
                                                >
                                                    {Number(user.enabled) ? 'Habilitado' : 'Bloqueado'}
                                                </span>
                                            </td>
                                            <td>
                                                <button
                                                    type="button"
                                                    className="access-more"
                                                    aria-label={`Opciones de ${user.username}`}
                                                    onClick={() => setSelected(user)}
                                                >
                                                    ⋯
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <div className="access-empty">
                            <h3>
                                {search || state !== 'all' ? 'No se encontraron usuarios.' : 'Todavía no hay usuarios.'}
                            </h3>
                            <p>
                                {search || state !== 'all'
                                    ? 'Prueba otro nombre o cambia el filtro de estado.'
                                    : 'Crea una cuenta para comenzar.'}
                            </p>
                        </div>
                    )}
                    {data && <Pagination page={page} total={data.total} onChange={setPage} />}
                </LoadState>
            </div>
            {creating && (
                <CreateUser onClose={() => setCreating(false)} onCreated={done} onDirtyChange={onDirtyChange} />
            )}
            {selected && (
                <UserPanel
                    key={selected.id}
                    user={selected}
                    onClose={() => {
                        setSelected(null);
                        mutate();
                    }}
                    onDone={done}
                    onDirtyChange={onDirtyChange}
                />
            )}
            {credential && <TemporaryCredential credential={credential} onClose={() => setCredential(null)} />}
        </>
    );
}
