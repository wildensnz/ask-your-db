/**
 * Integration test against the real demo database. Runs only when
 * DATABASE_URL (the reader role) is available, e.g. locally or in CI with
 * the secret configured. It proves the three layers that make the app
 * read-only actually hold.
 */

import { config } from 'dotenv';
import { describe, expect, it } from 'vitest';

config({ path: '.env.local', quiet: true });

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)('runReadOnlyQuery (integration)', () => {
  it('runs a SELECT and returns typed rows', async () => {
    const { runReadOnlyQuery } = await import('@/lib/db');
    const result = await runReadOnlyQuery(
      "SELECT count(*) AS n, min(order_date) AS first_day FROM orders WHERE status = 'paid' LIMIT 1",
    );
    expect(result.columns).toEqual(['n', 'first_day']);
    expect(typeof result.rows[0]!.n).toBe('number');
    expect(result.rows[0]!.first_day).toBe('2025-10-01');
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('caps rows at the maximum even without a LIMIT', async () => {
    const { runReadOnlyQuery } = await import('@/lib/db');
    const { MAX_ROWS } = await import('@/lib/sql-guard');
    const result = await runReadOnlyQuery('SELECT id FROM orders');
    expect(result.rowCount).toBe(MAX_ROWS);
  });

  it('refuses writes even if they bypass the guard', async () => {
    const { runReadOnlyQuery } = await import('@/lib/db');
    await expect(
      runReadOnlyQuery("INSERT INTO categories (name) VALUES ('x')"),
    ).rejects.toThrow(/read-only|permission denied/);
    await expect(runReadOnlyQuery('DROP TABLE order_items')).rejects.toThrow(
      /read-only|permission denied|must be owner/,
    );
  });

  it('times out slow queries', async () => {
    const { runReadOnlyQuery } = await import('@/lib/db');
    await expect(runReadOnlyQuery('SELECT pg_sleep(7)')).rejects.toThrow(
      /timed out/,
    );
  }, 15_000);
});
