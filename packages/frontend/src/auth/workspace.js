import Sidebar from 'components/Sidebar';
import { useEffect, useRef, useState } from 'react';
import { Prompt, useHistory, useLocation } from 'react-router-dom';
import AccessEditor from './access-editor';
import { useDiscardChanges } from './access-ui';
import Users from './access-users';
import { useAuth } from './context';
import { PasswordForm } from './forms';
import './access.css';

export function Account() {
    const [changePassword, setChangePassword] = useState(false);
    return (
        <>
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

export default function AccessWorkspace() {
    const { can } = useAuth();
    const location = useLocation();
    const history = useHistory();
    const [dirty, setDirty] = useState(false);
    const allowNavigation = useRef(false);
    const { requestClose, confirmation } = useDiscardChanges(dirty);
    const view = location.hash === '#roles' && can('access.roles') ? 'roles' : 'usuarios';
    const items = [
        { eventKey: 'usuarios', label: 'Usuarios', icon: usersIcon },
        ...(can('access.roles') ? [{ eventKey: 'roles', label: 'Roles', icon: rolesIcon }] : []),
    ];
    useEffect(() => {
        if (location.hash !== `#${view}`) history.replace({ ...location, hash: `#${view}` });
    }, [view, location, history]);
    return (
        <section aria-label="Acceso" className="clientes-layout access-layout p-0">
            <Prompt
                when={dirty}
                message={() => {
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
                        if (next !== view)
                            requestClose(() => {
                                allowNavigation.current = dirty;
                                setDirty(false);
                                history.push({ ...location, hash: `#${next}` });
                            });
                    }}
                />
                <div className="clientes-content access-content">
                    <div className="access-workspace">
                        {view === 'usuarios' ? (
                            <Users onDirtyChange={setDirty} />
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
