import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { authRequest, clearAuthTransport, setCsrfToken } from './transport';

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
    const [session, setSession] = useState(null);
    const [checking, setChecking] = useState(true);
    const [failure, setFailure] = useState('');
    const [epoch, setEpoch] = useState(0);
    const current = useRef(null);
    const sequence = useRef(0);
    const channel = useRef(null);
    const busy = useRef(false);

    const notify = useCallback(() => {
        channel.current?.postMessage({ type: 'changed' });
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
                previous?.stage !== data.stage
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

    const check = useCallback(
        async (hide = true) => {
            const ticket = ++sequence.current;
            if (hide) {
                clearAuthTransport();
                setChecking(true);
            }
            try {
                const data = await authRequest('session');
                if (ticket !== sequence.current) return;
                apply(data);
                setFailure('');
            } catch (error) {
                if (ticket !== sequence.current || error.name === 'AbortError') return;
                clearAuthTransport();
                current.current = null;
                setSession(null);
                setChecking(false);
                setFailure('No se puede validar la sesión. No se mostrarán datos hasta recuperar el acceso.');
            }
        },
        [apply],
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
                    notify();
                    await check();
                } else if (data.user) {
                    apply(data);
                }
                return data;
            } catch (error) {
                if (error.name === 'TimeoutError') await check();
                else if ([401, 403].includes(error.status)) await check(false);
                throw error;
            } finally {
                busy.current = false;
            }
        },
        [apply, check, notify],
    );

    useEffect(() => {
        void check();
        const refresh = () => {
            if (!busy.current && current.current) void check(current.current.stage === 'ready');
        };
        const restore = (event) => {
            if (event.persisted) void check();
            else refresh();
        };
        const lost = () => {
            void check();
        };
        const hide = () => {
            if (!busy.current) clearAuthTransport();
            setChecking(true);
        };
        const visible = () => {
            if (document.visibilityState === 'visible') refresh();
            else if (current.current?.stage === 'ready') hide();
        };
        const storage = (event) => {
            if (event.key === 'dmmarket:auth-change') refresh();
        };
        if (typeof BroadcastChannel !== 'undefined') {
            channel.current = new BroadcastChannel('dmmarket-auth');
            channel.current.onmessage = refresh;
        }
        const timer = setInterval(() => {
            if (!busy.current && current.current && document.visibilityState === 'visible') void check(false);
        }, 30000);
        window.addEventListener('dmmarket:access-lost', lost);
        window.addEventListener('pageshow', restore);
        window.addEventListener('pagehide', hide);
        window.addEventListener('focus', refresh);
        window.addEventListener('storage', storage);
        document.addEventListener('visibilitychange', visible);
        return () => {
            sequence.current += 1;
            clearInterval(timer);
            clearAuthTransport();
            channel.current?.close();
            window.removeEventListener('dmmarket:access-lost', lost);
            window.removeEventListener('pageshow', restore);
            window.removeEventListener('pagehide', hide);
            window.removeEventListener('focus', refresh);
            window.removeEventListener('storage', storage);
            document.removeEventListener('visibilitychange', visible);
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
        session?.permissions?.some((grant) => grant.capability === capability && grant.scope === 'global');
    return (
        <AuthContext.Provider value={{ session, checking, failure, epoch, action, check, can }}>
            {children}
        </AuthContext.Provider>
    );
}
