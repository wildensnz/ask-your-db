'use client';

import { AlertTriangle, ChevronDown, ShieldX } from 'lucide-react';
import type { AskResult, Step } from '@/lib/agent';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { ResultChart } from '@/components/result-chart';
import { ResultTable } from '@/components/result-table';
import { SqlBlock } from '@/components/sql-block';

const OUTCOME_LABEL: Record<AskResult['outcome'], string> = {
  answered: 'Answered',
  direct_reply: 'Answered without SQL',
  max_iterations: 'Attempts exhausted',
  refused: 'Declined',
  truncated: 'Cut off',
};

function stepTitle(step: Step, index: number, total: number): string {
  const n = `Attempt ${index + 1} of ${total}`;
  if (step.status === 'rejected') return `${n}: rejected by the SQL guard`;
  if (step.status === 'error') return `${n}: query failed, then corrected`;
  return n;
}

function FailedStep({ step, title }: { step: Step; title: string }) {
  return (
    <details className="group rounded-lg border border-dashed">
      <summary className="text-muted-foreground flex cursor-pointer items-center gap-2 px-3 py-2 text-xs select-none">
        {step.status === 'rejected' ? (
          <ShieldX className="text-destructive size-3.5" />
        ) : (
          <AlertTriangle className="size-3.5 text-amber-600" />
        )}
        <span className="flex-1">{title}</span>
        <ChevronDown className="size-3.5 transition-transform group-open:rotate-180" />
      </summary>
      <div className="space-y-2 px-3 pb-3">
        <SqlBlock sql={step.sql} />
        <p className="text-destructive text-xs">{step.error}</p>
      </div>
    </details>
  );
}

export function AnswerCard({ result }: { result: AskResult }) {
  const okSteps = result.steps.filter((s) => s.status === 'ok');
  const final = okSteps[okSteps.length - 1];
  const failed = result.steps.filter((s) => s.status !== 'ok');
  const queries = result.steps.length;

  return (
    <Card className="gap-4">
      <CardHeader>
        <CardTitle className="text-base leading-snug">
          {result.question}
        </CardTitle>
        <CardDescription className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          <Badge
            variant={result.outcome === 'answered' ? 'secondary' : 'outline'}
          >
            {OUTCOME_LABEL[result.outcome]}
          </Badge>
          {final ? (
            <span>
              {final.result!.rowCount} rows in {final.result!.durationMs} ms
            </span>
          ) : null}
          {queries > 0 ? (
            <span>
              {queries} {queries === 1 ? 'query' : 'queries'}
            </span>
          ) : null}
          <span>{result.model}</span>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-[15px] leading-relaxed">{result.answer.summary}</p>

        {result.answer.chart && final?.result ? (
          <ResultChart chart={result.answer.chart} result={final.result} />
        ) : null}

        {final?.result ? <ResultTable result={final.result} /> : null}

        {final ? (
          <details className="group" open>
            <summary className="text-muted-foreground flex cursor-pointer items-center gap-2 text-xs font-medium select-none">
              <ChevronDown className="size-3.5 transition-transform group-open:rotate-180" />
              SQL
              <span className="font-normal">{final.purpose}</span>
            </summary>
            <div className="mt-2">
              <SqlBlock sql={final.sql} />
            </div>
          </details>
        ) : null}

        {failed.length > 0 ? (
          <div className="space-y-2">
            {failed.map((step) => (
              <FailedStep
                key={result.steps.indexOf(step)}
                step={step}
                title={stepTitle(
                  step,
                  result.steps.indexOf(step),
                  result.steps.length,
                )}
              />
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
