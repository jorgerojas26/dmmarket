import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ConfiguracionPage from './index';

// react-markdown y sus dependencias son ESM-only; no se transforman en Jest
// (CRA4). Se mockea con un contenedor simple: estos tests verifican que las
// notas se muestren, no el renderizado del markdown en sí.
jest.mock('react-markdown', () => {
    const Markdown = ({ children }) => <div className="configuracion-about__notes-markdown">{children}</div>;
    return Markdown;
});

const jsonResponse = (body, status = 200) => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
});

const STATUS = { currentVersion: '1.0.0', platform: 'darwin', standalone: false };
const HISTORY = [
    { version: '1.1.0', publishedAt: '2026-08-19T00:00:00Z', notes: 'Novedades de la 1.1.0' },
    { version: '1.0.0', publishedAt: '2026-08-01T00:00:00Z', notes: '' },
];
const AVAILABLE = {
    updateAvailable: true,
    latestVersion: '1.1.0',
    notes: 'Novedades de la 1.1.0',
    assetUrl: 'http://fake/dmmarket-app.exe',
    sha256AssetUrl: 'http://fake/dmmarket-app.exe.sha256',
};
const UPTODATE = { updateAvailable: false, latestVersion: '1.0.0', notes: '', publishedAt: null };
const PROGRESS = { active: false, bytes: 100, total: 100 };

let fetchMock;

beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock;
});

afterEach(() => {
    jest.restoreAllMocks();
});

// Enruta el fetch por URL: `routes` mapea substring de URL → respuesta.
// Un endpoint no listado responde con error (detecta llamadas inesperadas).
const mockRoutes = (routes) => {
    fetchMock.mockImplementation((url) => {
        for (const [key, resp] of Object.entries(routes)) {
            if (String(url).includes(key)) return Promise.resolve(resp);
        }
        return Promise.resolve(jsonResponse({ error: `ruta no esperada: ${url}` }, 500));
    });
};

const baseRoutes = (extra = {}) => ({
    '/status': jsonResponse(STATUS),
    '/history': jsonResponse(HISTORY),
    ...extra,
});

it('muestra sidebar con "Acerca de", texto estándar, versión e historial', async () => {
    mockRoutes(baseRoutes());
    render(<ConfiguracionPage />);
    expect(screen.getAllByText('Acerca de').length).toBeGreaterThan(0); // item sidebar + título panel
    expect(screen.getByText('Versión instalada')).toBeInTheDocument();
    expect(screen.getByText('Buscar actualizaciones')).toBeInTheDocument();
    expect(await screen.findByText('v1.0.0')).toBeInTheDocument();

    // Historial de versiones con sus notas
    expect(await screen.findByText('Historial de versiones')).toBeInTheDocument();
    expect(screen.getByText('v1.1.0')).toBeInTheDocument();
    expect(screen.getByText('Novedades de la 1.1.0')).toBeInTheDocument();
});

it('flujo al día: check → "Estás al día"', async () => {
    mockRoutes(baseRoutes({ '/check': jsonResponse(UPTODATE) }));
    render(<ConfiguracionPage />);
    userEvent.click(await screen.findByText('Buscar actualizaciones'));
    expect(await screen.findByText('Estás al día (v1.0.0)')).toBeInTheDocument();
});

it('flujo con update disponible: notas + descargar + reiniciar', async () => {
    mockRoutes(
        baseRoutes({
            '/check': jsonResponse(AVAILABLE),
            '/download': jsonResponse({ success: true }),
            '/progress': jsonResponse(PROGRESS),
            '/apply': jsonResponse({ success: true }),
        }),
    );
    render(<ConfiguracionPage />);
    userEvent.click(await screen.findByText('Buscar actualizaciones'));
    expect(await screen.findByText('Versión 1.1.0 disponible')).toBeInTheDocument();
    // Las notas aparecen en el check y en el historial (misma release)
    expect((await screen.findAllByText('Novedades de la 1.1.0')).length).toBeGreaterThan(0);

    userEvent.click(screen.getByText('Descargar actualización'));
    expect(await screen.findByText('Descargado — Reiniciar para actualizar')).toBeInTheDocument();

    userEvent.click(screen.getByText('Reiniciar ahora'));
    expect(await screen.findByText(/Actualizando — la app se reiniciará/)).toBeInTheDocument();
});

it('error de red del check se muestra sin romper y permite reintentar', async () => {
    mockRoutes(
        baseRoutes({
            '/check': jsonResponse(
                { error: { message: 'GitHub limitó las peticiones (rate limit). Probá de nuevo más tarde.' } },
                429,
            ),
        }),
    );
    render(<ConfiguracionPage />);
    userEvent.click(await screen.findByText('Buscar actualizaciones'));
    expect(await screen.findByText(/rate limit/)).toBeInTheDocument();
    expect(screen.getByText('Buscar actualizaciones')).toBeInTheDocument(); // reintentar
});

it('error de descarga se muestra y permite reintentar', async () => {
    mockRoutes(
        baseRoutes({
            '/check': jsonResponse(AVAILABLE),
            '/download': jsonResponse({ error: { message: 'La verificación sha256 falló' } }, 500),
        }),
    );
    render(<ConfiguracionPage />);
    userEvent.click(await screen.findByText('Buscar actualizaciones'));
    userEvent.click(await screen.findByText('Descargar actualización'));
    expect(await screen.findByText('La verificación sha256 falló')).toBeInTheDocument();
    expect(screen.getByText('Descargar actualización')).toBeInTheDocument(); // reintentar
});
