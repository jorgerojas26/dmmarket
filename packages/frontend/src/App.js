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
import { Link, NavLink, Redirect, useLocation } from 'react-router-dom';
import Audit from './auth/audit';
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
    const has = (capability) => !pending && session?.permissions?.some((grant) => grant.capability === capability);
    const configuration = [
        'preferences.read',
        'rates.read',
        'rates.sync',
        'backups.read',
        'backups.create',
        'updates.read',
    ].some(can);
    const access = ['access.users', 'access.roles', 'access.links', 'access.recover'].some(can);
    const modules = [
        { path: '/ventas', label: 'Ventas', allowed: has('sales.read') },
        { path: '/compras', label: 'Compras', allowed: can('purchases.read') },
        { path: '/clientes', label: 'Clientes', allowed: can('clients.read') || can('receivables.read') },
        { path: '/proveedores', label: 'Proveedores', allowed: can('providers.read') },
        { path: '/vendedores', label: 'Vendedores', allowed: has('sellers.read') },
        { path: '/inventario', label: 'Inventario', allowed: can('inventory.read') },
        { path: '/configuracion', label: 'Configuración', allowed: configuration },
        { path: '/auditoria', label: 'Auditoría', allowed: can('audit.read') },
        { path: '/acceso', label: 'Acceso', allowed: access },
    ].filter((module) => module.allowed);
    const views = [
        { path: '/ventas', allowed: has('sales.read'), content: <Sales /> },
        { path: '/compras', allowed: can('purchases.read'), content: <Purchases /> },
        { path: '/proveedores', allowed: can('providers.read'), content: <Providers /> },
        {
            path: '/clientes',
            allowed: can('clients.read') || can('receivables.read'),
            content: <Clients onLogout={onLogout} logoutError={logoutError} />,
        },
        { path: '/vendedores', allowed: has('sellers.read'), content: <Sellers /> },
        { path: '/inventario', allowed: can('inventory.read'), content: <Inventory /> },
        { path: '/configuracion', allowed: configuration, content: <Configuration /> },
        { path: '/auditoria', allowed: can('audit.read'), content: <Audit /> },
        { path: '/acceso', allowed: access, content: <AccessWorkspace /> },
        { path: '/cuenta', allowed: true, content: <Account /> },
    ].filter((view) => view.allowed);
    const path = pathname.replace(/\/+$/, '') || '/';
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
                                            .filter(
                                                (item) =>
                                                    !['/configuracion', '/auditoria', '/acceso'].includes(item.path),
                                            )
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
                                                administration={modules.filter((item) =>
                                                    ['/acceso', '/auditoria'].includes(item.path),
                                                )}
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
                            <h2 className="h4">{module?.label || 'Mi cuenta'}</h2>
                            {!modules.length && (
                                <p>No tienes módulos habilitados. Consulta al responsable de acceso.</p>
                            )}
                            {view.content}
                        </section>
                    ) : (
                        <section aria-label="Página no disponible" className="p-4">
                            <h2 className="h4">Página no disponible</h2>
                            <p>Esta página no está autorizada para tu cuenta o todavía no está habilitada.</p>
                            <Link to="/">Volver al inicio</Link>
                        </section>
                    )}
                </Container>
            </Container>
        </div>
    );
}
