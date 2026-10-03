import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
    connectDrive,
    disconnectDrive,
    enableDrive,
    exportDriveKey,
    fetchDriveStatus,
    testDriveUpload,
} from 'api/google_drive';
import DrivePanel from './DrivePanel';

jest.mock('api/google_drive', () => ({
    connectDrive: jest.fn(),
    disconnectDrive: jest.fn(),
    enableDrive: jest.fn(),
    exportDriveKey: jest.fn(),
    fetchDriveStatus: jest.fn(),
    testDriveUpload: jest.fn(),
}));

const BASE = {
    configured: true,
    connected: false,
    connecting: false,
    running: false,
    localAccess: true,
    controlToken: 'control',
    recoveryConfirmed: false,
    uploads: [],
    localSetupUrl: 'http://127.0.0.1:8000/configuracion#respaldos',
};
const CONNECTED = { ...BASE, connected: true, email: 'business@example.com', folderName: 'Respaldos DMMarket' };

beforeEach(() => {
    jest.clearAllMocks();
    fetchDriveStatus.mockReset().mockResolvedValue({ status: 200, data: BASE });
    connectDrive.mockResolvedValue({
        status: 200,
        data: { authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth?state=nonce' },
    });
    disconnectDrive.mockResolvedValue({ status: 200, data: { warning: null } });
    testDriveUpload.mockResolvedValue({ status: 202, data: { ok: true } });
    enableDrive.mockResolvedValue({ status: 200, data: { ok: true } });
    jest.spyOn(window, 'open').mockReturnValue(null);
});
afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
});

it('makes Google optional and disables connecting when the release has no OAuth configuration', async () => {
    fetchDriveStatus.mockResolvedValue({ status: 200, data: { ...BASE, configured: false } });
    render(<DrivePanel />);
    expect(await screen.findByText('Cuenta: No conectada')).toBeInTheDocument();
    expect(screen.getByText('Opcional')).toBeInTheDocument();
    expect(screen.getByText(/Los respaldos locales funcionan sin Google Drive y sin Internet/)).toBeInTheDocument();
    expect(screen.getByText('Conectar con Google')).toBeDisabled();
    expect(connectDrive).not.toHaveBeenCalled();
});

it('instructs remote users to configure on the server and prevents all account changes', async () => {
    fetchDriveStatus.mockResolvedValue({ status: 200, data: { ...BASE, localAccess: false, controlToken: undefined } });
    render(<DrivePanel />);
    expect(await screen.findByText('Conectar con Google')).toBeDisabled();
    expect(screen.getByText(BASE.localSetupUrl)).toBeInTheDocument();
});

it('starts consent and offers a safe fallback link when the popup is blocked', async () => {
    fetchDriveStatus
        .mockResolvedValueOnce({ status: 200, data: BASE })
        .mockResolvedValue({ status: 200, data: { ...BASE, connecting: true } });
    render(<DrivePanel />);
    userEvent.click(await screen.findByText('Conectar con Google'));
    expect(await screen.findByText('Autorizar en Google')).toHaveAttribute(
        'href',
        'https://accounts.google.com/o/oauth2/v2/auth?state=nonce',
    );
    expect(connectDrive).toHaveBeenCalledWith('control');
    fetchDriveStatus.mockResolvedValue({ status: 200, data: BASE });
    userEvent.click(screen.getByText('Cancelar conexión'));
    await waitFor(() => expect(disconnectDrive).toHaveBeenCalledWith('control'));
});

