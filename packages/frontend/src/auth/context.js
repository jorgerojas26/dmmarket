import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useHistory, useLocation } from 'react-router-dom';
import useSWR from 'swr';
import { authRequest, authTransportGeneration, clearAuthTransport, setCsrfToken } from './transport';

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
    const history = useHistory();
    const location = useLocation();
    const previousLocation = useRef(location);
    const [session, setSession] = useState(null);
    const [checking, setChecking] = useState(true);
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

    const apply = useCallback(
        (data) => {
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
            const data = await authRequest('session');
            return { data, ticket };
        } catch (error) {
            if (ticket !== sequence.current || error.name === 'AbortError')
                return { data: current.current ?? undefined, ticket, canceled: true };
            error.sessionTicket = ticket;
            throw error;
        }
    }, []);
    const { mutate: mutateSession } = useSWR('/api/auth/session', fetchSession, {
        dedupingInterval: 1000,
        focusThrottleInterval: 1000,
        refreshInterval: 30000,
        revalidateOnFocus: true,
        revalidateOnReconnect: true,
        shouldRetryOnError: false,
        isPaused: () => busy.current && !forceValidation.current,
        onSuccess: (result) => {
            if (result.canceled || result.ticket !== sequence.current) return;
            apply(result.data);
            setFailure('');
        },
        onError: (error) => {
            if (error.sessionTicket !== undefined && error.sessionTicket !== sequence.current) return;
            clearAuthTransport();
            current.current = null;
            setSession(null);
            setChecking(false);
            setFailure('No se puede validar la sesión. No se mostrarán datos hasta recuperar el acceso.');
            void cacheMutation.current?.(undefined, false);
        },
    });
    cacheMutation.current = mutateSession;

    const check = useCallback(
        async (hide = true) => {
            sequence.current += 1;
            if (hide) {
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
                    const entering = current.current?.user?.id !== data.user.id || current.current?.stage !== 'ready';
                    sequence.current += 1;
                    apply(data);
                    await mutateSession({ data, ticket: sequence.current }, false);
                    if (entering && data.stage === 'ready') history.replace('/');
                }
                return data;
            } catch (error) {
                if (error.name === 'TimeoutError') await check();
                else if (path === 'first-user' || [401, 403].includes(error.status)) await check(false);
                throw error;
            } finally {
                busy.current = false;
            }
        },
        [apply, check, notify, history, mutateSession],
    );

    useLayoutEffect(() => {
        const previous = previousLocation.current;
        previousLocation.current = location;
        const changed =
            previous.pathname !== location.pathname ||
            previous.search !== location.search ||
            previous.hash !== location.hash;
        const homeRedirect = previous.pathname === '/' && history.action === 'REPLACE';
        if (
            !busy.current &&
            current.current?.stage === 'ready' &&
            changed &&
            !homeRedirect &&
            (previous.pathname !== location.pathname || history.action === 'POP')
        )
            void check();
    }, [location.pathname, location.search, location.hash, history.action, check]);

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
        const hide = () => {
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
        window.addEventListener('dmmarket:access-lost', lost);
        window.addEventListener('pageshow', restore);
        window.addEventListener('pagehide', hide);
        window.addEventListener('storage', storage);
        return () => {
            sequence.current += 1;
            clearAuthTransport();
            channel.current?.close();
            window.removeEventListener('dmmarket:access-lost', lost);
            window.removeEventListener('pageshow', restore);
            window.removeEventListener('pagehide', hide);
            window.removeEventListener('storage', storage);
        };
    }, [check]);

    useEffect(() => {
        if (checking || session?.stage !== 'ready') return undefined;
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
    }, [checking, session?.stage, check]);

    const can = (capability) =>
        !checking &&
        !failure &&
        session?.permissions?.some((grant) => grant.capability === capability && grant.scope === 'global');
    return (
        <AuthContext.Provider
            value={{
                session,
                checking,
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
