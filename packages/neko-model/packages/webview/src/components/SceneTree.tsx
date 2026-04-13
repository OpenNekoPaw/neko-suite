import React from 'react';
import type { SceneNodeSnapshot } from '../types';

interface SceneTreeProps {
  nodes: SceneNodeSnapshot[];
  selectedNodeId: string | null;
  onSelectNode: (id: string) => void;
}

/**
 * Scene hierarchy tree panel (left sidebar).
 */
export function SceneTree({
  nodes,
  selectedNodeId,
  onSelectNode,
}: SceneTreeProps): React.JSX.Element {
  // Build tree structure
  const rootNodes = nodes.filter((n) => !n.parentId);

  return (
    <div className="model-tree-panel w-52 overflow-y-auto text-xs">
      <div className="border-b border-[var(--model-divider)] p-2 font-semibold text-[var(--model-fg)]">
        Scene
      </div>
      <div className="p-1">
        {rootNodes.map((node) => (
          <TreeNode
            key={node.id}
            node={node}
            allNodes={nodes}
            selectedNodeId={selectedNodeId}
            onSelectNode={onSelectNode}
            depth={0}
          />
        ))}
      </div>
    </div>
  );
}

interface TreeNodeProps {
  node: SceneNodeSnapshot;
  allNodes: SceneNodeSnapshot[];
  selectedNodeId: string | null;
  onSelectNode: (id: string) => void;
  depth: number;
}

function TreeNode({
  node,
  allNodes,
  selectedNodeId,
  onSelectNode,
  depth,
}: TreeNodeProps): React.JSX.Element {
  const children = allNodes.filter((n) => n.parentId === node.id);
  const isSelected = selectedNodeId === node.id;

  const icon = node.hasCamera
    ? 'camera'
    : node.hasLight
      ? 'light'
      : node.hasMesh
        ? 'mesh'
        : node.hasSkeleton
          ? 'skeleton'
          : 'node';

  const iconMap: Record<string, string> = {
    camera: '\u{1F3A5}',
    light: '\u{1F4A1}',
    mesh: '\u25A0',
    skeleton: '\u{1F9B4}',
    node: '\u25CB',
  };

  return (
    <div>
      <div
        className={`model-selectable-row flex cursor-pointer items-center gap-1 px-1 py-0.5 ${
          isSelected ? 'model-selected-row' : ''
        }`}
        style={{ paddingLeft: `${depth * 12 + 4}px` }}
        onClick={() => onSelectNode(node.id)}
      >
        <span className="text-[10px] text-[var(--model-fg-secondary)] opacity-80">
          {iconMap[icon]}
        </span>
        <span className="truncate">{node.name}</span>
      </div>
      {children.map((child) => (
        <TreeNode
          key={child.id}
          node={child}
          allNodes={allNodes}
          selectedNodeId={selectedNodeId}
          onSelectNode={onSelectNode}
          depth={depth + 1}
        />
      ))}
    </div>
  );
}
