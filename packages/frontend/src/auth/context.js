import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useHistory } from 'react-router-dom';
import useSWR from 'swr';
import {
    authRequest,
    authTransportGeneration,
    clearAuthTransport,
    setAuthUnavailable,
    setCsrfToken,
} from './transport';

const SESSION_TOLERANCE_MS = 60000;
const SESSION_STAGES = new Set([
    'anonymous',
    'first-user',
    'setup-required',
    'password',
    'mfa',
    'mfa-enrollment',
    'ready',
]);

function verifiedSession(data) {
    const authenticated = ['password', 'mfa', 'mfa-enrollment', 'ready'].includes(data?.stage);
    if (
        !data ||
        !SESSION_STAGES.has(data.stage) ||
        typeof data.csrfToken !== 'string' ||
        !data.csrfToken ||
        (authenticated &&
            (typeof data.user?.id !== 'string' ||
                !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(data.user.id) ||
                !Number.isSafeInteger(data.revision) ||
                data.revision < 0 ||
                typeof data.mfaEnabled !== 'boolean' ||
                typeof data.user.username !== 'string' ||
                !data.user.username ||
                (data.user.displayName != null && typeof data.user.displayName !== 'string') ||
                !Array.isArray(data.permissions) ||
                !data.permissions.every(
                    (grant) =>
                        grant && typeof grant.capability === 'string' && ['global', 'assigned'].includes(grant.scope),
                ))) ||
        (!authenticated && data.user != null)
    ) {
        const error = new Error('No se pudo verificar la respuesta del servidor.');
        error.code = 'INVALID_RESPONSE';
        throw error;
    }
    return data;
}

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
    const history = useHistory();
    const loginRequested = useRef(history.location.pathname === '/login');
    const [session, setSession] = useState(loginRequested.current ? { user: null, stage: 'anonymous' } : null);
    const [checking, setChecking] = useState(!loginRequested.current);
    const [degraded, setDegraded] = useState(false);
    const verifiedAt = useRef(0);
    const toleranceTimer = useRef(null);
    const retryTimer = useRef(null);
    const [failure, setFailure] = useState('');
    const [epoch, setEpoch] = useState(0);
    const current = useRef(null);
    const sequence = useRef(0);
    const cacheMutation = useRef(null);
    const forceValidation = useRef(false);
    const channel = useRef(null);
    const busy = useRef(false);
    const pendingReauthentication = useRef(null);
    const [reauthenticationRequired, setReauthenticationRequired] = useState(false);
    const finishReauthentication = useCallback(() => {
        pendingReauthentication.current?.resolve();
        pendingReauthentication.current = null;
        setReauthenticationRequired(false);
    }, []);
    const cancelReauthentication = useCallback(() => {
        pendingReauthentication.current?.reject(new DOMException('Confirmación cancelada.', 'AbortError'));
        pendingReauthentication.current = null;
        setReauthenticationRequired(false);
    }, []);
    useEffect(() => cancelReauthentication, [epoch, cancelReauthentication]);
    const runPrivileged = useCallback(async (work) => {
        const generation = authTransportGeneration();
        try {
            return await work();
        } catch (error) {
            if (error.code !== 'RECENT_AUTH_REQUIRED') throw error;
            if (!pendingReauthentication.current) {
                const pending = {};
                pending.promise = new Promise((resolve, reject) => {
                    pending.resolve = resolve;
                    pending.reject = reject;
                });
                pendingReauthentication.current = pending;
                setReauthenticationRequired(true);
            }
            await pendingReauthentication.current.promise;
            if (authTransportGeneration() !== generation) throw new DOMException('La sesión cambió.', 'AbortError');
            return work();
        }
    }, []);

    const notify = useCallback(() => {
        if (channel.current) {
            channel.current.postMessage({ type: 'changed' });
            return;
        }
        try {
            localStorage.setItem('dmmarket:auth-change', `${Date.now()}:${Math.random()}`);
        } catch {}
    }, []);

    const restartLogin = useCallback(() => {
        loginRequested.current = true;
        verifiedAt.current = 0;
        sequence.current += 1;
        clearTimeout(toleranceTimer.current);
        toleranceTimer.current = null;
        clearTimeout(retryTimer.current);
        clearAuthTransport();
        setAuthUnavailable(false);
        current.current = null;
        setSession({ user: null, stage: 'anonymous' });
        setChecking(false);
        setFailure('');
        setDegraded(false);
        setEpoch((value) => value + 1);
        void cacheMutation.current?.(undefined, false);
    }, []);

    useLayoutEffect(() => {
        if (loginRequested.current && session?.stage === 'anonymous' && history.location.pathname !== '/login')
            history.replace('/login');
    }, [history, session]);

    const lock = useCallback((error) => {
        if (loginRequested.current) return;
        verifiedAt.current = 0;
        sequence.current += 1;
        clearTimeout(toleranceTimer.current);
        toleranceTimer.current = null;
        clearAuthTransport();
        setAuthUnavailable(true);
        current.current = null;
        setSession(null);
        setChecking(false);
        setDegraded(false);
        setEpoch((value) => value + 1);
        setFailure(
            error.code === 'INVALID_RESPONSE' ? 'invalid' : navigator.onLine === false ? 'offline' : 'unavailable',
        );
        void cacheMutation.current?.(undefined, false);
    }, []);

    const interrupted = useCallback(
        (error) => {
            if (loginRequested.current) return;
            if ([401, 403].includes(error.status)) {
                restartLogin();
                return;
            }
            const transient =
                error.code !== 'INVALID_RESPONSE' &&
                (error.name === 'TypeError' ||
                    error.name === 'NetworkError' ||
                    error.name === 'TimeoutError' ||
                    error.status >= 500 ||
                    [408, 429].includes(error.status));
            const remaining = SESSION_TOLERANCE_MS - (Date.now() - verifiedAt.current);
            if (transient && current.current?.stage === 'ready' && verifiedAt.current && remaining > 0) {
                setAuthUnavailable(true);
                setDegraded(true);
                if (toleranceTimer.current === null)
                    toleranceTimer.current = setTimeout(() => lock(error), Math.min(remaining, SESSION_TOLERANCE_MS));
                return;
            }
            lock(error);
        },
        [lock, restartLogin],
    );

    const apply = useCallback(
        (data) => {
            verifiedSession(data);
            clearTimeout(toleranceTimer.current);
            toleranceTimer.current = null;
            clearTimeout(retryTimer.current);
            verifiedAt.current = data.stage === 'ready' ? Date.now() : 0;
            setAuthUnavailable(false);
            setDegraded(false);
            setFailure('');
            const previous = current.current;
            if (
                previous?.user?.id !== data.user?.id ||
                previous?.revision !== data.revision ||
                previous?.stage !== data.stage ||
                JSON.stringify(previous?.permissions) !== JSON.stringify(data.permissions)
            ) {
                clearAuthTransport();
                setEpoch((value) => value + 1);
                if (previous || data.stage === 'anonymous') notify();
            }
            setCsrfToken(data.csrfToken);
            current.current = data;
            setSession(data);
            setChecking(false);
        },
        [notify],
    );

    const fetchSession = useCallback(async () => {
        const ticket = ++sequence.current;
        try {
            const data = verifiedSession(await authRequest('session'));
            return { data, ticket };
        } catch (error) {
            if (ticket !== sequence.current || error.name === 'AbortError')
                return { data: current.current ?? undefined, ticket, canceled: true };
            error.sessionTicket = ticket;
            throw error;
        }
    }, []);
    const { mutate: mutateSession, isValidating: retrying } = useSWR('/api/auth/session', fetchSession, {
        dedupingInterval: 1000,
        focusThrottleInterval: 1000,
        refreshInterval: 30000,
        revalidateOnFocus: true,
        revalidateOnReconnect: true,
        shouldRetryOnError: true,
        onErrorRetry: (error, _key, _config, revalidate, options) => {
            if (loginRequested.current || [401, 403].includes(error.status)) return;
            clearTimeout(retryTimer.current);
            const delay = Math.min(30000, 5000 * 2 ** ((options.retryCount || 1) - 1));
            retryTimer.current = setTimeout(
                () => {
                    if (!loginRequested.current && !busy.current) void revalidate({ ...options, dedupe: true });
                },
                Math.max(delay, (error.retryAfter || 0) * 1000),
            );
        },
        isPaused: () => loginRequested.current || (busy.current && !forceValidation.current),
        onSuccess: (result) => {
            if (loginRequested.current || result.canceled || result.ticket !== sequence.current) return;
            apply(result.data);
            setFailure('');
        },
        onError: (error) => {
            if (error.sessionTicket !== undefined && error.sessionTicket !== sequence.current) return;
            interrupted(error);
        },
    });
    cacheMutation.current = mutateSession;

    const check = useCallback(
        async (hide = true) => {
            if (loginRequested.current) return undefined;
            sequence.current += 1;
            if (hide) {
                verifiedAt.current = 0;
                clearTimeout(toleranceTimer.current);
                toleranceTimer.current = null;
                setDegraded(false);
                clearAuthTransport();
                setChecking(true);
            }
            forceValidation.current = true;
            try {
                return await mutateSession();
            } catch {
                return undefined;
            } finally {
                forceValidation.current = false;
            }
        },
        [mutateSession],
    );

    const action = useCallback(
        async (path, body) => {
            busy.current = true;
            sequence.current += 1;
            try {
                if (path === 'login' && loginRequested.current) {
                    const previous = verifiedSession(await authRequest('session'));
                    setCsrfToken(previous.csrfToken);
                    if (previous.user) {
                        await authRequest('logout', {});
                        notify();
                        const anonymous = verifiedSession(await authRequest('session'));
                        setCsrfToken(anonymous.csrfToken);
                    }
                }
                const data = await authRequest(path, body);
                if (path === 'logout') {
                    clearAuthTransport();
                    current.current = null;
                    setSession(null);
                    setChecking(true);
                    await mutateSession(undefined, false);
                    notify();
                    await check();
                } else if (data.user) {
                    verifiedSession(data);
                    loginRequested.current = false;
                    const entering = current.current?.user?.id !== data.user.id || current.current?.stage !== 'ready';
                    sequence.current += 1;
                    apply(data);
                    await mutateSession({ data, ticket: sequence.current }, false);
                    if (entering && data.stage === 'ready') history.replace('/');
                }
                return data;
            } catch (error) {
                if (error.name === 'TimeoutError') await check();
                else if (path === 'first-user' || [401, 403].includes(error.status)) {
                    verifiedAt.current = 0;
                    await check(false);
                }
                throw error;
            } finally {
                busy.current = false;
            }
        },
        [apply, check, notify, history, mutateSession],
    );

    useEffect(() => {
        const restore = (event) => {
            if (event.persisted) void check();
        };
        const changed = () => {
            if (!busy.current) void check();
        };
        const lost = () => {
            void check();
        };
        const focus = () => {
            if (
                !busy.current &&
                current.current?.stage === 'ready' &&
                Date.now() - verifiedAt.current >= SESSION_TOLERANCE_MS
            )
                void check();
        };
        const offline = () => interrupted(new TypeError('Sin conexión.'));
        const hide = () => {
            if (loginRequested.current) {
                sequence.current += 1;
                clearAuthTransport();
                return;
            }
            verifiedAt.current = 0;
            if (!busy.current) {
                sequence.current += 1;
                clearAuthTransport();
            }
            setChecking(true);
        };
        const storage = (event) => {
            if (event.key === 'dmmarket:auth-change') changed();
        };
        if (typeof BroadcastChannel !== 'undefined') {
            channel.current = new BroadcastChannel('dmmarket-auth');
            channel.current.onmessage = changed;
        }
        window.addEventListener('focus', focus);
        window.addEventListener('offline', offline);
        window.addEventListener('dmmarket:access-lost', lost);
        window.addEventListener('pageshow', restore);
        window.addEventListener('pagehide', hide);
        window.addEventListener('storage', storage);
        return () => {
            sequence.current += 1;
            clearAuthTransport();
            channel.current?.close();
            clearTimeout(toleranceTimer.current);
            toleranceTimer.current = null;
            clearTimeout(retryTimer.current);
            window.removeEventListener('focus', focus);
            window.removeEventListener('offline', offline);
            window.removeEventListener('dmmarket:access-lost', lost);
            window.removeEventListener('pageshow', restore);
            window.removeEventListener('pagehide', hide);
            window.removeEventListener('storage', storage);
        };
    }, [check, interrupted]);

    useEffect(() => {
        if (checking || degraded || session?.stage !== 'ready') return undefined;
        let lastSent = 0;
        const activity = (event) => {
            if (
                !event.isTrusted ||
                busy.current ||
                Date.now() - lastSent < 60000 ||
                event.target?.closest?.('[data-auth-logout]')
            )
                return;
            lastSent = Date.now();
            authRequest('activity', {}).catch((error) => {
                if (error.name !== 'AbortError' && !busy.current && current.current?.stage === 'ready') void check();
            });
        };
        window.addEventListener('pointerdown', activity);
        window.addEventListener('keydown', activity);
        return () => {
            window.removeEventListener('pointerdown', activity);
            window.removeEventListener('keydown', activity);
        };
    }, [checking, degraded, session?.stage, check]);

    const can = (capability) =>
        !checking &&
        !failure &&
        session?.permissions?.some((grant) => grant.capability === capability && grant.scope === 'global');
    return (
        <AuthContext.Provider
            value={{
                session,
                checking,
                degraded,
                retrying,
                restartLogin,
                failure,
                epoch,
                action,
                check,
                can,
                runPrivileged,
                reauthenticationRequired,
                finishReauthentication,
                cancelReauthentication,
            }}
        >
            {children}
        </AuthContext.Provider>
    );
}
