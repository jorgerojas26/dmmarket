let originalFetch;
let generation = 0;
let csrfToken = null;
let unavailable = false;
const pending = new Set();

export function authTransportGeneration() {
    return generation;
}

export function clearAuthTransport() {
    generation += 1;
    csrfToken = null;
    for (const controller of pending) controller.abort();
    pending.clear();
}

export function setAuthUnavailable(value) {
    unavailable = value;
}

export function setCsrfToken(value) {
    csrfToken = value;
}

export function installAuthTransport() {
    if (originalFetch) return;
    originalFetch = window.fetch.bind(window);
    window.fetch = async (resource, init = {}) => {
        const url = new URL(typeof resource === 'string' ? resource : resource.url, window.location.href);
        if (url.origin !== window.location.origin || !url.pathname.startsWith('/api/'))
            return originalFetch(resource, init);
        const version = generation;
        let timedOut = false;
        const failure = (error) => {
            if (!timedOut) return error;
            const result = new Error('El servidor no pudo confirmar el acceso a tiempo.');
            result.name = 'TimeoutError';
            result.status = 503;
            return result;
        };
        const controller = new AbortController();
        const signal = init.signal || (typeof resource !== 'string' ? resource.signal : null);
        const abort = () => controller.abort();
        if (signal?.aborted) controller.abort();
        signal?.addEventListener('abort', abort, { once: true });
        pending.add(controller);
        const cleanup = () => {
            pending.delete(controller);
            signal?.removeEventListener('abort', abort);
            clearTimeout(timeout);
        };
        const timeout = setTimeout(
            () => {
                timedOut = true;
                controller.abort();
                cleanup();
            },
            url.pathname === '/api/auth/session'
                ? 5000
                : url.pathname.startsWith('/api/auth/')
                  ? 10000
                  : url.pathname === '/api/update/download'
                    ? 660000
                    : 60000,
        );
        const headers = new Headers(init.headers || (typeof resource !== 'string' ? resource.headers : undefined));
        const method = (init.method || (typeof resource !== 'string' ? resource.method : 'GET')).toUpperCase();
        if (unavailable && !['GET', 'HEAD', 'OPTIONS'].includes(method) && url.pathname !== '/api/auth/logout') {
            cleanup();
            const error = new Error('La conexión está interrumpida.');
            error.status = 503;
            throw error;
        }
        if (!['GET', 'HEAD', 'OPTIONS'].includes(method) && csrfToken) headers.set('x-csrf-token', csrfToken);
        try {
            const response = await originalFetch(resource, {
                ...init,
                headers,
                credentials: 'same-origin',
                cache: 'no-store',
                signal: controller.signal,
            });
            if (version !== generation) throw new DOMException('La sesión cambió.', 'AbortError');
            const flow =
                /^\/api\/auth\/(session|login|logout|password|mfa(?:\/enrollment(?:\/confirm)?)?|reauthenticate|activity)$/.test(
                    url.pathname,
                );
            if (!flow && (response.status === 401 || (response.status === 403 && method === 'GET')))
                window.dispatchEvent(new CustomEvent('dmmarket:access-lost', { detail: response.status }));
            for (const name of ['json', 'text', 'blob', 'arrayBuffer', 'formData']) {
                const read = response[name].bind(response);
                response[name] = async () => {
                    try {
                        const result = await read();
                        if (version !== generation) throw new DOMException('La sesión cambió.', 'AbortError');
                        return result;
                    } catch (error) {
                        throw failure(error);
                    } finally {
                        cleanup();
                    }
                };
            }
            if (response.status === 204) cleanup();
            return response;
        } catch (error) {
            cleanup();
            throw failure(error);
        }
    };
}

export async function authRequest(path, body, method = 'POST') {
    const response = await fetch(
        `/api/auth/${path}`,
        body === undefined
            ? {}
            : {
                  method,
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(body),
              },
    );
    let result;
    try {
        result = await response.json();
    } catch (error) {
        if (['AbortError', 'TimeoutError'].includes(error.name)) throw error;
        if (response.ok) {
            const invalid = new Error('No se pudo verificar la respuesta del servidor.');
            invalid.code = 'INVALID_RESPONSE';
            throw invalid;
        }
    }
    if (!response.ok) {
        const error = new Error(result?.error?.message || 'No se pudo completar el acceso.');
        error.status = response.status;
        error.code = result?.error?.code;
        error.retryAfter = Number(response.headers.get('Retry-After')) || 0;
        throw error;
    }
    return result;
}
