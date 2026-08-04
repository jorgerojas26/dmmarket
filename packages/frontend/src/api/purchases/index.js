const BASE_URL = '/api/purchases';

export const fetchPurchasesDashboard = async ({ from, to, compareFrom, compareTo }) => {
    let url = `${BASE_URL}/dashboard?from=${from}&to=${to}`;
    if (compareFrom && compareTo) {
        url += `&compareFrom=${compareFrom}&compareTo=${compareTo}`;
    }
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Purchases dashboard API error: ${response.status}`);
    return response.json();
};

export const fetchPurchasesPareto = async ({ from, to }) => {
    const url = `${BASE_URL}/pareto?from=${from}&to=${to}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Purchases pareto API error: ${response.status}`);
    return response.json();
};
