import { describe, expect, it } from 'vitest';
import { MAX_ROWS, MAX_SQL_LENGTH, guardSql } from '@/lib/sql-guard';

const ok = (sql: string) => {
  const result = guardSql(sql);
  if (!result.ok) throw new Error(`expected ok, got: ${result.reason}`);
  return result.sql;
};

const rejected = (sql: string) => {
  const result = guardSql(sql);
  if (result.ok) throw new Error(`expected rejection, got: ${result.sql}`);
  return result.reason;
};

describe('guardSql: valid queries', () => {
  it('accepts a plain SELECT and appends LIMIT', () => {
    expect(ok('SELECT * FROM products')).toBe(
      `SELECT * FROM products\nLIMIT ${MAX_ROWS}`,
    );
  });

  it('accepts lowercase and leading whitespace', () => {
    expect(ok('   select id from orders')).toMatch(/^select id from orders/);
  });

  it('accepts a CTE', () => {
    const sql = ok(
      "WITH paid AS (SELECT * FROM orders WHERE status = 'paid') SELECT count(*) FROM paid",
    );
    expect(sql).toMatch(/^WITH paid/);
    expect(sql).toMatch(/LIMIT 200$/);
  });

  it('keeps an existing LIMIT at or under the cap', () => {
    expect(ok('SELECT * FROM products LIMIT 10')).toBe(
      'SELECT * FROM products LIMIT 10',
    );
    expect(ok('SELECT * FROM products LIMIT 200')).toBe(
      'SELECT * FROM products LIMIT 200',
    );
  });

  it('caps a LIMIT above the maximum', () => {
    expect(ok('SELECT * FROM products LIMIT 5000')).toBe(
      'SELECT * FROM products LIMIT 200',
    );
  });

  it('caps LIMIT ALL', () => {
    expect(ok('SELECT * FROM products LIMIT ALL')).toBe(
      'SELECT * FROM products LIMIT 200',
    );
  });

  it('handles LIMIT with OFFSET', () => {
    expect(ok('SELECT * FROM products LIMIT 999 OFFSET 20')).toBe(
      'SELECT * FROM products LIMIT 200 OFFSET 20',
    );
  });

  it('appends LIMIT when only a subquery has one', () => {
    expect(ok('SELECT * FROM (SELECT * FROM products LIMIT 5) p')).toBe(
      `SELECT * FROM (SELECT * FROM products LIMIT 5) p\nLIMIT ${MAX_ROWS}`,
    );
  });

  it('tolerates a single trailing semicolon', () => {
    expect(ok('SELECT 1;')).toBe(`SELECT 1\nLIMIT ${MAX_ROWS}`);
    expect(ok('SELECT 1 ;  \n')).toBe(`SELECT 1\nLIMIT ${MAX_ROWS}`);
  });

  it('removes comments', () => {
    expect(ok('SELECT 1 -- trailing comment\nFROM products')).toBe(
      `SELECT 1 \nFROM products\nLIMIT ${MAX_ROWS}`,
    );
    expect(ok('SELECT /* inline */ 1')).toBe(`SELECT   1\nLIMIT ${MAX_ROWS}`);
    expect(ok('SELECT /* outer /* nested */ still */ 1')).toBe(
      `SELECT   1\nLIMIT ${MAX_ROWS}`,
    );
  });

  it('ignores forbidden words inside string literals', () => {
    const sql = ok("SELECT * FROM products WHERE name = 'drop table; delete'");
    expect(sql).toContain("'drop table; delete'");
  });

  it('handles escaped quotes inside strings', () => {
    const sql = ok("SELECT * FROM customers WHERE name = 'Don''t update'");
    expect(sql).toContain("'Don''t update'");
  });

  it('ignores forbidden words in quoted identifiers', () => {
    expect(ok('SELECT "delete" FROM "orders"')).toMatch(/^SELECT "delete"/);
  });

  it('allows words that merely contain forbidden substrings', () => {
    ok('SELECT updated_at, created_at, settings FROM products');
    ok('SELECT * FROM orders OFFSET 10');
    ok("SELECT * FROM products WHERE name LIKE'%x%'");
  });

  it('allows typical aggregate queries with date functions', () => {
    ok(`
      SELECT date_trunc('month', order_date) AS month, sum(total) AS revenue
      FROM orders
      WHERE status = 'paid'
      GROUP BY 1
      ORDER BY 1
    `);
  });
});

