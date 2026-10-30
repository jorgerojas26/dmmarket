import { MODULES } from '@dmmarket/permissions';
import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { fetcher } from 'swr-config';
import { LoadState, ManagementForm, Pagination, useDiscardChanges } from './access-ui';
import { useAuth } from './context';
import { Field } from './forms';
import { authRequest } from './transport';

function grantsFor(role) {
    return (role?.permissions || []).reduce((grants, grant) => {
        if (grants[grant.capability] !== 'global') grants[grant.capability] = grant.scope;
        return grants;
    }, {});
}

function RoleForm({ role, catalog, onSaved, onCancel, onDirtyChange, readOnly = false }) {
    const { check } = useAuth();
    const [name, setName] = useState(role?.name || '');
    const [grants, setGrants] = useState(() => grantsFor(role));
    const [busy, setBusy] = useState(false);
    const changed =
        name !== (role?.name || '') ||
        catalog.some(({ capability }) => (grants[capability] || '') !== (grantsFor(role)[capability] || ''));
    const dirty = !readOnly && changed;
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
                    <span className="access-eyebrow">Acceso / Roles</span>
                    <h2>{readOnly ? 'Permisos del rol' : role ? 'Editar rol' : 'Crear rol'}</h2>
                    <p>Define qué puede hacer este perfil y sobre qué datos.</p>
                </div>
            </div>
            <div className="access-role-editor">
                <ManagementForm
                    readOnly={readOnly}
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
                                    .filter(([, scope]) => scope)
                                    .map(([capability, scope]) => ({ capability, scope })),
                            },
                            role ? 'PUT' : 'POST',
                        );
                        onDirtyChange(false);
                        await onSaved();
                        await check(false);
                    }}
                >
                    <div className="access-role-basics">
                        <Field label="Nombre del rol" value={name} onChange={setName} maxLength={64} />
                        <p className="access-muted">
                            Los permisos se suman a los de otros roles del usuario. Sin permisos seleccionados, este rol
                            no concede acceso.
                        </p>
                    </div>
                    {MODULES.map((module) => (
                        <section
                            className="access-permission-group"
                            key={module.key}
                            aria-label={`Permisos de ${module.label}`}
                        >
                            <h3>{module.label}</h3>
                            {module.resources.map((resource) => (
                                <section
                                    className="access-permission-submodule"
                                    key={resource.resource}
                                    aria-label={`${module.label} / ${resource.label}`}
                                >
                                    <h4>{resource.label}</h4>
                                    {['access', 'information', 'action'].map((kind) => {
                                        const entries = catalog.filter(
                                            (entry) => entry.resource === resource.resource && entry.kind === kind,
                                        );
                                        if (!entries.length) return null;
                                        return (
                                            <div key={kind} className="access-permission-section">
                                                <h5>
                                                    {
                                                        {
                                                            access: 'Acceso',
                                                            information: 'Información',
                                                            action: 'Acciones',
                                                        }[kind]
                                                    }
                                                </h5>
                                                {entries.map((capability) => {
                                                    const key = capability.capability;
                                                    return (
                                                        <div className="access-permission" key={key}>
                                                            <label htmlFor={`permission-${key}`}>
                                                                {capability.label}
                                                            </label>
                                                            <select
                                                                id={`permission-${key}`}
                                                                className="form-select"
                                                                aria-label={`${capability.label} · ${module.label} / ${resource.label}`}
                                                                disabled={busy}
                                                                value={grants[key] || ''}
                                                                onChange={(event) =>
                                                                    setGrants({ ...grants, [key]: event.target.value })
                                                                }
                                                            >
                                                                <option value="">Sin acceso</option>
                                                                <option value="global">Todo el negocio</option>
                                                                {capability.assigned && (
                                                                    <option value="assigned">
                                                                        Vendedores vinculados
                                                                    </option>
                                                                )}
                                                            </select>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        );
                                    })}
                                </section>
                            ))}
                        </section>
                    ))}
                    <div className="access-role-basics">
                        <p className="access-notice">
                            Los permisos limitados necesitan vendedores vinculados al usuario. Al modificar un rol se
                            cerrarán las sesiones de sus usuarios.
                        </p>
                    </div>
                </ManagementForm>
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
                                        <span>Perfil de permisos</span>
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

function SellersAssignment({ id, initial, onDirtyChange, onBusyChange, onSaved }) {
    const { check } = useAuth();
    const [selected, setSelected] = useState(initial);
    const [saved, setSaved] = useState(initial);
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const [reason, setReason] = useState('');
    const [message, setMessage] = useState('');
    const { data, error, mutate } = useSWR(
        `/api/auth/seller-options?search=${encodeURIComponent(search)}&page=${page}`,
        fetcher,
    );
    const { data: selectedNames } = useSWR(
        selected.length ? `/api/auth/seller-options?ids=${encodeURIComponent(selected.join(','))}` : null,
        fetcher,
    );
    const changed = [...selected].sort().join(',') !== [...saved].sort().join(',');
    useEffect(() => {
        if (!changed && !reason) {
            setSelected(initial);
            setSaved(initial);
        }
    }, [initial, changed, reason]);
    useEffect(() => {
        onDirtyChange(changed || Boolean(reason));
    }, [changed, reason, onDirtyChange]);
    return (
        <section className="access-assignment" aria-label="Vendedores vinculados">
            <h3>Vendedores vinculados</h3>
            <p className="access-muted">
                Limita los permisos que usan este alcance. Sin vínculos no se concede acceso restringido.
            </p>
            <ManagementForm
                button="Guardar vendedores vinculados"
                disabled={!changed}
                onBusyChange={onBusyChange}
                onSubmit={async () => {
                    await authRequest(`users/${id}/sellers`, { sellerIds: selected, reason }, 'PUT');
                    await onSaved(selected);
                    setSaved(selected);
                    setReason('');
                    setMessage('Vínculos guardados y sesiones del usuario revocadas.');
                    await check(false);
                }}
            >
                {selected.length > 0 && (
                    <fieldset className="access-selected" aria-label="Vendedores seleccionados">
                        {selected.map((sellerId) => (
                            <button
                                type="button"
                                className="access-chip"
                                key={sellerId}
                                aria-label={`Quitar ${selectedNames?.data.find((seller) => seller.id === sellerId)?.name || sellerId}`}
                                onClick={() => setSelected(selected.filter((value) => value !== sellerId))}
                            >
                                {selectedNames?.data.find((seller) => seller.id === sellerId)?.name || sellerId}
                                <span aria-hidden="true"> ×</span>
                            </button>
                        ))}
                    </fieldset>
                )}
                <input
                    type="search"
                    className="form-control"
                    aria-label="Buscar vendedores"
                    placeholder="Buscar por nombre o código…"
                    value={search}
                    onChange={(event) => {
                        setSearch(event.target.value);
                        setPage(1);
                    }}
                />
                <LoadState error={error} loading={!data} onRetry={mutate}>
                    <fieldset className="access-checklist" aria-label="Vendedores disponibles">
                        {data?.data.map((seller) => (
                            <label className="access-check" key={seller.id}>
                                <input
                                    type="checkbox"
                                    checked={selected.includes(seller.id)}
                                    disabled={!selected.includes(seller.id) && selected.length >= 100}
                                    onChange={(event) =>
                                        setSelected(
                                            event.target.checked
                                                ? [...selected, seller.id]
                                                : selected.filter((value) => value !== seller.id),
                                        )
                                    }
                                />
                                <span>
                                    {seller.name || 'Sin nombre'} · {seller.id}
                                </span>
                            </label>
                        ))}
                        {!data?.data.length && <p className="access-empty">No se encontraron vendedores.</p>}
                    </fieldset>
                </LoadState>
                {data && <Pagination page={page} total={data.total} onChange={setPage} />}
                <p className="access-muted">
                    {selected.length} seleccionados · Guardar cerrará las sesiones de este usuario.
                </p>
                <Field
                    label="Motivo del cambio de vínculos"
                    value={reason}
                    onChange={setReason}
                    minLength={5}
                    maxLength={64}
                />
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
    const sellers = useSWR(can('access.links.read') ? `/api/auth/users/${id}/sellers` : null, fetcher);
    const [rolesDirty, setRolesDirty] = useState(false);
    const [sellersDirty, setSellersDirty] = useState(false);
    useEffect(() => {
        onDirtyChange(rolesDirty || sellersDirty);
    }, [rolesDirty, sellersDirty, onDirtyChange]);
    return (
        <>
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
                            onSaved={(data) => assignedRoles.mutate({ data }, false)}
                            onDirtyChange={setRolesDirty}
                            onBusyChange={onBusyChange}
                        />
                    ) : (
                        <section aria-label="Roles del usuario">
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
            {can('access.links.read') && (
                <LoadState error={sellers.error} loading={!sellers.data} onRetry={sellers.mutate}>
                    {can('access.links.update') ? (
                        <SellersAssignment
                            id={id}
                            initial={sellers.data?.data || []}
                            onSaved={(data) => sellers.mutate({ data }, false)}
                            onDirtyChange={setSellersDirty}
                            onBusyChange={onBusyChange}
                        />
                    ) : (
                        <LinkedSellers initial={sellers.data?.data || []} />
                    )}
                </LoadState>
            )}
        </>
    );
}

function LinkedSellers({ initial }) {
    const { data, error, mutate } = useSWR(
        initial.length ? `/api/auth/seller-options?ids=${encodeURIComponent(initial.join(','))}` : null,
        fetcher,
    );
    return (
        <section aria-label="Vendedores vinculados">
            <h3>Vendedores vinculados</h3>
            {initial.length ? (
                <LoadState error={error} loading={!data} onRetry={mutate}>
                    <ul>
                        {data?.data.map((seller) => (
                            <li key={seller.id}>{seller.name}</li>
                        ))}
                    </ul>
                </LoadState>
            ) : (
                <p className="access-muted">Sin vendedores vinculados.</p>
            )}
        </section>
    );
}
