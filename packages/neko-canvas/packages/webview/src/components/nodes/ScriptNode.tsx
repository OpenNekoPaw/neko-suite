/**
 * ScriptNode - TOC-mode reference to a .nks / .fountain screenplay.
 * Shows scene structure only (no full text), loaded via getScriptIndex.
 * Clicking a scene can navigate to the linked SceneGroupNode.
 */

import { useEffect } from 'react';
import type { ScriptCanvasNode, CanvasViewport } from '@neko/shared';
import { BaseNode } from './BaseNode';

// =============================================================================
// Types
// =============================================================================

export interface ScriptNodeProps {
  node: ScriptCanvasNode;
  viewport: CanvasViewport;
  isSelected: boolean;
  onSelect?: (nodeId: string, multi: boolean) => void;
  onDrag?: (nodeId: string, position: { x: number; y: number }) => void;
  onMove?: (nodeId: string, position: { x: number; y: number }) => void;
  onResize?: (
    nodeId: string,
    size: { width: number; height: number },
    position: { x: number; y: number },
  ) => void;
  onResizeEnd?: (
    nodeId: string,
    size: { width: number; height: number },
    position: { x: number; y: number },
  ) => void;
  onConnectionStart?: (nodeId: string, anchor: string, e: React.MouseEvent) => void;
  onUpdateData?: (nodeId: string, data: Partial<ScriptCanvasNode['data']>) => void;
  /** Called to load scenes from neko-story */
  onLoadScenes?: (nodeId: string, scriptPath: string) => void;
  /** Called when user clicks "open script" button */
  onOpenScript?: (scriptPath: string) => void;
  /** Called when user clicks a scene row (navigate to SceneGroupNode) */
  onNavigateToScene?: (linkedSceneGroupId: string) => void;
}

// =============================================================================
// Component
// =============================================================================

const MAX_VISIBLE_SCENES = 5;

export function ScriptNode({
  node,
  viewport,
  isSelected,
  onSelect,
  onDrag,
  onMove,
  onResize,
  onResizeEnd,
  onConnectionStart,
  onLoadScenes,
  onOpenScript,
  onNavigateToScene,
}: ScriptNodeProps) {
  const { scriptPath, scriptTitle, scenes, linkedSceneGroupId } = node.data;

  // Request scene TOC on mount if not yet loaded
  useEffect(() => {
    if (scenes.length === 0 && scriptPath) {
      onLoadScenes?.(node.id, scriptPath);
    }
  }, [node.id, scriptPath, scenes.length, onLoadScenes]);

  const fileName = scriptPath.split('/').pop() ?? scriptPath;
  const visibleScenes = scenes.slice(0, MAX_VISIBLE_SCENES);
  const hiddenCount = scenes.length - visibleScenes.length;

  return (
    <BaseNode
      node={node}
      viewport={viewport}
      isSelected={isSelected}
      onSelect={onSelect}
      onDrag={onDrag}
      onMove={onMove}
      onResize={onResize}
      onResizeEnd={onResizeEnd}
      onConnectionStart={onConnectionStart}
    >
      <div className="flex flex-col h-full text-xs">
        {/* ── Header ── */}
        <div
          className="flex items-center gap-2 px-2 py-1.5 flex-shrink-0"
          style={{
            borderBottom: '1px solid var(--node-divider)',
            backgroundColor: 'var(--node-header-bg)',
          }}
        >
          <span style={{ fontSize: 14 }}>📄</span>
          <span className="flex-1 truncate font-medium" style={{ color: 'var(--node-fg)' }}>
            {scriptTitle || fileName}
          </span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onOpenScript?.(scriptPath);
            }}
            style={{
              fontSize: 9,
              padding: '1px 5px',
              borderRadius: 3,
              border: '1px solid var(--node-border)',
              backgroundColor: 'transparent',
              color: 'var(--neko-fg-secondary)',
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            打开
          </button>
        </div>

        {/* ── Scene list (TOC) ── */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {scenes.length === 0 ? (
            <div
              className="flex-1 flex items-center justify-center"
              style={{ color: 'var(--node-fg-secondary)', opacity: 0.5 }}
            >
              加载中…
            </div>
          ) : (
            <div className="flex flex-col divide-y" style={{ borderColor: 'var(--node-divider)' }}>
              {visibleScenes.map((scene) => (
                <button
                  key={scene.id}
                  className="flex items-center gap-2 px-2 py-1.5 text-left hover:bg-white/5 transition-colors"
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: onNavigateToScene && linkedSceneGroupId ? 'pointer' : 'default',
                    width: '100%',
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (linkedSceneGroupId) onNavigateToScene?.(linkedSceneGroupId);
                  }}
                >
                  <span style={{ color: 'var(--node-fg-secondary)', fontSize: 9, flexShrink: 0 }}>
                    L{scene.lineStart}
                  </span>
                  <span className="flex-1 truncate" style={{ color: 'var(--node-fg)' }}>
                    {scene.title}
                  </span>
                </button>
              ))}
              {hiddenCount > 0 && (
                <div
                  className="px-2 py-1"
                  style={{ color: 'var(--node-fg-secondary)', textAlign: 'center' }}
                >
                  +{hiddenCount} 个场景…
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div
          className="px-2 py-1 flex items-center justify-between flex-shrink-0"
          style={{
            borderTop: '1px solid var(--node-divider)',
            backgroundColor: 'var(--node-header-bg)',
          }}
        >
          <span style={{ color: 'var(--node-fg-secondary)' }}>SCRIPT</span>
          <span style={{ color: 'var(--node-fg-secondary)' }}>{scenes.length} 场</span>
        </div>
      </div>
    </BaseNode>
  );
}
