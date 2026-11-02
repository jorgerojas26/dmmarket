import { MODULES } from '@dmmarket/permissions';
import { useEffect, useState } from 'react';
import OverlayTrigger from 'react-bootstrap/OverlayTrigger';
import Popover from 'react-bootstrap/Popover';
import useSWR from 'swr';
import { fetcher } from 'swr-config';
import { LoadState, ManagementForm } from './access-ui';
import { useAuth } from './context';
import { RoleModules, RolePermissionMatrix } from './role-permissions';
import { authRequest } from './transport';

function grantsFor(permissions) {
    return Object.fromEntries(permissions.map(({ capability }) => [capability, true]));
}

function sameSelection(first, second) {
    return [...first].sort().join(',') === [...second].sort().join(',');
}

export default function UserAccess({ id, initial, onSaved, onDirtyChange, onBusyChange }) {
    const { can, check } = useAuth();
    const catalog = useSWR('/api/auth/roles/catalog', fetcher);
    const [selectedModule, setSelectedModule] = useState(MODULES[0].key);
    const [draft, setDraft] = useState(null);
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState('');
    const current = draft || initial;
    const grants = grantsFor(current.permissions);
    const changed =
        !sameSelection(current.roleIds, initial.roleIds) ||
        !sameSelection(
            Object.keys(grants),
            initial.permissions.map((grant) => grant.capability),
        );
    const selectedRoles = initial.roles.filter((role) => current.roleIds.includes(role.id));
    const availableRoles = initial.roles.filter((role) => !current.roleIds.includes(role.id));
    const sourcesFor = (ids) => {
        const sources = {};
        for (const role of initial.roles.filter((role) => ids.includes(role.id))) {
            for (const { capability } of role.permissions)
                sources[capability] = [...(sources[capability] || []), role.name];
        }
        return sources;
    };
    const sources = sourcesFor(current.roleIds);
    const inherited = Object.fromEntries(Object.keys(sources).map((capability) => [capability, true]));
    const effective = { ...inherited, ...grants };
    const previous = {
        ...Object.fromEntries(Object.keys(sourcesFor(initial.roleIds)).map((capability) => [capability, true])),
        ...grantsFor(initial.permissions),
    };
    const added = Object.keys(effective).filter((capability) => !previous[capability]).length;
    const removed = Object.keys(previous).filter((capability) => !effective[capability]).length;
    const module = MODULES.find((module) => module.key === selectedModule);
    const changeRoles = (update) => {
        setMessage('');
        setDraft((previous) => ({ ...(previous || initial), roleIds: update((previous || initial).roleIds) }));
    };
    const changeGrants = (update) => {
        setMessage('');
        setDraft((previous) => ({
            ...(previous || initial),
            permissions: Object.entries(update(grantsFor((previous || initial).permissions)))
                .filter(([, enabled]) => enabled)
                .map(([capability]) => ({ capability })),
        }));
    };
    useEffect(() => {
        onDirtyChange(changed);
        return () => onDirtyChange(false);
    }, [changed, onDirtyChange]);
    return (
        <section className="access-assignment access-user-access" aria-label="Acceso del usuario">
            <header className="access-section-head">
                <div>
                    <h3>Acceso</h3>
                </div>
                <OverlayTrigger
                    trigger="click"
                    rootClose
                    placement="bottom"
                    overlay={
                        <Popover id="user-access-help" className="kpi-help-popover">
                            <Popover.Body>
                                <div className="kpi-help-line">
                                    Para retirar un permiso heredado, quita el rol que lo concede.
                                </div>
                                <div className="kpi-help-line">
                                    Los permisos adicionales solo afectan a esta cuenta.
                                </div>
                                <div className="kpi-help-line">
                                    Los cambios de un rol alcanzan a todas las cuentas que lo tienen asignado.
                                </div>
                                <div className="kpi-help-line">Guardar el acceso cierra las sesiones del usuario.</div>
                            </Popover.Body>
                        </Popover>
                    }
                >
                    <button type="button" className="panel-help-btn" aria-label="Ayuda sobre acceso del usuario">
                        ?
                    </button>
                </OverlayTrigger>
            </header>
            <fieldset
                className="access-user-role-picker"
                aria-label="Roles del usuario"
                disabled={busy || !can('access.roles.assign')}
            >
                <legend>Roles</legend>
                <div className="access-user-role-selection">
                    {selectedRoles.map((role) => (
                        <span className="access-selected-role" key={role.id}>
                            <span>{role.name}</span>
                            {can('access.roles.assign') && (
                                <button
                                    type="button"
                                    aria-label={`Quitar rol ${role.name}`}
                                    onClick={() => changeRoles((ids) => ids.filter((id) => id !== role.id))}
                                >
                                    ×
                                </button>
                            )}
                        </span>
                    ))}
                    {!selectedRoles.length && <span className="access-muted">Sin roles asignados</span>}
                    {can('access.roles.assign') && (
                        <select
                            className="form-select access-add-role"
                            aria-label="Añadir rol"
                            value=""
                            disabled={!availableRoles.length}
                            form="user-access-form"
                            onChange={(event) => {
                                const id = event.target.value;
                                if (id) changeRoles((ids) => [...ids, id]);
                            }}
                        >
                            <option value="">
                                {availableRoles.length ? '+ Añadir rol' : 'Todos los roles asignados'}
                            </option>
                            {availableRoles.map((role) => (
                                <option key={role.id} value={role.id}>
                                    {role.name}
                                </option>
                            ))}
                        </select>
                    )}
                </div>
            </fieldset>
            <LoadState error={catalog.error} loading={!catalog.data} onRetry={catalog.mutate}>
                <div className="access-role-editor">
                    <div className="access-role-layout">
                        <RoleModules
                            modules={MODULES}
                            catalog={catalog.data?.data || []}
                            grants={effective}
                            selected={selectedModule}
                            onSelect={setSelectedModule}
                            busy={busy}
                        />
                        <ManagementForm
                            id="user-access-form"
                            button="Guardar acceso"
                            readOnly={!can('access.roles.assign')}
                            disabled={!changed}
                            cancelLabel="Descartar cambios"
                            onCancel={
                                changed
                                    ? () => {
                                          setMessage('');
                                          setDraft(null);
                                      }
                                    : undefined
                            }
                            secondaryAction={
                                changed && (
                                    <span className="access-save-state">
                                        Cambios sin guardar
                                        {added || removed ? ` · ${added} permisos nuevos, ${removed} retirados` : ''}
                                    </span>
                                )
                            }
                            onBusyChange={(value) => {
                                setBusy(value);
                                onBusyChange(value);
                            }}
                            onSubmit={async () => {
                                const saved = await authRequest(
                                    `users/${id}/access`,
                                    { roleIds: current.roleIds, permissions: current.permissions },
                                    'PUT',
                                );
                                await onSaved(saved);
                                setDraft(null);
                                setMessage('Acceso guardado. Se cerraron las sesiones del usuario.');
                                await check(false);
                            }}
                        >
                            <RolePermissionMatrix
                                module={module}
                                catalog={catalog.data?.data || []}
                                grants={grants}
                                inherited={inherited}
                                sources={sources}
                                showSources
                                setGrants={changeGrants}
                            />
                            {message && (
                                <p role="status" className="access-success">
                                    {message}
                                </p>
                            )}
                        </ManagementForm>
                    </div>
                </div>
            </LoadState>
        </section>
    );
}
