import { CurrencyRateProvider } from 'context/currency_rate';
import { ReportSettingsProvider } from 'context/report_settings';
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
import AuthPresentation, { AuthStage } from './presentation';
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
                            <ReportSettingsProvider enabled={!checking}>
                                <ShowNoesProvider enabled={!checking}>
                                    <CurrencyRateProvider>
                                        <UpdateProvider>
                                            <App pending={checking} onLogout={signOut} logoutError={logoutError} />
                                        </UpdateProvider>
                                    </CurrencyRateProvider>
                                </ShowNoesProvider>
                            </ReportSettingsProvider>
                            {!checking && <ReauthenticationDialog />}
                        </SWRConfig>
                    </SidebarProvider>
                </div>
            </>
        );
    }
    if (session?.stage === 'first-user') {
        return (
            <AuthPresentation setup>
                <InitialAccountForm />
            </AuthPresentation>
        );
    }
    if (session?.stage === 'anonymous' || session?.stage === 'mfa') {
        return (
            <AuthPresentation
                identified={session.stage === 'mfa'}
                username={session.user?.username}
                onLogout={signOut}
                logoutError={logoutError}
            >
                <div key={`${epoch}:${session.stage}`}>
                    {session.stage === 'anonymous' ? <LoginForm /> : <MfaForm />}
                </div>
            </AuthPresentation>
        );
    }
    if (session?.stage === 'setup-required') {
        return (
            <AuthPresentation setup>
                <AuthStage
                    title="Configuración inicial pendiente"
                    description="Completa la creación del primer administrador desde el propio servidor de DMMarket."
                >
                    <button type="button" className="btn btn-primary" onClick={() => check()}>
                        Actualizar estado
                    </button>
                </AuthStage>
            </AuthPresentation>
        );
    }
    if (session?.stage === 'password' || session?.stage === 'mfa-enrollment') {
        return (
            <AuthPresentation identified username={session.user?.username} onLogout={signOut} logoutError={logoutError}>
                <div key={`${epoch}:${session.stage}`}>
                    {session.stage === 'password' ? <PasswordForm panel /> : <EnrollmentForm panel />}
                </div>
            </AuthPresentation>
        );
    }
    return null;
}

function Boundary() {
    const { epoch } = useAuth();
    return <BoundaryContent key={epoch} />;
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
