import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ConfiguracionPage from './index';

const jsonResponse = (body, status = 200) => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
});

const STATUS = { currentVersion: '1.0.0', platform: 'darwin', standalone: false };
const AVAILABLE = {
    updateAvailable: true,
    latestVersion: '1.1.0',
    notes: 'Novedades de la 1.1.0',
    assetUrl: 'http://fake/dmmarket-app.exe',
    sha256AssetUrl: 'http://fake/dmmarket-app.exe.sha256',
};
const UPTODATE = { updateAvailable: false, latestVersion: '1.0.0', notes: '', publishedAt: null };

let fetchMock;

beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock;
});

afterEach(() => {
    jest.restoreAllMocks();
});

it('muestra sidebar con "Acerca de", texto estándar y versión', async () => {
    fetchMock.mockResolvedValue(jsonResponse(STATUS));
    render(<ConfiguracionPage />);
    expect(screen.getAllByText('Acerca de').length).toBeGreaterThan(0); // item sidebar + título panel
    expect(screen.getByText('Versión instalada')).toBeInTheDocument();
    expect(screen.getByText('Buscar actualizaciones')).toBeInTheDocument();
    expect(await screen.findByText('v1.0.0')).toBeInTheDocument();
});

it('flujo al día: check → "Estás al día"', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(STATUS)).mockResolvedValueOnce(jsonResponse(UPTODATE));
    render(<ConfiguracionPage />);
    userEvent.click(await screen.findByText('Buscar actualizaciones'));
    expect(await screen.findByText('Estás al día (v1.0.0)')).toBeInTheDocument();
});

it('flujo con update disponible: notas + descargar + reiniciar', async () => {
    fetchMock
        .mockResolvedValueOnce(jsonResponse(STATUS))
        .mockResolvedValueOnce(jsonResponse(AVAILABLE))
        .mockResolvedValueOnce(jsonResponse({ success: true })) // download
        .mockResolvedValueOnce(jsonResponse({ active: false, bytes: 100, total: 100 })) // progress
        .mockResolvedValueOnce(jsonResponse({ success: true })); // apply
    render(<ConfiguracionPage />);
    userEvent.click(await screen.findByText('Buscar actualizaciones'));
    expect(await screen.findByText('Versión 1.1.0 disponible')).toBeInTheDocument();
    expect(screen.getByText('Novedades de la 1.1.0')).toBeInTheDocument();

    userEvent.click(screen.getByText('Descargar actualización'));
    expect(await screen.findByText('Descargado — Reiniciar para actualizar')).toBeInTheDocument();

    userEvent.click(screen.getByText('Reiniciar ahora'));
    expect(await screen.findByText(/Actualizando — la app se reiniciará/)).toBeInTheDocument();
});

it('error de red del check se muestra sin romper y permite reintentar', async () => {
    fetchMock
        .mockResolvedValueOnce(jsonResponse(STATUS))
        .mockResolvedValueOnce(
            jsonResponse(
                { error: { message: 'GitHub limitó las peticiones (rate limit). Probá de nuevo más tarde.' } },
                429,
            ),
        );
    render(<ConfiguracionPage />);
    userEvent.click(await screen.findByText('Buscar actualizaciones'));
    expect(await screen.findByText(/rate limit/)).toBeInTheDocument();
    expect(screen.getByText('Buscar actualizaciones')).toBeInTheDocument(); // reintentar
});

it('error de descarga se muestra y permite reintentar', async () => {
    fetchMock
        .mockResolvedValueOnce(jsonResponse(STATUS))
        .mockResolvedValueOnce(jsonResponse(AVAILABLE))
        .mockResolvedValueOnce(jsonResponse({ error: { message: 'La verificación sha256 falló' } }, 500));
    render(<ConfiguracionPage />);
    userEvent.click(await screen.findByText('Buscar actualizaciones'));
    userEvent.click(await screen.findByText('Descargar actualización'));
    expect(await screen.findByText('La verificación sha256 falló')).toBeInTheDocument();
    expect(screen.getByText('Descargar actualización')).toBeInTheDocument(); // reintentar
});
