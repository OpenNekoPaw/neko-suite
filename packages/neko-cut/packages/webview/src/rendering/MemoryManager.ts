/**
 * MemoryManager - 内存压力协调管理器
 *
 * Phase 4: Webview 端统一内存管理
 *
 * 职责：
 * - 监控 Webview 内存使用情况
 * - 检测内存压力等级
 * - 协调各缓存层的内存淘汰
 * - 提供自适应缓存配置建议
 *
 * 设计原则：
 * - 单一职责 (S)：只负责内存管理决策
 * - 开闭原则 (O)：通过策略模式支持扩展
 * - 依赖倒置 (D)：依赖抽象的缓存接口
 */

// =============================================================================
// Types
// =============================================================================

/**
 * 内存压力等级
 */
export type MemoryPressureLevel = 'low' | 'medium' | 'high' | 'critical';

/**
 * 内存状态信息
 */
export interface MemoryStatus {
  /** 已使用内存（字节） */
  usedBytes: number;
  /** 总内存预算（字节） */
  totalBudgetBytes: number;
  /** 使用率 (0-1) */
  usageRatio: number;
  /** 压力等级 */
  pressureLevel: MemoryPressureLevel;
  /** 建议的缓存窗口乘数 */
  suggestedWindowMultiplier: number;
  /** 建议的最大帧数调整因子 */
  suggestedFramesFactor: number;
}

/**
 * 内存配置
 */
export interface MemoryManagerConfig {
  /** 总内存预算（字节），默认 2GB */
  totalBudgetBytes: number;
  /** 低压力阈值 (0-1)，默认 0.5 */
  lowPressureThreshold: number;
  /** 中等压力阈值 (0-1)，默认 0.7 */
  mediumPressureThreshold: number;
  /** 高压力阈值 (0-1)，默认 0.85 */
  highPressureThreshold: number;
  /** 危险阈值 (0-1)，默认 0.95 */
  criticalThreshold: number;
  /** 内存采样间隔（毫秒），默认 5000 */
  sampleInterval: number;
  /** 是否启用自动采样，默认 true */
  enableAutoSampling: boolean;
}

/**
 * 默认配置
 */
export const DEFAULT_MEMORY_CONFIG: MemoryManagerConfig = {
  totalBudgetBytes: 2 * 1024 * 1024 * 1024, // 2GB
  lowPressureThreshold: 0.5,
  mediumPressureThreshold: 0.7,
  highPressureThreshold: 0.85,
  criticalThreshold: 0.95,
  sampleInterval: 5000,
  enableAutoSampling: true,
};

/**
 * 可观察的内存源接口
 */
export interface IMemoryObservable {
  /** 获取当前内存使用（字节） */
  getMemoryUsage(): number;
  /** 执行内存清理 */
  evictMemory(targetBytes: number): number; // 返回实际释放的字节数
}

/**
 * 内存变化监听器
 */
export type MemoryPressureListener = (status: MemoryStatus) => void;

// =============================================================================
// MemoryManager
// =============================================================================

/**
 * 内存压力管理器
 *
 * 统一监控和协调 Webview 端的内存使用
 */
export class MemoryManager {
  // 配置
  private readonly config: MemoryManagerConfig;

  // 已注册的内存源
  private memorySources = new Map<string, IMemoryObservable>();

  // 压力变化监听器
  private listeners: MemoryPressureListener[] = [];

  // 当前状态
  private currentStatus: MemoryStatus;

  // 采样定时器
  private sampleTimer: number | null = null;

  // 上次压力等级（用于检测变化）
  private lastPressureLevel: MemoryPressureLevel = 'low';

  // 是否已销毁
  private disposed = false;

  constructor(config: Partial<MemoryManagerConfig> = {}) {
    this.config = { ...DEFAULT_MEMORY_CONFIG, ...config };
    this.currentStatus = this.createDefaultStatus();

    if (this.config.enableAutoSampling) {
      this.startAutoSampling();
    }
  }

  // ===========================================================================
  // Memory Source Registration
  // ===========================================================================

  /**
   * 注册内存源
   * @param name 内存源名称
   * @param source 内存源对象
   */
  registerSource(name: string, source: IMemoryObservable): void {
    if (this.disposed) return;
    this.memorySources.set(name, source);
  }

