import { act, fireEvent, render, screen } from '@testing-library/react';
import { applyUpdate, checkForUpdate, downloadUpdate, fetchUpdateStatus, getDownloadProgress } from 'api/update';
import { UpdateProvider, useUpdate } from 'context/update';
import UpdateToast from './index';

jest.mock('api/update');

const INTERVAL = 12 * 60 * 60 * 1000;
const KEY = 'dmmarket:update:last-check:1.0.0';
const STATUS = { currentVersion: '1.0.0', standalone: true };
const AVAILABLE = {
    updateAvailable: true,
    latestVersion: '1.1.0',
    assetUrl: 'https://example.com/app',
    sha256AssetUrl: 'https://example.com/app.sha256',
};

const ManualCheck = () => {
    const update = useUpdate();
    return (
        <button type="button" onClick={update.handleCheck}>
            Buscar manualmente
        </button>
    );
};

const renderToast = () =>
    render(
        <UpdateProvider>
            <UpdateToast />
            <ManualCheck />
        </UpdateProvider>,
    );

const flush = async () => {
    await act(async () => {});
};

const advance = async (ms) => {
    await act(async () => {
        jest.advanceTimersByTime(ms);
    });
};

beforeEach(() => {
    jest.useFakeTimers('modern');
    jest.setSystemTime(new Date('2026-08-20T10:00:00Z'));
    jest.resetAllMocks();
    localStorage.clear();
    fetchUpdateStatus.mockResolvedValue({ status: 200, data: STATUS });
    checkForUpdate.mockResolvedValue({ status: 200, data: AVAILABLE });
    downloadUpdate.mockResolvedValue({ status: 200, data: { success: true } });
    applyUpdate.mockResolvedValue({ status: 200, data: { success: true } });
    getDownloadProgress.mockResolvedValue({ status: 200, data: { bytes: 50, total: 100 } });
});

afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
});

it('busca al abrir y cada 12 horas, sin descargar ni aplicar automáticamente', async () => {
    renderToast();
    await flush();
    expect(checkForUpdate).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Versión 1.1.0 disponible.')).toBeInTheDocument();
    expect(downloadUpdate).not.toHaveBeenCalled();
    expect(applyUpdate).not.toHaveBeenCalled();
    await advance(INTERVAL - 60000);
    expect(checkForUpdate).toHaveBeenCalledTimes(1);
    await advance(60000);
    expect(checkForUpdate).toHaveBeenCalledTimes(2);
    await advance(INTERVAL);
    expect(checkForUpdate).toHaveBeenCalledTimes(3);
});

it('recargar o abrir otra pestaña no repite el chequeo antes de 12 horas', async () => {
    const first = renderToast();
    await flush();
    first.unmount();
    renderToast();
    await flush();
    expect(checkForUpdate).toHaveBeenCalledTimes(1);
    await advance(INTERVAL);
    expect(checkForUpdate).toHaveBeenCalledTimes(2);
});

it('comprueba un chequeo vencido al volver a la pestaña tras una suspensión', async () => {
    localStorage.setItem(KEY, String(Date.now() - INTERVAL + 1000));
    renderToast();
    await flush();
    expect(checkForUpdate).not.toHaveBeenCalled();
    jest.setSystemTime(Date.now() + 2000);
    fireEvent(document, new Event('visibilitychange'));
    await flush();
    expect(checkForUpdate).toHaveBeenCalledTimes(1);
});

it('no sigue buscando cuando la web está cerrada', async () => {
    const view = renderToast();
    await flush();
    view.unmount();
    await advance(INTERVAL * 2);
    fireEvent(window, new Event('focus'));
    expect(checkForUpdate).toHaveBeenCalledTimes(1);
});

it('no muestra toast si está al día y los fallos del chequeo no interrumpen el trabajo', async () => {
    checkForUpdate.mockRejectedValueOnce(new Error('Sin conexión'));
    checkForUpdate.mockResolvedValue({ status: 200, data: { updateAvailable: false } });
    renderToast();
    await flush();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    await advance(INTERVAL);
    expect(checkForUpdate).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

it('no activa el chequeo automático en desarrollo', async () => {
    fetchUpdateStatus.mockResolvedValue({ status: 200, data: { ...STATUS, standalone: false } });
    renderToast();
    await flush();
    await advance(INTERVAL);
    expect(checkForUpdate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('Buscar manualmente'));
    await flush();
    expect(checkForUpdate).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

it('tolera almacenamiento bloqueado e ignora fechas corruptas o futuras', async () => {
    localStorage.setItem(KEY, String(Date.now() + INTERVAL));
    const storage = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('Bloqueado');
    });
    renderToast();
    await flush();
    expect(checkForUpdate).toHaveBeenCalledTimes(1);
    await advance(60000);
    expect(checkForUpdate).toHaveBeenCalledTimes(1);
    storage.mockRestore();
});

it('permite cerrar el aviso y no lo vuelve a mostrar para la misma versión', async () => {
    renderToast();
    await flush();
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }));
    await advance(1000);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    await advance(INTERVAL);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    checkForUpdate.mockResolvedValue({ status: 200, data: { ...AVAILABLE, latestVersion: '1.2.0' } });
    await advance(INTERVAL);
    expect(screen.getByText('Versión 1.2.0 disponible.')).toBeInTheDocument();
});

