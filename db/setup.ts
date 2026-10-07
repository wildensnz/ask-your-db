/**
 * `npm run db:setup`
 *
 * Uses DATABASE_URL_ADMIN (never shipped to Vercel) to:
 *   1. apply db/schema.sql (drops and recreates the demo tables),
 *   2. insert the deterministic seed data,
 *   3. create or rotate the read-only role `askdb_reader`,
 *   4. verify the reader role cannot write,
 *   5. write DATABASE_URL (reader role) into .env.local.
 *
 * The reader connection string is never printed; copy it from .env.local
 * when configuring Vercel.
 */

import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { config } from 'dotenv';
import { Client } from 'pg';
import { generateSeed, type SeedData } from './seed';

const ROOT = path.resolve(import.meta.dirname, '..');
const ENV_FILE = path.join(ROOT, '.env.local');
const READER_ROLE = 'askdb_reader';

config({ path: ENV_FILE, quiet: true });

function log(message: string) {
  process.stdout.write(`${message}\n`);
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

/** Multi-row parameterized INSERT in chunks (stays under the 65k param cap). */
async function bulkInsert(
  client: Client,
  table: string,
  columns: string[],
  rows: unknown[][],
) {
  for (const part of chunk(rows, 500)) {
    const values: unknown[] = [];
    const tuples = part.map((row) => {
      const placeholders = row.map((v) => {
        values.push(v);
        return `$${values.length}`;
      });
      return `(${placeholders.join(', ')})`;
    });
    await client.query(
      `INSERT INTO ${table} (${columns.join(', ')}) VALUES ${tuples.join(', ')}`,
      values,
    );
  }
  await client.query(
    `SELECT setval(pg_get_serial_sequence('${table}', 'id'), (SELECT max(id) FROM ${table}))`,
  );
  log(`  ${table}: ${rows.length} rows`);
}

const cents = (n: number) => (n / 100).toFixed(2);

async function insertSeed(client: Client, data: SeedData) {
  await bulkInsert(
    client,
    'categories',
    ['id', 'name'],
    data.categories.map((c) => [c.id, c.name]),
  );
  await bulkInsert(
    client,
    'products',
    [
      'id',
      'category_id',
      'name',
      'brand',
      'unit_price',
      'unit',
      'stock',
      'active',
    ],
    data.products.map((p) => [
      p.id,
      p.categoryId,
      p.name,
      p.brand,
      cents(p.unitPriceCents),
      p.unit,
      p.stock,
      p.active,
    ]),
  );
  await bulkInsert(
    client,
    'sales_reps',
    ['id', 'name', 'region', 'hired_at'],
    data.salesReps.map((r) => [r.id, r.name, r.region, r.hiredAt]),
  );
  await bulkInsert(
    client,
    'customers',
    [
      'id',
      'name',
      'customer_type',
      'province',
      'city',
      'sales_rep_id',
      'since',
    ],
    data.customers.map((c) => [
      c.id,
      c.name,
      c.customerType,
      c.province,
      c.city,
      c.salesRepId,
      c.since,
    ]),
  );
  await bulkInsert(
    client,
    'orders',
    ['id', 'customer_id', 'sales_rep_id', 'order_date', 'status', 'total'],
    data.orders.map((o) => [
      o.id,
      o.customerId,
      o.salesRepId,
      o.orderDate,
      o.status,
      cents(o.totalCents),
    ]),
  );
  await bulkInsert(
    client,
    'order_items',
    ['id', 'order_id', 'product_id', 'quantity', 'unit_price', 'line_total'],
    data.orderItems.map((i) => [
      i.id,
      i.orderId,
      i.productId,
      i.quantity,
      cents(i.unitPriceCents),
      cents(i.lineTotalCents),
    ]),
  );
}

/** Creates (or rotates the password of) the SELECT-only role. */
async function setupReaderRole(client: Client, password: string) {
  if (!/^[A-Za-z0-9_-]+$/.test(password)) {
    throw new Error('generated password has unexpected characters');
  }
  const dbName = (
    await client.query<{ db: string }>('SELECT current_database() AS db')
  ).rows[0]!.db;

  await client.query(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${READER_ROLE}') THEN
        CREATE ROLE ${READER_ROLE} LOGIN;
      END IF;
    END $$;
  `);
  await client.query(
    `ALTER ROLE ${READER_ROLE} WITH LOGIN PASSWORD '${password}'`,
  );
  await client.query(`GRANT CONNECT ON DATABASE "${dbName}" TO ${READER_ROLE}`);
  await client.query(`GRANT USAGE ON SCHEMA public TO ${READER_ROLE}`);
  await client.query(`REVOKE CREATE ON SCHEMA public FROM ${READER_ROLE}`);
  await client.query(
    `GRANT SELECT ON ALL TABLES IN SCHEMA public TO ${READER_ROLE}`,
  );
  await client.query(
    `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO ${READER_ROLE}`,
  );
  // Belt and braces: the app also opens READ ONLY transactions and sets
  // its own statement_timeout, so these are defaults, not the only guard.
  try {
    await client.query(
      `ALTER ROLE ${READER_ROLE} SET default_transaction_read_only = on`,
    );
    await client.query(
      `ALTER ROLE ${READER_ROLE} SET statement_timeout = '5000'`,
    );
  } catch (error) {
    log(`  warning: could not set role defaults (${String(error)})`);
  }
  log(`  role ${READER_ROLE} ready`);
}

function readerUrl(adminUrl: string, password: string) {
  const url = new URL(adminUrl);
  url.username = READER_ROLE;
  url.password = password;
  // pg already treats `require` as `verify-full`; say so to avoid its warning.
  url.searchParams.set('sslmode', 'verify-full');
  return url.toString();
}

/** Proves the reader role can read but not write, even if it tries to opt out. */
async function verifyReader(url: string) {
  const reader = new Client({ connectionString: url });
  await reader.connect();
  try {
    const { rows } = await reader.query<{ n: string }>(
      'SELECT count(*)::text AS n FROM orders',
    );
    log(`  reader can SELECT (orders: ${rows[0]!.n})`);

    await reader.query('SET default_transaction_read_only = off');
    let blocked = false;
    try {
      await reader.query(`INSERT INTO categories (name) VALUES ('hack')`);
    } catch (error) {
      blocked = /permission denied|read-only/i.test(String(error));
    }
    if (!blocked) throw new Error('reader role was able to INSERT');
    log('  reader cannot INSERT (permission denied)');
  } finally {
    await reader.end();
  }
}

function writeEnv(key: string, value: string) {
  const current = existsSync(ENV_FILE) ? readFileSync(ENV_FILE, 'utf8') : '';
  const line = `${key}=${value}`;
  const pattern = new RegExp(`^${key}=.*$`, 'm');
  const next = pattern.test(current)
    ? current.replace(pattern, line)
    : `${current.trimEnd()}\n${line}\n`;
  writeFileSync(ENV_FILE, next);
}

async function main() {
  const adminUrl = process.env.DATABASE_URL_ADMIN;
  if (!adminUrl) {
    throw new Error('DATABASE_URL_ADMIN is not set in .env.local');
  }

  const client = new Client({ connectionString: adminUrl });
  await client.connect();
  try {
    log('Applying schema...');
    await client.query(readFileSync(path.join(ROOT, 'db/schema.sql'), 'utf8'));

    log('Inserting seed data...');
    const data = generateSeed();
    await client.query('BEGIN');
    await insertSeed(client, data);
    await client.query('COMMIT');

    log('Configuring reader role...');
    const password = randomBytes(24).toString('base64url');
    await setupReaderRole(client, password);

    const url = readerUrl(adminUrl, password);
    log('Verifying reader role...');
    await verifyReader(url);

    writeEnv('DATABASE_URL', url);
    log('DATABASE_URL (reader role) written to .env.local');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`db:setup failed: ${String(error)}\n`);
  process.exit(1);
});
