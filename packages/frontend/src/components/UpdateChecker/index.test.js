import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import UpdateChecker from './index';

const jsonResponse = (body, status = 200) => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
});

const STANDALONE_STATUS = { currentVersion: '1.0.0', platform: 'win32', standalone: true };
const DEV_STATUS = { currentVersion: '1.0.0', platform: 'darwin', standalone: false };
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

it('se renderiza también en dev (no compilado): badge + botón', async () => {
    fetchMock.mockResolvedValue(jsonResponse(DEV_STATUS));
    render(<UpdateChecker />);
    await screen.findByText('v1.0.0');
    expect(screen.getByText('Buscar actualizaciones')).toBeInTheDocument();
});

it('muestra versión actual + botón en el binario compilado', async () => {
    fetchMock.mockResolvedValue(jsonResponse(STANDALONE_STATUS));
    render(<UpdateChecker />);
    await screen.findByText('v1.0.0');
    expect(screen.getByText('Buscar actualizaciones')).toBeInTheDocument();
});

it('flujo al día: check → "Estás al día"', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(STANDALONE_STATUS)).mockResolvedValueOnce(jsonResponse(UPTODATE));
    render(<UpdateChecker />);
    userEvent.click(await screen.findByText('Buscar actualizaciones'));
    expect(await screen.findByText('Estás al día (v1.0.0)')).toBeInTheDocument();
});

it('flujo con update disponible: botón descargar + notas + reiniciar', async () => {
    fetchMock
        .mockResolvedValueOnce(jsonResponse(STANDALONE_STATUS))
        .mockResolvedValueOnce(jsonResponse(AVAILABLE))
        .mockResolvedValueOnce(jsonResponse({ success: true })) // download
        .mockResolvedValueOnce(jsonResponse({ active: false, bytes: 100, total: 100 })) // progress
        .mockResolvedValueOnce(jsonResponse({ success: true })); // apply
    render(<UpdateChecker />);
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
        .mockResolvedValueOnce(jsonResponse(STANDALONE_STATUS))
        .mockResolvedValueOnce(
            jsonResponse(
                { error: { message: 'GitHub limitó las peticiones (rate limit). Probá de nuevo más tarde.' } },
                429,
            ),
        );
    render(<UpdateChecker />);
    userEvent.click(await screen.findByText('Buscar actualizaciones'));
    expect(await screen.findByText(/rate limit/)).toBeInTheDocument();
    expect(screen.getByText('Buscar actualizaciones')).toBeInTheDocument(); // botón sigue para reintentar
});

it('error de descarga se muestra y permite reintentar', async () => {
    fetchMock
        .mockResolvedValueOnce(jsonResponse(STANDALONE_STATUS))
        .mockResolvedValueOnce(jsonResponse(AVAILABLE))
        .mockResolvedValueOnce(jsonResponse({ error: { message: 'La verificación sha256 falló' } }, 500));
    render(<UpdateChecker />);
    userEvent.click(await screen.findByText('Buscar actualizaciones'));
    userEvent.click(await screen.findByText('Descargar actualización'));
    expect(await screen.findByText('La verificación sha256 falló')).toBeInTheDocument();
    expect(screen.getByText('Descargar actualización')).toBeInTheDocument(); // reintentar
});
