/**
 * ExportBackpressureController - 导出背压控制器
 *
 * Phase 5: 流式导出背压管理
 *
 * 职责：
 * - 监控帧缓冲区状态
 * - 在缓冲区接近满时发出暂停信号
 * - 在缓冲区有空间时发出恢复信号
 * - 防止 Webview 渲染速度超过 Extension 编码速度导致内存溢出
 *
 * 设计原则（SOLID）：
 * - 单一职责 (S)：仅负责背压控制逻辑
 * - 开闭原则 (O)：通过配置支持不同的阈值策略
 * - 依赖倒置 (D)：通过回调与外部通信
 */

import type {
	BackpressureConfig,
	BackpressureStatus,
} from '@neko/shared';
import { DEFAULT_BACKPRESSURE_CONFIG } from '@neko/shared';

// =============================================================================
// Types
// =============================================================================

/**
 * 背压事件类型
 */
export type BackpressureEvent =
	| { type: 'pause'; status: BackpressureStatus }
	| { type: 'resume'; status: BackpressureStatus }
	| { type: 'update'; status: BackpressureStatus };

/**
 * 背压事件监听器
 */
export type BackpressureListener = (event: BackpressureEvent) => void;

/**
 * 帧编码统计
 */
interface EncodingStats {
	/** 开始时间 */
	startTime: number;
	/** 已编码帧数 */
	encodedFrames: number;
	/** 最近 N 帧的编码时间（用于计算 FPS） */
	recentEncodeTimes: number[];
}

// =============================================================================
// ExportBackpressureController
// =============================================================================

/**
 * 导出背压控制器
 *
 * 使用生产者-消费者模型控制流量：
 * - 生产者：Webview GPU 渲染
 * - 消费者：Extension FFmpeg 编码
 * - 缓冲区：帧队列
 */
export class ExportBackpressureController {
	// Configuration
	private readonly config: BackpressureConfig;

	// State
	private pendingFrames = 0;
	private isPaused = false;
	private stats: EncodingStats;

	// Event listeners
	private listeners: BackpressureListener[] = [];

	// Wait resolvers for blocking waitForCapacity
	private waitResolvers: Array<() => void> = [];

	// Disposed flag
	private disposed = false;

	constructor(config: Partial<BackpressureConfig> = {}) {
		this.config = { ...DEFAULT_BACKPRESSURE_CONFIG, ...config };
		this.stats = {
			startTime: Date.now(),
			encodedFrames: 0,
			recentEncodeTimes: [],
		};
	}

	// ===========================================================================
	// Public API - Frame Flow Control
	// ===========================================================================

	/**
	 * 等待缓冲区有空间
	 *
	 * 如果缓冲区满，会阻塞直到有空间或超时
	 * @returns true 如果有空间，false 如果超时
	 */
	async waitForCapacity(): Promise<boolean> {
		if (this.disposed) return false;

		// Check if we have capacity
		if (this.pendingFrames < this.config.maxPendingFrames) {
			return true;
		}

		// Wait for capacity
		return new Promise<boolean>((resolve) => {
			const timeoutId = setTimeout(() => {
				// Remove resolver from list
				const index = this.waitResolvers.indexOf(resolver);
				if (index !== -1) {
					this.waitResolvers.splice(index, 1);
				}
				resolve(false); // Timeout
			}, this.config.maxWaitTime);

			const resolver = () => {
				clearTimeout(timeoutId);
				resolve(true);
			};

			this.waitResolvers.push(resolver);
		});
	}

	/**
	 * 记录帧发送（生产者调用）
	 *
	 * @returns 当前背压状态
	 */
	onFrameSent(): BackpressureStatus {
		if (this.disposed) return this.getStatus();

		this.pendingFrames++;
		const status = this.getStatus();

		// Check if should pause
		if (!this.isPaused && status.utilization >= this.config.pauseThreshold) {
			this.isPaused = true;
			this.notifyListeners({ type: 'pause', status });
		} else {
			this.notifyListeners({ type: 'update', status });
		}

		return status;
	}

	/**
	 * 记录帧编码完成（消费者调用）
	 *
	 * @returns 当前背压状态
	 */
	onFrameEncoded(): BackpressureStatus {
		if (this.disposed) return this.getStatus();

		this.pendingFrames = Math.max(0, this.pendingFrames - 1);
		this.stats.encodedFrames++;

		// Track encoding time
		const now = Date.now();
		this.stats.recentEncodeTimes.push(now);
		// Keep only last 30 samples
		if (this.stats.recentEncodeTimes.length > 30) {
			this.stats.recentEncodeTimes.shift();
		}

		const status = this.getStatus();

		// Check if should resume
		if (this.isPaused && status.utilization <= this.config.resumeThreshold) {
			this.isPaused = false;
			this.notifyListeners({ type: 'resume', status });

			// Resolve waiting promises
			const resolver = this.waitResolvers.shift();
			if (resolver) {
				resolver();
			}
		} else {
			this.notifyListeners({ type: 'update', status });
		}

		return status;
	}

