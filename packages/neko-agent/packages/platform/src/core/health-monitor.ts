/**
 * Health Monitor - Unified health check service
 *
 * Provides centralized health monitoring for providers and workflows.
 * Used by both routing strategies and group managers.
 */

/**
 * Health status for a provider or workflow
 */
export interface HealthStatus {
  /** Provider/workflow ID */
  id: string;
  /** Whether the target is available */
  available: boolean;
  /** Last measured latency in ms */
  latency?: number;
  /** Last check timestamp */
  lastChecked: Date;
  /** Error message if unavailable */
  error?: string;
  /** Number of consecutive failures */
  consecutiveFailures: number;
}

/**
 * Health check function type
 */
export type HealthChecker = (id: string) => Promise<HealthStatus>;

/**
 * Health change listener
 */
export type HealthChangeListener = (status: HealthStatus) => void;

/**
 * Health monitor configuration
 */
export interface HealthMonitorConfig {
  /** Check interval in ms (default: 60000) */
  checkIntervalMs?: number;
  /** Timeout for health checks in ms (default: 5000) */
  checkTimeoutMs?: number;
  /** Max consecutive failures before marking as unhealthy (default: 3) */
  maxConsecutiveFailures?: number;
  /** Whether to mark as healthy by default (default: true) */
  defaultHealthy?: boolean;
}

/**
 * Centralized health monitoring service
 *
 * Features:
 * - Periodic health checks
 * - Status caching
 * - Change notifications
 * - Consecutive failure tracking
 */
export class HealthMonitor {
  private statuses: Map<string, HealthStatus> = new Map();
  private interval: ReturnType<typeof setInterval> | null = null;
  private listeners: Set<HealthChangeListener> = new Set();
  private healthChecker: HealthChecker;
  private config: Required<HealthMonitorConfig>;

  constructor(healthChecker: HealthChecker, config: HealthMonitorConfig = {}) {
    this.healthChecker = healthChecker;
    this.config = {
      checkIntervalMs: config.checkIntervalMs ?? 60000,
      checkTimeoutMs: config.checkTimeoutMs ?? 5000,
      maxConsecutiveFailures: config.maxConsecutiveFailures ?? 3,
      defaultHealthy: config.defaultHealthy ?? true,
    };
  }

  /**
   * Get health status for a specific ID
   */
  getStatus(id: string): HealthStatus | undefined {
    return this.statuses.get(id);
  }

  /**
   * Check if a target is available
   *
   * Returns true if:
   * - No status recorded yet and defaultHealthy is true
   * - Status is marked as available
   * - Consecutive failures below threshold
   */
  isAvailable(id: string): boolean {
    const status = this.statuses.get(id);
    if (!status) {
      return this.config.defaultHealthy;
    }
    return (
      status.available &&
      status.consecutiveFailures < this.config.maxConsecutiveFailures
    );
  }

  /**
   * Get all health statuses
   */
  getAllStatuses(): Map<string, HealthStatus> {
    return new Map(this.statuses);
  }

  /**
   * Get health status as a simple map (for routing context)
   */
  getHealthMap(): Map<string, boolean> {
    const map = new Map<string, boolean>();
    for (const [id, status] of this.statuses) {
      map.set(id, this.isAvailable(id));
    }
    return map;
  }

  /**
   * Check health of a specific target
   */
  async checkHealth(id: string): Promise<HealthStatus> {
    try {
      const status = await Promise.race([
        this.healthChecker(id),
        this.createTimeoutPromise(id),
      ]);

      // Update consecutive failures
      const previous = this.statuses.get(id);
      if (!status.available) {
        status.consecutiveFailures = (previous?.consecutiveFailures ?? 0) + 1;
      } else {
        status.consecutiveFailures = 0;
      }

      this.statuses.set(id, status);
      this.notifyListeners(status);

      return status;
    } catch (error) {
      const status: HealthStatus = {
        id,
        available: false,
        lastChecked: new Date(),
        error: error instanceof Error ? error.message : 'Unknown error',
        consecutiveFailures:
          (this.statuses.get(id)?.consecutiveFailures ?? 0) + 1,
      };

      this.statuses.set(id, status);
      this.notifyListeners(status);

      return status;
    }
  }

