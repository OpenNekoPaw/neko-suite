/**
 * LayerPanel - 图层管理面板组件
 * 提供图层排序、可见性切换、锁定等功能
 */

import { useCallback, useState } from 'react';
import type { CanvasNode } from '@neko/shared';
import clsx from 'clsx';

// =============================================================================
// Types
// =============================================================================

export interface LayerPanelProps {
  nodes: CanvasNode[];
  selectedNodeIds: string[];
  onSelectNode: (nodeId: string, multi: boolean) => void;
  onReorderNode: (nodeId: string, newZIndex: number) => void;
  onToggleLock: (nodeId: string) => void;
  onToggleVisibility?: (nodeId: string) => void;
  onDeleteNode?: (nodeId: string) => void;
}

interface LayerItemProps {
  node: CanvasNode;
  isSelected: boolean;
  onSelect: (multi: boolean) => void;
  onToggleLock: () => void;
  onToggleVisibility?: () => void;
  onDelete?: () => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
}

// =============================================================================
// Constants
// =============================================================================

const NODE_TYPE_ICONS: Record<string, string> = {
  media: '🎬',
  storyboard: '📋',
  annotation: '📝',
  group: '📁',
  text: 'T',
  artboard: '⬜',
};

const NODE_TYPE_LABELS: Record<string, string> = {
  media: 'Media',
  storyboard: 'Storyboard',
  annotation: 'Annotation',
  group: 'Group',
  text: 'Text',
  artboard: 'Artboard',
};

// =============================================================================
// Component
// =============================================================================