it('muestra loading y progreso, bloquea dobles clics y reinicia solo al descargar con éxito', async () => {
    let finishDownload;
    downloadUpdate.mockImplementation(
        () =>
            new Promise((resolve) => {
                finishDownload = resolve;
            }),
    );
    renderToast();
    await flush();
    fireEvent.click(screen.getByText('Actualizar y reiniciar'));
    fireEvent.click(screen.getByText('Descargando…', { selector: 'button' }));
    expect(downloadUpdate).toHaveBeenCalledTimes(1);
    expect(downloadUpdate).toHaveBeenCalledWith({
        assetUrl: AVAILABLE.assetUrl,
        sha256AssetUrl: AVAILABLE.sha256AssetUrl,
    });
    expect(screen.getByText('Descargando…', { selector: 'button' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Cerrar' })).not.toBeInTheDocument();
    expect(applyUpdate).not.toHaveBeenCalled();
    await advance(400);
    expect(screen.getByText('50%')).toBeInTheDocument();
    await act(async () => {
        finishDownload({ status: 200, data: { success: true } });
    });
    expect(applyUpdate).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Actualización preparada. La app se reiniciará.')).toBeInTheDocument();
    await advance(INTERVAL);
    expect(checkForUpdate).toHaveBeenCalledTimes(1);
});

it('muestra loading mientras se aplica', async () => {
    applyUpdate.mockImplementation(() => new Promise(() => {}));
    renderToast();
    await flush();
    fireEvent.click(screen.getByText('Actualizar y reiniciar'));
    await flush();
    expect(screen.getByText('Reiniciando…')).toBeDisabled();
});

it('muestra error de descarga y permite reintentar sin aplicar un archivo fallido', async () => {
    downloadUpdate.mockResolvedValueOnce({ status: 500, data: { error: { message: 'Hash inválido' } } });
    renderToast();
    await flush();
    fireEvent.click(screen.getByText('Actualizar y reiniciar'));
    await flush();
    expect(screen.getByRole('alert')).toHaveTextContent('Hash inválido');
    expect(applyUpdate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('Reintentar actualización'));
    await flush();
    expect(downloadUpdate).toHaveBeenCalledTimes(2);
    expect(applyUpdate).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Hash inválido')).not.toBeInTheDocument();
});

it('reintenta aplicar sin volver a descargar si falla el reinicio', async () => {
    applyUpdate.mockRejectedValueOnce(new Error('Sin conexión'));
    renderToast();
    await flush();
    fireEvent.click(screen.getByText('Actualizar y reiniciar'));
    await flush();
    expect(screen.getByRole('alert')).toHaveTextContent('No se pudo contactar al servidor');
    fireEvent.click(screen.getByText('Reintentar actualización'));
    await flush();
    expect(downloadUpdate).toHaveBeenCalledTimes(1);
    expect(applyUpdate).toHaveBeenCalledTimes(2);
    expect(screen.getByText('Actualización preparada. La app se reiniciará.')).toBeInTheDocument();
});

it('no solapa un chequeo manual con la descarga ni el automático con un chequeo pendiente', async () => {
    let finishCheck;
    checkForUpdate.mockImplementationOnce(
        () =>
            new Promise((resolve) => {
                finishCheck = resolve;
            }),
    );
    renderToast();
    await flush();
    fireEvent.click(screen.getByText('Buscar manualmente'));
    await advance(INTERVAL);
    expect(checkForUpdate).toHaveBeenCalledTimes(1);
    await act(async () => {
        finishCheck({ status: 200, data: AVAILABLE });
    });
    downloadUpdate.mockImplementation(() => new Promise(() => {}));
    fireEvent.click(screen.getByText('Actualizar y reiniciar'));
    fireEvent.click(screen.getByText('Buscar manualmente'));
    jest.setSystemTime(Date.now() + INTERVAL);
    fireEvent(window, new Event('focus'));
    await flush();
    expect(downloadUpdate).toHaveBeenCalledTimes(1);
    expect(checkForUpdate).toHaveBeenCalledTimes(2);
});