describe('guardSql: rejected queries', () => {
  it('rejects empty input', () => {
    expect(rejected('')).toMatch(/empty/);
    expect(rejected('   ;  ')).toMatch(/empty/);
  });

  it('rejects non-SELECT statements', () => {
    expect(rejected('DROP TABLE orders')).toMatch(/not allowed|SELECT/);
    expect(rejected('DELETE FROM orders')).toMatch(/not allowed|SELECT/);
    expect(rejected("INSERT INTO categories (name) VALUES ('x')")).toMatch(
      /not allowed|SELECT/,
    );
    expect(rejected("UPDATE orders SET status = 'paid'")).toMatch(
      /not allowed|SELECT/,
    );
    expect(rejected('TRUNCATE orders')).toMatch(/not allowed|SELECT/);
    expect(rejected('EXPLAIN SELECT 1')).toMatch(/only SELECT/);
    expect(rejected('SHOW tables')).toMatch(/only SELECT/);
  });

  it('rejects stacked statements', () => {
    expect(rejected('SELECT 1; DROP TABLE orders')).toMatch(/one statement/);
    expect(rejected('SELECT 1;; SELECT 2')).toMatch(/one statement/);
    expect(rejected('SELECT 1; -- comment\nDROP TABLE orders')).toMatch(
      /one statement/,
    );
  });

  it('rejects writes hidden inside a CTE', () => {
    expect(
      rejected(
        'WITH x AS (DELETE FROM orders RETURNING *) SELECT count(*) FROM x',
      ),
    ).toMatch(/DELETE/);
    expect(
      rejected(
        "WITH x AS (UPDATE orders SET status='paid' RETURNING id) SELECT * FROM x",
      ),
    ).toMatch(/UPDATE|SET/);
    expect(
      rejected(
        "WITH x AS (INSERT INTO categories(name) VALUES ('y') RETURNING id) SELECT * FROM x",
      ),
    ).toMatch(/INSERT|INTO/);
  });

  it('rejects SELECT INTO', () => {
    expect(rejected('SELECT * INTO new_table FROM orders')).toMatch(/INTO/);
  });

  it('rejects row locking', () => {
    expect(rejected('SELECT * FROM orders FOR UPDATE')).toMatch(/UPDATE/);
  });

  it('rejects admin functions and system catalogs', () => {
    expect(rejected('SELECT pg_sleep(10)')).toMatch(/pg_sleep/);
    expect(rejected("SELECT pg_read_file('/etc/passwd')")).toMatch(
      /pg_read_file/,
    );
    expect(rejected('SELECT * FROM pg_catalog.pg_tables')).toMatch(/pg_/);
    expect(rejected("SELECT lo_import('/etc/passwd')")).toMatch(/lo_import/);
    expect(rejected("SELECT set_config('x', 'y', false)")).toMatch(
      /set_config/,
    );
  });

  it('rejects session changes and transaction control', () => {
    expect(rejected('SET statement_timeout = 0')).toMatch(/only SELECT/);
    expect(rejected('SELECT 1 FROM orders; COMMIT')).toMatch(/one statement/);
    expect(rejected('BEGIN')).toMatch(/only SELECT/);
  });

  it('rejects DDL even when cased or spaced oddly', () => {
    expect(rejected('select 1 from orders; dRoP table orders')).toMatch(
      /one statement/,
    );
    expect(rejected('SELECT 1 UNION SELECT 1 FROM (CREATE TABLE x) y')).toMatch(
      /CREATE/,
    );
  });

  it('rejects quoting tricks it cannot parse safely', () => {
    expect(rejected("SELECT 'unterminated")).toMatch(/unterminated/);
    expect(rejected('SELECT 1 /* open comment')).toMatch(/unterminated/);
    expect(rejected("SELECT E'\\x41'")).toMatch(/backslash|escape/);
    expect(rejected("SELECT 'a\\'; DROP TABLE orders; --'")).toMatch(
      /backslash/,
    );
    expect(rejected('SELECT $$; DROP TABLE orders; $$')).toMatch(/dollar/);
    expect(rejected('SELECT $1')).toMatch(/dollar/);
  });

  it('rejects an unparseable LIMIT', () => {
    expect(rejected('SELECT * FROM orders LIMIT -1')).toMatch(/LIMIT|only/);
    expect(rejected('SELECT * FROM orders LIMIT 1e9')).toMatch(/LIMIT|only/);
  });

  it('rejects over-long input', () => {
    expect(rejected(`SELECT '${'x'.repeat(MAX_SQL_LENGTH)}'`)).toMatch(
      /too long/,
    );
  });

  it('rejects non-string input', () => {
    expect(rejected(42 as unknown as string)).toMatch(/string/);
  });
});
