import type Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it, vi } from 'vitest';
import { MAX_ITERATIONS, ask, type CreateMessage } from '@/lib/agent';
import type { QueryResult } from '@/lib/db';

// ---------------------------------------------------------------------------
// Helpers to script model responses without the network.
// ---------------------------------------------------------------------------

let nextId = 0;

function message(
  content: Anthropic.ContentBlock[],
  stop_reason: Anthropic.Message['stop_reason'] = 'tool_use',
): Anthropic.Message {
  return {
    id: `msg_${++nextId}`,
    type: 'message',
    role: 'assistant',
    model: 'test-model',
    content,
    stop_reason,
    stop_sequence: null,
    usage: {
      input_tokens: 100,
      output_tokens: 20,
      cache_creation_input_tokens: null,
      cache_read_input_tokens: null,
      server_tool_use: null,
      service_tier: null,
    } as Anthropic.Usage,
  } as Anthropic.Message;
}

function text(t: string): Anthropic.TextBlock {
  return { type: 'text', text: t, citations: null };
}

function toolUse(name: string, input: unknown): Anthropic.ToolUseBlock {
  return {
    type: 'tool_use',
    id: `tu_${++nextId}`,
    name,
    input,
    caller: { type: 'direct' },
  };
}

const runSql = (sql: string, purpose = 'test') =>
  message([toolUse('run_sql', { sql, purpose })]);
const answer = (input: unknown) =>
  message([toolUse('answer', input)], 'end_turn');

/** Returns the scripted responses in order and records every request. */
function scriptedClient(responses: Anthropic.Message[]) {
  const calls: Anthropic.MessageCreateParamsNonStreaming[] = [];
  const createMessage: CreateMessage = (params) => {
    // Snapshot: the agent mutates its messages array between calls.
    calls.push({ ...params, messages: structuredClone(params.messages) });
    const next = responses.shift();
    if (!next) throw new Error('no more scripted responses');
    return Promise.resolve(next);
  };
  return { createMessage, calls };
}

const monthly: QueryResult = {
  columns: ['month', 'revenue'],
  rows: [
    { month: '2026-01', revenue: 1000 },
    { month: '2026-02', revenue: 1500 },
    { month: '2026-03', revenue: 1250 },
  ],
  rowCount: 3,
  durationMs: 12,
};

/** Tool results carry strings in this app; make that explicit for assertions. */
function contentText(block: Anthropic.ToolResultBlockParam): string {
  return typeof block.content === 'string'
    ? block.content
    : JSON.stringify(block.content);
}

/** Finds the tool_result blocks sent back in a given request. */
function toolResultsIn(params: Anthropic.MessageCreateParamsNonStreaming) {
  const last = [...params.messages]
    .reverse()
    .find((m) => m.role === 'user' && Array.isArray(m.content));
  const blocks = last && Array.isArray(last.content) ? last.content : [];
  return blocks.filter(
    (b): b is Anthropic.ToolResultBlockParam => b.type === 'tool_result',
  );
}

// ---------------------------------------------------------------------------

describe('ask: happy path', () => {
  it('runs the query through the guard and returns the answer with a chart', async () => {
    const { createMessage, calls } = scriptedClient([
      runSql('SELECT month, revenue FROM sales', 'monthly revenue'),
      answer({
        summary: 'Revenue peaked in February.',
        chart: {
          type: 'line',
          xKey: 'month',
          yKey: 'revenue',
          title: 'Revenue',
        },
      }),
    ]);
    const runQuery = vi.fn().mockResolvedValue(monthly);

    const result = await ask('Monthly revenue?', { createMessage, runQuery });

    expect(result.outcome).toBe('answered');
    expect(result.answer.summary).toBe('Revenue peaked in February.');
    expect(result.answer.chart?.type).toBe('line');
    expect(result.iterations).toBe(2);
    expect(result.steps).toHaveLength(1);
    expect(result.steps[0]).toMatchObject({
      status: 'ok',
      purpose: 'monthly revenue',
      sql: 'SELECT month, revenue FROM sales\nLIMIT 200',
    });
    // The guarded SQL (with LIMIT) is what actually ran.
    expect(runQuery).toHaveBeenCalledWith(
      'SELECT month, revenue FROM sales\nLIMIT 200',
    );
    // The model saw the rows as a tool result.
    const sent = toolResultsIn(calls[1]!);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.is_error).toBeUndefined();
    expect(contentText(sent[0]!)).toContain('"rowCount":3');
    // Tokens are accounted for.
    expect(result.usage).toEqual({ inputTokens: 200, outputTokens: 40 });
  });

  it('sends the system prompt with cache_control and both tools', async () => {
    const { createMessage, calls } = scriptedClient([
      answer({ summary: 'No data needed.' }),
    ]);
    await ask('hi', { createMessage, runQuery: vi.fn() });
    const params = calls[0]!;
    expect(params.model).toBe('claude-sonnet-5-5');
    expect(params.max_tokens).toBeLessThanOrEqual(4096);
    expect(params.tools?.map((t) => ('name' in t ? t.name : ''))).toEqual([
      'run_sql',
      'answer',
    ]);
    const system = params.system as Anthropic.TextBlockParam[];
    expect(system[0]!.cache_control).toEqual({ type: 'ephemeral' });
    expect(system[0]!.text).toContain('orders(');
  });

  it('honours a model override', async () => {
    const { createMessage, calls } = scriptedClient([
      answer({ summary: 'ok' }),
    ]);
    await ask('hi', { createMessage, runQuery: vi.fn(), model: 'other-model' });
    expect(calls[0]!.model).toBe('other-model');
  });
});

