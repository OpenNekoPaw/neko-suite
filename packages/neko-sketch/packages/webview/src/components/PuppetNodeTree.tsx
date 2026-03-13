/**
 * PuppetNodeTree - collapsible tree view of Inochi2D puppet nodes
 *
 * Renders the puppet's node hierarchy using parent_id relationships.
 * Displays node type icons, names, and allows selection.
 */
import { useCallback, useState } from 'react';
import { useSketchStore } from '../stores';
import type { PuppetNodeSnapshot } from '../animation/types';

interface TreeNode {
  node: PuppetNodeSnapshot;
  children: TreeNode[];
}

/** Build a tree structure from a flat list of nodes using parent_id */
function buildTree(nodes: PuppetNodeSnapshot[]): TreeNode[] {
  const nodeMap = new Map<string, TreeNode>();
  const roots: TreeNode[] = [];

  // Create TreeNode wrappers
  for (const node of nodes) {
    nodeMap.set(node.id, { node, children: [] });
  }

  // Link parents to children
  for (const node of nodes) {
    const treeNode = nodeMap.get(node.id);
    if (!treeNode) continue;

    if (node.parent_id) {
      const parent = nodeMap.get(node.parent_id);
      if (parent) {
        parent.children.push(treeNode);
        continue;
      }
    }
    roots.push(treeNode);
  }

  return roots;
}

const NODE_TYPE_ICONS: Record<string, string> = {
  root: '◈',
  part: '▣',
  deform: '◇',
  composite: '⊞',
  group: '▷',
};

export function PuppetNodeTree() {
  const show = useSketchStore((s) => s.showLayerPanel);
  const puppetLoaded = useSketchStore((s) => s.puppetLoaded);
  const snapshot = useSketchStore((s) => s.puppetSnapshot);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  if (!show || !puppetLoaded || !snapshot) return null;

  const tree = buildTree(snapshot.nodes);

  return (
    <div className="sketch-panel" role="region" aria-label="Node Tree">
      <h3 className="sketch-panel-title m-0 mb-1">Nodes</h3>

      <div className="flex flex-col text-xs max-h-40 overflow-y-auto">
        {tree.map((root) => (
          <NodeItem
            key={root.node.id}
            treeNode={root}
            depth={0}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
        ))}
      </div>
    </div>
  );
}

function NodeItem(props: {
  treeNode: TreeNode;
  depth: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const { treeNode, depth, selectedId, onSelect } = props;
  const { node, children } = treeNode;
  const [expanded, setExpanded] = useState(depth < 2);

  const hasChildren = children.length > 0;
  const isSelected = node.id === selectedId;
  const icon = NODE_TYPE_ICONS[node.node_type] ?? '○';

  const handleToggle = useCallback(() => {
    if (hasChildren) setExpanded((prev) => !prev);
  }, [hasChildren]);

  const handleSelect = useCallback(() => {
    onSelect(node.id);
  }, [node.id, onSelect]);

  return (
    <>
      <div
        role="treeitem"
        tabIndex={0}
        aria-selected={isSelected}
        aria-expanded={hasChildren ? expanded : undefined}
        className={`flex items-center gap-1 py-0.5 cursor-pointer rounded ${
          isSelected ? 'bg-[var(--vscode-list-activeSelectionBackground)]' : ''
        }`}
        style={{ paddingLeft: `${depth * 12 + 4}px` }}
        onClick={handleSelect}
        onDoubleClick={handleToggle}
        onKeyDown={(e) => {
          if (e.key === 'Enter') handleSelect();
          if (e.key === ' ') handleToggle();
        }}
      >
        {hasChildren ? (
          <span
            className="w-3 text-center opacity-60 cursor-pointer select-none"
            onClick={(e) => {
              e.stopPropagation();
              handleToggle();
            }}
            aria-hidden
          >
            {expanded ? '▾' : '▸'}
          </span>
        ) : (
          <span className="w-3" />
        )}
        <span className="opacity-60" title={node.node_type} aria-hidden>
          {icon}
        </span>
        <span className="truncate flex-1">{node.name}</span>
        {node.has_mesh && (
          <span className="opacity-40 text-[10px]" title="Has mesh">
            ▣
          </span>
        )}
      </div>

      {expanded &&
        children.map((child) => (
          <NodeItem
            key={child.node.id}
            treeNode={child}
            depth={depth + 1}
            selectedId={selectedId}
            onSelect={onSelect}
          />
        ))}
    </>
  );
}
