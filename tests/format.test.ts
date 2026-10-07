import { describe, expect, it } from 'vitest';
import {
  formatAxisLabel,
  formatCell,
  formatCompact,
  formatMoney,
  isMoneyColumn,
  toText,
} from '@/lib/format';

describe('formatMoney', () => {
  it('uses the RD$ format with two decimals and thousands separators', () => {
    expect(formatMoney(1248500)).toBe('RD$ 1,248,500.00');
    expect(formatMoney(95.5)).toBe('RD$ 95.50');
    expect(formatMoney(0)).toBe('RD$ 0.00');
  });
});

describe('isMoneyColumn', () => {
  it('detects money-like names and skips counts', () => {
    expect(isMoneyColumn('revenue')).toBe(true);
    expect(isMoneyColumn('total_sales')).toBe(true);
    expect(isMoneyColumn('avg_order_value')).toBe(true);
    expect(isMoneyColumn('units')).toBe(false);
    expect(isMoneyColumn('order_count')).toBe(false);
    expect(isMoneyColumn('customer_id')).toBe(false);
    expect(isMoneyColumn('month')).toBe(false);
  });
});

describe('formatCell', () => {
  it('formats numbers by column kind', () => {
    expect(formatCell('revenue', 1234.5)).toBe('RD$ 1,234.50');
    expect(formatCell('units', 1234)).toBe('1,234');
    expect(formatCell('ratio', 0.4567)).toBe('0.46');
  });

  it('passes strings through and handles empties', () => {
    expect(formatCell('name', 'Colmado La Fe')).toBe('Colmado La Fe');
    expect(formatCell('x', null)).toBe('');
    expect(formatCell('x', undefined)).toBe('');
    expect(formatCell('x', true)).toBe('true');
  });
});

describe('toText', () => {
  it('never produces [object Object]', () => {
    expect(toText({ a: 1 })).toBe('{"a":1}');
    expect(toText([1, 2])).toBe('[1,2]');
    expect(toText(new Date('2026-03-01T00:00:00Z'))).toBe('2026-03-01');
  });
});

describe('formatCompact', () => {
  it('shortens large numbers', () => {
    expect(formatCompact(1_250_000)).toBe('1.25M');
    expect(formatCompact(85_000)).toBe('85K');
    expect(formatCompact(4200)).toBe('4,200');
    expect(formatCompact(12.345)).toBe('12.35');
  });
});

describe('formatAxisLabel', () => {
  it('shortens ISO months and dates', () => {
    expect(formatAxisLabel('2026-01-01')).toBe('Jan 26');
    expect(formatAxisLabel('2026-01-01 00:00:00')).toBe('Jan 26');
    expect(formatAxisLabel('2026-01')).toBe('Jan 26');
    expect(formatAxisLabel('2025-12-15')).toBe('Dec 15');
  });

  it('truncates long category labels', () => {
    expect(formatAxisLabel('Panadería y galletas artesanales')).toBe(
      'Panadería y galle…',
    );
    expect(formatAxisLabel('Bebidas')).toBe('Bebidas');
  });
});
