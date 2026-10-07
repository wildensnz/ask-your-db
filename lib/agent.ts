/**
 * The agent loop: question in, SQL steps + final answer out.
 *
 * Bounded by design: at most MAX_ITERATIONS model calls, a small max_tokens,
 * every query through the SQL guard and the read-only executor. The Anthropic
 * client and the query runner are injectable so the loop is unit-testable
 * without network access.
 */

import Anthropic from '@anthropic-ai/sdk';
import { runReadOnlyQuery, type QueryResult } from './db';
import { SCHEMA_PROMPT } from './schema-prompt';
import { guardSql } from './sql-guard';
import { TOOLS, answerInput, runSqlInput, type ChartSpec } from './tools';

export const DEFAULT_MODEL = 'claude-sonnet-5-5';
export const MAX_ITERATIONS = 4;
const MAX_TOKENS = 2048;
/** Rows echoed back to the model; the UI still gets up to MAX_ROWS. */
const ROWS_FOR_MODEL = 30;

export interface Step {
  sql: string;
  purpose: string;
  status: 'ok' | 'error' | 'rejected';
  result?: QueryResult;
  error?: string;
}

export interface Answer {
  summary: string;
  chart?: ChartSpec;
}

export type Outcome =
  'answered' | 'direct_reply' | 'max_iterations' | 'refused' | 'truncated';

export interface AskResult {
  question: string;
  steps: Step[];
  answer: Answer;
  outcome: Outcome;
  model: string;
  iterations: number;
  usage: { inputTokens: number; outputTokens: number };
}

export type CreateMessage = (
  params: Anthropic.MessageCreateParamsNonStreaming,
) => Promise<Anthropic.Message>;

export interface AgentDeps {
  createMessage?: CreateMessage;
  runQuery?: (sql: string) => Promise<QueryResult>;
  model?: string;
  maxIterations?: number;
}

export const SYSTEM_PROMPT = `You are "Ask Your DB", a data analyst for a small distributor. You answer business questions by querying a PostgreSQL database with the run_sql tool, then reply with the answer tool.

How to work:
- Decide which tables answer the question, then call run_sql with ONE SELECT query. Prefer a single well-aggregated query. You have at most ${MAX_ITERATIONS} tool calls in total, including the final answer, so do not explore table by table.
- Read the result. If the query fails, fix it and try again. If the result does not answer the question, refine the query.
- Finish by calling answer with a 1-3 sentence summary in the same language as the question, quoting the key numbers. Format money as "RD$ 1,248,500.00". When relevant, say which order statuses you counted.
- Add a chart only when the final result is a series: one category or date column (xKey) and one numeric column (yKey), between 2 and 60 rows. Keys must match the result column names exactly.
- Never state numbers you did not get from a query. If the question cannot be answered with this schema (for example phone numbers, costs, stock levels, employees' salaries), call answer right away and say what is missing.
- You cannot modify data. If asked to insert, update, delete or drop anything, do not try; call answer and explain that this assistant is read-only.
- Use clear snake_case column aliases (month, revenue, units, customer). Round money to 2 decimals. Order results meaningfully and keep them small.

${SCHEMA_PROMPT}`;

let defaultClient: Anthropic | undefined;

const defaultCreateMessage: CreateMessage = (params) => {
  defaultClient ??= new Anthropic();
  return defaultClient.messages.create(params);
};

function textOf(content: Anthropic.ContentBlock[]): string {
  return content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text.trim())
    .filter(Boolean)
    .join('\n');
}

/** Keep the chart only if its keys exist and yKey is numeric. */
function validateChart(
  chart: ChartSpec | undefined,
  last: QueryResult | undefined,
): ChartSpec | undefined {
  if (!chart || !last) return undefined;
  if (
    !last.columns.includes(chart.xKey) ||
    !last.columns.includes(chart.yKey)
  ) {
    return undefined;
  }
  if (last.rows.length < 2 || last.rows.length > 60) return undefined;
  const numeric = last.rows.some((r) => typeof r[chart.yKey] === 'number');
  return numeric ? chart : undefined;
}

function resultForModel(result: QueryResult): string {
  return JSON.stringify({
    columns: result.columns,
    rowCount: result.rowCount,
    rows: result.rows.slice(0, ROWS_FOR_MODEL),
    truncated: result.rowCount > ROWS_FOR_MODEL,
  });
}

