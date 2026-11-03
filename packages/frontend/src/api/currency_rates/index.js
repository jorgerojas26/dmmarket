const BASE_URL = '/api/currency_rates';

export const fetchCurrencyRates = async () => {
    const response = await fetch(`${BASE_URL}`);
    const data = await response.json();

    return { status: response.status, data };
};

export const fetchBcvRates = async () => {
    const response = await fetch(`${BASE_URL}/bcv`);
    if (!response.ok) throw new Error('Error al cargar el historial de tasas del BCV');
    return response.json();
};

export const fetchBcvRateByDate = async (fecha) => {
    const response = await fetch(`${BASE_URL}/bcv/${fecha}`);
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new Error(data?.error?.message || 'No se pudo consultar la tasa de esa fecha');
    return data;
};

export const fetchBcvStatus = async () => {
    const response = await fetch(`${BASE_URL}/bcv/status`);
    if (!response.ok) throw new Error('Error al consultar el estado de las tasas del BCV');
    return response.json();
};

export const syncBcvRates = async () => {
    const response = await fetch(`${BASE_URL}/bcv/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmed: true }),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok)
        throw Object.assign(new Error(data?.error?.message || 'No se pudo consultar el BCV'), {
            status: response.status,
            code: data?.error?.code,
        });
    return data;
};
