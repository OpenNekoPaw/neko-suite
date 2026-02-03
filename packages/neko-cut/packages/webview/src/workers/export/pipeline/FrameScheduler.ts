/**
 * Frame Scheduler
 *
 * Manages frame processing queue with backpressure control.
 * Prevents memory overflow by limiting concurrent frames in flight.
 */

// =============================================================================
// Types
// =============================================================================

export interface FrameSlot {
  /** Frame index */
  frameIndex: number;
  /** Timestamp in microseconds */
  timestamp: number;
  /** Whether slot is acquired */
  acquired: boolean;
}

export interface QueueStatus {
  /** Pending frames waiting to be processed */
  pending: number;
  /** Frames currently being processed */
  processing: number;
  /** Completed frames */
  completed: number;
  /** Maximum queue capacity */
  maxCapacity: number;
  /** Whether backpressure is active */
  backpressure: boolean;
}

export interface FrameSchedulerConfig {
  /** Maximum frames in flight */
  maxCapacity: number;
  /** Total frames to process */
  totalFrames: number;
  /** Frame rate */
  fps: number;
}

// =============================================================================
// FrameScheduler
// =============================================================================

export class FrameScheduler {
  private _config: FrameSchedulerConfig;
  private _nextFrameIndex = 0;
  private _processingCount = 0;
  private _completedCount = 0;
  private _waiters: Array<() => void> = [];
  private _cancelled = false;
  private _paused = false;
  private _pauseWaiters: Array<() => void> = [];

  constructor(config: FrameSchedulerConfig) {
    this._config = config;
  }

  // ===========================================================================
  // Public Methods
  // ===========================================================================

  /**
   * Request next frame slot (blocks if at capacity)
   */
  async requestFrame(): Promise<FrameSlot | null> {
    // Check if all frames are done
    if (this._nextFrameIndex >= this._config.totalFrames) {
      return null;
    }

    // Check if cancelled
    if (this._cancelled) {
      return null;
    }

    // Wait if paused
    while (this._paused && !this._cancelled) {
      await new Promise<void>(resolve => this._pauseWaiters.push(resolve));
    }

    if (this._cancelled) {
      return null;
    }

    // Wait for capacity (backpressure)
    while (this._processingCount >= this._config.maxCapacity && !this._cancelled) {
      await new Promise<void>(resolve => this._waiters.push(resolve));
    }

    if (this._cancelled) {
      return null;
    }

    // Acquire slot
    const frameIndex = this._nextFrameIndex++;
    const timestamp = Math.round((frameIndex / this._config.fps) * 1_000_000); // microseconds
    this._processingCount++;

    return {
      frameIndex,
      timestamp,
      acquired: true,
    };
  }

  /**
   * Release frame slot after processing
   */
  releaseFrame(_slot: FrameSlot): void {
    this._processingCount--;
    this._completedCount++;

    // Wake up waiters
    if (this._waiters.length > 0 && this._processingCount < this._config.maxCapacity) {
      const waiter = this._waiters.shift();
      if (waiter) waiter();
    }
  }

  /**
   * Get current queue status
   */
  getStatus(): QueueStatus {
    return {
      pending: this._config.totalFrames - this._nextFrameIndex,
      processing: this._processingCount,
      completed: this._completedCount,
      maxCapacity: this._config.maxCapacity,
      backpressure: this._processingCount >= this._config.maxCapacity,
    };
  }

  /**
   * Pause frame scheduling
   */
  pause(): void {
    this._paused = true;
  }

  /**
   * Resume frame scheduling
   */
  resume(): void {
    this._paused = false;
    // Wake up all pause waiters
    while (this._pauseWaiters.length > 0) {
      const waiter = this._pauseWaiters.shift();
      if (waiter) waiter();
    }
  }

  /**
   * Cancel all pending operations
   */
  cancel(): void {
    this._cancelled = true;
    this._paused = false;

    // Wake up all waiters
    while (this._waiters.length > 0) {
      const waiter = this._waiters.shift();
      if (waiter) waiter();
    }
    while (this._pauseWaiters.length > 0) {
      const waiter = this._pauseWaiters.shift();
      if (waiter) waiter();
    }
  }

  /**
   * Reset scheduler for new export
   */
  reset(): void {
    this._nextFrameIndex = 0;
    this._processingCount = 0;
    this._completedCount = 0;
    this._waiters = [];
    this._pauseWaiters = [];
    this._cancelled = false;
    this._paused = false;
  }

  /**
   * Check if export is complete
   */
  isComplete(): boolean {
    return this._completedCount >= this._config.totalFrames;
  }

  /**
   * Check if cancelled
   */
  isCancelled(): boolean {
    return this._cancelled;
  }

  /**
   * Check if paused
   */
  isPaused(): boolean {
    return this._paused;
  }

  /**
   * Get progress percentage
   */
  getProgress(): number {
    return (this._completedCount / this._config.totalFrames) * 100;
  }
}
