'use client';

import { ArrowUp, Loader2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { EXAMPLE_QUESTIONS } from '@/lib/examples';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface Props {
  busy: boolean;
  onAsk: (question: string) => void;
}

export function AskForm({ busy, onAsk }: Props) {
  const [question, setQuestion] = useState('');

  const submit = (value: string) => {
    const trimmed = value.trim();
    if (trimmed.length < 3 || busy) return;
    onAsk(trimmed);
    setQuestion('');
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    submit(question);
  };

  return (
    <div className="space-y-3">
      <form onSubmit={onSubmit} className="flex gap-2">
        <Input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ask a question about sales, products, customers or reps…"
          aria-label="Your question"
          maxLength={500}
          autoFocus
          className="bg-card h-11 flex-1 px-4 text-base shadow-xs md:text-base"
        />
        <Button
          type="submit"
          size="lg"
          className="h-11 px-4"
          disabled={busy || question.trim().length < 3}
        >
          {busy ? <Loader2 className="animate-spin" /> : <ArrowUp />}
          Ask
        </Button>
      </form>
      <div className="flex flex-wrap gap-2">
        {EXAMPLE_QUESTIONS.map((q) => (
          <button
            key={q}
            type="button"
            disabled={busy}
            onClick={() => submit(q)}
            className="bg-card text-muted-foreground hover:border-foreground/30 hover:text-foreground rounded-full border px-3 py-1 text-xs transition-colors disabled:opacity-50"
          >
            {q}
          </button>
        ))}
      </div>
    </div>
  );
}
