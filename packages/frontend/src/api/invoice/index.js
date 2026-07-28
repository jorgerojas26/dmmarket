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

export const fetchInvoiceList = async ({
  from,
  to,
  showNoe,
  page = 1,
  limit = 20,
  sortBy = "createdAt",
  sortDir = "desc",
  search,
}) => {
  const params = new URLSearchParams();
  params.append("from", from);
  params.append("to", to);
  params.append("showNoe", String(showNoe));
  params.append("page", String(page));
  params.append("limit", String(limit));
  params.append("sortBy", sortBy);
  params.append("sortDir", sortDir);
  if (search) params.append("search", search);

  const response = await fetch(`${BASE_URL}?${params.toString()}`);
  const invoices = await response.json();
  return invoices;
};

export const fetchInvoiceDetail = async (invoiceId, showNoe) => {
    const response = await fetch(
        `${BASE_URL}/${invoiceId}/detail?showNoe=${showNoe}`,
    );
    return response.json();
};
