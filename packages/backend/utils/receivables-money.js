const Decimal = require("decimal.js");

const Money = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

function fail(message, status = 400) {
  throw Object.assign(new Error(message), { status });
}

function decimal(value, scale = 4, positive = false) {
  if (!["string", "number"].includes(typeof value)) fail("Ingresa un importe numérico válido.");
  const text = String(value);
  if (!new RegExp(`^\\d{1,${18 - scale}}(?:\\.\\d{1,${scale}})?$`).test(text)) {
    fail(`Ingresa un importe válido con hasta ${scale} decimales.`);
  }
  const amount = new Money(text);
  if (positive && amount.lte(0)) fail("El importe debe ser mayor que cero.");
  return amount;
}

const fixed = (value) => new Money(value).toFixed(4);
const total = (values) => values.reduce((sum, value) => sum.plus(value), new Money(0));

function allocate(documents, amount) {
  let remaining = new Money(amount);
  const applications = [];
  for (const document of documents) {
    if (remaining.lte(0)) break;
    const balance = decimal(document.SaldoActual);
    if (balance.lte(0)) continue;
    const applied = Money.min(balance, remaining);
    applications.push({ id: document.IdDocumento, sale: document.IdFactura, amount: fixed(applied) });
    remaining = remaining.minus(applied);
  }
  return { applications, applied: fixed(new Money(amount).minus(remaining)), excess: fixed(remaining) };
}

module.exports = { Money, fail, decimal, fixed, total, allocate };
