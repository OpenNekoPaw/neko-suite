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
    <div className="w-52 bg-[var(--vscode-sideBar-background,#252526)] border-r border-[var(--vscode-sideBar-border,#3c3c3c)] overflow-y-auto text-xs">
      <div className="p-2 text-[var(--vscode-sideBarTitle-foreground,#bbbbbb)] font-semibold border-b border-[var(--vscode-sideBar-border,#3c3c3c)]">
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
        className={`flex items-center gap-1 px-1 py-0.5 cursor-pointer rounded ${
          isSelected
            ? 'bg-[var(--vscode-list-activeSelectionBackground,#094771)]'
            : 'hover:bg-[var(--vscode-list-hoverBackground,#2a2d2e)]'
        }`}
        style={{ paddingLeft: `${depth * 12 + 4}px` }}
        onClick={() => onSelectNode(node.id)}
      >
        <span className="opacity-60 text-[10px]">{iconMap[icon]}</span>
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
