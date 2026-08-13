import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * useState sincronizado con localStorage.
 *
 * - Lectura lazy: el estado se inicializa desde `localStorage.getItem(key)`.
 * - Cada set escribe a localStorage (JSON).
 * - `key` null desactiva la persistencia (el set solo actualiza el estado).
 * - Si `key` cambia (p.ej. otra tabla), el estado se recarga desde storage.
 */
const readStored = (key, fallback) => {
    if (!key) return fallback;
    try {
        const raw = localStorage.getItem(key);
        return raw != null ? JSON.parse(raw) : fallback;
    } catch {
        return fallback;
    }
};

const useLocalStorage = (key, fallback) => {
    const [value, setValue] = useState(() => readStored(key, fallback));
    const firstRenderRef = useRef(true);

    // Recargar cuando cambia la key (evita sobrescribir en el primer render).
    useEffect(() => {
        if (firstRenderRef.current) {
            firstRenderRef.current = false;
            return;
        }
        setValue(readStored(key, fallback));
    }, [key, fallback]);

    const setStored = useCallback(
        (next) => {
            setValue((prev) => {
                const resolved = typeof next === 'function' ? next(prev) : next;
                if (key) {
                    try {
                        localStorage.setItem(key, JSON.stringify(resolved));
                    } catch {
                        // storage lleno o bloqueado — el estado sigue vivo en memoria
                    }
                }
                return resolved;
            });
        },
        [key],
    );

    return [value, setStored];
};

export default useLocalStorage;
