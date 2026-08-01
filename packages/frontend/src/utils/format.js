export const formatCurrency = (val) =>
    `$${Number(val).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * Formats a USD amount in the requested currency for PDFs/prints.
 * `currency` is 'USD' or 'Bs'; when 'Bs', the amount is converted with `rate` (Bs per USD).
 * If 'Bs' is requested but no valid rate is available, falls back to USD.
 */
export const formatMoney = (val, currency = 'USD', rate) => {
    const useBs = currency === 'Bs' && rate != null && !Number.isNaN(Number(rate));
    const amount = useBs ? Number(val) * Number(rate) : Number(val);
    const formatted = amount.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return useBs ? `Bs ${formatted}` : `$${formatted}`;
};

export const formatNumber = (val) => Number(val).toLocaleString('es-VE');

export const formatPercent = (val) => `${Number(val).toFixed(1)}%`;

export const computeComparison = (current, previous) => {
    if (previous == null || previous <= 0) return null;
    const pct = ((current - previous) / previous) * 100;
    return { pct: Math.abs(pct).toFixed(1), isPositive: pct >= 0 };
};
