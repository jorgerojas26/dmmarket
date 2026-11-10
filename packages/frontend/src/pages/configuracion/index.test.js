import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { UpdateProvider } from 'context/update';
import { createMemoryHistory } from 'history';
import { Router } from 'react-router-dom';
import ConfiguracionPage from './index';

// react-markdown y sus dependencias son ESM-only; no se transforman en Jest
// (CRA4). Se mockea con un contenedor simple: estos tests verifican que las
// notas se muestren, no el renderizado del markdown en sí.
jest.mock('react-markdown', () => {
    const Markdown = ({ children }) => <div className="configuracion-about__notes-markdown">{children}</div>;
    return Markdown;
});

const renderPage = (history = createMemoryHistory({ initialEntries: ['/configuracion'] })) => ({
    ...render(
        <Router history={history}>
            <UpdateProvider>
                <ConfiguracionPage />
            </UpdateProvider>
        </Router>,
    ),
    history,
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
    renderPage();
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
    renderPage();
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
    renderPage();
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
    renderPage();
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
    renderPage();
    userEvent.click(await screen.findByText('Buscar actualizaciones'));
    userEvent.click(await screen.findByText('Descargar actualización'));
    expect(await screen.findByText('La verificación sha256 falló')).toBeInTheDocument();
    expect(screen.getByText('Descargar actualización')).toBeInTheDocument(); // reintentar
});

it('abre la sección de respaldos desde el sidebar de configuración', async () => {
    mockRoutes(
        baseRoutes({
            '/api/backups': jsonResponse({
                directory: '/var/lib/dmmarket/backups',
                retention: 30,
                nextRunAt: '2026-08-21T02:00:00Z',
                running: false,
                lastError: null,
                backups: [],
            }),
        }),
    );
    renderPage();
    userEvent.click(screen.getByText('Respaldos', { selector: 'span.nav-label' }));
    expect(await screen.findByText('No hay respaldos exitosos todavía.')).toBeInTheDocument();
    expect(screen.getByText('/var/lib/dmmarket/backups')).toBeInTheDocument();
    expect(screen.queryByText('Versión instalada')).not.toBeInTheDocument();
});

it('muestra la conexión y el estado de Google Drive sin confundirlos con el respaldo local', async () => {
    mockRoutes(
        baseRoutes({
            '/api/backups/drive': jsonResponse({
                configured: false,
                connected: true,
                localAccess: false,
                recoveryConfirmed: true,
                email: 'business@example.com',
                folderName: 'Respaldos DMMarket',
                uploads: [
                    { name: 'dmmarket-2026-08-20.sql.gz', status: 'uploaded', uploadedAt: '2026-08-20T02:02:00Z' },
                ],
            }),
            '/api/backups': jsonResponse({
                directory: '/var/lib/dmmarket/backups',
                retention: 30,
                nextRunAt: '2026-08-21T02:00:00Z',
                running: false,
                lastError: null,
                backups: [{ name: 'dmmarket-2026-08-20.sql.gz', sizeBytes: 1024, completedAt: '2026-08-20T02:01:00Z' }],
            }),
        }),
    );
    renderPage();
    userEvent.click(screen.getByText('Respaldos', { selector: 'span.nav-label' }));
    expect(await screen.findByText('Exitoso')).toBeInTheDocument();
    expect(await screen.findByText('Subido')).toBeInTheDocument();
    expect(screen.getByText('Desconectar')).toBeDisabled();
});

it('puts Acerca de first and records the default section in the URL', async () => {
    mockRoutes(baseRoutes());
    const { container, history } = renderPage();
    expect(container.querySelector('.nav-label')).toHaveTextContent('Acerca de');
    expect(history.location.hash).toBe('#acercade');
    expect(await screen.findByText('v1.0.0')).toBeInTheDocument();
});

it.each(['#acercade', '#respaldos'])('restores %s after remounting and preserves query parameters', async (hash) => {
    mockRoutes(
        baseRoutes({ '/api/backups': jsonResponse({ backups: [], retention: 30, nextRunAt: '2026-08-21T02:00:00Z' }) }),
    );
    const history = createMemoryHistory({ initialEntries: [`/configuracion?source=test${hash}`] });
    const view = renderPage(history);
    expect(history.location.hash).toBe(hash);
    view.unmount();
    renderPage(history);
    expect(history.location.search).toBe('?source=test');
    if (hash === '#respaldos') {
        expect(await screen.findByText('No hay respaldos exitosos todavía.')).toBeInTheDocument();
    } else {
        expect(await screen.findByText('Versión instalada')).toBeInTheDocument();
    }
});

