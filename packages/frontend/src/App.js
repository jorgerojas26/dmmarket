import UpdateToast from 'components/UpdateToast';
import { CurrencyRateContext } from 'context/currency_rate';
import { ShowNoeContext } from 'context/show_noe';
import { useCurrencyRates } from 'hooks/useCurrencyRates';
import { useContext, useEffect, useState } from 'react';
import Container from 'react-bootstrap/Container';
import Nav from 'react-bootstrap/Nav';
import Navbar from 'react-bootstrap/Navbar';
import { Link, NavLink, Redirect, useLocation } from 'react-router-dom';
import Audit from './auth/audit';
import Commissions from './auth/commissions';
import { useAuth } from './auth/context';
import AccessWorkspace, { Account } from './auth/workspace';
import Clients from './pages/clientes';
import Purchases from './pages/compras';
import Configuration from './pages/configuracion';
import Inventory from './pages/inventario';
import Providers from './pages/proveedores';
import Sellers from './pages/vendedores';
import Sales from './pages/ventas';

export default function App({ onLogout, logoutError }) {
    const { session, can } = useAuth();
    const { pathname } = useLocation();
    const { showNoe, setShowNoe } = useContext(ShowNoeContext);
    const { currencyRate, setCurrencyRate } = useContext(CurrencyRateContext);
    const { data: currencies } = useCurrencyRates(can('rates.read'));
    useEffect(() => {
        if (currencies?.status === 200) setCurrencyRate(currencies.data.find((currency) => currency.Simbolo === 'BsS'));
    }, [currencies, setCurrencyRate]);
    const [expanded, setExpanded] = useState(false);
    const has = (capability) => session.permissions.some((grant) => grant.capability === capability);
    const configuration = ['rates.read', 'rates.sync', 'backups.read', 'backups.create', 'updates.read'].some(can);
    const access = ['access.users', 'access.roles', 'access.links', 'access.recover'].some(can);
    const modules = [
        { path: '/ventas', label: 'Ventas', allowed: has('sales.read') },
        { path: '/compras', label: 'Compras', allowed: can('purchases.read') },
        { path: '/clientes', label: 'Clientes', allowed: can('clients.read') || can('receivables.read') },
        { path: '/proveedores', label: 'Proveedores', allowed: can('providers.read') },
        { path: '/vendedores', label: 'Vendedores', allowed: has('sellers.read') },
        { path: '/comisiones', label: 'Comisiones', allowed: has('commissions.read') },
        { path: '/inventario', label: 'Inventario', allowed: can('inventory.read') },
        { path: '/configuracion', label: 'Configuración', allowed: configuration },
        { path: '/auditoria', label: 'Auditoría', allowed: can('audit.read') },
        { path: '/acceso', label: 'Acceso', allowed: access },
    ].filter((module) => module.allowed);
    const views = [
        { path: '/ventas', label: 'Desglose', allowed: has('sales.read'), content: <Sales /> },
        { path: '/compras', label: 'Desglose', allowed: can('purchases.read'), content: <Purchases /> },
        { path: '/proveedores', label: 'Directorio', allowed: can('providers.read'), content: <Providers /> },
        {
            path: '/clientes',
            label: 'Clientes',
            allowed: can('clients.read') || can('receivables.read'),
            content: <Clients />,
        },
        { path: '/vendedores', label: 'Vendedores', allowed: has('sellers.read'), content: <Sellers /> },
        { path: '/comisiones', label: 'Consulta', allowed: has('commissions.read'), content: <Commissions /> },
        { path: '/inventario', label: 'Existencias', allowed: can('inventory.read'), content: <Inventory /> },
        { path: '/configuracion', label: 'Configuración', allowed: configuration, content: <Configuration /> },
        { path: '/auditoria', label: 'Historial', allowed: can('audit.read'), content: <Audit /> },
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
        <div className="App bg-dark">
            <UpdateToast />
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
                        ].some((route) => pathname.includes(route))
                            ? ' has-clients-sidebar'
                            : '')
                    }
                >
                    <Container fluid className="app-navbar-inner">
                        <Navbar.Brand className="app-navbar-brand">SISTEMA DE REPORTES</Navbar.Brand>
                        <Navbar.Toggle aria-controls="basic-navbar-nav" label="Abrir navegación" />
                        <Navbar.Collapse id="basic-navbar-nav">
                            <Nav className="me-auto app-navbar-links flex-wrap">
                                {modules
                                    .filter((item) => item.path !== '/configuracion')
                                    .map((item) => (
                                        <Nav.Link
                                            key={item.path}
                                            aria-label={item.label}
                                            as={NavLink}
                                            to={item.path}
                                            className="text-decoration-none"
                                            isActive={() => path === item.path || path.startsWith(`${item.path}/`)}
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
                                {configuration && (
                                    <Link
                                        to="/configuracion"
                                        title="Configuración"
                                        aria-label="Configuración"
                                        onClick={() => setExpanded(false)}
                                        className={`text-decoration-none nav-link app-navbar-icon${
                                            pathname.includes('/configuracion') ? ' active' : ''
                                        }`}
                                    >
                                        <svg
                                            width="20"
                                            height="20"
                                            viewBox="0 0 24 24"
                                            fill="none"
                                            stroke="currentColor"
                                            strokeWidth="2"
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                        >
                                            <title>Configuración</title>
                                            <circle cx="12" cy="12" r="3" />
                                            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                                        </svg>
                                    </Link>
                                )}
                                {has('sales.read') && (
                                    <div className="app-navbar-switch">
                                        <span className="text-light">Facturas</span>
                                        <div>
                                            <label className="switch">
                                                <input
                                                    type="checkbox"
                                                    aria-label="Notas de entrega"
                                                    checked={showNoe}
                                                    onChange={(event) => setShowNoe(event.target.checked)}
                                                />
                                                <span className="slider round"></span>
                                            </label>
                                        </div>
                                        <span className="text-light">Notas de entrega</span>
                                    </div>
                                )}
                                {can('rates.read') && (
                                    <div className="text-light app-navbar-ref" aria-busy={!currencies}>
                                        <span>
                                            REF: <span className="fw-bold text-info">{currencyRate?.Cambio}</span>{' '}
                                            {currencyRate?.Simbolo}
                                        </span>
                                    </div>
                                )}
                                <span className="text-light" role="status" aria-label="Usuario conectado">
                                    {session.user.username}
                                </span>
                                <Link
                                    to="/cuenta"
                                    className="text-decoration-none nav-link"
                                    onClick={() => setExpanded(false)}
                                >
                                    Mi cuenta
                                </Link>
                                <button
                                    type="button"
                                    data-auth-logout="true"
                                    className="btn btn-outline-light"
                                    onClick={onLogout}
                                >
                                    Salir
                                </button>
                            </div>
                        </Navbar.Collapse>
                    </Container>
                </Navbar>
                {logoutError && (
                    <p role="alert" className="text-warning px-4 mb-0">
                        {logoutError}
                    </p>
                )}
                <Container fluid className="d-flex flex-column flex-grow-1 overflow-hidden p-0">
                    {path === '/' ? (
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
                      ].includes(path) ? (
                        view.content
                    ) : view ? (
                        <section
                            key={path}
                            aria-label={module?.label || 'Mi cuenta'}
                            className="flex-grow-1 overflow-auto p-4 text-light"
                        >
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
