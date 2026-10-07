import { describe, expect, it } from 'vitest';
import { createRateLimiter } from '@/lib/rate-limit';

describe('createRateLimiter', () => {
  it('allows up to the limit inside a window, then blocks', () => {
    const limiter = createRateLimiter(3, 1000);
    expect(limiter.check('a', 0).allowed).toBe(true);
    expect(limiter.check('a', 10).allowed).toBe(true);
    expect(limiter.check('a', 20).allowed).toBe(true);
    const blocked = limiter.check('a', 30);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterMs).toBe(970);
  });

  it('keeps keys independent', () => {
    const limiter = createRateLimiter(1, 1000);
    expect(limiter.check('a', 0).allowed).toBe(true);
    expect(limiter.check('b', 0).allowed).toBe(true);
    expect(limiter.check('a', 1).allowed).toBe(false);
  });

  it('slides the window', () => {
    const limiter = createRateLimiter(2, 1000);
    limiter.check('a', 0);
    limiter.check('a', 500);
    expect(limiter.check('a', 900).allowed).toBe(false);
    expect(limiter.check('a', 1001).allowed).toBe(true);
    expect(limiter.check('a', 1400).allowed).toBe(false);
    expect(limiter.check('a', 1501).allowed).toBe(true);
  });
});