it('updates the URL when selecting a section and supports back and forward', async () => {
    mockRoutes(
        baseRoutes({ '/api/backups': jsonResponse({ backups: [], retention: 30, nextRunAt: '2026-08-21T02:00:00Z' }) }),
    );
    const { history } = renderPage();
    userEvent.click(screen.getByText('Respaldos', { selector: 'span.nav-label' }));
    expect(history.location.hash).toBe('#respaldos');
    expect(await screen.findByText('No hay respaldos exitosos todavía.')).toBeInTheDocument();
    act(() => history.goBack());
    expect(history.location.hash).toBe('#acercade');
    expect(screen.getByText('Versión instalada')).toBeInTheDocument();
    act(() => history.goForward());
    expect(history.location.hash).toBe('#respaldos');
    userEvent.click(screen.getByText('Acerca de', { selector: 'span.nav-label' }));
    expect(history.location.hash).toBe('#acercade');
});

it('gestiona bancos y métodos desde Cobranza sin perder la sección al navegar', async () => {
    let banks = [{ id: 'BV', name: 'Banco inicial', active: true }];
    let methods = [{ id: 'EFECTIVO', name: 'Efectivo', active: true }];
    fetchMock.mockImplementation(async (url, options = {}) => {
        if (String(url).includes('/catalogs/banks')) {
            if (options.method === 'POST') banks = [...banks, { ...JSON.parse(options.body), active: true }];
            if (options.method === 'PUT') {
                const id = decodeURIComponent(String(url).split('/').pop());
                banks = banks.map((bank) => (bank.id === id ? { ...bank, ...JSON.parse(options.body) } : bank));
            }
            return jsonResponse(options.method ? { saved: true } : banks);
        }
        if (String(url).includes('/catalogs/methods')) {
            if (options.method === 'POST') methods = [...methods, { ...JSON.parse(options.body), active: true }];
            return jsonResponse(options.method ? { saved: true } : methods);
        }
        if (String(url).includes('/api/receivables/banks')) return jsonResponse(banks.filter((bank) => bank.active));
        if (String(url).includes('/api/receivables/methods')) return jsonResponse(methods);
        if (String(url).includes('/history')) return jsonResponse(HISTORY);
        if (String(url).includes('/status')) return jsonResponse(STATUS);
        return jsonResponse({}, 404);
    });
    const { history } = renderPage();
    userEvent.click(screen.getByText('Cobranza', { selector: 'span.nav-label' }));
    expect(history.location.hash).toBe('#cobranza');
    expect(await screen.findByText('Banco inicial')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Cobranza' })).toHaveClass('report-settings');
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
    expect(await screen.findByText('Efectivo')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Bancos' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Métodos de pago' })).toBeInTheDocument();
    const bankTable = screen.getByRole('table', { name: 'Bancos configurados' });
    const methodTable = screen.getByRole('table', { name: 'Métodos configurados' });
    for (const table of [bankTable, methodTable]) {
        expect(
            within(table)
                .getAllByRole('columnheader')
                .map((cell) => cell.textContent),
        ).toEqual(['Orden', 'Código', 'Nombre', 'Estado', 'Acciones']);
        for (const button of within(table).getAllByRole('button')) {
            expect(button.textContent).toBe('');
            expect(button.querySelector('svg')).not.toBeNull();
            expect(button).toHaveAttribute('title', button.getAttribute('aria-label'));
        }
    }
    expect(within(bankTable).getAllByRole('row')[1].children).toHaveLength(5);
    expect([...within(bankTable).getAllByRole('row')[1].children].map((cell) => cell.textContent)).toEqual([
        '',
        'BV',
        'Banco inicial',
        'Activo',
        '',
    ]);
    expect(within(methodTable).getByRole('cell', { name: 'EFECTIVO' })).toBeInTheDocument();
    expect(within(bankTable).getByText('Activo')).toHaveClass('collection-settings__state--active');
    expect(within(methodTable).getByText('Activo')).toHaveClass('collection-settings__state--active');
    expect(screen.queryByText(/El catálogo de bancos se comparte/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Los métodos inactivos dejan de estar disponibles/)).not.toBeInTheDocument();
    userEvent.click(screen.getByRole('button', { name: 'Nuevo banco' }));
    expect(await screen.findByRole('dialog', { name: 'Nuevo banco' })).toBeInTheDocument();
    userEvent.type(screen.getByLabelText('Código'), 'TEST');
    userEvent.type(screen.getByLabelText('Nombre'), 'Banco nuevo');
    userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(await screen.findByText('Banco nuevo')).toBeInTheDocument();
    userEvent.click(screen.getByRole('button', { name: 'Editar Banco nuevo' }));
    expect(await screen.findByRole('dialog', { name: 'Editar banco' })).toBeInTheDocument();
    expect(screen.getByLabelText('Código')).toBeDisabled();
    userEvent.clear(screen.getByLabelText('Nombre'));
    userEvent.type(screen.getByLabelText('Nombre'), 'Banco editado');
    userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(await screen.findByText('Banco editado')).toBeInTheDocument();
    userEvent.click(screen.getByRole('button', { name: 'Desactivar Banco editado' }));
    let confirmation = await screen.findByRole('dialog', { name: 'Desactivar Banco editado' });
    expect(within(confirmation).getByText(/Los abonos anteriores se conservan/)).toBeInTheDocument();
    expect(banks.find((bank) => bank.id === 'TEST').active).toBe(true);
    userEvent.click(within(confirmation).getByRole('button', { name: 'Cancelar' }));
    expect(banks.find((bank) => bank.id === 'TEST').active).toBe(true);
    userEvent.click(screen.getByRole('button', { name: 'Desactivar Banco editado' }));
    confirmation = await screen.findByRole('dialog', { name: 'Desactivar Banco editado' });
    userEvent.click(within(confirmation).getByRole('button', { name: 'Confirmar desactivación' }));
    expect(await screen.findByRole('button', { name: 'Reactivar Banco editado' })).toBeInTheDocument();
    expect(screen.getByText('Inactivo')).toHaveClass('collection-settings__state--inactive');
    userEvent.click(screen.getByRole('button', { name: 'Reactivar Banco editado' }));
    expect(await screen.findByRole('button', { name: 'Desactivar Banco editado' })).toBeInTheDocument();
    userEvent.click(screen.getByRole('button', { name: 'Editar Banco editado' }));
    const bankEditor = await screen.findByRole('dialog', { name: 'Editar banco' });
    const bankForm = within(bankEditor).getByRole('form', { name: 'Editar registro' });
    userEvent.clear(within(bankForm).getByLabelText('Nombre'));
    userEvent.type(within(bankForm).getByLabelText('Nombre'), 'Borrador de banco');
    userEvent.click(within(bankEditor).getByRole('button', { name: 'Cancelar' }));
    expect(banks.find((bank) => bank.id === 'TEST').name).toBe('Banco editado');
    userEvent.click(screen.getByRole('button', { name: 'Nuevo método' }));
    const methodDialog = await screen.findByRole('dialog', { name: 'Nuevo método' });
    const methodForm = within(methodDialog).getByRole('form', { name: 'Nuevo método' });
    userEvent.type(within(methodForm).getByLabelText('Código'), 'ZELLE');
    userEvent.type(within(methodForm).getByLabelText('Nombre'), 'Zelle');
    userEvent.click(within(methodForm).getByRole('button', { name: 'Guardar' }));
    expect(await screen.findByText('Zelle')).toBeInTheDocument();
    userEvent.click(screen.getByRole('button', { name: 'Editar Zelle' }));
    const methodEditor = await screen.findByRole('dialog', { name: 'Editar método' });
    expect(within(methodEditor).getByLabelText('Código')).toBeDisabled();
    expect(within(methodEditor).getByLabelText('Nombre')).toHaveValue('Zelle');
    userEvent.clear(within(methodEditor).getByLabelText('Nombre'));
    userEvent.type(within(methodEditor).getByLabelText('Nombre'), 'Borrador de método');
    userEvent.click(within(methodEditor).getByRole('button', { name: 'Cancelar' }));
    expect(methods.find((method) => method.id === 'ZELLE').name).toBe('Zelle');
    userEvent.click(screen.getByRole('button', { name: 'Desactivar Zelle' }));
    const methodConfirmation = await screen.findByRole('dialog', { name: 'Desactivar Zelle' });
    expect(within(methodConfirmation).getByRole('button', { name: 'Confirmar desactivación' })).toBeInTheDocument();
    expect(methods.find((method) => method.id === 'ZELLE').active).toBe(true);
    userEvent.click(within(methodConfirmation).getByRole('button', { name: 'Cancelar' }));
});

