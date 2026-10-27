import { useAuth } from 'auth/context';
import Dropdown from 'react-bootstrap/Dropdown';
import { NavLink } from 'react-router-dom';
import useSWR from 'swr';
import { fetcher } from 'swr-config';
import './styles.css';

function MenuIcon({ name }) {
    const icons = {
        account: (
            <>
                <circle cx="12" cy="8" r="4" />
                <path d="M4 21v-2a8 8 0 0 1 16 0v2" />
            </>
        ),
        access: (
            <>
                <path d="m12 3 8 4v5c0 5-8 9-8 9s-8-4-8-9V7l8-4Z" />
                <path d="m8 12 3 3 5-6" />
            </>
        ),
        audit: (
            <>
                <rect x="5" y="4" width="14" height="17" rx="2" />
                <path d="M9 4V2h6v2M9 10h6M9 14h6M9 18h3" />
            </>
        ),
        logout: <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />,
    };
    return (
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
            {icons[name]}
        </svg>
    );
}

export default function UserMenu({ onLogout, onNavigate, administration }) {
    const { session } = useAuth();
    const { data, error, mutate } = useSWR('/api/auth/profile', fetcher);
    const name = session.user.displayName || session.user.username;
    const initials = name
        .trim()
        .split(/\s+/)
        .map((part) => Array.from(part)[0])
        .filter(Boolean)
        .slice(0, 2)
        .join('')
        .toLocaleUpperCase();
    const roleNames = data?.roles.map((role) => role.name).join(' · ');
    const roleText = data ? roleNames || 'Sin rol asignado' : error ? 'Rol no disponible' : 'Cargando rol…';
    return (
        <Dropdown align="end" className="user-menu">
            <Dropdown.Toggle
                id="account-menu"
                variant="link"
                className="user-menu-trigger app-navbar-account-toggle"
                aria-label="Menú de cuenta"
                aria-describedby="account-summary"
            >
                <span className="user-menu-avatar" aria-hidden="true">
                    {initials}
                </span>
                <span className="user-menu-meta" id="account-summary">
                    <span className="user-menu-name" title={name}>
                        {name}
                    </span>
                    <span className="user-menu-role" title={roleText}>
                        {roleText}
                    </span>
                </span>
                <svg
                    className="user-menu-chevron"
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    aria-hidden="true"
                >
                    <path d="m6 9 6 6 6-6" />
                </svg>
                <span className="visually-hidden" role="status" aria-label="Usuario conectado">
                    {session.user.username}
                </span>
            </Dropdown.Toggle>
            <Dropdown.Menu variant="dark" className="user-menu-dropdown">
                <Dropdown.Header className="user-menu-profile">
                    <span className="user-menu-avatar" aria-hidden="true">
                        {initials}
                    </span>
                    <div>
                        <strong>{name}</strong>
                        <span className="user-menu-username">@{session.user.username}</span>
                    </div>
                    <div className="user-menu-roles">
                        {data?.roles.length ? (
                            data.roles.map((role) => <span key={role.id}>{role.name}</span>)
                        ) : (
                            <span>{roleText}</span>
                        )}
                    </div>
                    {error && (
                        <button type="button" className="user-menu-retry" onClick={() => mutate()}>
                            Reintentar perfil
                        </button>
                    )}
                </Dropdown.Header>
                <Dropdown.Divider />
                <Dropdown.Item as={NavLink} to="/cuenta" onClick={onNavigate}>
                    <MenuIcon name="account" />
                    Mi cuenta
                </Dropdown.Item>
                {administration.map((item) => (
                    <Dropdown.Item key={item.path} as={NavLink} to={item.path} onClick={onNavigate}>
                        <MenuIcon name={item.path === '/acceso' ? 'access' : 'audit'} />
                        {item.label}
                    </Dropdown.Item>
                ))}
                <Dropdown.Divider />
                <Dropdown.Item
                    as="button"
                    className="user-menu-logout"
                    data-auth-logout="true"
                    onClick={() => {
                        onNavigate();
                        onLogout();
                    }}
                >
                    <MenuIcon name="logout" />
                    Salir
                </Dropdown.Item>
            </Dropdown.Menu>
        </Dropdown>
    );
}
