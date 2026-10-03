import useUpdateFlow from 'hooks/useUpdateFlow';
import { createContext, useContext, useEffect, useRef } from 'react';

const CHECK_INTERVAL = 12 * 60 * 60 * 1000;
const UpdateContext = createContext(null);

export const useUpdate = () => useContext(UpdateContext);

export const UpdateProvider = ({ children }) => {
    const update = useUpdateFlow();
    const lastCheck = useRef(0);
    const { status, checking, downloading, applying, applied, handleCheck } = update;

    useEffect(() => {
        if (!status?.standalone || applied) return undefined;
        const key = `dmmarket:update:last-check:${status.currentVersion}`;
        const checkIfDue = () => {
            if (checking || downloading || applying) return;
            const now = Date.now();
            let previous = lastCheck.current;
            try {
                const stored = Number(localStorage.getItem(key));
                if (Number.isFinite(stored) && stored > 0 && stored <= now) {
                    previous = Math.max(previous, stored);
                }
            } catch {}
            if (previous && now - previous < CHECK_INTERVAL) return;
            lastCheck.current = now;
            try {
                localStorage.setItem(key, String(now));
            } catch {}
            handleCheck();
        };

        checkIfDue();
        const timer = setInterval(checkIfDue, 60 * 1000);
        const onVisibilityChange = () => {
            if (document.visibilityState === 'visible') checkIfDue();
        };
        document.addEventListener('visibilitychange', onVisibilityChange);
        window.addEventListener('focus', checkIfDue);
        return () => {
            clearInterval(timer);
            document.removeEventListener('visibilitychange', onVisibilityChange);
            window.removeEventListener('focus', checkIfDue);
        };
    }, [status, checking, downloading, applying, applied, handleCheck]);

    return <UpdateContext.Provider value={update}>{children}</UpdateContext.Provider>;
};
