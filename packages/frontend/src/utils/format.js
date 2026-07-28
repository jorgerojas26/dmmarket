export const formatCurrency = (val) =>
    `$${Number(val).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const formatNumber = (val) => Number(val).toLocaleString('es-VE');

export const formatPercent = (val) => `${Number(val).toFixed(1)}%`;

export const computeComparison = (current, previous) => {
    if (previous == null || previous <= 0) return null;
    const pct = ((current - previous) / previous) * 100;
    return { pct: Math.abs(pct).toFixed(1), isPositive: pct >= 0 };
};
