import { MODULES } from '@dmmarket/permissions';
import { useEffect, useState } from 'react';
import OverlayTrigger from 'react-bootstrap/OverlayTrigger';
import Popover from 'react-bootstrap/Popover';
import useSWR from 'swr';
import { fetcher } from 'swr-config';
import { LoadState, ManagementForm, useDiscardChanges } from './access-ui';
import { CommercialProfileForm } from './commercial-profile';
import { useAuth } from './context';
import { Field } from './forms';
import { RoleModules, RolePermissionMatrix } from './role-permissions';
import { authRequest } from './transport';
import UserPermissions from './user-permissions';

function grantsFor(role) {
    return (role?.permissions || []).reduce((grants, grant) => {
        grants[grant.capability] = true;
        return grants;
    }, {});
}

function RoleForm({ role, catalog, onSaved, onCancel, onDirtyChange, readOnly = false }) {
    const { check } = useAuth();
    const [name, setName] = useState(role?.name || '');
    const [grants, setGrants] = useState(() => grantsFor(role));
    const [busy, setBusy] = useState(false);
    const [selectedModule, setSelectedModule] = useState(MODULES[0].key);
    const changed =
        name !== (role?.name || '') ||
        catalog.some(({ capability }) => Boolean(grants[capability]) !== Boolean(grantsFor(role)[capability]));
    const dirty = !readOnly && changed;
    const module = MODULES.find((module) => module.key === selectedModule);
    const moduleEntries = catalog.filter((entry) => entry.module === selectedModule);
    const hasModulePermissions = moduleEntries.some(({ capability }) => grants[capability]);
    const { requestClose, confirmation } = useDiscardChanges(dirty);
    useEffect(() => {
        onDirtyChange(dirty);
        return () => onDirtyChange(false);
    }, [dirty, onDirtyChange]);
    return (
        <>
            <div className="access-header">
                <div>
                    <button
                        type="button"
                        className="access-back"
                        disabled={busy}
                        onClick={() => requestClose(onCancel)}
                    >
                        <svg
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            aria-hidden="true"
                        >
                            <path d="m12 5-7 7 7 7M5 12h14" />
                        </svg>
                        Volver a roles
                    </button>
                    <div className="panel-help-title access-role-title">
                        <h2>{readOnly ? 'Permisos del rol' : role ? 'Editar rol' : 'Crear rol'}</h2>
                        <OverlayTrigger
                            trigger="click"
                            rootClose
                            placement="bottom"
                            overlay={
                                <Popover id="role-permissions-help" className="kpi-help-popover">
                                    <Popover.Body>
                                        <div className="kpi-help-line">Los permisos se suman entre roles.</div>
                                        <div className="kpi-help-line">
                                            Los permisos comerciales se aplican a la identidad de la cuenta.
                                        </div>
                                        <div className="kpi-help-line">
                                            Consultar datos de otros vendedores requiere el permiso explícito
                                            correspondiente.
                                        </div>
                                        <div className="kpi-help-line">
                                            <span className="kpi-help-k">Consulta: </span>
                                            incluye impresión, salvo permisos adicionales.
                                        </div>
                                        <div className="kpi-help-line">
                                            <span className="kpi-help-k">Rentabilidad: </span>
                                            costos, utilidad y margen.
                                        </div>
                                        <div className="kpi-help-line">
                                            Guardar cambios en un rol cierra las sesiones afectadas.
                                        </div>
                                    </Popover.Body>
                                </Popover>
                            }
                        >
                            <button
                                type="button"
                                className="panel-help-btn"
                                aria-label="Ayuda sobre permisos"
                                title="Ayuda sobre permisos"
                            >
                                ?
                            </button>
                        </OverlayTrigger>
                    </div>
                </div>
            </div>
            <fieldset className="access-role-identity" disabled={busy || readOnly}>
                <Field
                    label="Nombre del rol"
                    value={name}
                    onChange={setName}
                    maxLength={64}
                    className="access-role-name"
                    form="access-role-form"
                />
            </fieldset>
            <div className="access-role-editor">
                <div className="access-role-layout">
                    <RoleModules
                        modules={MODULES}
                        catalog={catalog}
                        grants={grants}
                        selected={selectedModule}
                        onSelect={setSelectedModule}
                        busy={busy}
                    />
                    <ManagementForm
                        id="access-role-form"
                        readOnly={readOnly}
                        secondaryAction={
                            hasModulePermissions && (
                                <button
                                    type="button"
                                    className="access-role-clear"
                                    aria-label={`Quitar permisos de ${module.label}`}
                                    onClick={() =>
                                        setGrants((previous) => {
                                            const next = { ...previous };
                                            for (const entry of moduleEntries) delete next[entry.capability];
                                            return next;
                                        })
                                    }
                                >
                                    Quitar permisos
                                </button>
                            )
                        }
                        button="Guardar rol"
                        onBusyChange={setBusy}
                        disabled={!changed}
                        onCancel={() => {
                            if (!busy) requestClose(onCancel);
                        }}
                        onSubmit={async () => {
                            await authRequest(
                                role ? `roles/${role.id}` : 'roles',
                                {
                                    name,
                                    permissions: Object.entries(grants)
                                        .filter(([, enabled]) => enabled)
                                        .map(([capability]) => ({ capability })),
                                },
                                role ? 'PUT' : 'POST',
                            );
                            onDirtyChange(false);
                            await onSaved();
                            await check(false);
                        }}
                    >
                        <RolePermissionMatrix
                            key={selectedModule}
                            module={module}
                            catalog={catalog}
                            grants={grants}
                            setGrants={setGrants}
                        />
                    </ManagementForm>
                </div>
            </div>
            {confirmation}
        </>
    );
}