  /**
   * Check health of multiple targets
   */
  async checkAll(ids: string[]): Promise<Map<string, HealthStatus>> {
    const results = await Promise.allSettled(ids.map((id) => this.checkHealth(id)));

    const statusMap = new Map<string, HealthStatus>();
    for (let i = 0; i < ids.length; i++) {
      const result = results[i];
      if (result.status === 'fulfilled') {
        statusMap.set(ids[i], result.value);
      }
    }

    return statusMap;
  }

  /**
   * Start periodic health checks
   */
  startPeriodicCheck(ids: string[]): void {
    this.stopPeriodicCheck();

    // Initial check
    this.checkAll(ids).catch(console.error);

    // Periodic checks
    this.interval = setInterval(() => {
      this.checkAll(ids).catch(console.error);
    }, this.config.checkIntervalMs);
  }

  /**
   * Stop periodic health checks
   */
  stopPeriodicCheck(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  /**
   * Register a status change listener
   *
   * @returns Unsubscribe function
   */
  onStatusChange(listener: HealthChangeListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Mark a target as unavailable
   *
   * Useful when an error occurs during operation
   */
  markUnavailable(id: string, error?: string): void {
    const previous = this.statuses.get(id);
    const status: HealthStatus = {
      id,
      available: false,
      lastChecked: new Date(),
      error,
      consecutiveFailures: (previous?.consecutiveFailures ?? 0) + 1,
    };

    this.statuses.set(id, status);
    this.notifyListeners(status);
  }

  /**
   * Mark a target as available
   *
   * Resets consecutive failures
   */
  markAvailable(id: string, latency?: number): void {
    const status: HealthStatus = {
      id,
      available: true,
      latency,
      lastChecked: new Date(),
      consecutiveFailures: 0,
    };

    this.statuses.set(id, status);
    this.notifyListeners(status);
  }

  /**
   * Clear all statuses
   */
  clear(): void {
    this.statuses.clear();
  }

  /**
   * Dispose the health monitor
   */
  dispose(): void {
    this.stopPeriodicCheck();
    this.statuses.clear();
    this.listeners.clear();
  }

  /**
   * Create a timeout promise for health checks
   */
  private createTimeoutPromise(id: string): Promise<HealthStatus> {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Health check timeout for ${id}`));
      }, this.config.checkTimeoutMs);
    });
  }

  /**
   * Notify all listeners of a status change
   */
  private notifyListeners(status: HealthStatus): void {
    for (const listener of this.listeners) {
      try {
        listener(status);
      } catch (error) {
        console.error('Health status listener error:', error);
      }
    }
  }
}

/**
 * Create a simple HTTP health checker
 */
export function createHttpHealthChecker(
  getUrl: (id: string) => string | undefined
): HealthChecker {
  return async (id: string): Promise<HealthStatus> => {
    const url = getUrl(id);
    if (!url) {
      return {
        id,
        available: false,
        lastChecked: new Date(),
        error: 'No URL configured',
        consecutiveFailures: 0,
      };
    }

    const startTime = Date.now();

    try {
      const response = await fetch(url, {
        method: 'HEAD',
        signal: AbortSignal.timeout(5000),
      });

      const latency = Date.now() - startTime;

      return {
        id,
        available: response.ok || response.status === 405, // 405 = method not allowed (but server responds)
        latency,
        lastChecked: new Date(),
        consecutiveFailures: 0,
      };
    } catch (error) {
      return {
        id,
        available: false,
        lastChecked: new Date(),
        error: error instanceof Error ? error.message : 'Unknown error',
        consecutiveFailures: 0,
      };
    }
  };
}
