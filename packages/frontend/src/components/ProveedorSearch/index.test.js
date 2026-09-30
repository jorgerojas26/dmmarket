import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ProveedorSearch from './index';

const providers = [{ IdProveedor: 'P1', Empresa: 'Proveedor de prueba' }];
const originalFetch = global.fetch;

// La medición local del endpoint de reportes tarda ~4 s incluso con limit=20.
// Reproducimos esa latencia sin depender de la base de datos o de la red.
beforeEach(() => {
    jest.useFakeTimers('modern');
    global.fetch = jest.fn((url) => new Promise((resolve) => {
        const report = String(url).includes('/providers/list');
        setTimeout(() => resolve({
            ok: true,
            json: async () => report ? { data: providers } : providers,
        }), report ? 4000 : 0);
    }));
});

afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
    jest.restoreAllMocks();
    global.fetch = originalFetch;
});

const advance = async (ms) => {
    await act(async () => {
        jest.advanceTimersByTime(ms);
        await Promise.resolve();
    });
};

it('shows provider matches within 500 ms without loading the full report', async () => {
    render(<ProveedorSearch onSelect={jest.fn()} />);
    const input = screen.getByRole('combobox');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'prueba' } });
    await advance(500);
    await advance(1);

    expect(screen.getByText('Proveedor de prueba')).toBeInTheDocument();
    expect(screen.queryByText('Cargando...')).not.toBeInTheDocument();
    expect(global.fetch.mock.calls.every(([url]) => !String(url).includes('/providers/list'))).toBe(true);
    expect(global.fetch).toHaveBeenCalledWith('/api/providers/options?search=prueba');
});

it('coalesces rapid typing into one request with the final search term', async () => {
    render(<ProveedorSearch onSelect={jest.fn()} />);
    const input = screen.getByRole('combobox');
    fireEvent.change(input, { target: { value: 'p' } });
    await advance(100);
    fireEvent.change(input, { target: { value: 'pr' } });
    await advance(100);
    fireEvent.change(input, { target: { value: 'prueba' } });
    await advance(249);
    expect(global.fetch).not.toHaveBeenCalled();
    await advance(1);
    await advance(1);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledWith('/api/providers/options?search=prueba');
});

it('does not restart the debounce when the parent rerenders', async () => {
    const onSelect = jest.fn();
    const { rerender } = render(<ProveedorSearch onSelect={onSelect} />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'prueba' } });
    await advance(125);
    rerender(<ProveedorSearch onSelect={onSelect} />);
    await advance(125);
    await advance(1);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Proveedor de prueba')).toBeInTheDocument();
});

it('loads initial options and preserves selecting and clearing providers', async () => {
    const onSelect = jest.fn();
    render(<ProveedorSearch onSelect={onSelect} />);
    await advance(250);
    await advance(1);
    fireEvent.focus(screen.getByRole('combobox'));
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'ArrowDown', code: 'ArrowDown' });
    userEvent.click(screen.getByText('Proveedor de prueba'));
    expect(global.fetch).toHaveBeenCalledWith('/api/providers/options?');
    expect(onSelect).toHaveBeenCalledWith(providers[0], 'select-option');

    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Backspace', code: 'Backspace', keyCode: 8 });
    expect(onSelect).toHaveBeenLastCalledWith(null, 'clear');
});

it('finishes loading when no providers match', async () => {
    global.fetch.mockImplementation(async () => ({ ok: true, json: async () => [] }));
    render(<ProveedorSearch onSelect={jest.fn()} />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'unknown' } });
    await advance(250);
    expect(screen.getByText('Sin resultados')).toBeInTheDocument();
    expect(screen.queryByText('Cargando...')).not.toBeInTheDocument();
});
