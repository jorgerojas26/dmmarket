let reportCurrency = 'USD';

export const setReportCurrency = (currency) => {
    reportCurrency = currency === 'Bs' ? 'Bs' : 'USD';
};

export const getReportCurrency = () => reportCurrency;

export const formatCurrency = (val, locale = 'es-VE', options = {}) =>
    `${reportCurrency === 'Bs' ? 'Bs ' : '$'}${Number(val ?? 0).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2, ...options })}`;

export const formatMoney = (val) => formatCurrency(val);

/**
 * Formats a USD amount in the requested currency for PDFs/prints.
 * `currency` is 'USD' or 'Bs'; when 'Bs', the amount is converted with `rate` (Bs per USD).
 * If 'Bs' is requested but no valid rate is available, falls back to USD.
 */
export const formatUsdMoney = (val, currency = 'USD', rate) => {
    const useBs = currency === 'Bs' && rate != null && !Number.isNaN(Number(rate));
    const amount = useBs ? Number(val) * Number(rate) : Number(val);
    const formatted = amount.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return useBs ? `Bs ${formatted}` : `$${formatted}`;
};

export const formatNumber = (val) => Number(val).toLocaleString('es-VE');

/**
 * Cantidades/pesos (hasta 3 decimales) en formato es-VE: separador de miles con
 * punto y decimal con coma (p.ej. 11.139,3). Valores 0/NaN → ''.
 */
export const formatQuantity = (val) => {
    const num = Number(val);
    if (Number.isNaN(num) || num === 0) return '';
    return num.toLocaleString('es-VE', { maximumFractionDigits: 3 });
};

export const formatPercent = (val) => `${Number(val).toFixed(1)}%`;

export const computeComparison = (current, previous) => {
    if (previous == null || previous <= 0) return null;
    const pct = ((current - previous) / previous) * 100;
    return { pct: Math.abs(pct).toFixed(1), isPositive: pct >= 0 };
};

export const formatReportId = (value) => (['__none__', '__empty__'].includes(value) ? 'Sin ID' : value);
