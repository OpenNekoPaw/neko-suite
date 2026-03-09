/**
 * PreviewModeController - 预览模式控制器
 *
 * 职责：
 * - 管理预览模式状态（Idle/Playback/Scrubbing）
 * - 实现自动模式切换的 debounce 逻辑
 * - 与 Extension 端同步模式状态
 *
 * 状态转换：
 * ```
 *                    ┌──────────────────┐
 *                    │                  │
 *        ┌───────────│     Idle         │◄──────────┐
 *        │           │  (高质量 JPEG)    │           │
 *        │           └────────┬─────────┘           │
 *        │                    │                     │
 *        │ 开始播放           │ 开始拖动            │ 停止操作
 *        │                    │                     │ (debounce)
 *        ▼                    ▼                     │
 * ┌───────────────┐    ┌───────────────┐            │
 * │               │    │               │            │
 * │   Playback    │◄──►│   Scrubbing   │────────────┘
 * │  (H.264 流)   │    │  (H.264 流)   │
 * │               │    │               │
 * └───────────────┘    └───────────────┘
 * ```
 */

import { postMessage } from '../utils/vscodeApi';
import { getLogger } from '../utils/logger';

const logger = getLogger('PreviewModeController');

/**
 * Preview mode
 */
export type PreviewMode = 'idle' | 'playback' | 'scrubbing';

/**
 * Preview mode controller configuration
 */
export interface PreviewModeControllerConfig {
  /** Debounce time for idle transition (ms) */
  idleDebounceMs?: number;
  /** Callback on mode change */
  onModeChange?: (mode: PreviewMode) => void;
  /** Sync mode to Extension */
  syncToExtension?: boolean;
}

/**
 * Preview mode controller
 */
export class PreviewModeController {
  private config: Required<PreviewModeControllerConfig>;
  private mode: PreviewMode = 'idle';
  private idleTimer: number | null = null;
  private disposed = false;

  // Event listeners
  private listeners: Set<(mode: PreviewMode) => void> = new Set();

  constructor(config: PreviewModeControllerConfig = {}) {
    this.config = {
      idleDebounceMs: config.idleDebounceMs ?? 300,
      onModeChange: config.onModeChange ?? (() => {}),
      syncToExtension: config.syncToExtension ?? true,
    };
  }

  /**
   * Get current mode
   */
  getMode(): PreviewMode {
    return this.mode;
  }

  /**
   * Set mode directly (no debounce)
   */
  setMode(mode: PreviewMode): void {
    if (this.disposed || this.mode === mode) {
      return;
    }

    this.cancelIdleTimer();
    this.updateMode(mode);
  }

  /**
   * Enter playback mode
   */
  enterPlayback(): void {
    this.cancelIdleTimer();
    this.updateMode('playback');
  }

  /**
   * Enter scrubbing mode
   */
  enterScrubbing(): void {
    this.cancelIdleTimer();
    this.updateMode('scrubbing');
  }

  /**
   * Schedule transition to idle mode (with debounce)
   */
  scheduleIdle(): void {
    if (this.disposed) {
      return;
    }

    this.cancelIdleTimer();
    this.idleTimer = window.setTimeout(() => {
      this.updateMode('idle');
    }, this.config.idleDebounceMs);
  }

  /**
   * Notify activity (resets idle timer)
   */
  notifyActivity(): void {
    if (this.mode !== 'idle') {
      // Reset idle timer if in streaming mode
      this.scheduleIdle();
    }
  }

  /**
   * Add mode change listener
   */
  addListener(listener: (mode: PreviewMode) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Cancel idle timer
   */
  private cancelIdleTimer(): void {
    if (this.idleTimer !== null) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
  }

  /**
   * Update mode and notify listeners
   */
  private updateMode(mode: PreviewMode): void {
    if (this.mode === mode) {
      return;
    }

    const previousMode = this.mode;
    this.mode = mode;

    logger.info(`Mode changed: ${previousMode} → ${mode}`);

    // Notify callback
    this.config.onModeChange(mode);

    // Notify listeners
    for (const listener of this.listeners) {
      try {
        listener(mode);
      } catch (error) {
        logger.error('Listener error:', error);
      }
    }

    // Sync to Extension
    if (this.config.syncToExtension) {
      this.syncModeToExtension(mode);
    }
  }

  /**
   * Sync mode to Extension via postMessage
   */
  private syncModeToExtension(mode: PreviewMode): void {
    try {
      postMessage({
        type: 'preview:setMode',
        payload: { mode },
      });
    } catch (error) {
      logger.warn('Failed to sync mode to Extension:', error);
    }
  }

  /**
   * Dispose the controller
   */
  dispose(): void {
    if (this.disposed) {
      return;
    }

    this.disposed = true;
    this.cancelIdleTimer();
    this.listeners.clear();
  }
}

// Singleton instance
let instance: PreviewModeController | null = null;

/**
 * Get singleton PreviewModeController instance
 */
export function getPreviewModeController(
  config?: PreviewModeControllerConfig,
): PreviewModeController {
  if (!instance) {
    instance = new PreviewModeController(config);
  }
  return instance;
}

/**
 * Reset singleton instance (for testing)
 */
export function resetPreviewModeController(): void {
  if (instance) {
    instance.dispose();
    instance = null;
  }
}

export default PreviewModeController;
