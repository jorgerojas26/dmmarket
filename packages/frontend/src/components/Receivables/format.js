import { DateTime } from 'luxon';

export const money = (value, currency = 'USD', precision = 2) => {
    const [integer, decimals = ''] = String(value || '0').split('.');
    const units =
        BigInt(`${integer.replace('-', '')}${decimals.padEnd(precision, '0').slice(0, precision)}`) +
        BigInt(Number(decimals[precision] || 0) >= 5 ? 1 : 0);
    const rounded = units.toString().padStart(precision + 1, '0');
    const whole = rounded.slice(0, -precision).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    const sign = integer.startsWith('-') && units !== BigInt(0) ? '-' : '';
    const symbol = currency === 'USD' ? '$' : currency === 'BsS' ? 'Bs ' : `${currency} `;
    return `${symbol}${sign}${whole},${rounded.slice(-precision)}`;
};
const rateFormatter = new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const rateLabel = (value) =>
    Number(value) > 0 && Number.isFinite(Number(value)) ? rateFormatter.format(Number(value)) : '—';

export const shortDate = (value) => (value ? DateTime.fromISO(String(value).slice(0, 10)).toFormat('dd/MM') : '—');

export const dateLabel = (value) =>
    value ? DateTime.fromISO(String(value).slice(0, 10)).toFormat('dd MMM yyyy', { locale: 'es' }) : '—';
export const today = () => DateTime.now().setZone('America/Caracas').toISODate();

export function requestId() {
    const crypto = window.crypto;
    if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 15) | 64;
    bytes[8] = (bytes[8] & 63) | 128;
    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