it('requires downloading and confirming the recovery key before enabling automatic uploads', async () => {
    fetchDriveStatus.mockResolvedValue({ status: 200, data: CONNECTED });
    exportDriveKey.mockResolvedValue({ status: 200, data: new Blob(['recovery key']) });
    const create = URL.createObjectURL;
    const revoke = URL.revokeObjectURL;
    URL.createObjectURL = jest.fn(() => 'blob:recovery');
    URL.revokeObjectURL = jest.fn();
    jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    try {
        render(<DrivePanel />);
        expect(await screen.findByText('Habilitar cargas automáticas')).toBeDisabled();
        expect(screen.getByLabelText('Guardé la clave de recuperación fuera del servidor')).toBeDisabled();
        expect(screen.queryByText('Probar subida')).not.toBeInTheDocument();
        userEvent.click(screen.getByText('Descargar clave de recuperación'));
        await waitFor(() =>
            expect(screen.getByLabelText('Guardé la clave de recuperación fuera del servidor')).not.toBeDisabled(),
        );
        userEvent.click(screen.getByLabelText('Guardé la clave de recuperación fuera del servidor'));
        userEvent.click(screen.getByText('Habilitar cargas automáticas'));
        await waitFor(() => expect(enableDrive).toHaveBeenCalledWith('control'));
        expect(exportDriveKey).toHaveBeenCalledWith('control');
        expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:recovery');
    } finally {
        URL.createObjectURL = create;
        URL.revokeObjectURL = revoke;
    }
});

it('supports testing and disconnecting without disabling local backups', async () => {
    fetchDriveStatus.mockResolvedValue({ status: 200, data: { ...CONNECTED, recoveryConfirmed: true } });
    render(<DrivePanel />);
    expect(await screen.findByText('Cuenta: business@example.com')).toBeInTheDocument();
    userEvent.click(screen.getByText('Probar subida'));
    expect(await screen.findByText('Prueba de subida iniciada con el respaldo más reciente.')).toBeInTheDocument();
    userEvent.click(screen.getByText('Desconectar'));
    expect(
        await screen.findByText('Google Drive está desconectado. Los respaldos locales siguen funcionando.'),
    ).toBeInTheDocument();
});

it('shows consent and operation errors without losing the local-independent controls', async () => {
    connectDrive.mockResolvedValue({ status: 400, data: { error: { message: 'Google rechazó el permiso.' } } });
    render(<DrivePanel />);
    userEvent.click(await screen.findByText('Conectar con Google'));
    expect(await screen.findByText('Google rechazó el permiso.')).toBeInTheDocument();
    expect(screen.getByText('Conectar con Google')).not.toBeDisabled();
});

it('polls active consent and stops polling on unmount', async () => {
    jest.useFakeTimers();
    fetchDriveStatus.mockResolvedValue({ status: 200, data: { ...BASE, connecting: true } });
    const view = render(<DrivePanel />);
    await act(async () => {});
    const previous = fetchDriveStatus.mock.calls.length;
    await act(async () => jest.advanceTimersByTime(3000));
    expect(fetchDriveStatus.mock.calls.length).toBe(previous + 1);
    view.unmount();
    await act(async () => jest.advanceTimersByTime(60000));
    expect(fetchDriveStatus.mock.calls.length).toBe(previous + 1);
});

it('shows loading and a read failure without suggesting that Drive is ready', async () => {
    fetchDriveStatus.mockRejectedValueOnce(new Error('No se pudo consultar Google Drive.'));
    render(<DrivePanel />);
    expect(screen.getByRole('status')).toHaveTextContent('Cargando conexión');
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo consultar Google Drive.');
    expect(screen.queryByText('Activa')).not.toBeInTheDocument();
});

it('refreshes when the parent requests it and blocks operations on stale connection data', async () => {
    const view = render(<DrivePanel refreshKey={0} />);
    expect(await screen.findByText('Conectar con Google')).not.toBeDisabled();
    fetchDriveStatus.mockRejectedValueOnce(new Error('Sin conexión al servidor.'));
    view.rerender(<DrivePanel refreshKey={1} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Sin conexión al servidor.');
    expect(screen.getByText('Conectar con Google')).toBeDisabled();
    view.rerender(<DrivePanel refreshKey={2} />);
    await waitFor(() => expect(screen.getByText('Conectar con Google')).not.toBeDisabled());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});
