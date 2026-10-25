import { useState } from 'react';
import Nav from 'react-bootstrap/Nav';
import Navbar from 'react-bootstrap/Navbar';
import { Link, NavLink, Redirect, useLocation } from 'react-router-dom';
import ClientDashboard from './auth/client-dashboard';
import { useAuth } from './auth/context';
import InactiveClients from './auth/inactive-clients';
import Inventory from './auth/inventory';
import Pareto from './auth/pareto';
import Parties from './auth/parties';
import PurchaseOverview from './auth/purchase-overview';
import Purchases from './auth/purchases';
import Sales from './auth/sales';
import SellerDashboard from './auth/seller-dashboard';
import AccessWorkspace, { Account, Rates } from './auth/workspace';

export default function App() {
    const { session, can } = useAuth();
    const { pathname } = useLocation();
    const [expanded, setExpanded] = useState(false);
    const has = (capability) => session.permissions.some((grant) => grant.capability === capability);
    const access = ['access.users', 'access.roles', 'access.links', 'access.recover'].some(can);
    const modules = [
        { path: '/ventas', label: 'Ventas', allowed: has('sales.read') },
        { path: '/compras', label: 'Compras', allowed: can('purchases.read') },
        { path: '/clientes', label: 'Clientes', allowed: can('clients.read') },
        { path: '/vendedores', label: 'Vendedores', allowed: has('sellers.read') },
        { path: '/inventario', label: 'Inventario', allowed: can('inventory.read') },
        { path: '/tasas', label: 'Tasas', allowed: can('rates.read') },
        { path: '/acceso', label: 'Acceso', allowed: access },
    ].filter((module) => module.allowed);
    const views = [
        { path: '/ventas', label: 'Desglose', allowed: has('sales.read'), content: <Sales /> },
        {
            path: '/ventas/pareto',
            label: 'Pareto',
            allowed: has('sales.read') && can('purchases.read'),
            content: <Pareto />,
        },
        { path: '/compras', label: 'Desglose', allowed: can('purchases.read'), content: <Purchases /> },
        { path: '/compras/resumen', label: 'Resumen', allowed: can('purchases.read'), content: <PurchaseOverview /> },
        {
            path: '/compras/pareto',
            label: 'Pareto',
            allowed: can('purchases.read') && can('purchases.costs'),
            content: <PurchaseOverview pareto />,
        },
        {
            path: '/clientes',
            label: 'Directorio',
            allowed: can('clients.read'),
            content: <Parties key="clients" kind="clients" />,
        },
        {
            path: '/clientes/panel',
            label: 'Resumen',
            allowed: can('clients.read') && has('sales.read'),
            content: <ClientDashboard />,
        },
        {
            path: '/clientes/sin-documentos',
            label: 'Sin documentos autorizados',
            allowed: can('clients.read') && has('sales.read'),
            content: <InactiveClients />,
        },
        {
            path: '/vendedores',
            label: 'Directorio',
            allowed: has('sellers.read'),
            content: <Parties key="sellers" kind="sellers" />,
        },
        {
            path: '/vendedores/panel',
            label: 'Resumen',
            allowed: has('sellers.read') && has('sales.read'),
            content: <SellerDashboard />,
        },
        { path: '/inventario', label: 'Existencias', allowed: can('inventory.read'), content: <Inventory /> },
        { path: '/tasas', label: 'Referencia', allowed: can('rates.read'), content: <Rates /> },
        { path: '/acceso', label: 'Administración', allowed: access, content: <AccessWorkspace /> },
        { path: '/cuenta', label: 'Mi cuenta', allowed: true, content: <Account /> },
    ].filter((view) => view.allowed);
    const path = pathname.replace(/\/+$/, '') || '/';
    const view = views.find((item) => item.path === path);
    const module = modules.find((item) => path === item.path || path.startsWith(`${item.path}/`));
    const children = module
        ? views.filter((item) => item.path === module.path || item.path.startsWith(`${module.path}/`))
        : [];
    return (
        <>
            <Navbar
                aria-label="Módulos disponibles"
                variant="dark"
                expand="lg"
                expanded={expanded}
                onToggle={setExpanded}
                className="border-bottom border-secondary mb-3"
            >
                <Navbar.Brand as={Link} to="/" onClick={() => setExpanded(false)}>
                    Reportes
                </Navbar.Brand>
                <Navbar.Toggle aria-controls="authorized-modules" label="Abrir navegación" />
                <Navbar.Collapse id="authorized-modules">
                    <Nav className="me-auto flex-wrap">
                        {modules.map((item) => (
                            <Nav.Link
                                key={item.path}
                                as={NavLink}
                                to={item.path}
                                isActive={() => path === item.path || path.startsWith(`${item.path}/`)}
                                onClick={() => setExpanded(false)}
                            >
                                {item.label}
                            </Nav.Link>
                        ))}
                        <Nav.Link as={NavLink} to="/cuenta" onClick={() => setExpanded(false)}>
                            Mi cuenta
                        </Nav.Link>
                    </Nav>
                </Navbar.Collapse>
            </Navbar>
            {path === '/' ? (
                <Redirect to={modules[0]?.path || '/cuenta'} />
            ) : view ? (
                <section key={path} aria-label={module?.label || 'Mi cuenta'}>
                    <h2 className="h4">{module?.label || 'Mi cuenta'}</h2>
                    {children.length > 1 && (
                        <nav aria-label={`Vistas de ${module.label}`} className="nav nav-pills gap-2 mb-3">
                            {children.map((item) => (
                                <NavLink
                                    key={item.path}
                                    to={item.path}
                                    exact
                                    className="nav-link"
                                    activeClassName="active"
                                >
                                    {item.label}
                                </NavLink>
                            ))}
                        </nav>
                    )}
                    {!modules.length && <p>No tienes módulos habilitados. Consulta al responsable de acceso.</p>}
                    {view.content}
                </section>
            ) : (
                <section aria-label="Página no disponible">
                    <h2 className="h4">Página no disponible</h2>
                    <p>Esta página no está autorizada para tu cuenta o todavía no está habilitada.</p>
                    <Link to="/">Volver al inicio</Link>
                </section>
            )}
        </>
    );
}
