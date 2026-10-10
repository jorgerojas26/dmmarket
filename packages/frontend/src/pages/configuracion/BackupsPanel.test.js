import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createBackup, fetchBackups } from 'api/backups';
import { fetchDriveStatus } from 'api/google_drive';
import BackupsPanel, { formatSize } from './BackupsPanel';

jest.mock('api/backups', () => ({ createBackup: jest.fn(), fetchBackups: jest.fn() }));
jest.mock('api/google_drive', () => ({ fetchDriveStatus: jest.fn() }));

const STATUS = {
    controlToken: 'backup-control-token',
    directory: '/var/lib/dmmarket/backups',
    retention: 30,
    nextRunAt: '2026-08-21T02:00:00Z',
    running: false,
    lastError: null,
    backups: [{ name: 'dmmarket-2026-08-20.sql.gz', completedAt: '2026-08-20T02:01:00Z', sizeBytes: 1572864 }],
};

beforeEach(() => {
    createBackup.mockReset().mockResolvedValue({ status: 202, data: { ok: true } });
    fetchDriveStatus.mockReset().mockResolvedValue({
        status: 200,
        data: { configured: false, connected: false, localAccess: true, uploads: [] },
    });
    fetchBackups.mockReset();
    fetchBackups.mockResolvedValue({ status: 200, data: STATUS });
});

afterEach(() => jest.useRealTimers());

it('lists successful backups, their compressed sizes, directory and policy', async () => {
    render(<BackupsPanel />);
    expect(await screen.findByText('dmmarket-2026-08-20.sql.gz')).toBeInTheDocument();
    expect(screen.getByText('1,5 MiB')).toBeInTheDocument();
    expect(screen.getByText('Exitoso')).toBeInTheDocument();
    expect(screen.getByText('/var/lib/dmmarket/backups')).toBeInTheDocument();
    expect(screen.getByText(/últimos 30 respaldos exitosos/)).toBeInTheDocument();
    expect(screen.getByText(/02:00/)).toBeInTheDocument();
});

it('shows loading and an empty history without pretending a backup succeeded', async () => {
    fetchBackups.mockResolvedValue({ status: 200, data: { ...STATUS, backups: [] } });
    render(<BackupsPanel />);
    expect(screen.getByText('Cargando respaldos…')).toHaveAttribute('role', 'status');
    expect(await screen.findByText('No hay respaldos exitosos todavía.')).toBeInTheDocument();
    expect(screen.queryByText('Exitoso')).not.toBeInTheDocument();
});

it('shows an in-progress backup and the latest failed attempt', async () => {
    fetchBackups.mockResolvedValue({
        status: 200,
        data: {
            ...STATUS,
            running: true,
            lastError: { occurredAt: '2026-08-20T02:00:00Z', message: 'Instala mysqldump.' },
        },
    });
    render(<BackupsPanel />);
    expect(await screen.findByText(/Respaldo en curso/)).toBeInTheDocument();
    expect(screen.getByText(/Instala mysqldump/)).toBeInTheDocument();
});

