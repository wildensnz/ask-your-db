'use client';

import { Database, Lock } from 'lucide-react';
import { useState } from 'react';
import type { AskResult } from '@/lib/agent';
import { AnswerCard } from '@/components/answer-card';
import { AskForm } from '@/components/ask-form';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

type Entry =
  | { id: number; question: string; status: 'loading' }
  | { id: number; question: string; status: 'error'; message: string }
  | { id: number; question: string; status: 'done'; result: AskResult };

let nextId = 1;

export default function Home() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const busy = entries.some((e) => e.status === 'loading');

  const ask = async (question: string) => {
    const id = nextId++;
    setEntries((prev) => [{ id, question, status: 'loading' }, ...prev]);

    let next: Entry;
    try {
      const res = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ question }),
      });
      const body = (await res.json()) as AskResult | { error: string };
      next =
        res.ok && 'answer' in body
          ? { id, question, status: 'done', result: body }
          : {
              id,
              question,
              status: 'error',
              message:
                'error' in body
                  ? body.error
                  : `Request failed (${res.status}).`,
            };
    } catch {
      next = {
        id,
        question,
        status: 'error',
        message: 'Could not reach the server. Check your connection.',
      };
    }
    setEntries((prev) => prev.map((e) => (e.id === id ? next : e)));
  };

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-4 py-10 md:py-14">
      <header className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">Ask Your DB</h1>
          <Badge variant="outline" className="gap-1">
            <Lock /> Read-only
          </Badge>
          <Badge variant="outline" className="gap-1">
            <Database /> Postgres demo
          </Badge>
        </div>
        <p className="text-muted-foreground max-w-2xl text-sm">
          Ask a business question in plain language. A Claude agent writes the
          SQL, a guard validates it, and it runs with a read-only role against
          Colmado Digital, a fictional Dominican distributor with 12 months of
          sales data.
        </p>
      </header>

      <AskForm busy={busy} onAsk={(q) => void ask(q)} />

      <section className="space-y-4" aria-live="polite">
        {entries.map((entry) => {
          if (entry.status === 'done') {
            return <AnswerCard key={entry.id} result={entry.result} />;
          }
          if (entry.status === 'error') {
            return (
              <Card key={entry.id} className="border-destructive/40">
                <CardHeader>
                  <p className="text-base font-medium">{entry.question}</p>
                </CardHeader>
                <CardContent>
                  <p className="text-destructive text-sm">{entry.message}</p>
                </CardContent>
              </Card>
            );
          }
          return (
            <Card key={entry.id}>
              <CardHeader>
                <p className="text-base font-medium">{entry.question}</p>
                <p className="text-muted-foreground text-xs">
                  Generating SQL and running it read-only…
                </p>
              </CardHeader>
              <CardContent className="space-y-3">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-40 w-full" />
                <Skeleton className="h-4 w-1/3" />
              </CardContent>
            </Card>
          );
        })}
      </section>

      <footer className="text-muted-foreground mt-auto pt-6 text-xs">
        Every query goes through a SQL guard and a READ ONLY transaction with a
        5 s timeout and a 200-row cap. Demo data only.
      </footer>
    </main>
  );
}
