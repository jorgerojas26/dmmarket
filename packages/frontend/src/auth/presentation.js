import './presentation.css';

export function AuthIcon({ kind = 'shield' }) {
    return (
        <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
        >
            {kind === 'arrow' ? (
                <path d="M5 12h14m-5-5 5 5-5 5" />
            ) : kind === 'eye' ? (
                <>
                    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
                    <circle cx="12" cy="12" r="3" />
                </>
            ) : kind === 'code' ? (
                <>
                    <rect x="6" y="2" width="12" height="20" rx="3" />
                    <path d="M10 5h4M11 18h2M9 10h.01M12 10h.01M15 10h.01M9 13h.01M12 13h.01M15 13h.01" />
                </>
            ) : (
                <>
                    <path d="m12 3 8 3v6c0 4-4 7-8 9-4-2-8-5-8-9V6l8-3Z" />
                    <path d="m9 12 2 2 4-4" />
                </>
            )}
        </svg>
    );
}

export default function AuthPresentation({ setup = false, mfa, children, username, onLogout, logoutError }) {
    return (
        <main className={`auth-entry${setup ? ' auth-entry-setup' : ''}`}>
            <header className="auth-entry-header">
                <div className="auth-entry-brand">
                    <span className="auth-entry-monogram" aria-hidden="true">
                        dm
                    </span>
                    <span>DMMarket</span>
                </div>
                {!setup && (
                    <span className="auth-entry-header-note">
                        <AuthIcon /> Acceso protegido
                    </span>
                )}
            </header>
            <div className="auth-entry-layout">
                <div className="auth-entry-panel">
                    <div className={setup ? 'auth-entry-initial' : 'auth-entry-card'}>
                        {children}
                        {mfa && (
                            <div className="auth-entry-account">
                                <span role="status" aria-label="Usuario conectado">
                                    {username}
                                </span>
                                <button type="button" data-auth-logout="true" onClick={onLogout}>
                                    Salir
                                </button>
                            </div>
                        )}
                        {logoutError && (
                            <p role="alert" className="auth-entry-logout-error">
                                {logoutError}
                            </p>
                        )}
                    </div>
                    {!setup && (
                        <p className="auth-entry-security">
                            <AuthIcon /> Acceso exclusivo para usuarios autorizados.
                        </p>
                    )}
                </div>
            </div>
        </main>
    );
}
