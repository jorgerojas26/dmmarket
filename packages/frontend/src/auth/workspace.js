import useSWR from 'hooks/swr-wrapper';
import { useState } from 'react';
import { fetcher } from 'swr-config';
import AccessEditor from './access-editor';
import { useAuth } from './context';
import { AccessForm, Field, PasswordForm, ReauthenticationForm } from './forms';
import Parties from './parties';
import Sales from './sales';
import { authRequest } from './transport';

function Rates() {
    const { data, error } = useSWR('/api/currency_rates', fetcher);
    return (
        <section className="card bg-dark border-secondary p-4 my-3">
            <h2 className="h4">Tasas de referencia</h2>
            {error && <p role="alert">No se pudieron consultar las tasas autorizadas.</p>}
            {!data && !error && <p role="status">Cargando tasas…</p>}
            {data && (
                <table className="table table-dark">
                    <thead>
                        <tr>
                            <th>Moneda</th>
                            <th>Cambio</th>
                        </tr>
                    </thead>
                    <tbody>
                        {data.map((row) => (
                            <tr key={row.Simbolo}>
                                <td>{row.Simbolo}</td>
                                <td>{row.Cambio}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
        </section>
    );
}

function Users() {
    const { session, can } = useAuth();
    const [page, setPage] = useState(1);
    const { data, error, mutate } = useSWR(`/api/auth/users?page=${page}`, fetcher);
    const { data: roles } = useSWR(can('access.roles') ? '/api/auth/roles' : null, fetcher);
    const [username, setUsername] = useState('');
    const [displayName, setDisplayName] = useState('');
    const [roleId, setRoleId] = useState('');
    const [reason, setReason] = useState('');
    const [credential, setCredential] = useState(null);
    const [selected, setSelected] = useState(null);
    const [operation, setOperation] = useState('disable');
    const [operationReason, setOperationReason] = useState('');
    const [showCredential, setShowCredential] = useState(false);
    return (
        <section aria-label="Administración de usuarios">
            <h2 className="h4 mt-4">Administración de usuarios</h2>
            {error && <p role="alert">No se pudo consultar el directorio autorizado.</p>}
            {data && (
                <>
                    <table className="table table-dark">
                        <thead>
                            <tr>
                                <th>Usuario</th>
                                <th>Nombre</th>
                                <th>Estado</th>
                                <th>Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
                            {data.data.map((user) => (
                                <tr key={user.id}>
                                    <td>{user.username}</td>
                                    <td>{user.display_name}</td>
                                    <td>{Number(user.enabled) ? 'Habilitado' : 'Bloqueado'}</td>
                                    <td>
                                        {user.id !== session.user.id && (
                                            <>
                                                <button
                                                    type="button"
                                                    className="btn btn-sm btn-outline-light me-2"
                                                    onClick={() => {
                                                        setSelected(user);
                                                        setOperation(Number(user.enabled) ? 'disable' : 'enable');
                                                    }}
                                                >
                                                    Cambiar estado de {user.username}
                                                </button>
                                                {can('access.recover') && (
                                                    <button
                                                        type="button"
                                                        className="btn btn-sm btn-outline-warning"
                                                        onClick={() => {
                                                            setSelected(user);
                                                            setOperation('reset');
                                                        }}
                                                    >
                                                        Recuperar {user.username}
                                                    </button>
                                                )}
                                            </>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    <button
                        type="button"
                        className="btn btn-outline-light me-2"
                        disabled={page === 1}
                        onClick={() => setPage(page - 1)}
                    >
                        Página anterior
                    </button>
                    <span>Página {page}</span>
                    <button
                        type="button"
                        className="btn btn-outline-light ms-2"
                        disabled={page * 100 >= data.total}
                        onClick={() => setPage(page + 1)}
                    >
                        Página siguiente
                    </button>
                </>
            )}
            {selected && (
                <AccessForm
                    title={`Confirmar operación sobre ${selected.username}`}
                    button="Confirmar operación"
                    onSubmit={async () => {
                        const result = operation.startsWith('reset')
                            ? await authRequest(`users/${selected.id}/reset`, {
                                  resetMfa: operation === 'reset-mfa',
                                  reason: operationReason,
                              })
                            : await authRequest(`users/${selected.id}/enabled`, {
                                  enabled: operation === 'enable',
                                  reason: operationReason,
                              });
                        if (result.temporaryPassword) {
                            setCredential(result);
                            setShowCredential(false);
                        }
                        setSelected(null);
                        setOperationReason('');
                        await mutate();
                    }}
                >
                    <label htmlFor="access-operation" className="form-label">
                        Operación
                    </label>
                    <select
                        id="access-operation"
                        className="form-select"
                        value={operation}
                        onChange={(event) => setOperation(event.target.value)}
                    >
                        <option value="disable">Bloquear cuenta</option>
                        <option value="enable">Habilitar cuenta</option>
                        {can('access.recover') && (
                            <>
                                <option value="reset">Emitir contraseña temporal conservando MFA</option>
                                <option value="reset-mfa">Recuperar contraseña y MFA</option>
                            </>
                        )}
                    </select>
                    <Field
                        label="Motivo de la operación"
                        value={operationReason}
                        onChange={setOperationReason}
                        minLength={5}
                        maxLength={64}
                    />
                    <button type="button" className="btn btn-outline-light mt-2" onClick={() => setSelected(null)}>
                        Cancelar operación
                    </button>
                </AccessForm>
            )}
            <AccessForm
                title="Crear usuario"
                button="Crear usuario"
                onSubmit={async () => {
                    const result = await authRequest('users', {
                        username,
                        displayName,
                        roleIds: roleId ? [roleId] : [],
                        reason,
                    });
                    setCredential(result);
                    setShowCredential(false);
                    setUsername('');
                    setDisplayName('');
                    setReason('');
                    setRoleId('');
                    await mutate();
                }}
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
                    <>
                        <label htmlFor="initial-role" className="form-label">
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
                    </>
                )}
                <Field label="Motivo del alta" value={reason} onChange={setReason} minLength={5} maxLength={64} />
            </AccessForm>
            {credential && (
                <section className="alert alert-warning" aria-label="Credencial temporal emitida">
                    <h3 className="h5">Credencial temporal emitida para {credential.username}</h3>
                    <p>Se muestra solo ahora. Entrega por un canal con identidad verificada. Vence en 30 minutos.</p>
                    <input
                        aria-label="Contraseña temporal emitida"
                        autoComplete="off"
                        className="form-control"
                        type={showCredential ? 'text' : 'password'}
                        value={credential.temporaryPassword}
                        readOnly
                    />
                    <button
                        type="button"
                        className="btn btn-outline-dark mt-2 me-2"
                        onClick={() => setShowCredential(!showCredential)}
                    >
                        {showCredential ? 'Ocultar contraseña temporal' : 'Mostrar contraseña temporal'}
                    </button>
                    <button type="button" className="btn btn-dark mt-2" onClick={() => setCredential(null)}>
                        Cerrar credencial temporal
                    </button>
                </section>
            )}
        </section>
    );
}

export default function SessionWorkspace() {
    const { session, can } = useAuth();
    const [changePassword, setChangePassword] = useState(false);
    return (
        <>
            <p role="status">Acceso verificado para {session.user.displayName}.</p>
            <p className="text-warning">
                Los módulos de negocio sin autorización completa permanecen deshabilitados durante esta implementación.
            </p>
            {can('rates.read') && <Rates />}
            {session.permissions.some((grant) => grant.capability === 'sales.read') && <Sales />}
            {session.permissions.some((grant) => ['clients.read', 'sellers.read'].includes(grant.capability)) && (
                <Parties />
            )}
            {['access.users', 'access.roles', 'access.links', 'access.recover'].some(can) && <ReauthenticationForm />}
            {can('access.users') && <Users />}
            {(can('access.roles') || can('access.links')) && <AccessEditor />}
            {!session.permissions.some((grant) =>
                [
                    'rates.read',
                    'sales.read',
                    'clients.read',
                    'sellers.read',
                    'access.users',
                    'access.roles',
                    'access.links',
                ].includes(grant.capability),
            ) && <p>No tienes módulos habilitados en esta fase. Consulta al responsable de acceso.</p>}
            <button
                type="button"
                className="btn btn-outline-light my-3"
                onClick={() => setChangePassword(!changePassword)}
            >
                {changePassword ? 'Ocultar cambio de contraseña' : 'Cambiar mi contraseña'}
            </button>
            {changePassword && <PasswordForm />}
        </>
    );
}
