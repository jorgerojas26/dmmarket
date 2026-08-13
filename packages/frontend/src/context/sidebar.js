import { createContext, useContext, useEffect, useState } from 'react';

// Crea el contexto con un valor inicial
export const SidebarContext = createContext({
    collapsed: false,
    toggleCollapsed: () => {},
});

export const SidebarProvider = ({ children }) => {
    const [collapsed, setCollapsed] = useState(localStorage.getItem('sidebarCollapsed') === 'true');

    useEffect(() => {
        localStorage.setItem('sidebarCollapsed', collapsed.toString());
        document.body.classList.toggle('sidebar-collapsed', collapsed);
        return () => document.body.classList.remove('sidebar-collapsed');
    }, [collapsed]);

    const toggleCollapsed = () => setCollapsed((c) => !c);

    return <SidebarContext.Provider value={{ collapsed, toggleCollapsed }}>{children}</SidebarContext.Provider>;
};

export const useSidebar = () => useContext(SidebarContext);
