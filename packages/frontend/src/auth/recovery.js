import { useEffect, useRef } from 'react';
import './recovery.css';

function ConnectionIcon({ protectedAccess = false }) {
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
            {protectedAccess ? (
                <>
                    <path d="m12 3 8 3v6c0 4-4 7-8 9-4-2-8-5-8-9V6l8-3Z" />
                    <path d="m9 12 2 2 4-4" />
                </>
            ) : (
                <>
                    <path d="M3 8a15 15 0 0 1 18 0M6 12a10 10 0 0 1 12 0M9 16a5 5 0 0 1 6 0" />
                    <path d="m3 3 18 18M12 20h.01" />
                </>
            )}
        </svg>
    );
}

function RecoveryActions({ retrying, onRetry, onLeave }) {
    return (
        <div className="auth-recovery-actions">
            <button type="button" className="btn btn-primary auth-retry-button" onClick={onRetry} disabled={retrying}>
                <svg
                    className={retrying ? 'auth-retry-spinning' : ''}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                >
                    <path d="M20 7v5h-5M4 17v-5h5" />
                    <path d="M6 7a7 7 0 0 1 12-1l2 3M4 15l2 3a7 7 0 0 0 12-1" />
                </svg>
                {retrying ? 'Reconectando…' : 'Reintentar'}
            </button>
            <button type="button" className="btn btn-outline-light auth-leave-button" onClick={onLeave}>
                Volver a iniciar sesión
                <span aria-hidden="true">→</span>
            </button>
        </div>
    );
}

export function ConnectionNotice({ visible, retrying, onRetry, onLeave }) {
    if (!visible) return null;
    return (
        <section className="auth-connection-notice" aria-label="Estado de conexión">
            <div className="auth-connection-symbol">
                <ConnectionIcon />
            </div>
            <div className="auth-connection-state">
                <span role="status">Conexión interrumpida</span>
                <span className="auth-readonly-badge">Solo lectura</span>
            </div>
            <RecoveryActions retrying={retrying} onRetry={onRetry} onLeave={onLeave} />
        </section>
    );
}

export default function SessionRecovery({ reason, retrying, onRetry, onLeave }) {
    const heading = useRef(null);
    const invalid = reason === 'invalid';
    useEffect(() => {
        heading.current?.focus({ preventScroll: true });
    }, []);
    return (
        <main className="auth-recovery-page">
            <header className="auth-recovery-brand">
                <span className="auth-recovery-monogram" aria-hidden="true">
                    DM
                </span>
                <span>DMMarket</span>
            </header>
            <section className="auth-recovery-card" aria-labelledby="auth-recovery-title">
                <div className="auth-recovery-symbol">
                    <ConnectionIcon protectedAccess={invalid} />
                </div>
                <span className="auth-recovery-eyebrow">
                    {invalid ? 'Verificación de acceso' : 'Estado de conexión'}
                </span>
                <h1 id="auth-recovery-title" ref={heading} tabIndex={-1}>
                    {invalid ? 'No pudimos validar tu acceso' : 'Conexión interrumpida'}
                </h1>
                <div className="auth-recovery-status" role="status">
                    <span aria-hidden="true" />
                    {invalid
                        ? 'Acceso sin verificar'
                        : reason === 'offline'
                          ? 'Sin conexión'
                          : 'Servidor no disponible'}
                </div>
                <RecoveryActions retrying={retrying} onRetry={onRetry} onLeave={onLeave} />
                <div className="auth-recovery-protected">
                    <ConnectionIcon protectedAccess />
                    Datos protegidos
                </div>
            </section>
        </main>
    );
}
