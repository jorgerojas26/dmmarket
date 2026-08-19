import useMediaQuery from 'hooks/useMediaQuery';
import { createContext, useContext, useEffect, useState } from 'react';

// Crea el contexto con un valor inicial
export const SidebarContext = createContext({
    collapsed: false,
    toggleCollapsed: () => {},
});

export const SidebarProvider = ({ children }) => {
    // En pantallas de laptop (<1400px) el sidebar arranca colapsado; en pantallas
    // extra grandes (≥1400px), expandido. Ese es solo el default por viewport:
    // si el usuario ya eligió un estado (guardado en localStorage), se respeta en
    // cualquier tamaño de pantalla.
    const isLaptop = !useMediaQuery('(min-width: 1400px)');
    const [collapsed, setCollapsed] = useState(() => {
        const stored = localStorage.getItem('sidebarCollapsed');
        return stored != null ? stored === 'true' : isLaptop;
    });

    useEffect(() => {
        document.body.classList.toggle('sidebar-collapsed', collapsed);
        return () => document.body.classList.remove('sidebar-collapsed');
    }, [collapsed]);

    const toggleCollapsed = () => {
        // Persistir la elección del usuario (deja de aplicarse el default por viewport).
        const next = !collapsed;
        setCollapsed(next);
        localStorage.setItem('sidebarCollapsed', next.toString());
    };

    return <SidebarContext.Provider value={{ collapsed, toggleCollapsed }}>{children}</SidebarContext.Provider>;
};

export const useSidebar = () => useContext(SidebarContext);
