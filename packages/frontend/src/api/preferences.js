import { fetcher } from 'swr-config';

function validated(value) {
    if (
        !value ||
        !['invoices', 'delivery-notes'].includes(value.documentType) ||
        !Number.isSafeInteger(value.revision) ||
        value.revision < 1
    ) {
        throw new Error('No se pudieron verificar las preferencias del sistema.');
    }
    return value;
}

export async function fetchPreferences(url = '/api/preferences') {
    return validated(await fetcher(url));
}

export async function updatePreferences(preferences) {
    return validated(
        await fetcher('/api/preferences', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(preferences),
        }),
    );
}
