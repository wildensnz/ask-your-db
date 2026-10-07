import Anthropic from '@anthropic-ai/sdk';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { ask } from '@/lib/agent';
import { createRateLimiter } from '@/lib/rate-limit';

export const maxDuration = 60;

const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60_000;

const limiter = createRateLimiter(RATE_LIMIT, RATE_WINDOW_MS);

const bodySchema = z.object({
  question: z.string().trim().min(3).max(500),
});

function clientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for');
  return forwarded?.split(',')[0]?.trim() || 'unknown';
}

export async function POST(req: Request) {
  const { allowed, retryAfterMs } = limiter.check(clientIp(req));
  if (!allowed) {
    return NextResponse.json(
      { error: 'Too many requests. Please wait a minute and try again.' },
      {
        status: 429,
        headers: { 'Retry-After': String(Math.ceil(retryAfterMs / 1000)) },
      },
    );
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Please ask a question between 3 and 500 characters.' },
      { status: 400 },
    );
  }

  try {
    const result = await ask(parsed.data.question);
    return NextResponse.json(result);
  } catch (error) {
    console.error('[api/ask]', error);
    if (error instanceof Anthropic.AuthenticationError) {
      return NextResponse.json(
        { error: 'The server is missing a valid model API key.' },
        { status: 500 },
      );
    }
    if (
      error instanceof Anthropic.BadRequestError &&
      /credit balance/i.test(error.message)
    ) {
      return NextResponse.json(
        { error: 'The model API account is out of credits.' },
        { status: 503 },
      );
    }
    if (error instanceof Anthropic.RateLimitError) {
      return NextResponse.json(
        { error: 'The model is busy right now. Please try again shortly.' },
        { status: 503 },
      );
    }
    return NextResponse.json(
      { error: 'Something went wrong while answering. Please try again.' },
      { status: 500 },
    );
  }
}
