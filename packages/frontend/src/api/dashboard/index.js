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
