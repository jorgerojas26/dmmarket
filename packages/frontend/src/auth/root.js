import { CurrencyRateProvider } from 'context/currency_rate';
import { ShowNoesProvider } from 'context/show_noe';
import { SidebarProvider } from 'context/sidebar';
import { UpdateProvider } from 'context/update';
import { SWRConfig } from 'hooks/swr-wrapper';
import { useMemo, useState } from 'react';
import { BrowserRouter } from 'react-router-dom';
import { fetcher, swrConfig } from 'swr-config';
import App from '../App';
import { AuthProvider, useAuth } from './context';
import { EnrollmentForm, InitialAccountForm, LoginForm, MfaForm, PasswordForm, ReauthenticationDialog } from './forms';
import SessionRecovery, { ConnectionNotice } from './recovery';
import { authTransportGeneration } from './transport';

function BoundaryContent() {
    const { session, checking, failure, degraded, retrying, restartLogin, epoch, action, check } = useAuth();
    const [logoutError, setLogoutError] = useState('');
    const generation = authTransportGeneration();
    const cache = useMemo(() => new Map(), [epoch, generation]);
    const signOut = async () => {
        setLogoutError('');
        try {
            await action('logout', {});
        } catch {
            setLogoutError('No se pudo confirmar la salida en el servidor. Vuelve a intentarlo.');
        }
    };
    if (failure)
        return (
            <SessionRecovery reason={failure} retrying={retrying} onRetry={() => check(false)} onLeave={restartLogin} />
        );
    if (checking || session?.stage === 'ready') {
        return (
            <>
                <ConnectionNotice
                    visible={degraded}
                    retrying={retrying}
                    onRetry={() => check(false)}
                    onLeave={restartLogin}
                />
                <div className="auth-session-content" inert={degraded ? '' : undefined}>
                    <SidebarProvider>
                        <SWRConfig
                            key={`${epoch}:${generation}:ready`}
                            value={{
                                ...swrConfig,
                                fetcher,
                                provider: () => cache,
                                isPaused: () => generation !== authTransportGeneration(),
                            }}
                        >
                            <CurrencyRateProvider>
                                <UpdateProvider>
                                    <App pending={checking} onLogout={signOut} logoutError={logoutError} />
                                </UpdateProvider>
                                {!checking && <ReauthenticationDialog />}
                            </CurrencyRateProvider>
                        </SWRConfig>
                    </SidebarProvider>
                </div>
            </>
        );
    }
    return (
        <main className="bg-dark text-light" style={{ height: '100vh', overflowY: 'auto' }}>
            <div className="container py-4" style={{ maxWidth: 1000 }}>
                <header className="d-flex justify-content-between align-items-center mb-4">
                    <h1 className="h3">DMMarket</h1>
                    {!checking && session?.user && (
                        <div>
                            <span className="me-3" role="status" aria-label="Usuario conectado">
                                {session.user.username}
                            </span>
                            <button
                                type="button"
                                data-auth-logout="true"
                                className="btn btn-outline-light"
                                onClick={signOut}
                            >
                                Salir
                            </button>
                        </div>
                    )}
                </header>
                {logoutError && (
                    <p role="alert" className="text-warning">
                        {logoutError}
                    </p>
                )}
                <div key={`${epoch}:${session?.stage}`}>
                    {session?.stage === 'first-user' && <InitialAccountForm />}
                    {session?.stage === 'setup-required' && (
                        <section>
                            <h2 className="h4">Configuración inicial pendiente</h2>
                            <p>Completa la creación del primer administrador desde el propio servidor de DMMarket.</p>
                            <button type="button" className="btn btn-primary" onClick={() => check()}>
                                Actualizar estado
                            </button>
                        </section>
                    )}
                    {session?.stage === 'anonymous' && <LoginForm />}
                    {session?.stage === 'password' && <PasswordForm />}
                    {session?.stage === 'mfa' && <MfaForm />}
                    {session?.stage === 'mfa-enrollment' && <EnrollmentForm />}
                </div>
            </div>
        </main>
    );
}

function Boundary() {
    const { epoch } = useAuth();
    return (
        <ShowNoesProvider key={epoch}>
            <BoundaryContent />
        </ShowNoesProvider>
    );
}

export default function AuthRoot() {
    const sessionCache = useMemo(() => new Map(), []);
    const sessionConfig = useMemo(() => ({ provider: () => sessionCache }), [sessionCache]);
    return (
        <SWRConfig value={sessionConfig}>
            <BrowserRouter>
                <AuthProvider>
                    <Boundary />
                </AuthProvider>
            </BrowserRouter>
        </SWRConfig>
    );
}
