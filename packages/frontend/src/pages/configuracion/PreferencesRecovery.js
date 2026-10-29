import { ShowNoeContext } from 'context/show_noe';
import { SWRConfig } from 'hooks/swr-wrapper';
import { useContext, useEffect, useMemo, useRef, useState } from 'react';
import './preferences-recovery.css';

export function DocumentPreferenceGate({ children, onLeave, logoutError }) {
    const { preferences, loading, error, refreshPreferences } = useContext(ShowNoeContext);
    const revision = preferences?.revision;
    const cache = useMemo(() => new Map(), [revision]);
    if (error) return <PreferencesRecovery onRetry={refreshPreferences} onLeave={onLeave} logoutError={logoutError} />;
    if (loading || !preferences)
        return (
            <div className="preferences-recovery" role="status" aria-busy="true">
                Cargando configuración…
            </div>
        );
    return (
        <SWRConfig key={revision} value={{ provider: () => cache }}>
            {children}
        </SWRConfig>
    );
}

export default function PreferencesRecovery({ onRetry, onLeave, logoutError }) {
    const heading = useRef(null);
    const [active, setActive] = useState(null);
    useEffect(() => {
        heading.current?.focus({ preventScroll: true });
    }, []);

    const run = async (action, name) => {
        setActive(name);
        try {
            await action();
        } catch {
            return;
        } finally {
            setActive(null);
        }
    };

    return (
        <main className="preferences-recovery">
            <section
                className="preferences-recovery-card"
                aria-labelledby="preferences-recovery-title"
                aria-busy={Boolean(active)}
            >
                <div className="preferences-recovery-header">
                    <span className="preferences-recovery-icon" aria-hidden="true">
                        <svg
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.6"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden="true"
                        >
                            <rect x="4" y="3" width="16" height="18" rx="3" />
                            <path d="M8 8h8M8 12h4M8 16h2M16 12v3M16 18h.01" />
                        </svg>
                    </span>
                    <span className="preferences-recovery-status">
                        <span aria-hidden="true" />
                        Reportes en pausa
                    </span>
                </div>
                <h2 id="preferences-recovery-title" tabIndex={-1} ref={heading}>
                    Configuración no disponible
                </h2>
                <p className="preferences-recovery-description" role="alert">
                    No pudimos recuperar las preferencias del sistema. Reintenta para continuar.
                </p>
                <div className="preferences-recovery-actions">
                    <button
                        type="button"
                        className="preferences-recovery-retry"
                        onClick={() => run(onRetry, 'retry')}
                        disabled={Boolean(active)}
                    >
                        <svg
                            className={active === 'retry' ? 'preferences-recovery-spinning' : ''}
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.7"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden="true"
                        >
                            <path d="M20 7v5h-5M4 17v-5h5M6 7a7 7 0 0 1 12-1l2 3M4 15l2 3a7 7 0 0 0 12-1" />
                        </svg>
                        {active === 'retry' ? 'Reintentando…' : 'Reintentar'}
                    </button>
                    <button
                        type="button"
                        className="preferences-recovery-leave"
                        onClick={() => run(onLeave, 'logout')}
                        disabled={Boolean(active)}
                    >
                        {active === 'logout' ? 'Cerrando…' : 'Cerrar sesión'}
                    </button>
                </div>
                {logoutError && (
                    <p className="preferences-recovery-error" role="alert">
                        {logoutError}
                    </p>
                )}
                <p className="preferences-recovery-help">Si el problema persiste, contacta al administrador.</p>
            </section>
        </main>
    );
}
