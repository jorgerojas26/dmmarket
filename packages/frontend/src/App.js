import { ShowNoeContext } from 'context/show_noe';
import { useCurrencyRates } from 'hooks/useCurrencyRates';
import ClientesPage from 'pages/clientes';
import ComprasPage from 'pages/compras';
import VentasPage from 'pages/ventas';
import { useContext, useEffect } from 'react';
import Container from 'react-bootstrap/Container';
import Nav from 'react-bootstrap/Nav';
import Navbar from 'react-bootstrap/Navbar';
import { Link, Redirect, Route, Switch, useLocation } from 'react-router-dom';
import { CurrencyRateContext } from './context/currency_rate';
import ConfiguracionPage from './pages/configuracion';
import ProveedoresPage from './pages/proveedores';

const SIDEBAR_ROUTES = ['/ventas', '/compras', '/clientes', '/proveedores', '/configuracion'];

function App() {
    const location = useLocation();
    const { currencyRate, setCurrencyRate } = useContext(CurrencyRateContext);
    const { showNoe, setShowNoe } = useContext(ShowNoeContext);

    const { data: currenciesRes } = useCurrencyRates();

    useEffect(() => {
        if (currenciesRes?.data) {
            setCurrencyRate(currenciesRes.data.find((currency) => currency.Simbolo === 'BsS'));
        }
    }, [currenciesRes, setCurrencyRate]);

    return (
        <div className="App bg-dark">
            <Container fluid id="main" className="m-0 p-0 vh-100 d-flex flex-column">
                <Navbar
                    variant="dark"
                    className={
                        'app-navbar' +
                        (SIDEBAR_ROUTES.some((route) => location.pathname.includes(route))
                            ? ' has-clients-sidebar'
                            : '')
                    }
                    expand="xl"
                >
                    <Container fluid>
                        <Navbar.Brand>SISTEMA DE REPORTES</Navbar.Brand>

                        <Navbar.Toggle aria-controls="basic-navbar-nav" />
                        <Navbar.Collapse id="basic-navbar-nav">
                            <Container fluid className="d-flex gap-5 justify-content-between align-items-center">
                                <Nav className="me-auto">
                                    {['ventas', 'compras', 'clientes', 'proveedores'].map((route) => {
                                        return (
                                            <Link
                                                key={route}
                                                to={`/${route}`}
                                                className={`text-decoration-none nav-link${
                                                    location.pathname.includes(route) ? ' active' : ''
                                                }`}
                                            >
                                                {route}
                                            </Link>
                                        );
                                    })}
                                </Nav>
                                <div
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '20px',
                                    }}
                                >
                                    <Link
                                        to="/configuracion"
                                        title="Configuración"
                                        className={`text-decoration-none nav-link p-1${
                                            location.pathname.includes('/configuracion') ? ' active' : ''
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
                                    <span className="text-light">Facturas</span>
                                    <div>
                                        <label className="switch">
                                            <input
                                                type="checkbox"
                                                checked={showNoe}
                                                onChange={(e) => setShowNoe(e.target.checked)}
                                            />
                                            <span className="slider round"></span>
                                        </label>
                                    </div>
                                    <span className="text-light">Notas de entrega</span>
                                </div>
                                <div className="text-light">
                                    <span>
                                        REF: <span className="fw-bold text-info">{currencyRate?.Cambio}</span>{' '}
                                        {currencyRate?.Simbolo}
                                    </span>
                                </div>
                            </Container>
                        </Navbar.Collapse>
                    </Container>
                </Navbar>

                <Container fluid className="d-flex flex-column flex-grow-1 overflow-hidden p-0">
                    <Switch>
                        <Redirect exact from="/" to="/ventas" />
                        <Route path="/ventas" component={VentasPage} />
                        <Route path="/compras" component={ComprasPage} />
                        <Route path="/clientes" component={ClientesPage} />
                        <Route path="/proveedores" component={ProveedoresPage} />
                        <Route path="/configuracion" component={ConfiguracionPage} />
                    </Switch>
                </Container>
            </Container>
        </div>
    );
}

export default App;
