/**
 * Rate Limiter Unit Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  RateLimiter,
  RateLimitError,
  KeyedRateLimiter,
  AdaptiveRateLimiter,
} from '../rate-limiter';

describe('RateLimiter', () => {
  describe('sliding window', () => {
    it('should allow requests within limit', () => {
      const limiter = new RateLimiter({ maxRequests: 5, windowMs: 1000 });

      for (let i = 0; i < 5; i++) {
        const result = limiter.tryAcquire();
        expect(result.allowed).toBe(true);
        expect(result.remaining).toBe(4 - i);
      }

      limiter.dispose();
    });

    it('should block requests over limit', () => {
      const limiter = new RateLimiter({ maxRequests: 3, windowMs: 1000 });

      // Use up limit
      limiter.tryAcquire();
      limiter.tryAcquire();
      limiter.tryAcquire();

      const result = limiter.tryAcquire();
      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
      expect(result.retryAfterMs).toBeGreaterThan(0);

      limiter.dispose();
    });

    it('should allow requests after window expires', async () => {
      vi.useFakeTimers();
      const limiter = new RateLimiter({ maxRequests: 2, windowMs: 100 });

      limiter.tryAcquire();
      limiter.tryAcquire();
      expect(limiter.tryAcquire().allowed).toBe(false);

      // Advance past window
      await vi.advanceTimersByTimeAsync(150);

      expect(limiter.tryAcquire().allowed).toBe(true);

      vi.useRealTimers();
      limiter.dispose();
    });

    it('should check without consuming', () => {
      const limiter = new RateLimiter({ maxRequests: 2, windowMs: 1000 });

      expect(limiter.canAcquire()).toBe(true);
      expect(limiter.stats.windowCount).toBe(0);

      limiter.tryAcquire();
      expect(limiter.canAcquire()).toBe(true);
      expect(limiter.stats.windowCount).toBe(1);

      limiter.dispose();
    });
  });

  describe('token bucket', () => {
    it('should allow burst up to max tokens', () => {
      const limiter = new RateLimiter({
        maxRequests: 5,
        algorithm: 'token_bucket',
      });

      for (let i = 0; i < 5; i++) {
        expect(limiter.tryAcquire().allowed).toBe(true);
      }
      expect(limiter.tryAcquire().allowed).toBe(false);

      limiter.dispose();
    });

    it('should refill tokens over time', async () => {
      vi.useFakeTimers();
      const limiter = new RateLimiter({
        maxRequests: 5,
        algorithm: 'token_bucket',
        tokensPerInterval: 1,
        refillInterval: 100,
      });

      // Use all tokens
      for (let i = 0; i < 5; i++) {
        limiter.tryAcquire();
      }
      expect(limiter.tryAcquire().allowed).toBe(false);

      // Wait for refill
      await vi.advanceTimersByTimeAsync(100);
      expect(limiter.tryAcquire().allowed).toBe(true);

      vi.useRealTimers();
      limiter.dispose();
    });
  });

  describe('acquire with wait', () => {
    it('should wait when rate limited', async () => {
      vi.useFakeTimers();
      const limiter = new RateLimiter({ maxRequests: 1, windowMs: 100 });

      limiter.tryAcquire();

      const acquirePromise = limiter.acquire();
      await vi.advanceTimersByTimeAsync(150);
      await acquirePromise;

      // Should complete without error
      expect(limiter.stats.totalThrottled).toBe(1);

      vi.useRealTimers();
      limiter.dispose();
    });

    it('should run operation with rate limiting', async () => {
      const limiter = new RateLimiter({ maxRequests: 10, windowMs: 1000 });

      const result = await limiter.run(async () => 42);
      expect(result).toBe(42);

      limiter.dispose();
    });
  });

  describe('dynamic limit update', () => {
    it('should update limit dynamically', () => {
      const limiter = new RateLimiter({ maxRequests: 5, windowMs: 1000 });

      limiter.updateLimit(10);
      expect(limiter.stats.max).toBe(10);

      limiter.dispose();
    });

    it('should handle rate limit response headers', () => {
      const limiter = new RateLimiter({ maxRequests: 100, windowMs: 60000 });

      const retryAfter = limiter.handleRateLimitResponse({
        'retry-after': '5',
        'x-ratelimit-limit': '50',
        'x-ratelimit-remaining': '0',
      });

      expect(retryAfter).toBe(5000);
      expect(limiter.stats.max).toBe(50);

      limiter.dispose();
    });
  });

  describe('stats', () => {
    it('should track statistics', () => {
      const limiter = new RateLimiter({ maxRequests: 5, windowMs: 1000 });

      limiter.tryAcquire();
      limiter.tryAcquire();
      limiter.tryAcquire();

      const stats = limiter.stats;
      expect(stats.available).toBe(2);
      expect(stats.max).toBe(5);
      expect(stats.windowCount).toBe(3);
      expect(stats.totalRequests).toBe(3);

      limiter.dispose();
    });

    it('should track throttled requests', () => {
      const limiter = new RateLimiter({ maxRequests: 2, windowMs: 1000 });

      limiter.tryAcquire();
      limiter.tryAcquire();
      limiter.tryAcquire(); // Over limit

      expect(limiter.stats.totalThrottled).toBe(0); // tryAcquire doesn't count as throttled

      limiter.dispose();
    });
  });

  describe('reset', () => {
    it('should reset all state', () => {
      const limiter = new RateLimiter({ maxRequests: 3, windowMs: 1000 });

      limiter.tryAcquire();
      limiter.tryAcquire();
      limiter.tryAcquire();
      expect(limiter.tryAcquire().allowed).toBe(false);

      limiter.reset();
      expect(limiter.tryAcquire().allowed).toBe(true);
      expect(limiter.stats.totalRequests).toBe(1);

      limiter.dispose();
    });
  });
});

describe('KeyedRateLimiter', () => {
  it('should maintain separate limiters per key', () => {
    const limiters = new KeyedRateLimiter({ maxRequests: 2, windowMs: 1000 });

    limiters.tryAcquire('a');
    limiters.tryAcquire('a');
    expect(limiters.tryAcquire('a').allowed).toBe(false);

    // Key 'b' should still be available
    expect(limiters.tryAcquire('b').allowed).toBe(true);

    limiters.dispose();
  });

  it('should support per-key options', () => {
    const limiters = new KeyedRateLimiter({ maxRequests: 10, windowMs: 1000 });

    limiters.setKeyOptions('special', { maxRequests: 2, windowMs: 1000 });

    expect(limiters.getLimiter('normal').stats.max).toBe(10);
    expect(limiters.getLimiter('special').stats.max).toBe(2);

    limiters.dispose();
  });

  it('should update limit for specific key', () => {
    const limiters = new KeyedRateLimiter({ maxRequests: 10, windowMs: 1000 });

    limiters.updateLimit('a', 20);
    expect(limiters.getLimiter('a').stats.max).toBe(20);
    expect(limiters.getLimiter('b').stats.max).toBe(10);

    limiters.dispose();
  });

  it('should get stats for all keys', async () => {
    const limiters = new KeyedRateLimiter({ maxRequests: 10, windowMs: 1000 });

    await limiters.run('a', async () => 1);
    await limiters.run('b', async () => 2);
    await limiters.run('a', async () => 3);

    const stats = limiters.getAllStats();
    expect(stats.get('a')?.totalRequests).toBe(2);
    expect(stats.get('b')?.totalRequests).toBe(1);

    limiters.dispose();
  });

  it('should reset all limiters', () => {
    const limiters = new KeyedRateLimiter({ maxRequests: 2, windowMs: 1000 });

    limiters.tryAcquire('a');
    limiters.tryAcquire('a');
    limiters.tryAcquire('b');
    limiters.tryAcquire('b');

    expect(limiters.tryAcquire('a').allowed).toBe(false);
    expect(limiters.tryAcquire('b').allowed).toBe(false);

    limiters.resetAll();

    expect(limiters.tryAcquire('a').allowed).toBe(true);
    expect(limiters.tryAcquire('b').allowed).toBe(true);

    limiters.dispose();
  });
});

describe('AdaptiveRateLimiter', () => {
  it('should start with base rate', () => {
    const limiter = new AdaptiveRateLimiter({ maxRequests: 100, windowMs: 60000 });

    expect(limiter.getEffectiveRate()).toBe(100);

    limiter.dispose();
  });

  it('should decrease rate on rate limit', () => {
    const limiter = new AdaptiveRateLimiter({ maxRequests: 100, windowMs: 60000 });

    limiter.recordRateLimit();
    expect(limiter.getEffectiveRate()).toBeLessThan(100);

    limiter.dispose();
  });

  it('should increase rate after consecutive successes', () => {
    const limiter = new AdaptiveRateLimiter({
      maxRequests: 100,
      windowMs: 60000,
      successesForIncrease: 5,
    });

    // Record enough successes
    for (let i = 0; i < 5; i++) {
      limiter.recordSuccess();
    }

    expect(limiter.getEffectiveRate()).toBeGreaterThan(100);

    limiter.dispose();
  });

  it('should respect max multiplier', () => {
    const limiter = new AdaptiveRateLimiter({
      maxRequests: 100,
      windowMs: 60000,
      maxMultiplier: 1.5,
      successesForIncrease: 1,
    });

    // Record many successes
    for (let i = 0; i < 100; i++) {
      limiter.recordSuccess();
    }

    expect(limiter.getEffectiveRate()).toBeLessThanOrEqual(150);

    limiter.dispose();
  });

  it('should respect min requests', () => {
    const limiter = new AdaptiveRateLimiter({
      maxRequests: 100,
      windowMs: 60000,
      minRequests: 20,
    });

    // Record many rate limits
    for (let i = 0; i < 10; i++) {
      limiter.recordRateLimit();
    }

    expect(limiter.getEffectiveRate()).toBeGreaterThanOrEqual(20);

    limiter.dispose();
  });

  it('should reset consecutive successes on rate limit', () => {
    const limiter = new AdaptiveRateLimiter({
      maxRequests: 100,
      windowMs: 60000,
      successesForIncrease: 10,
    });

    // Record some successes but not enough
    for (let i = 0; i < 5; i++) {
      limiter.recordSuccess();
    }

    // Hit rate limit
    limiter.recordRateLimit();

    // Rate should decrease, not increase
    expect(limiter.getEffectiveRate()).toBeLessThan(100);

    limiter.dispose();
  });
});

describe('RateLimitError', () => {
  it('should contain retry after info', () => {
    const error = new RateLimitError('Rate limit exceeded', 5000);

    expect(error.name).toBe('RateLimitError');
    expect(error.message).toBe('Rate limit exceeded');
    expect(error.retryAfterMs).toBe(5000);
  });
});
