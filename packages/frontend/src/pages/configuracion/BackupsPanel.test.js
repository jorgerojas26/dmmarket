import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { fetchBackups } from 'api/backups';
import BackupsPanel, { formatSize } from './BackupsPanel';

jest.mock('api/backups', () => ({ fetchBackups: jest.fn() }));
jest.mock('./DrivePanel', () => () => <div>Google Drive opcional</div>);

const STATUS = {
    directory: '/var/lib/dmmarket/backups',
    retention: 30,
    nextRunAt: '2026-08-21T02:00:00Z',
    running: false,
    lastError: null,
    backups: [{ name: 'dmmarket-2026-08-20.sql.gz', completedAt: '2026-08-20T02:01:00Z', sizeBytes: 1572864 }],
};

beforeEach(() => {
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
    expect(screen.getByRole('status')).toHaveTextContent('Cargando respaldos');
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