export default function AccessEditor({ onDirtyChange }) {
    const { can } = useAuth();
    const { data: roles, error, mutate } = useSWR('/api/auth/roles', fetcher);
    const { data: catalog, error: catalogError, mutate: retryCatalog } = useSWR('/api/auth/roles/catalog', fetcher);
    const [editing, setEditing] = useState(null);
    const {
        data: role,
        error: roleError,
        mutate: retryRole,
    } = useSWR(editing && editing !== 'new' ? `/api/auth/roles/${editing}` : null, fetcher);
    const [search, setSearch] = useState('');
    const [message, setMessage] = useState('');
    if (editing)
        return (
            <LoadState
                error={catalogError || roleError}
                loading={!catalog || (editing !== 'new' && role?.id !== editing)}
                onRetry={() => {
                    retryCatalog();
                    retryRole();
                }}
            >
                <RoleForm
                    key={editing}
                    readOnly={!can(editing === 'new' ? 'access.roles.create' : 'access.roles.update')}
                    role={editing === 'new' ? null : role}
                    catalog={catalog?.data || []}
                    onDirtyChange={onDirtyChange}
                    onCancel={() => setEditing(null)}
                    onSaved={async () => {
                        setEditing(null);
                        setMessage('Rol guardado. Se revocaron las sesiones afectadas por los cambios.');
                        await mutate();
                    }}
                />
            </LoadState>
        );
    const filtered = (roles?.data || []).filter((item) =>
        item.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()),
    );
    return (
        <>
            <header className="access-header">
                <div>
                    <h2>Roles</h2>
                </div>
                {can('access.roles.create') && (
                    <button
                        type="button"
                        className="btn btn-primary"
                        onClick={() => {
                            setMessage('');
                            setEditing('new');
                        }}
                    >
                        Crear rol
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
                        aria-label="Buscar roles"
                        placeholder="Buscar rol…"
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                    />
                </div>
                <LoadState error={error} loading={!roles} onRetry={mutate}>
                    {filtered.length ? (
                        <ul className="access-role-list">
                            {filtered.map((item) => (
                                <li key={item.id}>
                                    <div className="access-role-symbol" aria-hidden="true">
                                        ◇
                                    </div>
                                    <div>
                                        <strong>{item.name}</strong>
                                    </div>
                                    <button
                                        type="button"
                                        className="btn btn-outline-light"
                                        aria-label={`${can('access.roles.update') ? 'Editar' : 'Ver permisos de'} ${item.name}`}
                                        onClick={() => {
                                            setMessage('');
                                            setEditing(item.id);
                                        }}
                                    >
                                        {can('access.roles.update') ? 'Editar' : 'Ver permisos'}
                                    </button>
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <p className="access-empty">{search ? 'No se encontraron roles.' : 'Todavía no hay roles.'}</p>
                    )}
                </LoadState>
            </div>
        </>
    );
}

function RolesAssignment({ id, initial, roles, onDirtyChange, onBusyChange, onSaved }) {
    const { check } = useAuth();
    const [selected, setSelected] = useState(initial);
    const [saved, setSaved] = useState(initial);
    const [message, setMessage] = useState('');
    const changed = [...selected].sort().join(',') !== [...saved].sort().join(',');
    useEffect(() => {
        if (!changed) {
            setSelected(initial);
            setSaved(initial);
        }
    }, [initial, changed]);
    useEffect(() => {
        onDirtyChange(changed);
    }, [changed, onDirtyChange]);
    return (
        <section className="access-assignment" aria-label="Roles del usuario">
            <h3>Roles</h3>
            <p className="access-muted">Selecciona uno o varios perfiles para esta cuenta.</p>
            <ManagementForm
                button="Guardar roles del usuario"
                disabled={!changed}
                onBusyChange={onBusyChange}
                onSubmit={async () => {
                    await authRequest(`users/${id}/roles`, { roleIds: selected }, 'PUT');
                    await onSaved(selected);
                    setSaved(selected);
                    setMessage('Roles asignados y sesiones del usuario revocadas.');
                    await check(false);
                }}
            >
                <fieldset className="access-checklist" aria-label="Roles asignados">
                    {roles.map((role) => (
                        <label className="access-check" key={role.id}>
                            <input
                                type="checkbox"
                                checked={selected.includes(role.id)}
                                onChange={(event) =>
                                    setSelected(
                                        event.target.checked
                                            ? [...selected, role.id]
                                            : selected.filter((value) => value !== role.id),
                                    )
                                }
                            />
                            <span>{role.name}</span>
                        </label>
                    ))}
                    {!roles.length && (
                        <p className="access-muted">No hay roles disponibles. Crea uno en la sección Roles.</p>
                    )}
                </fieldset>
                <p className="access-muted">Guardar los cambios cerrará las sesiones de este usuario.</p>
                {message && (
                    <p role="status" className="access-success">
                        {message}
                    </p>
                )}
            </ManagementForm>
        </section>
    );
}

export function Assignments({ id, onDirtyChange, onBusyChange }) {
    const { can } = useAuth();
    const roles = useSWR(can('access.roles.read') ? '/api/auth/roles' : null, fetcher);
    const assignedRoles = useSWR(can('access.roles.read') ? `/api/auth/users/${id}/roles` : null, fetcher);
    const individual = useSWR(can('access.roles.read') ? `/api/auth/users/${id}/permissions` : null, fetcher);
    const profile = useSWR(can('access.profile.read') ? `/api/auth/users/${id}/commercial-profile` : null, fetcher);
    const [rolesDirty, setRolesDirty] = useState(false);
    const [profileDirty, setProfileDirty] = useState(false);
    const [permissionsDirty, setPermissionsDirty] = useState(false);
    useEffect(() => {
        onDirtyChange(rolesDirty || profileDirty || permissionsDirty);
    }, [rolesDirty, profileDirty, permissionsDirty, onDirtyChange]);
    return (
        <div className="access-user-assignments">
            <div className="access-user-overview">
                {can('access.roles.read') && (
                    <LoadState
                        error={roles.error || assignedRoles.error}
                        loading={!roles.data || !assignedRoles.data}
                        onRetry={() => {
                            roles.mutate();
                            assignedRoles.mutate();
                        }}
                    >
                        {can('access.roles.assign') ? (
                            <RolesAssignment
                                id={id}
                                initial={assignedRoles.data?.data || []}
                                roles={roles.data?.data || []}
                                onSaved={async (data) => {
                                    await assignedRoles.mutate({ data }, false);
                                    await individual.mutate();
                                }}
                                onDirtyChange={setRolesDirty}
                                onBusyChange={onBusyChange}
                            />
                        ) : (
                            <section className="access-assignment" aria-label="Roles del usuario">
                                <h3>Roles</h3>
                                <ul>
                                    {(roles.data?.data || [])
                                        .filter((role) => assignedRoles.data?.data.includes(role.id))
                                        .map((role) => (
                                            <li key={role.id}>{role.name}</li>
                                        ))}
                                </ul>
                            </section>
                        )}
                    </LoadState>
                )}
                {can('access.profile.read') && (
                    <LoadState error={profile.error} loading={profile.data === undefined} onRetry={profile.mutate}>
                        {can('access.profile.update') ? (
                            <CommercialProfileForm
                                id={id}
                                initial={profile.data}
                                onSaved={(data) => profile.mutate(data, false)}
                                onDirtyChange={setProfileDirty}
                                onBusyChange={onBusyChange}
                            />
                        ) : (
                            <section className="access-assignment" aria-label="Identidad comercial de la cuenta">
                                <h3>Perfil comercial</h3>
                                <p>{profile.data?.name || 'Sin perfil comercial'}</p>
                            </section>
                        )}
                    </LoadState>
                )}
            </div>
            {can('access.roles.read') && (
                <LoadState error={individual.error} loading={!individual.data} onRetry={individual.mutate}>
                    {individual.data && (
                        <UserPermissions
                            id={id}
                            initial={individual.data}
                            onSaved={() => individual.mutate()}
                            onDirtyChange={setPermissionsDirty}
                            onBusyChange={onBusyChange}
                        />
                    )}
                </LoadState>
            )}
        </div>
    );
}