  /**
   * 注销内存源
   * @param name 内存源名称
   */
  unregisterSource(name: string): void {
    this.memorySources.delete(name);
  }

  /**
   * 获取所有已注册的内存源名称
   */
  getRegisteredSources(): string[] {
    return Array.from(this.memorySources.keys());
  }

  // ===========================================================================
  // Pressure Monitoring
  // ===========================================================================

  /**
   * 添加压力变化监听器
   */
  addPressureListener(listener: MemoryPressureListener): void {
    this.listeners.push(listener);
  }

  /**
   * 移除压力变化监听器
   */
  removePressureListener(listener: MemoryPressureListener): void {
    const index = this.listeners.indexOf(listener);
    if (index !== -1) {
      this.listeners.splice(index, 1);
    }
  }

  /**
   * 获取当前内存状态
   */
  getStatus(): MemoryStatus {
    return { ...this.currentStatus };
  }

  /**
   * 手动更新内存状态
   */
  updateStatus(): MemoryStatus {
    if (this.disposed) return this.currentStatus;

    // 收集所有内存源的使用量
    let totalUsed = 0;
    for (const source of this.memorySources.values()) {
      totalUsed += source.getMemoryUsage();
    }

    const usageRatio = totalUsed / this.config.totalBudgetBytes;
    const pressureLevel = this.calculatePressureLevel(usageRatio);

    this.currentStatus = {
      usedBytes: totalUsed,
      totalBudgetBytes: this.config.totalBudgetBytes,
      usageRatio,
      pressureLevel,
      suggestedWindowMultiplier: this.getSuggestedWindowMultiplier(pressureLevel),
      suggestedFramesFactor: this.getSuggestedFramesFactor(pressureLevel),
    };

    // 检查压力等级是否变化
    if (pressureLevel !== this.lastPressureLevel) {
      this.lastPressureLevel = pressureLevel;
      this.notifyListeners();
    }

    return this.currentStatus;
  }

  // ===========================================================================
  // Memory Eviction
  // ===========================================================================

  /**
   * 请求释放内存
   * @param targetBytes 目标释放字节数
   * @returns 实际释放的字节数
   */
  requestEviction(targetBytes: number): number {
    if (this.disposed) return 0;

    let totalEvicted = 0;
    let remaining = targetBytes;

    // 按注册顺序逐个请求释放
    for (const source of this.memorySources.values()) {
      if (remaining <= 0) break;

      const evicted = source.evictMemory(remaining);
      totalEvicted += evicted;
      remaining -= evicted;
    }

    // 更新状态
    this.updateStatus();

    return totalEvicted;
  }

  /**
   * 检查并自动释放内存（如果压力过高）
   */
  checkAndEvict(): void {
    if (this.disposed) return;

    const status = this.updateStatus();

    if (status.pressureLevel === 'critical') {
      // 危险级别：释放 30% 的内存
      const targetEvict = this.config.totalBudgetBytes * 0.3;
      this.requestEviction(targetEvict);
    } else if (status.pressureLevel === 'high') {
      // 高压力：释放 15% 的内存
      const targetEvict = this.config.totalBudgetBytes * 0.15;
      this.requestEviction(targetEvict);
    }
  }

  // ===========================================================================
  // Configuration Suggestions
  // ===========================================================================

  /**
   * 获取建议的缓存窗口乘数
   */
  private getSuggestedWindowMultiplier(level: MemoryPressureLevel): number {
    switch (level) {
      case 'low':
        return 2.0; // 正常：缓存 2x 时间窗口
      case 'medium':
        return 1.5; // 中等压力：减少到 1.5x
      case 'high':
        return 1.0; // 高压力：只缓存 1x
      case 'critical':
        return 0.5; // 危险：最小缓存
      default:
        return 2.0;
    }
  }

  /**
   * 获取建议的帧数调整因子
   */
  private getSuggestedFramesFactor(level: MemoryPressureLevel): number {
    switch (level) {
      case 'low':
        return 1.0; // 正常：使用默认帧数
      case 'medium':
        return 0.75; // 中等压力：减少到 75%
      case 'high':
        return 0.5; // 高压力：减少到 50%
      case 'critical':
        return 0.25; // 危险：最小帧数
      default:
        return 1.0;
    }
  }

