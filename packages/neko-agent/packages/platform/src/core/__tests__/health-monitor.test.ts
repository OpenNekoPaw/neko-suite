/**
 * HealthMonitor Tests
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  HealthMonitor,
  type HealthStatus,
  type HealthChecker,
  createHttpHealthChecker,
} from '../health-monitor';

describe('HealthMonitor', () => {
  let monitor: HealthMonitor;
  let mockChecker: HealthChecker;

  beforeEach(() => {
    vi.useFakeTimers();
    mockChecker = vi.fn().mockImplementation((id: string) => Promise.resolve({
      id,
      available: true,
      lastChecked: new Date(),
      consecutiveFailures: 0,
    } satisfies HealthStatus));

    monitor = new HealthMonitor(mockChecker, {
      checkIntervalMs: 1000,
      maxConsecutiveFailures: 3,
    });
  });

  afterEach(() => {
    monitor.dispose();
    vi.useRealTimers();
  });

  describe('checkHealth', () => {
    it('should check health and return status', async () => {
      const status = await monitor.checkHealth('provider-1');
      expect(status.id).toBe('provider-1');
      expect(status.available).toBe(true);
    });

    it('should cache health status', async () => {
      await monitor.checkHealth('provider-1');
      const status = monitor.getStatus('provider-1');
      expect(status).toBeDefined();
      expect(status?.available).toBe(true);
    });

    it('should track consecutive failures', async () => {
      const failingChecker: HealthChecker = vi.fn().mockResolvedValue({
        id: 'failing',
        available: false,
        lastChecked: new Date(),
        consecutiveFailures: 0,
      });
      const failMonitor = new HealthMonitor(failingChecker);

      await failMonitor.checkHealth('provider-1');
      let status = failMonitor.getStatus('provider-1');
      expect(status?.consecutiveFailures).toBe(1);

      await failMonitor.checkHealth('provider-1');
      status = failMonitor.getStatus('provider-1');
      expect(status?.consecutiveFailures).toBe(2);

      failMonitor.dispose();
    });
  });

  describe('isAvailable', () => {
    it('should return true for unknown providers (defaultHealthy)', () => {
      expect(monitor.isAvailable('unknown')).toBe(true);
    });

    it('should return true for available providers', async () => {
      await monitor.checkHealth('provider-1');
      expect(monitor.isAvailable('provider-1')).toBe(true);
    });

    it('should return false for unavailable providers', async () => {
      const failingChecker: HealthChecker = vi.fn().mockResolvedValue({
        id: 'failing',
        available: false,
        lastChecked: new Date(),
        consecutiveFailures: 0,
      });
      const failMonitor = new HealthMonitor(failingChecker);

      await failMonitor.checkHealth('provider-1');
      expect(failMonitor.isAvailable('provider-1')).toBe(false);

      failMonitor.dispose();
    });
  });

  describe('getHealthMap', () => {
    it('should return map of all health statuses', async () => {
      await monitor.checkHealth('provider-1');
      await monitor.checkHealth('provider-2');

      const healthMap = monitor.getHealthMap();
      expect(healthMap.size).toBe(2);
      expect(healthMap.get('provider-1')).toBe(true);
      expect(healthMap.get('provider-2')).toBe(true);
    });
  });

  describe('markAvailable/markUnavailable', () => {
    it('should mark provider as available', () => {
      monitor.markAvailable('provider-1', 100);
      expect(monitor.isAvailable('provider-1')).toBe(true);

      const status = monitor.getStatus('provider-1');
      expect(status?.latency).toBe(100);
      expect(status?.consecutiveFailures).toBe(0);
    });

    it('should mark provider as unavailable', () => {
      monitor.markUnavailable('provider-1', 'Connection failed');
      expect(monitor.isAvailable('provider-1')).toBe(false);

      const status = monitor.getStatus('provider-1');
      expect(status?.error).toBe('Connection failed');
    });
  });

  describe('periodic checks', () => {
    it('should start periodic checks', async () => {
      monitor.startPeriodicCheck(['provider-1', 'provider-2']);

      // Initial check is called immediately
      await vi.advanceTimersByTimeAsync(0);
      expect(mockChecker).toHaveBeenCalled();
    });

    it('should stop periodic checks', async () => {
      monitor.startPeriodicCheck(['provider-1']);

      // Initial check
      await vi.advanceTimersByTimeAsync(0);
      const callCount = (mockChecker as ReturnType<typeof vi.fn>).mock.calls.length;

      monitor.stopPeriodicCheck();

      await vi.advanceTimersByTimeAsync(5000);

      // Call count should not increase after stopping
      expect((mockChecker as ReturnType<typeof vi.fn>).mock.calls.length).toBe(
        callCount
      );
    });
  });

  describe('status change listeners', () => {
    it('should notify listeners on status change', async () => {
      const listener = vi.fn();
      monitor.onStatusChange(listener);

      await monitor.checkHealth('provider-1');

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'provider-1',
          available: true,
        })
      );
    });

    it('should unsubscribe listener', async () => {
      const listener = vi.fn();
      const unsubscribe = monitor.onStatusChange(listener);

      unsubscribe();
      await monitor.checkHealth('provider-1');

      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('createHttpHealthChecker', () => {
    it('should create a health checker function', () => {
      const checker = createHttpHealthChecker((id) => `https://api.example.com/${id}/health`);
      expect(typeof checker).toBe('function');
    });

    it('should return unavailable for unconfigured URLs', async () => {
      const checker = createHttpHealthChecker(() => undefined);
      const status = await checker('unknown');
      expect(status.available).toBe(false);
      expect(status.error).toBe('No URL configured');
    });
  });
});
