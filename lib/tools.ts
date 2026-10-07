/**
 * Tool definitions for the agent: zod schemas (used to validate what the
 * model sends back) and the matching JSON Schema handed to the API.
 */

import type Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';

export const runSqlInput = z.object({
  sql: z.string().min(1).describe('A single PostgreSQL SELECT statement.'),
  purpose: z
    .string()
    .min(1)
    .max(200)
    .describe('One short sentence: what this query is meant to find out.'),
});
export type RunSqlInput = z.infer<typeof runSqlInput>;

export const chartSpec = z.object({
  type: z.enum(['bar', 'line']),
  xKey: z
    .string()
    .describe('Column to use for the x axis (categories or dates).'),
  yKey: z.string().describe('Numeric column to plot.'),
  title: z.string().max(80),
});
export type ChartSpec = z.infer<typeof chartSpec>;

export const answerInput = z.object({
  summary: z
    .string()
    .min(1)
    .max(1200)
    .describe(
      'The answer in plain language, 1-3 sentences, with the key numbers. ' +
        'Same language as the question.',
    ),
  chart: chartSpec
    .optional()
    .describe(
      'Optional. Only when the last successful query has one category/date ' +
        'column and one numeric column worth plotting. Keys must match the ' +
        "result columns exactly. Use 'line' for time series, 'bar' otherwise.",
    ),
});
export type AnswerInput = z.infer<typeof answerInput>;

function toInputSchema(schema: z.ZodObject): Anthropic.Tool['input_schema'] {
  const json = z.toJSONSchema(schema, { target: 'draft-7' }) as Record<
    string,
    unknown
  >;
  delete json.$schema;
  return json as Anthropic.Tool['input_schema'];
}

export const TOOLS: Anthropic.Tool[] = [
  {
    name: 'run_sql',
    description:
      'Run one read-only SELECT query against the database and get back the ' +
      'columns and the first rows. The query is validated first: anything ' +
      'other than a single SELECT/WITH statement is rejected, and results are ' +
      'capped at 200 rows. If it fails you get the error message and may fix ' +
      'the query and try again.',
    input_schema: toInputSchema(runSqlInput),
  },
  {
    name: 'answer',
    description:
      'Finish with the final answer for the user. Call this exactly once, ' +
      'after your queries, or immediately if the question cannot be answered ' +
      'from this database (then say so honestly in the summary).',
    input_schema: toInputSchema(answerInput),
  },
];
