const BASE_URL = '/api/invoices';

export const fetchInvoiceReport = async ({
    from,
    to,
    showNoe,
    page = 1,
    limit = 20,
    sortBy = 'rawProfit',
    sortDir = 'desc',
}) => {
    const params = new URLSearchParams({
        from,
        to,
        showNoe,
        page,
        limit,
        sortBy,
        sortDir,
    });
    const response = await fetch(`${BASE_URL}/sales?${params}`);
    const report = await response.json();
    return report;
};

export const fetchInvoiceList = async ({ from, to, showNoe }) => {
    const response = await fetch(`${BASE_URL}?from=${from}&to=${to}&showNoe=${showNoe}`);
    const invoices = await response.json();
    return invoices;
};

export const fetchInvoiceDetail = async (invoiceId, showNoe) => {
    const response = await fetch(
        `${BASE_URL}/${invoiceId}/detail?showNoe=${showNoe}`,
    );
    return response.json();
};
