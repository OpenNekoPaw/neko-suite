/**
 * useSnap - 吸附功能 Hook
 * 提供节点拖拽时的吸附计算和参考线生成
 */

import { useState, useCallback, useRef } from 'react';
import type { CanvasNode } from '@neko/shared';
import {
  SnapEngine,
  DEFAULT_SNAP_CONFIG,
  type SnapConfig,
  type SnapResult,
  type Guide,
  type Point,
} from '../utils/snapEngine';

// =============================================================================
// Types
// =============================================================================

export interface UseSnapOptions {
  /** 所有节点 */
  nodes: CanvasNode[];
  /** 吸附配置 */
  config?: Partial<SnapConfig>;
  /** 是否启用吸附 */
  enabled?: boolean;
}

export interface UseSnapReturn {
  /** 计算吸附位置 */
  snap: (
    position: Point,
    size: { width: number; height: number },
    excludeIds?: string[]
  ) => SnapResult;
  /** 当前参考线 */
  guides: Guide[];
  /** 更新参考线（拖拽时调用） */
  updateGuides: (
    position: Point,
    size: { width: number; height: number },
    excludeIds?: string[]
  ) => void;
  /** 清除参考线 */
  clearGuides: () => void;
  /** 吸附配置 */
  config: SnapConfig;
  /** 更新配置 */
  setConfig: (config: Partial<SnapConfig>) => void;
}

// =============================================================================
// Hook
// =============================================================================

export function useSnap({
  nodes,
  config: initialConfig,
  enabled = true,
}: UseSnapOptions): UseSnapReturn {
  const [guides, setGuides] = useState<Guide[]>([]);
  const [config, setConfigState] = useState<SnapConfig>({
    ...DEFAULT_SNAP_CONFIG,
    ...initialConfig,
  });

  const engineRef = useRef<SnapEngine>(new SnapEngine(config));

  // 更新引擎配置
  const setConfig = useCallback((newConfig: Partial<SnapConfig>) => {
    setConfigState((prev) => {
      const updated = { ...prev, ...newConfig };
      engineRef.current.setConfig(updated);
      return updated;
    });
  }, []);

  // 计算吸附
  const snap = useCallback(
    (
      position: Point,
      size: { width: number; height: number },
      excludeIds: string[] = []
    ): SnapResult => {
      if (!enabled) {
        return {
          position,
          snapped: false,
          horizontal: null,
          vertical: null,
        };
      }

      engineRef.current.setNodes(nodes, excludeIds);
      return engineRef.current.snap(position, size);
    },
    [nodes, enabled]
  );

  // 更新参考线
  const updateGuides = useCallback(
    (
      position: Point,
      size: { width: number; height: number },
      excludeIds: string[] = []
    ) => {
      if (!enabled) {
        setGuides([]);
        return;
      }

      engineRef.current.setNodes(nodes, excludeIds);
      const newGuides = engineRef.current.generateGuides(position, size);
      setGuides(newGuides);
    },
    [nodes, enabled]
  );

  // 清除参考线
  const clearGuides = useCallback(() => {
    setGuides([]);
  }, []);

  return {
    snap,
    guides,
    updateGuides,
    clearGuides,
    config,
    setConfig,
  };
}