	/**
	 * 批量确认帧编码完成
	 *
	 * @param count 编码完成的帧数
	 * @returns 当前背压状态
	 */
	onFramesBatchEncoded(count: number): BackpressureStatus {
		if (this.disposed) return this.getStatus();

		this.pendingFrames = Math.max(0, this.pendingFrames - count);
		this.stats.encodedFrames += count;

		const status = this.getStatus();

		// Check if should resume
		if (this.isPaused && status.utilization <= this.config.resumeThreshold) {
			this.isPaused = false;
			this.notifyListeners({ type: 'resume', status });

			// Resolve waiting promises
			while (
				this.waitResolvers.length > 0 &&
				this.pendingFrames < this.config.maxPendingFrames
			) {
				const resolver = this.waitResolvers.shift();
				resolver?.();
			}
		} else {
			this.notifyListeners({ type: 'update', status });
		}

		return status;
	}

	// ===========================================================================
	// Public API - Status
	// ===========================================================================

	/**
	 * 获取当前背压状态
	 */
	getStatus(): BackpressureStatus {
		const utilization = this.pendingFrames / this.config.maxPendingFrames;

		return {
			pendingFrames: this.pendingFrames,
			maxPendingFrames: this.config.maxPendingFrames,
			utilization,
			shouldPause: this.isPaused,
			encodingFps: this.calculateEncodingFps(),
		};
	}

	/**
	 * 是否应该暂停发送
	 */
	shouldPause(): boolean {
		return this.isPaused;
	}

	/**
	 * 获取当前待处理帧数
	 */
	getPendingFrames(): number {
		return this.pendingFrames;
	}

	/**
	 * 获取编码统计
	 */
	getEncodingStats(): {
		totalEncoded: number;
		encodingFps: number;
		elapsedTime: number;
	} {
		return {
			totalEncoded: this.stats.encodedFrames,
			encodingFps: this.calculateEncodingFps(),
			elapsedTime: Date.now() - this.stats.startTime,
		};
	}

	// ===========================================================================
	// Public API - Event Listeners
	// ===========================================================================

	/**
	 * 添加背压事件监听器
	 */
	addListener(listener: BackpressureListener): void {
		this.listeners.push(listener);
	}

	/**
	 * 移除背压事件监听器
	 */
	removeListener(listener: BackpressureListener): void {
		const index = this.listeners.indexOf(listener);
		if (index !== -1) {
			this.listeners.splice(index, 1);
		}
	}

	// ===========================================================================
	// Lifecycle
	// ===========================================================================

	/**
	 * 重置控制器状态
	 */
	reset(): void {
		this.pendingFrames = 0;
		this.isPaused = false;
		this.stats = {
			startTime: Date.now(),
			encodedFrames: 0,
			recentEncodeTimes: [],
		};

		// Resolve all waiting promises
		while (this.waitResolvers.length > 0) {
			const resolver = this.waitResolvers.shift();
			resolver?.();
		}
	}

	/**
	 * 销毁控制器
	 */
	dispose(): void {
		if (this.disposed) return;
		this.disposed = true;

		// Resolve all waiting promises
		while (this.waitResolvers.length > 0) {
			const resolver = this.waitResolvers.shift();
			resolver?.();
		}

		this.listeners = [];
	}

	// ===========================================================================
	// Private Helpers
	// ===========================================================================

	/**
	 * 计算编码 FPS
	 */
	private calculateEncodingFps(): number {
		const times = this.stats.recentEncodeTimes;
		if (times.length < 2) {
			return 0;
		}

		// Calculate FPS from recent samples
		const first = times[0];
		const last = times[times.length - 1];
		const duration = (last! - first!) / 1000; // seconds

		if (duration <= 0) return 0;

		return (times.length - 1) / duration;
	}

	/**
	 * 通知所有监听器
	 */
	private notifyListeners(event: BackpressureEvent): void {
		for (const listener of this.listeners) {
			try {
				listener(event);
			} catch (error) {
				console.error('[BackpressureController] Listener error:', error);
			}
		}
	}
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * 创建背压控制器
 */
export function createBackpressureController(
	config?: Partial<BackpressureConfig>
): ExportBackpressureController {
	return new ExportBackpressureController(config);
}
