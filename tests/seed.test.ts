import { describe, expect, it } from 'vitest';
import {
  DATA_END,
  DATA_START,
  createRng,
  generateSeed,
  type SeedData,
} from '@/db/seed';
import { DATA_RANGE } from '@/lib/schema-prompt';

let cached: SeedData | undefined;
const seed = () => (cached ??= generateSeed());

describe('createRng', () => {
  it('is deterministic for the same seed', () => {
    const a = createRng(42);
    const b = createRng(42);
    const left = Array.from({ length: 5 }, () => a.next());
    const right = Array.from({ length: 5 }, () => b.next());
    expect(left).toEqual(right);
  });

  it('produces values in [0, 1) and ints within bounds', () => {
    const rng = createRng(7);
    for (let i = 0; i < 1000; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      const n = rng.int(3, 5);
      expect(n).toBeGreaterThanOrEqual(3);
      expect(n).toBeLessThanOrEqual(5);
    }
  });
});

describe('generateSeed', () => {
  it('is deterministic', () => {
    const a = generateSeed();
    const b = generateSeed();
    expect(a).toEqual(b);
    expect(a.orders[123]).toEqual(b.orders[123]);
  });

  it('changes with a different seed', () => {
    const other = generateSeed({ seed: 99 });
    expect(other.orders[0]).not.toEqual(seed().orders[0]);
  });

  it('has the expected sizes', () => {
    const data = seed();
    expect(data.categories).toHaveLength(8);
    expect(data.products).toHaveLength(80);
    expect(data.salesReps).toHaveLength(8);
    expect(data.customers).toHaveLength(300);
    expect(data.orders).toHaveLength(4000);
    expect(data.orderItems.length).toBeGreaterThan(4000);
  });

  it('keeps referential integrity', () => {
    const data = seed();
    const categoryIds = new Set(data.categories.map((c) => c.id));
    const productIds = new Set(data.products.map((p) => p.id));
    const repIds = new Set(data.salesReps.map((r) => r.id));
    const customerIds = new Set(data.customers.map((c) => c.id));
    const orderIds = new Set(data.orders.map((o) => o.id));

    for (const p of data.products)
      expect(categoryIds.has(p.categoryId)).toBe(true);
    for (const c of data.customers) expect(repIds.has(c.salesRepId)).toBe(true);
    for (const o of data.orders) {
      expect(customerIds.has(o.customerId)).toBe(true);
      expect(repIds.has(o.salesRepId)).toBe(true);
    }
    for (const i of data.orderItems) {
      expect(orderIds.has(i.orderId)).toBe(true);
      expect(productIds.has(i.productId)).toBe(true);
    }
  });

  it('has unique names and ids', () => {
    const data = seed();
    const unique = (xs: unknown[]) => new Set(xs).size === xs.length;
    expect(unique(data.customers.map((c) => c.name))).toBe(true);
    expect(unique(data.products.map((p) => p.name))).toBe(true);
    expect(unique(data.orders.map((o) => o.id))).toBe(true);
    expect(unique(data.orderItems.map((i) => i.id))).toBe(true);
  });

  it('order totals match their line items', () => {
    const data = seed();
    const sums = new Map<number, number>();
    for (const i of data.orderItems) {
      expect(i.lineTotalCents).toBe(i.quantity * i.unitPriceCents);
      sums.set(i.orderId, (sums.get(i.orderId) ?? 0) + i.lineTotalCents);
    }
    for (const o of data.orders) {
      expect(o.totalCents).toBe(sums.get(o.id));
      expect(o.totalCents).toBeGreaterThan(0);
    }
  });

  it('keeps orders inside the documented date range, in order', () => {
    const data = seed();
    expect(DATA_RANGE).toEqual({ start: DATA_START, end: DATA_END });
    let previous = '';
    for (const o of data.orders) {
      expect(o.orderDate >= DATA_START).toBe(true);
      expect(o.orderDate <= DATA_END).toBe(true);
      expect(o.orderDate >= previous).toBe(true);
      previous = o.orderDate;
    }
  });

  it('has a December peak and a realistic status mix', () => {
    const data = seed();
    const byMonth = new Map<string, number>();
    const byStatus = { paid: 0, pending: 0, cancelled: 0 };
    for (const o of data.orders) {
      const month = o.orderDate.slice(0, 7);
      byMonth.set(month, (byMonth.get(month) ?? 0) + 1);
      byStatus[o.status]++;
    }
    const december = byMonth.get('2025-12')!;
    const average = data.orders.length / byMonth.size;
    expect(byMonth.size).toBe(12);
    expect(december).toBeGreaterThan(average * 1.25);
    expect(byStatus.paid / data.orders.length).toBeGreaterThan(0.8);
    expect(byStatus.cancelled).toBeGreaterThan(0);
    expect(byStatus.pending).toBeGreaterThan(0);
  });

  it('spreads customers across provinces and reps', () => {
    const data = seed();
    const provinces = new Set(data.customers.map((c) => c.province));
    const reps = new Set(data.customers.map((c) => c.salesRepId));
    expect(provinces.size).toBeGreaterThanOrEqual(15);
    expect(reps.size).toBe(8);
  });
});
