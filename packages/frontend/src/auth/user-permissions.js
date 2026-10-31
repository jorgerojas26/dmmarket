import { MODULES } from '@dmmarket/permissions';
import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { fetcher } from 'swr-config';
import { LoadState, ManagementForm } from './access-ui';
import { useAuth } from './context';
import { RoleModules, RolePermissionMatrix } from './role-permissions';
import { authRequest } from './transport';

function grantsFor(permissions) {
    return Object.fromEntries(permissions.map(({ capability }) => [capability, true]));
}

export default function UserPermissions({ id, initial, onSaved, onDirtyChange, onBusyChange }) {
    const { can, check } = useAuth();
    const catalog = useSWR('/api/auth/roles/catalog', fetcher);
    const [selectedModule, setSelectedModule] = useState(MODULES[0].key);
    const [grants, setGrants] = useState(() => grantsFor(initial.permissions));
    const [saved, setSaved] = useState(() => grantsFor(initial.permissions));
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState('');
    const selected = Object.keys(grants)
        .filter((key) => grants[key])
        .sort();
    const changed =
        selected.join(',') !==
        Object.keys(saved)
            .filter((key) => saved[key])
            .sort()
            .join(',');
    const inherited = grantsFor(initial.inherited);
    const module = MODULES.find((module) => module.key === selectedModule);
    useEffect(() => {
        if (!changed) {
            setGrants(grantsFor(initial.permissions));
            setSaved(grantsFor(initial.permissions));
        }
    }, [initial.permissions, changed]);
    useEffect(() => {
        onDirtyChange(changed);
        return () => onDirtyChange(false);
    }, [changed, onDirtyChange]);
    return (
        <section className="access-assignment access-user-permissions" aria-label="Permisos adicionales">
            <h3>Permisos adicionales</h3>
            <p className="access-muted">
                Se suman a los roles. Los marcados como «Rol» se administran desde sus roles.
            </p>
            <LoadState error={catalog.error} loading={!catalog.data} onRetry={catalog.mutate}>
                <div className="access-role-editor">
                    <div className="access-role-layout">
                        <RoleModules
                            modules={MODULES}
                            catalog={catalog.data?.data || []}
                            grants={{ ...inherited, ...Object.fromEntries(selected.map((key) => [key, true])) }}
                            selected={selectedModule}
                            onSelect={setSelectedModule}
                            busy={busy}
                        />
                        <ManagementForm
                            button="Guardar permisos adicionales"
                            readOnly={!can('access.roles.assign')}
                            disabled={!changed}
                            onBusyChange={(value) => {
                                setBusy(value);
                                onBusyChange(value);
                            }}
                            onSubmit={async () => {
                                await authRequest(
                                    `users/${id}/permissions`,
                                    { permissions: selected.map((capability) => ({ capability })) },
                                    'PUT',
                                );
                                setSaved({ ...grants });
                                await onSaved();
                                setMessage('Permisos adicionales guardados. Se cerraron las sesiones del usuario.');
                                await check(false);
                            }}
                        >
                            <RolePermissionMatrix
                                module={module}
                                catalog={catalog.data?.data || []}
                                grants={grants}
                                inherited={inherited}
                                setGrants={setGrants}
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
