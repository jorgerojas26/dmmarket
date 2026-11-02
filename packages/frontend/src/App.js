import { modulePermissions } from '@dmmarket/permissions';
import AccessDenied from 'components/AccessDenied';
import UpdateToast from 'components/UpdateToast';
import UserMenu from 'components/UserMenu';
import { CurrencyRateContext } from 'context/currency_rate';
import { ReportCurrencyGate } from 'context/report_settings';
import { useSidebar } from 'context/sidebar';
import { useCurrencyRates } from 'hooks/useCurrencyRates';
import { useContext, useEffect, useState } from 'react';
import Container from 'react-bootstrap/Container';
import Nav from 'react-bootstrap/Nav';
import Navbar from 'react-bootstrap/Navbar';
import { NavLink, Redirect, useLocation } from 'react-router-dom';
import { useAuth } from './auth/context';
import AccessWorkspace, { Account } from './auth/workspace';
import Clients from './pages/clientes';
import Purchases from './pages/compras';
import Configuration from './pages/configuracion';
import { DocumentPreferenceGate } from './pages/configuracion/PreferencesRecovery';
import Inventory from './pages/inventario';
import Providers from './pages/proveedores';
import Sellers from './pages/vendedores';
import Sales from './pages/ventas';

export default function App({ onLogout, logoutError, pending = false }) {
    const { session, can } = useAuth();
    const { pathname } = useLocation();
    const { collapsed } = useSidebar();
    const { currencyRate, setCurrencyRate } = useContext(CurrencyRateContext);
    const { data: currencies } = useCurrencyRates(can('rates.read'));
    useEffect(() => {
        if (currencies?.status === 200) setCurrencyRate(currencies.data.find((currency) => currency.Simbolo === 'BsS'));
    }, [currencies, setCurrencyRate]);
    const [expanded, setExpanded] = useState(false);
    const hasModule = (module) => !pending && modulePermissions(session?.permissions || [], module).length > 0;
    const configuration =
        can('preferences.read') ||
        can('settings.currency.read') ||
        can('updates.read') ||
        can('backups.read') ||
        can('backups.create') ||
        can('rates.read') ||
        can('rates.sync');
    const access = hasModule('access') || hasModule('audit');
    const modules = [
        { path: '/ventas', label: 'Ventas', allowed: hasModule('sales') },
        { path: '/compras', label: 'Compras', allowed: hasModule('purchases') },
        { path: '/clientes', label: 'Clientes', allowed: hasModule('clients') },
        { path: '/proveedores', label: 'Proveedores', allowed: hasModule('providers') },
        { path: '/vendedores', label: 'Vendedores', allowed: hasModule('sellers') },
        { path: '/inventario', label: 'Inventario', allowed: hasModule('inventory') },
        { path: '/configuracion', label: 'Configuración', allowed: configuration },
        { path: '/acceso', label: 'Acceso', allowed: access },
    ].filter((module) => module.allowed);
    const views = [
        { path: '/ventas', allowed: hasModule('sales'), content: <Sales /> },
        { path: '/compras', allowed: hasModule('purchases'), content: <Purchases /> },
        { path: '/proveedores', allowed: hasModule('providers'), content: <Providers /> },
        {
            path: '/clientes',
            allowed: hasModule('clients'),
            content: <Clients onLogout={onLogout} logoutError={logoutError} />,
        },
        { path: '/vendedores', allowed: hasModule('sellers'), content: <Sellers /> },
        { path: '/inventario', allowed: hasModule('inventory'), content: <Inventory /> },
        { path: '/configuracion', allowed: configuration, content: <Configuration /> },
        { path: '/auditoria', allowed: hasModule('audit'), content: <Redirect to="/acceso#auditoria" /> },
        { path: '/acceso', allowed: access, content: <AccessWorkspace /> },
        { path: '/cuenta', allowed: true, content: <Account /> },
    ].filter((view) => view.allowed);
    const path = /^\/acceso\/(?:usuarios|auditoria)\/[^/]+\/?$/.test(pathname)
        ? '/acceso'
        : pathname.replace(/\/+$/, '') || '/';
    const view = views.find((item) => item.path === path);
    const module = modules.find((item) => path === item.path || path.startsWith(`${item.path}/`));
    return (
        <div className="App bg-dark">
            {!pending && <UpdateToast />}
            <Container fluid id="main" className="m-0 p-0 vh-100 d-flex flex-column">
                <Navbar
                    aria-label="Módulos disponibles"
                    variant="dark"
                    expand="xl"
                    expanded={expanded}
                    onToggle={setExpanded}
                    className={
                        'app-navbar' +
                        ([
                            '/ventas',
                            '/compras',
                            '/clientes',
                            '/proveedores',
                            '/vendedores',
                            '/inventario',
                            '/configuracion',
                            '/acceso',
                        ].some((route) => pathname.includes(route))
                            ? ' has-clients-sidebar'
                            : '')
                    }
                >
                    <Container fluid className="app-navbar-inner">
                        <Navbar.Brand className="app-navbar-brand">SISTEMA DE REPORTES</Navbar.Brand>
                        {!pending && (
                            <>
                                <Navbar.Toggle
                                    aria-controls="basic-navbar-nav"
                                    aria-expanded={expanded}
                                    label="Abrir navegación"
                                />
                                <Navbar.Collapse id="basic-navbar-nav">
                                    <Nav className="me-auto app-navbar-links">
                                        {modules
                                            .filter((item) => !['/configuracion', '/acceso'].includes(item.path))
                                            .map((item) => (
                                                <Nav.Link
                                                    key={item.path}
                                                    aria-label={item.label}
                                                    as={NavLink}
                                                    to={item.path}
                                                    className="text-decoration-none"
                                                    isActive={() =>
                                                        path === item.path || path.startsWith(`${item.path}/`)
                                                    }
                                                    onClick={() => setExpanded(false)}
                                                >
                                                    {[
                                                        '/ventas',
                                                        '/compras',
                                                        '/clientes',
                                                        '/proveedores',
                                                        '/vendedores',
                                                        '/inventario',
                                                    ].includes(item.path)
                                                        ? item.label.toLowerCase()
                                                        : item.label}
                                                </Nav.Link>
                                            ))}
                                    </Nav>
                                    <div className="app-navbar-actions">
                                        {can('rates.read') && (
                                            <div className="text-light app-navbar-ref" aria-busy={!currencies}>
                                                <span>
                                                    REF:{' '}
                                                    <span className="fw-bold text-info">{currencyRate?.Cambio}</span>{' '}
                                                    {currencyRate?.Simbolo}
                                                </span>
                                            </div>
                                        )}
                                        <div className="app-navbar-account-actions">
                                            <UserMenu
                                                configuration={configuration}
                                                onLogout={onLogout}
                                                onNavigate={() => setExpanded(false)}
                                                administration={modules.filter((item) => item.path === '/acceso')}
                                            />
                                        </div>
                                    </div>
                                </Navbar.Collapse>
                            </>
                        )}
                    </Container>
                </Navbar>
                {!pending && logoutError && (
                    <p role="alert" className="text-warning px-4 mb-0">
                        {logoutError}
                    </p>
                )}
                <Container fluid className="d-flex flex-column flex-grow-1 overflow-hidden p-0">
                    {pending ? (
                        <main aria-label="Validando acceso" aria-busy="true" className="clientes-layout p-0">
                            <div className="clientes-row">
                                {[
                                    '/ventas',
                                    '/compras',
                                    '/clientes',
                                    '/proveedores',
                                    '/vendedores',
                                    '/inventario',
                                    '/configuracion',
                                    '/acceso',
                                ].includes(path) && (
                                    <aside
                                        aria-hidden="true"
                                        className={`clients-sidebar app-pending-sidebar${collapsed ? ' collapsed' : ''}`}
                                    />
                                )}
                                <div className="clientes-content p-4" />
                            </div>
                        </main>
                    ) : path === '/' ? (
                        <Redirect to={modules[0]?.path || '/cuenta'} />
                    ) : view &&
                      [
                          '/inventario',
                          '/compras',
                          '/ventas',
                          '/clientes',
                          '/vendedores',
                          '/proveedores',
                          '/configuracion',
                          '/acceso',
                          '/auditoria',
                      ].includes(path) ? (
                        ['/ventas', '/vendedores', '/proveedores'].includes(path) ? (
                            <DocumentPreferenceGate key={pathname} onLeave={onLogout} logoutError={logoutError}>
                                {view.content}
                            </DocumentPreferenceGate>
                        ) : ['/compras', '/inventario'].includes(path) ? (
                            <ReportCurrencyGate>{view.content}</ReportCurrencyGate>
                        ) : (
                            view.content
                        )
                    ) : view ? (
                        <section
                            key={path}
                            aria-label={module?.label || 'Mi cuenta'}
                            className="flex-grow-1 overflow-auto p-4 text-light"
                        >
                            {module?.label && <h2 className="h4">{module.label}</h2>}
                            {!modules.length && (
                                <p>No tienes módulos habilitados. Consulta al responsable de acceso.</p>
                            )}
                            {view.content}
                        </section>
                    ) : (
                        <AccessDenied key={path} />
                    )}
                </Container>
            </Container>
        </div>
    );
}