  /**
   * 获取针对当前压力的动态配置建议
   */
  getSuggestedConfig(): {
    maxFramesPerTrack: number;
    timeWindowMultiplier: number;
    enableCompositeCache: boolean;
  } {
    const status = this.currentStatus;

    // 基础配置
    const baseMaxFrames = 180; // 默认最大帧数
    const baseWindowMultiplier = 2;

    return {
      maxFramesPerTrack: Math.floor(baseMaxFrames * status.suggestedFramesFactor),
      timeWindowMultiplier: baseWindowMultiplier * status.suggestedWindowMultiplier / 2,
      // 高压力时禁用合成帧缓存
      enableCompositeCache: status.pressureLevel !== 'critical' && status.pressureLevel !== 'high',
    };
  }

  // ===========================================================================
  // Lifecycle
  // ===========================================================================

  /**
   * 开始自动采样
   */
  startAutoSampling(): void {
    if (this.sampleTimer !== null) return;

    this.sampleTimer = window.setInterval(() => {
      this.checkAndEvict();
    }, this.config.sampleInterval);
  }

  /**
   * 停止自动采样
   */
  stopAutoSampling(): void {
    if (this.sampleTimer !== null) {
      window.clearInterval(this.sampleTimer);
      this.sampleTimer = null;
    }
  }

  /**
   * 销毁管理器
   */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;

    this.stopAutoSampling();
    this.memorySources.clear();
    this.listeners = [];
  }

  // ===========================================================================
  // Private Helpers
  // ===========================================================================

  /**
   * 计算压力等级
   */
  private calculatePressureLevel(usageRatio: number): MemoryPressureLevel {
    if (usageRatio >= this.config.criticalThreshold) {
      return 'critical';
    } else if (usageRatio >= this.config.highPressureThreshold) {
      return 'high';
    } else if (usageRatio >= this.config.mediumPressureThreshold) {
      return 'medium';
    } else {
      return 'low';
    }
  }

  /**
   * 通知所有监听器
   */
  private notifyListeners(): void {
    const status = { ...this.currentStatus };
    for (const listener of this.listeners) {
      try {
        listener(status);
      } catch (error) {
        console.error('[MemoryManager] Listener error:', error);
      }
    }
  }

  /**
   * 创建默认状态
   */
  private createDefaultStatus(): MemoryStatus {
    return {
      usedBytes: 0,
      totalBudgetBytes: this.config.totalBudgetBytes,
      usageRatio: 0,
      pressureLevel: 'low',
      suggestedWindowMultiplier: 2.0,
      suggestedFramesFactor: 1.0,
    };
  }
}

// =============================================================================
// TimelineFrameCache 适配器
// =============================================================================

import type { TimelineFrameCache } from './TimelineFrameCache';

/**
 * 将 TimelineFrameCache 适配为 IMemoryObservable
 */
export class TimelineFrameCacheMemoryAdapter implements IMemoryObservable {
  constructor(private cache: TimelineFrameCache) {}

  getMemoryUsage(): number {
    return this.cache.getStats().totalMemoryBytes;
  }

  evictMemory(targetBytes: number): number {
    // TimelineFrameCache 的内存管理是内部的
    // 这里我们通过清除合成缓存来释放内存
    const statsBefore = this.cache.getStats();
    this.cache.invalidateCompositeCache();
    const statsAfter = this.cache.getStats();

    const evicted = statsBefore.totalMemoryBytes - statsAfter.totalMemoryBytes;

    // 如果释放的不够，进一步清理（这是一个简化实现）
    if (evicted < targetBytes) {
      // 清除所有缓存作为最后手段
      this.cache.clear();
      return statsBefore.totalMemoryBytes;
    }

    return evicted;
  }
}

// =============================================================================
// Singleton Instance
// =============================================================================

let memoryManagerInstance: MemoryManager | null = null;

/**
 * 获取 MemoryManager 单例
 */
export function getMemoryManager(
  config?: Partial<MemoryManagerConfig>
): MemoryManager {
  if (!memoryManagerInstance) {
    memoryManagerInstance = new MemoryManager(config);
  }
  return memoryManagerInstance;
}

/**
 * 重置 MemoryManager 单例（用于测试）
 */
export function resetMemoryManager(): void {
  if (memoryManagerInstance) {
    memoryManagerInstance.dispose();
    memoryManagerInstance = null;
  }
}
