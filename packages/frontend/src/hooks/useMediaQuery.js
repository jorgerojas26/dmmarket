import { useEffect, useState } from 'react';

/**
 * Suscribe un componente a una media query CSS (p.ej. '(min-width: 1400px)').
 * Devuelve true cuando la query coincide; se actualiza en vivo al cruzar el
 * breakpoint (resize del navegador).
 */
const useMediaQuery = (query) => {
    const [matches, setMatches] = useState(() => window.matchMedia(query).matches);

    useEffect(() => {
        const mql = window.matchMedia(query);
        const handler = (e) => setMatches(e.matches);
        setMatches(mql.matches);
        mql.addEventListener('change', handler);
        return () => mql.removeEventListener('change', handler);
    }, [query]);

    return matches;
};

export default useMediaQuery;