export function LayerPanel({
  nodes,
  selectedNodeIds,
  onSelectNode,
  onReorderNode,
  onToggleLock,
  onToggleVisibility,
  onDeleteNode,
}: LayerPanelProps) {
  const [draggedNodeId, setDraggedNodeId] = useState<string | null>(null);

  // 按 zIndex 降序排列（最上层在最前）
  const sortedNodes = [...nodes].sort((a, b) => b.zIndex - a.zIndex);

  const handleDragStart = useCallback(
    (nodeId: string) => (e: React.DragEvent) => {
      setDraggedNodeId(nodeId);
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', nodeId);
    },
    [],
  );

  const handleDragOver = useCallback(
    (_nodeId: string) => (e: React.DragEvent) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
    },
    [],
  );

  const handleDrop = useCallback(
    (targetNodeId: string) => (e: React.DragEvent) => {
      e.preventDefault();
      if (!draggedNodeId || draggedNodeId === targetNodeId) {
        setDraggedNodeId(null);
        return;
      }

      const targetNode = nodes.find((n) => n.id === targetNodeId);
      if (targetNode) {
        onReorderNode(draggedNodeId, targetNode.zIndex);
      }

      setDraggedNodeId(null);
    },
    [draggedNodeId, nodes, onReorderNode],
  );

  const handleDragEnd = useCallback(() => {
    setDraggedNodeId(null);
  }, []);

  return (
    <div className="flex flex-col h-full bg-gray-900 border-l border-gray-700">
      {/* 面板标题 */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-700">
        <span className="text-sm font-medium text-gray-200">Layers</span>
        <span className="text-xs text-gray-500">{nodes.length}</span>
      </div>

      {/* 图层列表 */}
      <div className="flex-1 overflow-y-auto" onDragEnd={handleDragEnd}>
        {sortedNodes.length === 0 ? (
          <div className="flex items-center justify-center h-full text-sm text-gray-500">
            No layers
          </div>
        ) : (
          <div className="py-1">
            {sortedNodes.map((node) => (
              <LayerItem
                key={node.id}
                node={node}
                isSelected={selectedNodeIds.includes(node.id)}
                onSelect={(multi) => onSelectNode(node.id, multi)}
                onToggleLock={() => onToggleLock(node.id)}
                onToggleVisibility={
                  onToggleVisibility ? () => onToggleVisibility(node.id) : undefined
                }
                onDelete={onDeleteNode ? () => onDeleteNode(node.id) : undefined}
                onDragStart={handleDragStart(node.id)}
                onDragOver={handleDragOver(node.id)}
                onDrop={handleDrop(node.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* 底部工具栏 */}
      <div className="flex items-center gap-1 px-2 py-1.5 border-t border-gray-700 text-xs">
        <button
          className="px-2 py-1 hover:bg-gray-700 rounded transition-colors text-gray-400 hover:text-gray-200"
          title="Select All"
          onClick={() => {
            nodes.forEach((n) => onSelectNode(n.id, true));
          }}
        >
          All
        </button>
        <button
          className="px-2 py-1 hover:bg-gray-700 rounded transition-colors text-gray-400 hover:text-gray-200"
          title="Deselect All"
          onClick={() => {
            // 通过选择一个不存在的节点来清除选择
            onSelectNode('', false);
          }}
        >
          None
        </button>
      </div>
    </div>
  );
}

// =============================================================================
// Sub-components
// =============================================================================

function LayerItem({
  node,
  isSelected,
  onSelect,
  onToggleLock,
  onToggleVisibility,
  onDelete,
  onDragStart,
  onDragOver,
  onDrop,
}: LayerItemProps) {
  const icon = NODE_TYPE_ICONS[node.type] || '?';
  const label = NODE_TYPE_LABELS[node.type] || 'Unknown';

  // 获取节点名称
  const getNodeName = (): string => {
    const data = node.data as any;
    if (data.name) return data.name;
    if (data.title) return data.title;
    if (data.label) return data.label;
    if (data.content) return data.content.slice(0, 20) + (data.content.length > 20 ? '...' : '');
    if (data.assetPath) return data.assetPath.split('/').pop() || 'Media';
    return `${label} ${node.id.slice(-4)}`;
  };

  return (
    <div
      className={clsx(
        'flex items-center gap-2 px-2 py-1.5 mx-1 rounded cursor-pointer',
        'transition-colors duration-100',
        isSelected
          ? 'bg-blue-600/30 border border-blue-500/50'
          : 'hover:bg-gray-800 border border-transparent',
        node.locked && 'opacity-60',
      )}
      onClick={(e) => onSelect(e.shiftKey || e.metaKey)}
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      {/* 拖拽手柄 */}
      <div className="text-gray-600 cursor-grab hover:text-gray-400">⋮⋮</div>

      {/* 类型图标 */}
      <span className="text-sm w-5 text-center">{icon}</span>

      {/* 节点名称 */}
      <span className="flex-1 text-sm text-gray-300 truncate">{getNodeName()}</span>

      {/* 操作按钮 */}
      <div className="flex items-center gap-1">
        {/* 锁定按钮 */}
        <button
          className={clsx(
            'p-1 rounded text-xs transition-colors',
            node.locked ? 'text-yellow-500' : 'text-gray-500 hover:text-gray-300',
          )}
          onClick={(e) => {
            e.stopPropagation();
            onToggleLock();
          }}
          title={node.locked ? 'Unlock' : 'Lock'}
        >
          {node.locked ? '🔒' : '🔓'}
        </button>

        {/* 可见性按钮（可选） */}
        {onToggleVisibility && (
          <button
            className="p-1 rounded text-xs text-gray-500 hover:text-gray-300 transition-colors"
            onClick={(e) => {
              e.stopPropagation();
              onToggleVisibility();
            }}
            title="Toggle Visibility"
          >
            👁
          </button>
        )}

        {/* 删除按钮（可选） */}
        {onDelete && (
          <button
            className="p-1 rounded text-xs text-gray-500 hover:text-red-400 transition-colors"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            title="Delete"
          >
            ✕
          </button>
        )}
      </div>

      {/* zIndex 指示器 */}
      <span className="text-xs text-gray-600 w-6 text-right">{node.zIndex}</span>
    </div>
  );
}