describe('ask: recovery', () => {
  it('feeds a database error back and lets the model retry', async () => {
    const { createMessage, calls } = scriptedClient([
      runSql('SELECT bad FROM orders'),
      runSql('SELECT total FROM orders'),
      answer({ summary: 'Fixed.' }),
    ]);
    const runQuery = vi
      .fn()
      .mockRejectedValueOnce(new Error('column "bad" does not exist'))
      .mockResolvedValueOnce({
        columns: ['total'],
        rows: [{ total: 1 }],
        rowCount: 1,
        durationMs: 1,
      });

    const result = await ask('q', { createMessage, runQuery });

    expect(result.outcome).toBe('answered');
    expect(result.steps.map((s) => s.status)).toEqual(['error', 'ok']);
    expect(result.steps[0]!.error).toContain('column "bad"');
    const sent = toolResultsIn(calls[1]!);
    expect(sent[0]!.is_error).toBe(true);
    expect(contentText(sent[0]!)).toContain('column "bad" does not exist');
  });

  it('rejects unsafe SQL without touching the database', async () => {
    const { createMessage, calls } = scriptedClient([
      runSql('DROP TABLE orders', 'drop it'),
      answer({ summary: 'I can only read data.' }),
    ]);
    const runQuery = vi.fn();

    const result = await ask('borra la tabla orders', {
      createMessage,
      runQuery,
    });

    expect(runQuery).not.toHaveBeenCalled();
    expect(result.steps[0]).toMatchObject({
      status: 'rejected',
      sql: 'DROP TABLE orders',
    });
    expect(result.steps[0]!.error).toMatch(/SELECT/);
    const sent = toolResultsIn(calls[1]!);
    expect(sent[0]!.is_error).toBe(true);
    expect(contentText(sent[0]!)).toMatch(/rejected by the safety guard/);
    expect(result.answer.summary).toBe('I can only read data.');
  });

  it('rejects malformed tool input and keeps going', async () => {
    const { createMessage, calls } = scriptedClient([
      message([toolUse('run_sql', { sql: 42 })]),
      answer({ summary: 'done' }),
    ]);
    const result = await ask('q', { createMessage, runQuery: vi.fn() });
    expect(result.outcome).toBe('answered');
    expect(result.steps).toHaveLength(0);
    expect(contentText(toolResultsIn(calls[1]!)[0]!)).toMatch(
      /Invalid run_sql input/,
    );
  });

  it('drops a chart whose keys do not match the result', async () => {
    const { createMessage } = scriptedClient([
      runSql('SELECT month, revenue FROM sales'),
      answer({
        summary: 's',
        chart: { type: 'bar', xKey: 'nope', yKey: 'revenue', title: 't' },
      }),
    ]);
    const result = await ask('q', {
      createMessage,
      runQuery: vi.fn().mockResolvedValue(monthly),
    });
    expect(result.answer.chart).toBeUndefined();
  });
});

describe('ask: termination', () => {
  it('stops after MAX_ITERATIONS and warns the model before the last call', async () => {
    const responses = Array.from({ length: MAX_ITERATIONS }, () =>
      runSql('SELECT 1'),
    );
    const { createMessage, calls } = scriptedClient(responses);
    const runQuery = vi.fn().mockResolvedValue({
      columns: ['?column?'],
      rows: [{ '?column?': 1 }],
      rowCount: 1,
      durationMs: 1,
    });

    const result = await ask('loop', { createMessage, runQuery });

    expect(calls).toHaveLength(MAX_ITERATIONS);
    expect(result.outcome).toBe('max_iterations');
    expect(result.iterations).toBe(MAX_ITERATIONS);
    expect(result.steps).toHaveLength(MAX_ITERATIONS);
    expect(result.answer.summary).toMatch(/ran out of attempts/);
    // The request before the final call carries the "last tool call" note.
    const lastRequest = calls[MAX_ITERATIONS - 1]!;
    const lastUser = lastRequest.messages[lastRequest.messages.length - 1]!;
    const blocks = lastUser.content as Anthropic.ContentBlockParam[];
    expect(blocks.some((b) => b.type === 'text')).toBe(true);
    expect(JSON.stringify(blocks)).toMatch(/last tool call/);
  });

  it('returns prose when the model answers without tools', async () => {
    const { createMessage } = scriptedClient([
      message([text('That information is not in the database.')], 'end_turn'),
    ]);
    const result = await ask('phone of the manager?', {
      createMessage,
      runQuery: vi.fn(),
    });
    expect(result.outcome).toBe('direct_reply');
    expect(result.answer.summary).toBe(
      'That information is not in the database.',
    );
    expect(result.steps).toHaveLength(0);
  });

  it('handles a refusal stop reason', async () => {
    const { createMessage } = scriptedClient([message([], 'refusal')]);
    const result = await ask('q', { createMessage, runQuery: vi.fn() });
    expect(result.outcome).toBe('refused');
  });

  it('handles a truncated response', async () => {
    const { createMessage } = scriptedClient([
      message(
        [toolUse('run_sql', { sql: 'SELECT', purpose: 'x' })],
        'max_tokens',
      ),
    ]);
    const runQuery = vi.fn();
    const result = await ask('q', { createMessage, runQuery });
    expect(result.outcome).toBe('truncated');
    expect(runQuery).not.toHaveBeenCalled();
  });
});
