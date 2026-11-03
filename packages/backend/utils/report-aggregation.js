const Decimal = require("decimal.js");

const exactKey = (value) => JSON.stringify(value == null ? null : String(value));

function groupRows(rows, field) {
  const groups = new Map();
  for (const row of rows) {
    const key = exactKey(row[field]);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  return [...groups.values()];
}

function sumValues(rows, field) {
  let total = null;
  for (const row of rows) if (row[field] != null) total = (total || new Decimal(0)).plus(row[field]);
  return total;
}

function roundAmount(value, places = 2) {
  return new Decimal(value ?? 0).toDecimalPlaces(places, Decimal.ROUND_HALF_UP).toNumber();
}

function formatAmount(value, decimal) {
  const rounded = new Decimal(value ?? 0).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  return decimal ? rounded.toFixed(2) : rounded.toNumber();
}

function descendingAmount(first, second) {
  if (first == null) return second == null ? 0 : 1;
  if (second == null) return -1;
  return new Decimal(second).comparedTo(first);
}

module.exports = { exactKey, groupRows, sumValues, roundAmount, formatAmount, descendingAmount };
