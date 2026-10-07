'use client';

import { Check, Copy } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';

const KEYWORDS = new Set(
  (
    'select from where group by order having limit offset with as on join ' +
    'left right inner outer full cross and or not in is null distinct case ' +
    'when then else end asc desc union all between like ilike exists any ' +
    'count sum avg min max round coalesce cast extract interval date_trunc ' +
    'to_char now current_date filter over partition lateral nulls first last'
  ).split(' '),
);

type Token = { kind: 'kw' | 'str' | 'num' | 'plain'; text: string };

/** Tiny tokenizer: enough for highlighting, never used for safety. */
function tokenize(sql: string): Token[] {
  const tokens: Token[] = [];
  const re =
    /('(?:[^']|'')*')|(\b\d+(?:\.\d+)?\b)|([A-Za-z_][A-Za-z0-9_]*)|([\s\S])/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(sql)) !== null) {
    const [, str, num, word, other] = match;
    if (str !== undefined) tokens.push({ kind: 'str', text: str });
    else if (num !== undefined) tokens.push({ kind: 'num', text: num });
    else if (word !== undefined) {
      tokens.push({
        kind: KEYWORDS.has(word.toLowerCase()) ? 'kw' : 'plain',
        text: word,
      });
    } else tokens.push({ kind: 'plain', text: other ?? '' });
  }
  return tokens;
}

const CLASS: Record<Token['kind'], string> = {
  kw: 'text-chart-1 font-semibold',
  str: 'text-emerald-700 dark:text-emerald-400',
  num: 'text-amber-700 dark:text-amber-400',
  plain: '',
};

export function SqlBlock({ sql }: { sql: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(sql);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard can be unavailable (http, permissions); ignore quietly.
    }
  };

  return (
    <div className="relative">
      <pre className="bg-muted/40 overflow-x-auto rounded-lg border p-3 pr-20 font-mono text-xs leading-relaxed whitespace-pre-wrap">
        {tokenize(sql).map((t, i) => (
          <span key={i} className={CLASS[t.kind]}>
            {t.text}
          </span>
        ))}
      </pre>
      <Button
        type="button"
        variant="outline"
        size="xs"
        className="absolute top-2 right-2"
        onClick={() => void copy()}
        aria-label="Copy SQL"
      >
        {copied ? <Check /> : <Copy />}
        {copied ? 'Copied' : 'Copy'}
      </Button>
    </div>
  );
}