it('muestra errores de carga de Cobranza y permite reintentar', async () => {
    mockRoutes(
        baseRoutes({
            '/catalogs/banks': jsonResponse({ error: { message: 'Catálogo no disponible' } }, 503),
            '/catalogs/methods': jsonResponse([{ id: 'EFECTIVO', name: 'Efectivo', active: true }]),
        }),
    );
    renderPage(createMemoryHistory({ initialEntries: ['/configuracion#cobranza'] }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Catálogo no disponible');
    expect(await screen.findByText('Efectivo')).toBeInTheDocument();
    mockRoutes(baseRoutes({ '/catalogs/banks': jsonResponse([]), '/catalogs/methods': jsonResponse([]) }));
    userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('No hay bancos configurados.')).toBeInTheDocument();
});

it.each([
    ['banks', 'Bancos', 'Bancos configurados', 'Editar banco'],
    ['methods', 'Métodos de pago', 'Métodos configurados', 'Editar método'],
])(
    'mantiene la tabla de %s al guardar y muestra el aviso dentro del encabezado',
    async (type, sectionName, tableName, dialogName) => {
        const rows = [{ id: 'TEST', name: 'Registro de prueba', active: true }];
        let reads = 0;
        let finishReload;
        fetchMock.mockImplementation(async (url, options = {}) => {
            if (String(url).includes(`/catalogs/${type}`)) {
                if (options.method === 'PUT') return jsonResponse({ saved: true });
                if (reads++ === 0) return jsonResponse(rows);
                return new Promise((resolve) => {
                    finishReload = () => resolve(jsonResponse(rows));
                });
            }
            if (String(url).includes('/catalogs/')) return jsonResponse([]);
            if (String(url).includes('/history')) return jsonResponse(HISTORY);
            if (String(url).includes('/status')) return jsonResponse(STATUS);
            return jsonResponse([]);
        });
        renderPage(createMemoryHistory({ initialEntries: ['/configuracion#cobranza'] }));
        const table = await screen.findByRole('table', { name: tableName });
        const section = screen.getByRole('region', { name: sectionName });
        userEvent.click(within(table).getByRole('button', { name: 'Editar Registro de prueba' }));
        const dialog = await screen.findByRole('dialog', { name: dialogName });
        userEvent.click(within(dialog).getByRole('button', { name: 'Guardar' }));
        const notice = await within(section).findByText('Cambios guardados.');
        expect(table).toBeInTheDocument();
        expect(notice.parentElement).toHaveClass('collection-settings__toolbar');
        await act(async () => {
            finishReload();
        });
        expect(within(section).getByRole('table', { name: tableName })).toBe(table);
    },
);

it.each([
    ['banks', 'Bancos configurados', false],
    ['methods', 'Métodos configurados', false],
    ['banks', 'Bancos configurados', true],
])('reordena %s con el tirador y conserva el orden si falla el guardado (%s, %s)', async (type, tableName, fails) => {
    let rows = [
        { id: 'A', name: 'Primero', active: true },
        { id: 'B', name: 'Segundo', active: true },
        { id: 'C', name: 'Tercero', active: false },
    ];
    const rect = HTMLElement.prototype.getBoundingClientRect;
    jest.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function () {
        if (this.tagName === 'TBODY') {
            const height = this.children.length * 40;
            return {
                x: 0,
                y: 100,
                top: 100,
                left: 0,
                right: 700,
                bottom: 100 + height,
                width: 700,
                height,
                toJSON: () => ({}),
            };
        }
        const row = this.closest('tbody tr');
        if (!row) return rect.call(this);
        const top = 100 + row.sectionRowIndex * 40;
        return { x: 0, y: top, top, left: 0, right: 700, bottom: top + 40, width: 700, height: 40, toJSON: () => ({}) };
    });
    fetchMock.mockImplementation(async (url, options = {}) => {
        if (String(url).includes(`/catalogs/${type}/reorder`)) {
            if (fails) return jsonResponse({ error: { message: 'No se pudo guardar el orden.' } }, 500);
            const { ids } = JSON.parse(options.body);
            rows = ids.map((id) => rows.find((row) => row.id === id));
            return jsonResponse(rows);
        }
        if (String(url).includes(`/catalogs/${type}`)) return jsonResponse(rows);
        if (String(url).includes('/catalogs/')) return jsonResponse([]);
        if (String(url).includes('/history')) return jsonResponse(HISTORY);
        if (String(url).includes('/status')) return jsonResponse(STATUS);
        return jsonResponse([]);
    });
    const view = renderPage(createMemoryHistory({ initialEntries: ['/configuracion#cobranza'] }));
    const table = await screen.findByRole('table', { name: tableName });
    const handle = within(table).getByRole('button', { name: 'Mover Primero' });
    act(() => handle.focus());
    fireEvent.keyDown(handle, { key: ' ', code: 'Space', keyCode: 32 });
    await waitFor(() => expect(handle).toHaveAttribute('aria-pressed', 'true'));
    fireEvent.keyDown(document, { key: 'ArrowDown', code: 'ArrowDown', keyCode: 40 });
    await waitFor(() => expect(handle.closest('tr').style.transform).toContain('40px'));
    fireEvent.keyDown(document, { key: ' ', code: 'Space', keyCode: 32 });
    await waitFor(() =>
        expect(fetchMock).toHaveBeenCalledWith(
            `/api/receivables/catalogs/${type}/reorder`,
            expect.objectContaining({ method: 'POST', body: JSON.stringify({ ids: ['B', 'A', 'C'] }) }),
        ),
    );
    if (fails) expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo guardar el orden.');
    else expect(await screen.findByText('Orden guardado.')).toBeInTheDocument();
    const order = () =>
        within(screen.getByRole('table', { name: tableName }))
            .getAllByRole('row')
            .slice(1)
            .map((row) => row.children[1].textContent);
    expect(order()).toEqual(fails ? ['A', 'B', 'C'] : ['B', 'A', 'C']);
    view.unmount();
    renderPage(createMemoryHistory({ initialEntries: ['/configuracion#cobranza'] }));
    await screen.findByRole('table', { name: tableName });
    expect(order()).toEqual(fails ? ['A', 'B', 'C'] : ['B', 'A', 'C']);
});