export async function ask(
  question: string,
  deps: AgentDeps = {},
): Promise<AskResult> {
  const createMessage = deps.createMessage ?? defaultCreateMessage;
  const runQuery = deps.runQuery ?? runReadOnlyQuery;
  const model = deps.model ?? process.env.ANTHROPIC_MODEL ?? DEFAULT_MODEL;
  const maxIterations = deps.maxIterations ?? MAX_ITERATIONS;

  const messages: Anthropic.MessageParam[] = [
    { role: 'user', content: question },
  ];
  const steps: Step[] = [];
  const usage = { inputTokens: 0, outputTokens: 0 };
  let lastOk: QueryResult | undefined;

  const finish = (
    outcome: Outcome,
    answer: Answer,
    iterations: number,
  ): AskResult => ({
    question,
    steps,
    answer,
    outcome,
    model,
    iterations,
    usage,
  });

  for (let iteration = 1; iteration <= maxIterations; iteration++) {
    const response = await createMessage({
      model,
      max_tokens: MAX_TOKENS,
      system: [
        {
          type: 'text',
          text: SYSTEM_PROMPT,
          cache_control: { type: 'ephemeral' },
        },
      ],
      tools: TOOLS,
      messages,
    });
    usage.inputTokens += response.usage.input_tokens;
    usage.outputTokens += response.usage.output_tokens;

    if (response.stop_reason === 'refusal') {
      return finish(
        'refused',
        { summary: 'The model declined to answer this request.' },
        iteration,
      );
    }
    if (response.stop_reason === 'max_tokens') {
      return finish(
        'truncated',
        {
          summary:
            'The answer was cut off before it was complete. Please try a more specific question.',
        },
        iteration,
      );
    }

    const toolUses = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
    );

    if (toolUses.length === 0) {
      // The model replied in prose (e.g. a clarification or an honest "no").
      const text = textOf(response.content);
      return finish(
        'direct_reply',
        {
          summary: text || 'I could not produce an answer for this question.',
        },
        iteration,
      );
    }

    messages.push({ role: 'assistant', content: response.content });
    const toolResults: Anthropic.ToolResultBlockParam[] = [];

    for (const tool of toolUses) {
      if (tool.name === 'answer') {
        const parsed = answerInput.safeParse(tool.input);
        if (parsed.success) {
          return finish(
            'answered',
            {
              summary: parsed.data.summary,
              chart: validateChart(parsed.data.chart, lastOk),
            },
            iteration,
          );
        }
        toolResults.push({
          type: 'tool_result',
          tool_use_id: tool.id,
          is_error: true,
          content: `Invalid answer input: ${parsed.error.message}`,
        });
        continue;
      }

      if (tool.name === 'run_sql') {
        const parsed = runSqlInput.safeParse(tool.input);
        if (!parsed.success) {
          toolResults.push({
            type: 'tool_result',
            tool_use_id: tool.id,
            is_error: true,
            content: `Invalid run_sql input: ${parsed.error.message}`,
          });
          continue;
        }
        const { sql, purpose } = parsed.data;
        const guard = guardSql(sql);
        if (!guard.ok) {
          steps.push({ sql, purpose, status: 'rejected', error: guard.reason });
          toolResults.push({
            type: 'tool_result',
            tool_use_id: tool.id,
            is_error: true,
            content: `Query rejected by the safety guard: ${guard.reason}. Only a single read-only SELECT statement is allowed.`,
          });
          continue;
        }
        try {
          const result = await runQuery(guard.sql);
          lastOk = result;
          steps.push({ sql: guard.sql, purpose, status: 'ok', result });
          toolResults.push({
            type: 'tool_result',
            tool_use_id: tool.id,
            content: resultForModel(result),
          });
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          steps.push({
            sql: guard.sql,
            purpose,
            status: 'error',
            error: message,
          });
          toolResults.push({
            type: 'tool_result',
            tool_use_id: tool.id,
            is_error: true,
            content: `Query failed: ${message}`,
          });
        }
        continue;
      }

      toolResults.push({
        type: 'tool_result',
        tool_use_id: tool.id,
        is_error: true,
        content: `Unknown tool "${tool.name}".`,
      });
    }

    const content: Anthropic.ContentBlockParam[] = [...toolResults];
    if (iteration === maxIterations - 1) {
      content.push({
        type: 'text',
        text: 'This is your last tool call. Call answer now with what you know; if you could not get the data, say so honestly.',
      });
    }
    messages.push({ role: 'user', content });
  }

  return finish(
    'max_iterations',
    {
      summary: lastOk
        ? 'I ran out of attempts before writing a final summary. The last query result is shown below.'
        : 'I could not get a working query within the allowed attempts. Please try rephrasing the question.',
    },
    maxIterations,
  );
}
