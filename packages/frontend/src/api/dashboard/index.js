const BASE_URL = '/api/dashboard';

export const fetchDashboardSales = async ({ from, to, showNoe, compareFrom, compareTo }) => {
    let url = `${BASE_URL}/sales?from=${from}&to=${to}&showNoe=${showNoe}`;
    if (compareFrom && compareTo) {
        url += `&compareFrom=${compareFrom}&compareTo=${compareTo}`;
    }
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Dashboard API error: ${response.status}`);
    return response.json();
};

export const fetchDashboardPareto = async ({ from, to, showNoe, modo = 'ventas', sortBy, sortDir }) => {
    const params = new URLSearchParams({ from, to, showNoe, modo });
    if (sortBy && sortDir) {
        params.set('sortBy', sortBy);
        params.set('sortDir', sortDir);
    }
    const response = await fetch(`${BASE_URL}/pareto?${params.toString()}`);
    if (!response.ok) throw new Error(`Pareto API error: ${response.status}`);
    return response.json();
};
