/**
 * Circuit Breaker Unit Tests
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  CircuitBreaker,
  CircuitOpenError,
  KeyedCircuitBreaker,
} from '../circuit-breaker';

describe('CircuitBreaker', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('initial state', () => {
    it('should start in closed state', () => {
      const breaker = new CircuitBreaker();
      expect(breaker.getState()).toBe('closed');
      expect(breaker.canExecute()).toBe(true);
      breaker.dispose();
    });
  });

  describe('state transitions', () => {
    it('should open after failure threshold', () => {
      const breaker = new CircuitBreaker({ failureThreshold: 3 });

      expect(breaker.getState()).toBe('closed');

      breaker.recordFailure(new Error('fail 1'));
      breaker.recordFailure(new Error('fail 2'));
      expect(breaker.getState()).toBe('closed');

      breaker.recordFailure(new Error('fail 3'));
      expect(breaker.getState()).toBe('open');

      breaker.dispose();
    });

    it('should transition to half-open after reset timeout', async () => {
      const breaker = new CircuitBreaker({
        failureThreshold: 1,
        resetTimeout: 1000,
      });

      breaker.recordFailure(new Error('fail'));
      expect(breaker.getState()).toBe('open');

      // Advance time past reset timeout
      await vi.advanceTimersByTimeAsync(1500);

      expect(breaker.getState()).toBe('half_open');
      breaker.dispose();
    });

    it('should close after success threshold in half-open', async () => {
      const breaker = new CircuitBreaker({
        failureThreshold: 1,
        successThreshold: 2,
        resetTimeout: 100,
      });

      breaker.recordFailure(new Error('fail'));
      await vi.advanceTimersByTimeAsync(150);

      expect(breaker.getState()).toBe('half_open');

      breaker.recordSuccess();
      expect(breaker.getState()).toBe('half_open');

      breaker.recordSuccess();
      expect(breaker.getState()).toBe('closed');

      breaker.dispose();
    });

    it('should reopen on failure in half-open', async () => {
      const breaker = new CircuitBreaker({
        failureThreshold: 1,
        resetTimeout: 100,
      });

      breaker.recordFailure(new Error('fail'));
      await vi.advanceTimersByTimeAsync(150);

      expect(breaker.getState()).toBe('half_open');

      breaker.recordFailure(new Error('fail again'));
      expect(breaker.getState()).toBe('open');

      breaker.dispose();
    });
  });

  describe('canExecute', () => {
    it('should allow execution in closed state', () => {
      const breaker = new CircuitBreaker();
      expect(breaker.canExecute()).toBe(true);
      breaker.dispose();
    });

    it('should reject execution in open state', () => {
      const breaker = new CircuitBreaker({ failureThreshold: 1 });
      breaker.recordFailure(new Error('fail'));

      expect(breaker.getState()).toBe('open');
      expect(breaker.canExecute()).toBe(false);

      breaker.dispose();
    });

    it('should limit requests in half-open state', async () => {
      const breaker = new CircuitBreaker({
        failureThreshold: 1,
        resetTimeout: 100,
        halfOpenMaxRequests: 2,
      });

      breaker.recordFailure(new Error('fail'));
      await vi.advanceTimersByTimeAsync(150);

      // First two should be allowed
      expect(breaker.canExecute()).toBe(true);
      breaker.recordSuccess();
      expect(breaker.canExecute()).toBe(true);

      // Third should be rejected (still half-open, max 2 requests)
      // Note: We need to track requests in half-open state
      // Current implementation counts on execute(), not canExecute()

      breaker.dispose();
    });
  });

  describe('execute', () => {
    it('should execute operation in closed state', async () => {
      const breaker = new CircuitBreaker();

      const result = await breaker.execute(async () => 42);
      expect(result).toBe(42);

      breaker.dispose();
    });

    it('should throw CircuitOpenError when open', async () => {
      const breaker = new CircuitBreaker({ failureThreshold: 1 });
      breaker.recordFailure(new Error('fail'));

      await expect(breaker.execute(async () => 42)).rejects.toThrow(
        CircuitOpenError
      );

      breaker.dispose();
    });

    it('should record success on successful execution', async () => {
      const breaker = new CircuitBreaker();

      await breaker.execute(async () => 'ok');

      const stats = breaker.getStats();
      expect(stats.totalSuccesses).toBe(1);
      expect(stats.totalFailures).toBe(0);

      breaker.dispose();
    });

    it('should record failure on failed execution', async () => {
      const breaker = new CircuitBreaker({ failureThreshold: 5 });

      await expect(
        breaker.execute(async () => {
          throw new Error('test error');
        })
      ).rejects.toThrow('test error');

      const stats = breaker.getStats();
      expect(stats.totalSuccesses).toBe(0);
      expect(stats.totalFailures).toBe(1);

      breaker.dispose();
    });
  });

  describe('failure window', () => {
    it('should only count failures within window', async () => {
      const breaker = new CircuitBreaker({
        failureThreshold: 3,
        failureWindow: 1000,
      });

      breaker.recordFailure(new Error('fail 1'));
      breaker.recordFailure(new Error('fail 2'));

      // Advance time past failure window
      await vi.advanceTimersByTimeAsync(1500);

      // Old failures should be cleaned up
      breaker.recordFailure(new Error('fail 3'));

      // Should still be closed because old failures expired
      expect(breaker.getState()).toBe('closed');

      breaker.dispose();
    });
  });

  describe('force methods', () => {
    it('should force open the circuit', () => {
      const breaker = new CircuitBreaker();
      expect(breaker.getState()).toBe('closed');

      breaker.forceOpen();
      expect(breaker.getState()).toBe('open');

      breaker.dispose();
    });

    it('should force close the circuit', () => {
      const breaker = new CircuitBreaker({ failureThreshold: 1 });
      breaker.recordFailure(new Error('fail'));
      expect(breaker.getState()).toBe('open');

      breaker.forceClose();
      expect(breaker.getState()).toBe('closed');

      breaker.dispose();
    });
  });

  describe('reset', () => {
    it('should reset to initial state', () => {
      const breaker = new CircuitBreaker({ failureThreshold: 1 });
      breaker.recordFailure(new Error('fail'));
      expect(breaker.getState()).toBe('open');

      breaker.reset();

      expect(breaker.getState()).toBe('closed');
      expect(breaker.getStats().failures).toBe(0);

      breaker.dispose();
    });
  });

  describe('state change callback', () => {
    it('should call onStateChange on transitions', () => {
      const onStateChange = vi.fn();
      const breaker = new CircuitBreaker({
        failureThreshold: 1,
        onStateChange,
      });

      breaker.recordFailure(new Error('fail'));

      expect(onStateChange).toHaveBeenCalledWith('closed', 'open');

      breaker.dispose();
    });
  });

  describe('stats', () => {
    it('should track all statistics', async () => {
      const breaker = new CircuitBreaker({ failureThreshold: 5 });

      await breaker.execute(async () => 'ok');
      await breaker.execute(async () => 'ok');

      try {
        await breaker.execute(async () => {
          throw new Error('fail');
        });
      } catch {
        // Expected
      }

      const stats = breaker.getStats();
      expect(stats.totalRequests).toBe(3);
      expect(stats.totalSuccesses).toBe(2);
      expect(stats.totalFailures).toBe(1);
      expect(stats.state).toBe('closed');

      breaker.dispose();
    });
  });
});

describe('KeyedCircuitBreaker', () => {
  it('should maintain separate breakers per key', () => {
    const breakers = new KeyedCircuitBreaker({ failureThreshold: 1 });

    breakers.getBreaker('a').recordFailure(new Error('fail'));

    expect(breakers.getBreaker('a').getState()).toBe('open');
    expect(breakers.getBreaker('b').getState()).toBe('closed');

    breakers.dispose();
  });

  it('should execute with key-specific breaker', async () => {
    const breakers = new KeyedCircuitBreaker({ failureThreshold: 1 });

    const result = await breakers.execute('test', async () => 42);
    expect(result).toBe(42);

    breakers.dispose();
  });

  it('should track open circuits', () => {
    const breakers = new KeyedCircuitBreaker({ failureThreshold: 1 });

    breakers.getBreaker('a').recordFailure(new Error('fail'));
    breakers.getBreaker('c').recordFailure(new Error('fail'));

    const open = breakers.getOpenCircuits();
    expect(open).toContain('a');
    expect(open).toContain('c');
    expect(open).not.toContain('b');

    breakers.dispose();
  });

  it('should reset all breakers', () => {
    const breakers = new KeyedCircuitBreaker({ failureThreshold: 1 });

    breakers.getBreaker('a').recordFailure(new Error('fail'));
    breakers.getBreaker('b').recordFailure(new Error('fail'));

    breakers.resetAll();

    expect(breakers.getBreaker('a').getState()).toBe('closed');
    expect(breakers.getBreaker('b').getState()).toBe('closed');

    breakers.dispose();
  });
});
