/**
 * PuppetNodeTree - collapsible tree view of puppet nodes
 *
 * Renders the puppet's node hierarchy using parent_id relationships.
 * Displays node type icons, names, and allows selection.
 */
import { useState } from 'react';
import { TreeView } from '@neko/ui/creative';
import { usePuppetStore } from '../stores/puppet-store';
import { mapPuppetNodesToTreeViewItems } from './adapters/sharedPuppetUiAdapter';

export function PuppetNodeTree() {
  const puppetLoaded = usePuppetStore((s) => s.puppetLoaded);
  const snapshot = usePuppetStore((s) => s.puppetSnapshot);
  const selectedNativeBoneId = usePuppetStore((s) => s.selectedNativeBoneId);
  const setSelectedNativeBoneId = usePuppetStore((s) => s.setSelectedNativeBoneId);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<ReadonlySet<string>>(() => new Set());
  const [focusedId, setFocusedId] = useState<string | undefined>();

  if (!puppetLoaded || !snapshot) return null;

  const selectedTreeId = selectedNativeBoneId ?? selectedId;
  const tree = mapPuppetNodesToTreeViewItems(snapshot.nodes, selectedTreeId);

  return (
    <div className="sketch-panel" role="region" aria-label="Node Tree">
      <h3 className="sketch-panel-title m-0 mb-1">Nodes</h3>

      <TreeView
        className="max-h-40"
        expandedIds={expandedIds}
        focusedId={focusedId ?? selectedTreeId ?? snapshot.nodes[0]?.id}
        height={160}
        items={tree}
        label="Puppet nodes"
        onFocusItem={setFocusedId}
        onSelect={(id) => {
          setSelectedId(id);
          setFocusedId(id);
          const node = snapshot.nodes.find((item) => item.id === id);
          setSelectedNativeBoneId(node?.node_type === 'group' ? id : null);
        }}
        onToggleExpand={(id, expanded) => {
          setExpandedIds((current) => {
            const next = new Set(current);
            if (expanded) {
              next.add(id);
            } else {
              next.delete(id);
            }
            return next;
          });
        }}
        selectedIds={selectedTreeId ? [selectedTreeId] : undefined}
        virtualization={PUPPET_NODE_TREE_VIRTUALIZATION}
      />
    </div>
  );
}

const PUPPET_NODE_TREE_VIRTUALIZATION = {
  itemHeight: 22,
  overscan: 4,
  threshold: 200,
} as const;