it.each([
    () => Promise.resolve({ status: 500, data: { error: { message: 'Revisa los permisos.' } } }),
    () => Promise.reject(new Error('Sin conexión.')),
])('shows errors and allows a manual refresh', async (failure) => {
    fetchBackups.mockImplementationOnce(failure);
    render(<BackupsPanel />);
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    userEvent.click(screen.getByText('Actualizar lista'));
    expect(await screen.findByText('dmmarket-2026-08-20.sql.gz')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

it('distinguishes a retention warning from a failed backup', async () => {
    fetchBackups.mockResolvedValue({
        status: 200,
        data: {
            ...STATUS,
            retentionError: { message: 'El respaldo se guardó, pero no se pudieron eliminar los archivos antiguos.' },
        },
    });
    render(<BackupsPanel />);
    expect(await screen.findByText(/El respaldo se guardó/)).toBeInTheDocument();
    expect(screen.getByText('Exitoso')).toBeInTheDocument();
    expect(screen.queryByText(/Último intento fallido/)).not.toBeInTheDocument();
});

it('refreshes every minute and cancels polling when unmounted', async () => {
    jest.useFakeTimers();
    const view = render(<BackupsPanel />);
    await act(async () => {});
    expect(fetchBackups).toHaveBeenCalledTimes(1);
    await act(async () => jest.advanceTimersByTime(60000));
    expect(fetchBackups).toHaveBeenCalledTimes(2);
    view.unmount();
    await act(async () => jest.advanceTimersByTime(60000));
    expect(fetchBackups).toHaveBeenCalledTimes(2);
});

it('formats bytes with binary units', () => {
    expect(formatSize(0)).toBe('0 B');
    expect(formatSize(1023)).toBe('1023 B');
    expect(formatSize(1024)).toBe('1 KiB');
    expect(formatSize(1024 ** 3)).toBe('1 GiB');
});

it('summarizes available copies and refreshes local and Drive information together', async () => {
    render(<BackupsPanel />);
    expect(await screen.findByText('dmmarket-2026-08-20.sql.gz')).toBeInTheDocument();
    expect(screen.getByLabelText('Resumen de respaldos')).toHaveTextContent('1 / 30');
    expect(fetchDriveStatus).toHaveBeenCalledTimes(1);
    userEvent.click(screen.getByRole('button', { name: 'Actualizar lista' }));
    await act(async () => {});
    expect(fetchBackups).toHaveBeenCalledTimes(2);
    expect(fetchDriveStatus).toHaveBeenCalledTimes(2);
});

it('keeps the last known history visible when a refresh fails and recovers on retry', async () => {
    render(<BackupsPanel />);
    expect(await screen.findByText('dmmarket-2026-08-20.sql.gz')).toBeInTheDocument();
    fetchBackups.mockRejectedValueOnce(new Error('Sin conexión.'));
    userEvent.click(screen.getByRole('button', { name: 'Actualizar lista' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('últimos datos disponibles');
    expect(screen.getByText('dmmarket-2026-08-20.sql.gz')).toBeInTheDocument();
    userEvent.click(screen.getByRole('button', { name: 'Actualizar lista' }));
    await act(async () => {});
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

it.each([
    ['uploaded', true, 'Subido', 'bg-backups-success'],
    ['uploading', true, 'Subiendo', 'bg-backups-info'],
    ['error', true, 'Error', 'bg-backups-warning'],
    [undefined, true, 'Pendiente', 'bg-backups-secondary'],
    ['uploaded', false, 'Desactivado', 'bg-backups-secondary'],
])(
    'shows the correct Drive upload state for %s with recovery confirmed: %s',
    async (uploadStatus, confirmed, label, color) => {
        fetchDriveStatus.mockResolvedValue({
            status: 200,
            data: {
                configured: true,
                connected: true,
                localAccess: true,
                recoveryConfirmed: confirmed,
                uploads: [{ name: STATUS.backups[0].name, status: uploadStatus }],
            },
        });
        render(<BackupsPanel />);
        const table = await screen.findByRole('table');
        expect(within(table).getByText(label)).toHaveClass(color);
    },
);

it('requires confirmation and allows cancellation without starting a backup', async () => {
    render(<BackupsPanel />);
    await screen.findByText('dmmarket-2026-08-20.sql.gz');
    userEvent.click(screen.getByRole('button', { name: 'Crear respaldo ahora' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('MySQL puede bloquear temporalmente las escrituras');
    expect(dialog).toHaveTextContent('límite de 30 respaldos');
    expect(createBackup).not.toHaveBeenCalled();
    userEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    expect(createBackup).not.toHaveBeenCalled();
});

it('starts a confirmed backup, prevents duplicate clicks and does not claim completion', async () => {
    let resolve;
    createBackup.mockImplementationOnce(
        () =>
            new Promise((done) => {
                resolve = done;
            }),
    );
    render(<BackupsPanel />);
    await screen.findByText('dmmarket-2026-08-20.sql.gz');
    userEvent.click(screen.getByRole('button', { name: 'Crear respaldo ahora' }));
    userEvent.click(await screen.findByRole('button', { name: 'Confirmar respaldo' }));
    expect(createBackup).toHaveBeenCalledWith(STATUS.controlToken);
    expect(screen.getByRole('button', { name: 'Iniciando…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeDisabled();
    fetchBackups.mockResolvedValue({ status: 200, data: { ...STATUS, running: true } });
    await act(async () => resolve({ status: 202, data: { ok: true } }));
    expect(await screen.findByText(/Respaldo en curso/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Creando respaldo…' })).toBeDisabled();
    expect(createBackup).toHaveBeenCalledTimes(1);
    expect(screen.getByText('dmmarket-2026-08-20.sql.gz')).toBeInTheDocument();
});

it.each([
    () => Promise.resolve({ status: 409, data: { error: { message: 'Ya hay un respaldo en curso.' } } }),
    () => Promise.reject(new Error('Sin conexión.')),
])('shows a manual request failure without losing the history', async (failure) => {
    createBackup.mockImplementationOnce(failure);
    render(<BackupsPanel />);
    await screen.findByText('dmmarket-2026-08-20.sql.gz');
    userEvent.click(screen.getByRole('button', { name: 'Crear respaldo ahora' }));
    userEvent.click(await screen.findByRole('button', { name: 'Confirmar respaldo' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('dmmarket-2026-08-20.sql.gz')).toBeInTheDocument();
});

it('polls a running backup every three seconds and displays the completed manual copy', async () => {
    jest.useFakeTimers();
    fetchBackups.mockResolvedValue({ status: 200, data: { ...STATUS, running: true } });
    render(<BackupsPanel />);
    await act(async () => {});
    expect(screen.getByRole('button', { name: 'Creando respaldo…' })).toBeDisabled();
    const completed = {
        ...STATUS,
        backups: [
            {
                name: 'dmmarket-2026-08-20-manual-120000000-example.sql.gz',
                completedAt: '2026-08-20T12:00:01Z',
                sizeBytes: 100,
            },
        ],
    };
    fetchBackups.mockResolvedValue({ status: 200, data: completed });
    await act(async () => jest.advanceTimersByTime(3000));
    expect(screen.getByText(completed.backups[0].name)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Crear respaldo ahora' })).toBeEnabled();
    expect(screen.queryByText(/Respaldo en curso/)).not.toBeInTheDocument();
});
