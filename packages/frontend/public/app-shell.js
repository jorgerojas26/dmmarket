{
    const root = document.documentElement;
    const path = window.location.pathname.replace(/\/+$/, '') || '/';
    root.dataset.initialSidebar = String(
        [
            '/ventas',
            '/compras',
            '/clientes',
            '/proveedores',
            '/vendedores',
            '/inventario',
            '/configuracion',
            '/acceso',
        ].includes(path),
    );
    let collapsed = !window.matchMedia('(min-width: 1400px)').matches;
    try {
        const preference = localStorage.getItem('sidebarCollapsed');
        if (preference !== null) collapsed = preference === 'true';
    } catch {}
    root.dataset.initialCollapsed = String(collapsed);
}
