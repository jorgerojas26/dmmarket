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
import { EnrollmentForm, LoginForm, MfaForm, PasswordForm, ReauthenticationDialog } from './forms';

function BoundaryContent() {
    const { session, checking, failure, epoch, action, check } = useAuth();
    const [logoutError, setLogoutError] = useState('');
    const cache = useMemo(() => new Map(), [epoch]);
    const signOut = async () => {
        setLogoutError('');
        try {
            await action('logout', {});
        } catch {
            setLogoutError('No se pudo confirmar la salida en el servidor. Vuelve a intentarlo.');
        }
    };
    if (!checking && !failure && session?.stage === 'ready') {
        return (
            <SWRConfig key={`${epoch}:ready`} value={{ ...swrConfig, fetcher, provider: () => cache }}>
                <CurrencyRateProvider>
                    <SidebarProvider>
                        <UpdateProvider>
                            <App onLogout={signOut} logoutError={logoutError} />
                        </UpdateProvider>
                        <ReauthenticationDialog />
                    </SidebarProvider>
                </CurrencyRateProvider>
            </SWRConfig>
        );
    }
    return (
        <main className="bg-dark text-light" style={{ height: '100vh', overflowY: 'auto' }} aria-busy={checking}>
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
                {checking ? (
                    <p role="status">Comprobando sesión…</p>
                ) : failure ? (
                    <section>
                        <p role="alert">{failure}</p>
                        <button type="button" className="btn btn-primary" onClick={() => check()}>
                            Reintentar validación
                        </button>
                    </section>
                ) : (
                    <div key={`${epoch}:${session?.stage}`}>
                        {session?.stage === 'anonymous' && <LoginForm />}
                        {session?.stage === 'password' && <PasswordForm />}
                        {session?.stage === 'mfa' && <MfaForm />}
                        {session?.stage === 'mfa-enrollment' && <EnrollmentForm />}
                    </div>
                )}
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
    return (
        <BrowserRouter>
            <AuthProvider>
                <Boundary />
            </AuthProvider>
        </BrowserRouter>
    );
}
