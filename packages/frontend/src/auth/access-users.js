import { useEffect, useRef, useState } from 'react';
import Dropdown from 'react-bootstrap/Dropdown';
import { createPortal } from 'react-dom';
import useSWR from 'swr';
import { fetcher } from 'swr-config';
import { Assignments } from './access-editor';
import { permissionGroups } from './access-permissions';
import { AccessDialog, LoadState, ManagementForm, Pagination, useDiscardChanges } from './access-ui';
import { useAuth } from './context';
import { Field } from './forms';
import { authRequest } from './transport';

function CreateUser({ onClose, onCreated, onDirtyChange }) {
    const { can } = useAuth();
    const heading = useRef(null);
    const [username, setUsername] = useState('');
    const [displayName, setDisplayName] = useState('');
    const [roleId, setRoleId] = useState('');
    const [mfaRequired, setMfaRequired] = useState(false);
    const [busy, setBusy] = useState(false);
    const { data: roles, error, mutate } = useSWR(can('access.roles') ? '/api/auth/roles' : null, fetcher);
    const role = useSWR(roleId ? `/api/auth/roles/${roleId}` : null, fetcher);
    const dirty = Boolean(username || displayName || roleId || mfaRequired);
    useEffect(() => {
        heading.current?.focus();
    }, []);
    useEffect(() => {
        onDirtyChange(dirty);
        return () => onDirtyChange(false);
    }, [dirty, onDirtyChange]);
    return (
        <section className="access-create-user" aria-labelledby="create-user-title">
            <button type="button" className="access-back" onClick={onClose} disabled={busy}>
                <span aria-hidden="true">←</span> Volver a usuarios
            </button>
            <header className="access-header">
                <h2 id="create-user-title" ref={heading} tabIndex={-1}>
                    Crear usuario
                </h2>
            </header>
            <div className="access-create-form">
                <ManagementForm
                    button="Crear usuario"
                    onBusyChange={setBusy}
                    onCancel={onClose}
                    disabled={Boolean(!roleId || !roles || error || !role.data || role.error)}
                    onSubmit={async () =>
                        onCreated(
                            await authRequest('users', {
                                username,
                                displayName,
                                roleIds: [roleId],
                                mfaRequired,
                            }),
                        )
                    }
                >
                    <div className="access-create-fields">
                        <Field
                            label="Nombre"
                            className="access-create-field"
                            name="displayName"
                            value={displayName}
                            onChange={setDisplayName}
                            autoComplete="off"
                            maxLength={128}
                            placeholder="Ana Pérez"
                        />
                        <Field
                            label="Username"
                            className="access-create-field"
                            name="username"
                            value={username}
                            onChange={setUsername}
                            autoComplete="off"
                            autoCapitalize="none"
                            spellCheck={false}
                            maxLength={64}
                            pattern={'[a-zA-Z0-9._\\-]+'}
                            placeholder="ana.perez"
                        />
                        <LoadState error={error} loading={!roles} onRetry={mutate}>
                            <div className="access-create-field">
                                <label className="form-label" htmlFor="initial-role">
                                    Rol
                                </label>
                                <select
                                    id="initial-role"
                                    name="roleId"
                                    className="form-select"
                                    value={roleId}
                                    required
                                    onChange={(event) => setRoleId(event.target.value)}
                                >
                                    <option value="" disabled>
                                        Selecciona un rol
                                    </option>
                                    {roles?.data.map((item) => (
                                        <option key={item.id} value={item.id}>
                                            {item.name}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            {roleId && (
                                <LoadState error={role.error} loading={!role.data} onRetry={role.mutate}>
                                    <section className="access-role-preview" aria-label="Permisos del rol">
                                        <details key={roleId}>
                                            <summary>Ver permisos ({role.data?.permissions.length || 0})</summary>
                                            <ul>
                                                {permissionGroups.flatMap(([, items]) =>
                                                    items.flatMap(([key, label]) =>
                                                        (role.data?.permissions || [])
                                                            .filter((grant) => grant.capability === key)
                                                            .map((grant) => (
                                                                <li key={`${key}:${grant.scope}`}>
                                                                    {label}{' '}
                                                                    <span className="access-muted">
                                                                        ·{' '}
                                                                        {grant.scope === 'assigned'
                                                                            ? 'Vendedores vinculados'
                                                                            : 'Todos los datos'}
                                                                    </span>
                                                                </li>
                                                            )),
                                                    ),
                                                )}
                                            </ul>
                                        </details>
                                    </section>
                                </LoadState>
                            )}
                        </LoadState>
                        <label className="access-mfa-option">
                            <input
                                type="checkbox"
                                checked={mfaRequired}
                                onChange={(event) => setMfaRequired(event.target.checked)}
                            />
                            <span>Exigir MFA</span>
                        </label>
                    </div>
                </ManagementForm>
            </div>
        </section>
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
    const { requestClose, confirmation } = useDiscardChanges(Boolean(reason || resetMfa));
    const close = () => requestClose(onClose);
    const title =
        operation === 'reset'
            ? 'Recuperar acceso'
            : operation === 'enable'
              ? 'Habilitar usuario'
              : 'Deshabilitar usuario';
    return (
        <>
            <AccessDialog title={title} onClose={close} busy={busy}>
                <p>
                    <strong>{user.display_name}</strong> <span className="access-muted">@{user.username}</span>
                </p>
                <p className="access-notice">
                    {operation === 'reset'
                        ? 'Se emitirá una nueva contraseña temporal y se cerrarán las sesiones del usuario. La contraseña anterior dejará de funcionar.'
                        : operation === 'disable'
                          ? 'El usuario no podrá ingresar y se cerrarán sus sesiones activas. Sus datos y permisos se conservarán para que puedas habilitarlo de nuevo.'
                          : 'El usuario podrá volver a ingresar con sus permisos actuales. Sus sesiones anteriores no se restaurarán.'}
                </p>
                <ManagementForm
                    button={operation === 'reset' ? 'Confirmar operación' : title}
                    onCancel={close}
                    onBusyChange={setBusy}
                    onSubmit={async () => {
                        const result =
                            operation === 'reset'
                                ? await authRequest(`users/${user.id}/reset`, { resetMfa, reason })
                                : await authRequest(`users/${user.id}/enabled`, {
                                      enabled: operation === 'enable',
                                      reason,
                                  });
                        await onDone(result);
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
            {confirmation}
        </>
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
                        {Number(user.enabled) ? 'Habilitado' : 'Deshabilitado'}
                    </span>
                </div>
                {(can('access.users') || can('access.recover')) && (
                    <section className="access-account-actions" aria-label="Acciones de la cuenta">
                        <div className="access-inline-actions">
                            {can('access.recover') && user.id !== session.user.id && (
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
                                    disabled={busy || user.id === session.user.id}
                                    onClick={() =>
                                        requestClose(() => setOperation(Number(user.enabled) ? 'disable' : 'enable'))
                                    }
                                >
                                    {Number(user.enabled) ? 'Deshabilitar usuario' : 'Habilitar usuario'}
                                </button>
                            )}
                        </div>
                        {can('access.users') && user.id === session.user.id && (
                            <p className="access-muted">No puedes deshabilitar tu propia cuenta.</p>
                        )}
                    </section>
                )}
                <fieldset disabled={busy}>
                    <Assignments id={user.id} onDirtyChange={setDirty} onBusyChange={setBusy} />
                </fieldset>
                {!can('access.roles') && !can('access.links') && (
                    <p className="access-muted">
                        Desde aquí puedes administrar el estado y la recuperación de esta cuenta, según tus permisos.
                    </p>
                )}
            </AccessDialog>
            {operation && (
                <UserOperation user={user} operation={operation} onClose={() => setOperation(null)} onDone={onDone} />
            )}
            {confirmation}
        </>
    );
}

export default function Users({ onDirtyChange, creating, onCreate, onCancelCreate, onCreated }) {
    const { can, session } = useAuth();
    const [page, setPage] = useState(1);
    const [search, setSearch] = useState('');
    const [state, setState] = useState('all');
    const [operation, setOperation] = useState(null);
    const [selected, setSelected] = useState(null);
    const [credential, setCredential] = useState(null);
    const [message, setMessage] = useState('');
    const { data, error, mutate } = useSWR(
        `/api/auth/directory?page=${page}&search=${encodeURIComponent(search)}&state=${state}`,
        fetcher,
    );
    const done = async (result) => {
        if (creating) onCreated();
        setSelected(null);
        setOperation(null);
        if (result.temporaryPassword) {
            setCredential(result);
            setSearch(result.username);
            setState('all');
            setPage(1);
        } else {
            setPage(1);
            setMessage(
                result.enabled
                    ? 'Usuario habilitado. Ya puede volver a ingresar.'
                    : 'Usuario deshabilitado. Se cerraron sus sesiones activas.',
            );
        }
        await mutate();
    };
    if (creating) return <CreateUser onClose={onCancelCreate} onCreated={done} onDirtyChange={onDirtyChange} />;
    return (
        <>
            <header className="access-header">
                <div>
                    <h2>Administración de usuarios</h2>
                </div>
                {can('access.users') && can('access.roles') && (
                    <button
                        type="button"
                        className="btn btn-primary"
                        onClick={() => {
                            setMessage('');
                            onCreate();
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
                        <option value="disabled">Deshabilitados</option>
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
                                                    {Number(user.enabled) ? 'Habilitado' : 'Deshabilitado'}
                                                </span>
                                            </td>
                                            <td>
                                                <Dropdown align="end" className="access-row-dropdown">
                                                    <Dropdown.Toggle
                                                        variant="link"
                                                        className="access-more"
                                                        aria-label={`Opciones de ${user.username}`}
                                                    >
                                                        ⋯
                                                    </Dropdown.Toggle>
                                                    {createPortal(
                                                        <Dropdown.Menu
                                                            variant="dark"
                                                            className="access-row-menu"
                                                            popperConfig={{ strategy: 'fixed' }}
                                                        >
                                                            <Dropdown.Item
                                                                as="button"
                                                                onClick={() => setSelected(user)}
                                                            >
                                                                Administrar acceso
                                                            </Dropdown.Item>
                                                            {(can('access.users') ||
                                                                (can('access.recover') &&
                                                                    user.id !== session.user.id)) && (
                                                                <Dropdown.Divider />
                                                            )}
                                                            {can('access.recover') && user.id !== session.user.id && (
                                                                <Dropdown.Item
                                                                    as="button"
                                                                    onClick={() =>
                                                                        setOperation({ user, kind: 'reset' })
                                                                    }
                                                                >
                                                                    Recuperar acceso
                                                                </Dropdown.Item>
                                                            )}
                                                            {can('access.users') && (
                                                                <Dropdown.Item
                                                                    as="button"
                                                                    className={
                                                                        Number(user.enabled) ? 'access-menu-danger' : ''
                                                                    }
                                                                    disabled={user.id === session.user.id}
                                                                    onClick={() =>
                                                                        setOperation({
                                                                            user,
                                                                            kind: Number(user.enabled)
                                                                                ? 'disable'
                                                                                : 'enable',
                                                                        })
                                                                    }
                                                                >
                                                                    {Number(user.enabled)
                                                                        ? 'Deshabilitar usuario'
                                                                        : 'Habilitar usuario'}
                                                                </Dropdown.Item>
                                                            )}
                                                            {can('access.users') && user.id === session.user.id && (
                                                                <Dropdown.Header className="access-menu-hint">
                                                                    No puedes deshabilitar tu propia cuenta.
                                                                </Dropdown.Header>
                                                            )}
                                                        </Dropdown.Menu>,
                                                        document.body,
                                                    )}
                                                </Dropdown>
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
            {operation && (
                <UserOperation
                    user={operation.user}
                    operation={operation.kind}
                    onClose={() => setOperation(null)}
                    onDone={done}
                />
            )}
            {credential && <TemporaryCredential credential={credential} onClose={() => setCredential(null)} />}
        </>
    );
}
