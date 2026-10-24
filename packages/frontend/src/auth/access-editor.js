import useSWR from 'hooks/swr-wrapper';
import { useEffect, useState } from 'react';
import { fetcher } from 'swr-config';
import { useAuth } from './context';
import { AccessForm, Field } from './forms';

async function update(path, method, body) {
    const response = await fetch(`/api/auth/${path}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data?.error?.message || 'No se pudo cambiar el acceso.');
    return data;
}

function RoleEditor() {
    const { check } = useAuth();
    const { data: roles, mutate } = useSWR('/api/auth/roles', fetcher);
    const { data: catalog } = useSWR('/api/auth/roles/catalog', fetcher);
    const [id, setId] = useState('');
    const { data: selected, error } = useSWR(id ? `/api/auth/roles/${id}` : null, fetcher);
    const [name, setName] = useState('');
    const [grants, setGrants] = useState({});
    const [reason, setReason] = useState('');
    const [message, setMessage] = useState('');
    useEffect(() => {
        setName(selected?.name || '');
        setGrants(
            (selected?.permissions || []).reduce((result, grant) => {
                if (result[grant.capability] !== 'global') result[grant.capability] = grant.scope;
                return result;
            }, {}),
        );
    }, [selected]);
    return (
        <section aria-label="Editor de roles">
            <label htmlFor="access-role-editor">Rol para editar</label>
            <select
                id="access-role-editor"
                className="form-select"
                value={id}
                onChange={(event) => {
                    setId(event.target.value);
                    setName('');
                    setGrants({});
                    setMessage('');
                }}
            >
                <option value="">Crear rol nuevo</option>
                {roles?.data.map((role) => (
                    <option key={role.id} value={role.id}>
                        {role.name}
                    </option>
                ))}
            </select>
            {message && <p role="status">{message}</p>}
            {error && <p role="alert">No se pudo consultar el rol.</p>}
            {catalog && (!id || selected?.id === id) && (
                <AccessForm
                    title={id ? 'Editar rol' : 'Crear rol'}
                    button="Guardar rol"
                    onSubmit={async () => {
                        await update(id ? `roles/${id}` : 'roles', id ? 'PUT' : 'POST', {
                            name,
                            permissions: Object.entries(grants)
                                .filter(([, scope]) => scope)
                                .map(([capability, scope]) => ({ capability, scope })),
                            reason,
                        });
                        await mutate();
                        setMessage('Rol guardado. Se revocaron las sesiones afectadas por los cambios.');
                        setReason('');
                        await check(false);
                    }}
                >
                    <Field label="Nombre del rol" value={name} onChange={setName} maxLength={64} />
                    <p>
                        Las capacidades privilegiadas exigen MFA. Un permiso asignado sin vendedores vinculados no
                        concede acceso.
                    </p>
                    <p>
                        En ventas, utilidad y margen requieren sales.profit y sales.costs con cobertura del conjunto
                        consultado: total menos utilidad revela el costo.
                    </p>
                    {catalog.data.map((capability) => (
                        <div className="my-2" key={capability.capability}>
                            <label htmlFor={`permission-${capability.capability}`}>
                                {capability.capability}
                                {capability.privileged ? ' · MFA' : ''}
                            </label>
                            <select
                                id={`permission-${capability.capability}`}
                                className="form-select"
                                value={grants[capability.capability] || ''}
                                onChange={(event) =>
                                    setGrants({ ...grants, [capability.capability]: event.target.value })
                                }
                            >
                                <option value="">Sin permiso</option>
                                <option value="global">Global</option>
                                {capability.assigned && <option value="assigned">Vendedores vinculados</option>}
                            </select>
                        </div>
                    ))}
                    <Field
                        label="Motivo del cambio de rol"
                        value={reason}
                        onChange={setReason}
                        minLength={5}
                        maxLength={64}
                    />
                </AccessForm>
            )}
        </section>
    );
}

function Assignments({ id, roles }) {
    const { can, check } = useAuth();
    const { data: assignedRoles } = useSWR(can('access.roles') ? `/api/auth/users/${id}/roles` : null, fetcher);
    const { data: assignedSellers } = useSWR(can('access.links') ? `/api/auth/users/${id}/sellers` : null, fetcher);
    const [roleIds, setRoleIds] = useState([]);
    const [sellers, setSellers] = useState('');
    const [reason, setReason] = useState('');
    const [message, setMessage] = useState('');
    useEffect(() => {
        setRoleIds(assignedRoles?.data || []);
    }, [assignedRoles]);
    useEffect(() => {
        setSellers((assignedSellers?.data || []).join(', '));
    }, [assignedSellers]);
    return (
        <>
            {message && <p role="status">{message}</p>}
            {can('access.roles') && assignedRoles && (
                <AccessForm
                    title="Roles del usuario"
                    button="Guardar roles del usuario"
                    onSubmit={async () => {
                        await update(`users/${id}/roles`, 'PUT', { roleIds, reason });
                        setMessage('Roles asignados y sesiones del usuario revocadas.');
                        setReason('');
                        await check(false);
                    }}
                >
                    <label htmlFor="user-role-assignments">Roles asignados</label>
                    <select
                        id="user-role-assignments"
                        className="form-select"
                        multiple
                        value={roleIds}
                        onChange={(event) =>
                            setRoleIds(Array.from(event.target.selectedOptions, (option) => option.value))
                        }
                    >
                        {roles?.data.map((role) => (
                            <option key={role.id} value={role.id}>
                                {role.name}
                            </option>
                        ))}
                    </select>
                    <Field
                        label="Motivo de asignación de roles"
                        value={reason}
                        onChange={setReason}
                        minLength={5}
                        maxLength={64}
                    />
                </AccessForm>
            )}
            {can('access.links') && assignedSellers && (
                <AccessForm
                    title="Vendedores vinculados"
                    button="Guardar vendedores vinculados"
                    onSubmit={async () => {
                        await update(`users/${id}/sellers`, 'PUT', {
                            sellerIds: sellers
                                .split(',')
                                .map((value) => value.trim())
                                .filter(Boolean),
                            reason,
                        });
                        setMessage('Vínculos guardados y sesiones del usuario revocadas.');
                        setReason('');
                        await check(false);
                    }}
                >
                    <p>IDs existentes separados por coma. Vacío elimina los vínculos; no concede acceso global.</p>
                    <Field
                        required={false}
                        label="IDs de vendedores vinculados"
                        value={sellers}
                        onChange={setSellers}
                        maxLength={3300}
                    />
                    <Field
                        label="Motivo del cambio de vínculos"
                        value={reason}
                        onChange={setReason}
                        minLength={5}
                        maxLength={64}
                    />
                </AccessForm>
            )}
        </>
    );
}

export default function AccessEditor() {
    const { can } = useAuth();
    const [open, setOpen] = useState(false);
    const [id, setId] = useState('');
    const { data: users } = useSWR(open && can('access.users') ? '/api/auth/users' : null, fetcher);
    const { data: roles } = useSWR(open && can('access.roles') ? '/api/auth/roles' : null, fetcher);
    return (
        <section className="my-4">
            <button type="button" className="btn btn-outline-light" onClick={() => setOpen(!open)}>
                Administrar roles y vínculos
            </button>
            {open && (
                <>
                    {can('access.roles') && <RoleEditor />}
                    <label htmlFor="access-assignment-user">ID del usuario para asignaciones</label>
                    <input
                        id="access-assignment-user"
                        className="form-control"
                        list="access-assignment-users"
                        value={id}
                        maxLength={36}
                        onChange={(event) => setId(event.target.value)}
                    />
                    <datalist id="access-assignment-users">
                        {users?.data.map((user) => (
                            <option key={user.id} value={user.id}>
                                {user.username}
                            </option>
                        ))}
                    </datalist>
                    {id && <Assignments key={id} id={id} roles={roles} />}
                </>
            )}
        </section>
    );
}
