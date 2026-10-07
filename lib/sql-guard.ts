/**
 * SQL guard: decides whether a model-written query may run.
 *
 * Pure function, no I/O. Defence in depth: the database role is SELECT-only
 * and every query runs inside a READ ONLY transaction, so this guard is the
 * first gate, not the only one. It is deliberately conservative: anything it
 * cannot parse with confidence is rejected.
 *
 * Rules
 *  1. One statement only (a single trailing `;` is tolerated).
 *  2. Must start with SELECT or WITH.
 *  3. No write/DDL/admin keywords anywhere outside string literals.
 *  4. No comments, backslashes, dollar quoting or `pg_*` / `lo_*` functions.
 *  5. A trailing LIMIT is enforced and capped at MAX_ROWS.
 */

export const MAX_ROWS = 200;
export const MAX_SQL_LENGTH = 4000;

export type GuardResult =
  { ok: true; sql: string } | { ok: false; reason: string };

const FORBIDDEN_KEYWORDS = [
  'insert',
  'update',
  'delete',
  'merge',
  'drop',
  'alter',
  'truncate',
  'create',
  'grant',
  'revoke',
  'copy',
  'into',
  'vacuum',
  'analyze',
  'analyse',
  'cluster',
  'reindex',
  'refresh',
  'lock',
  'set',
  'reset',
  'call',
  'do',
  'execute',
  'prepare',
  'deallocate',
  'listen',
  'notify',
  'begin',
  'commit',
  'rollback',
  'savepoint',
  'comment',
  'security',
  'import',
  'declare',
  'fetch',
  'move',
  'discard',
  'load',
] as const;

const FORBIDDEN_PREFIXES = ['pg_', 'lo_', 'dblink', 'set_config'] as const;

interface Scanned {
  /** SQL with comments removed and the same string literals as the input. */
  clean: string;
  /** Same length as `clean`; string/identifier contents replaced by spaces. */
  masked: string;
}

/**
 * Walks the SQL once, dropping comments and masking the inside of quoted
 * strings and identifiers so later keyword checks only see real code.
 * Returns a reason string on anything ambiguous.
 */
function scan(sql: string): Scanned | string {
  let clean = '';
  let masked = '';
  let i = 0;
  const n = sql.length;

  while (i < n) {
    const ch = sql[i]!;
    const next = sql[i + 1];

    if (ch === '\\') return 'backslashes are not allowed';
    if (ch === '$') return 'dollar quoting and parameters are not allowed';
    if (ch === '\0') return 'invalid character';

    // Line comment: drop to end of line.
    if (ch === '-' && next === '-') {
      while (i < n && sql[i] !== '\n') i++;
      continue;
    }

    // Block comment (Postgres nests them).
    if (ch === '/' && next === '*') {
      let depth = 1;
      i += 2;
      while (i < n && depth > 0) {
        if (sql[i] === '/' && sql[i + 1] === '*') {
          depth++;
          i += 2;
        } else if (sql[i] === '*' && sql[i + 1] === '/') {
          depth--;
          i += 2;
        } else {
          i++;
        }
      }
      if (depth > 0) return 'unterminated comment';
      clean += ' ';
      masked += ' ';
      continue;
    }

    // Quoted string or identifier. A doubled quote is an escaped quote.
    if (ch === "'" || ch === '"') {
      const quote = ch;
      // Escape-string prefix (E'...') changes escaping rules: refuse it.
      if (quote === "'" && /[eE]$/.test(clean) && !/\w[eE]$/.test(clean)) {
        return "escape strings (E'...') are not allowed";
      }
      let j = i + 1;
      let body = '';
      let closed = false;
      while (j < n) {
        if (sql[j] === quote) {
          if (sql[j + 1] === quote) {
            body += quote + quote;
            j += 2;
            continue;
          }
          closed = true;
          break;
        }
        if (sql[j] === '\\') return 'backslashes are not allowed';
        body += sql[j];
        j++;
      }
      if (!closed) return 'unterminated quoted string';
      clean += quote + body + quote;
      masked += quote + ' '.repeat(body.length) + quote;
      i = j + 1;
      continue;
    }

    clean += ch;
    masked += ch;
    i++;
  }

  return { clean, masked };
}

export function guardSql(input: string): GuardResult {
  if (typeof input !== 'string')
    return { ok: false, reason: 'SQL must be a string' };
  if (input.length > MAX_SQL_LENGTH) {
    return {
      ok: false,
      reason: `SQL is too long (max ${MAX_SQL_LENGTH} chars)`,
    };
  }

  const scanned = scan(input);
  if (typeof scanned === 'string') return { ok: false, reason: scanned };

  let { clean, masked } = scanned;

  // Trim whitespace and one trailing semicolon, keeping indices aligned.
  const trimEnd = (s: string) => s.replace(/[\s;]+$/u, '');
  const trailing = masked.length - trimEnd(masked).length;
  const stripped = masked.slice(masked.length - trailing);
  if ((stripped.match(/;/g) ?? []).length > 1) {
    return { ok: false, reason: 'only one statement is allowed' };
  }
  masked = masked.slice(0, masked.length - trailing);
  clean = clean.slice(0, clean.length - trailing);
  const lead = masked.length - masked.trimStart().length;
  masked = masked.slice(lead);
  clean = clean.slice(lead);

  if (clean.length === 0) return { ok: false, reason: 'SQL is empty' };
  if (masked.includes(';')) {
    return { ok: false, reason: 'only one statement is allowed' };
  }

  if (!/^(select|with)\b/i.test(masked)) {
    return { ok: false, reason: 'only SELECT queries are allowed' };
  }

  const lower = masked.toLowerCase();
  const words = lower.match(/[a-z_][a-z0-9_]*/g) ?? [];
  for (const word of words) {
    if ((FORBIDDEN_KEYWORDS as readonly string[]).includes(word)) {
      return {
        ok: false,
        reason: `keyword "${word.toUpperCase()}" is not allowed`,
      };
    }
    for (const prefix of FORBIDDEN_PREFIXES) {
      if (word.startsWith(prefix)) {
        return { ok: false, reason: `"${word}" is not allowed` };
      }
    }
  }

  // Enforce the row cap on the outermost query.
  const limitMatch = /\blimit\s+(\d+|all)(\s+offset\s+\d+)?\s*$/i.exec(masked);
  if (!limitMatch && /\blimit\s+\S+(\s+offset\s+\S+)?\s*$/i.test(masked)) {
    return { ok: false, reason: 'LIMIT must be a non-negative integer' };
  }
  if (limitMatch) {
    const value = Number(limitMatch[1]);
    if (!Number.isInteger(value) || value > MAX_ROWS) {
      const start = limitMatch.index + limitMatch[0].indexOf(limitMatch[1]!);
      clean =
        clean.slice(0, start) +
        String(MAX_ROWS) +
        clean.slice(start + limitMatch[1]!.length);
    }
    return { ok: true, sql: clean };
  }

  return { ok: true, sql: `${clean}\nLIMIT ${MAX_ROWS}` };
}