it.each([
    ['banks', 'Bancos configurados'],
    ['methods', 'Métodos configurados'],
])('limita el arrastre de %s al eje vertical y al cuerpo de su tabla', async (type, tableName) => {
    const rows = [
        { id: 'A', name: 'Primero', active: true },
        { id: 'B', name: 'Segundo', active: true },
        { id: 'C', name: 'Tercero', active: true },
    ];
    const rect = HTMLElement.prototype.getBoundingClientRect;
    jest.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function () {
        if (this.tagName === 'TBODY') {
            return {
                x: 0,
                y: 100,
                top: 100,
                left: 0,
                right: 700,
                bottom: 220,
                width: 700,
                height: 120,
                toJSON: () => ({}),
            };
        }
        const row = this.closest('tbody tr');
        if (!row) return rect.call(this);
        const top = 100 + row.sectionRowIndex * 40;
        return { x: 0, y: top, top, left: 0, right: 700, bottom: top + 40, width: 700, height: 40, toJSON: () => ({}) };
    });
    fetchMock.mockImplementation(async (url) => {
        if (String(url).includes(`/catalogs/${type}`)) return jsonResponse(rows);
        if (String(url).includes('/catalogs/')) return jsonResponse([]);
        if (String(url).includes('/history')) return jsonResponse(HISTORY);
        if (String(url).includes('/status')) return jsonResponse(STATUS);
        return jsonResponse([]);
    });
    const pointer = (target, name, x, y) => {
        const event = new MouseEvent(name, { bubbles: true, button: 0, buttons: 1, clientX: x, clientY: y });
        Object.defineProperty(event, 'isPrimary', { value: true });
        fireEvent(target, event);
    };
    renderPage(createMemoryHistory({ initialEntries: ['/configuracion#cobranza'] }));
    const table = await screen.findByRole('table', { name: tableName });
    const handle = within(table).getByRole('button', { name: 'Mover Primero' });
    pointer(handle, 'pointerdown', 10, 120);
    pointer(document, 'pointermove', 20, 130);
    await waitFor(() => expect(handle).toHaveAttribute('aria-pressed', 'true'));
    pointer(document, 'pointermove', 600, 2000);
    await waitFor(() => expect(handle.closest('tr').style.transform).toBe('translate3d(0px, 80px, 0)'));
    pointer(document, 'pointermove', -600, -2000);
    await waitFor(() => expect(handle.closest('tr').style.transform).toBe('translate3d(0px, 0px, 0)'));
    fireEvent.keyDown(document, { key: 'Escape', code: 'Escape', keyCode: 27 });
    await waitFor(() => expect(handle).not.toHaveAttribute('aria-pressed', 'true'));
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith('/reorder'))).toBe(false);
});
