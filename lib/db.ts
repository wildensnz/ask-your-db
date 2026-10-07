/**
 * Read-only query execution against the demo database.
 *
 * Every query runs inside a READ ONLY transaction with a 5 s statement
 * timeout, using the connection string of the SELECT-only role. The SQL
 * guard runs before this; the role and the transaction mode are the second
 * and third lines of defence.
 */

import { Pool, types, type PoolClient } from 'pg';
import { MAX_ROWS } from './sql-guard';

export const STATEMENT_TIMEOUT_MS = 5000;

export interface QueryResult {
  columns: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
  durationMs: number;
}

export class QueryError extends Error {
  constructor(
    message: string,
    public readonly code?: string,
  ) {
    super(message);
    this.name = 'QueryError';
  }
}

// Return dates as plain strings and numerics as numbers so results are
// JSON-stable and the UI can format them.
types.setTypeParser(types.builtins.DATE, (v) => v);
types.setTypeParser(types.builtins.TIMESTAMP, (v) => v);
types.setTypeParser(types.builtins.TIMESTAMPTZ, (v) => v);
types.setTypeParser(types.builtins.NUMERIC, Number);
types.setTypeParser(types.builtins.INT8, Number);

const globalForPool = globalThis as unknown as { askdbPool?: Pool };

function getPool(): Pool {
  if (!globalForPool.askdbPool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error('DATABASE_URL is not set');
    globalForPool.askdbPool = new Pool({
      connectionString,
      max: 3,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
    });
  }
  return globalForPool.askdbPool;
}

interface PgError {
  code?: string;
  message?: string;
  position?: string;
  hint?: string;
}

/** Turns a Postgres error into a short message the model can act on. */
export function normalizeDbError(error: unknown): QueryError {
  const e = (error ?? {}) as PgError;
  if (e.code === '57014') {
    return new QueryError(
      `Query timed out after ${STATEMENT_TIMEOUT_MS / 1000}s. Simplify it or add filters.`,
      e.code,
    );
  }
  if (e.code === '25006') {
    return new QueryError(
      'Rejected: the connection is read-only; only SELECT queries can run.',
      e.code,
    );
  }
  if (e.code === '42501') {
    return new QueryError(
      'Rejected: permission denied for this operation.',
      e.code,
    );
  }
  const parts = [e.message ?? String(error)];
  if (e.position) parts.push(`(at character ${e.position})`);
  if (e.hint) parts.push(`Hint: ${e.hint}`);
  return new QueryError(parts.join(' '), e.code);
}

async function withReadOnlyTransaction<T>(
  client: PoolClient,
  fn: () => Promise<T>,
): Promise<T> {
  await client.query('BEGIN READ ONLY');
  try {
    await client.query(`SET LOCAL statement_timeout = ${STATEMENT_TIMEOUT_MS}`);
    const result = await fn();
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  }
}

/**
 * Runs SQL that already passed the guard. Throws `QueryError` with a
 * model-friendly message on failure.
 */
export async function runReadOnlyQuery(sql: string): Promise<QueryResult> {
  const client = await getPool().connect();
  const started = Date.now();
  try {
    return await withReadOnlyTransaction(client, async () => {
      const result = await client.query({ text: sql, rowMode: 'array' });
      const columns = result.fields.map((f) => f.name);
      const rows = (result.rows as unknown[][])
        .slice(0, MAX_ROWS)
        .map((row) =>
          Object.fromEntries(columns.map((name, i) => [name, row[i]])),
        );
      return {
        columns,
        rows,
        rowCount: rows.length,
        durationMs: Date.now() - started,
      };
    });
  } catch (error) {
    throw normalizeDbError(error);
  } finally {
    client.release();
  }
}
