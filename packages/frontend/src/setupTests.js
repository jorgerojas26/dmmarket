import '@testing-library/jest-dom';

// jsdom no implementa matchMedia. Mockeamos un MediaQueryList mínimo para los
// componentes que usan useMediaQuery (tabs responsive del desglose, etc.).
// Devuelve matches: true → los tests renderizan el layout "wide" (lado a lado),
// que es el comportamiento base que asumen los tests existentes.
Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query) => ({
        matches: true,
        media: query,
        onchange: null,
        addListener: () => {}, // deprecated API, mantenida por compatibilidad
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
    }),
});
