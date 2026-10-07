/** Display formatting for query results. Pure, unit-tested. */

const MONEY_COLUMN =
  /(revenue|total|amount|price|sales|value|ticket|spend|income|cost|rd\$)/i;
const COUNT_COLUMN =
  /(count|orders|units|quantity|customers|rows|n$|_id$|^id$)/i;

const money = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const integer = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const decimal = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });

/** Safe string conversion for unknown cell values (never "[object Object]"). */
export function toText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return JSON.stringify(value);
}

export function formatMoney(value: number): string {
  return `RD$ ${money.format(value)}`;
}

export function isMoneyColumn(column: string): boolean {
  return MONEY_COLUMN.test(column) && !COUNT_COLUMN.test(column);
}

/** Formats a cell for the table according to its column name and type. */
export function formatCell(column: string, value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') {
    if (isMoneyColumn(column)) return formatMoney(value);
    return Number.isInteger(value)
      ? integer.format(value)
      : decimal.format(value);
  }
  return toText(value);
}

/** Short tick labels for chart axes: 1.2M, 850K, 42. */
export function formatCompact(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${decimal.format(value / 1_000_000)}M`;
  if (abs >= 10_000) return `${decimal.format(value / 1_000)}K`;
  return Number.isInteger(value)
    ? integer.format(value)
    : decimal.format(value);
}

/** Shortens ISO dates and timestamps for axis labels. */
export function formatAxisLabel(value: unknown): string {
  const s = toText(value);
  const iso = /^(\d{4})-(\d{2})(?:-(\d{2}))?(?:[T ].*)?$/.exec(s);
  if (!iso) return s.length > 18 ? `${s.slice(0, 17)}…` : s;
  const [, year, month, day] = iso;
  const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  const name = months[Number(month) - 1] ?? month;
  return day && day !== '01'
    ? `${name} ${Number(day)}`
    : `${name} ${year!.slice(2)}`;
}
