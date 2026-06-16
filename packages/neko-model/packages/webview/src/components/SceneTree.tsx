import React from 'react';
import { TreeView } from '@neko/ui/creative';
import type { SceneNodeSnapshot } from '../types';
import { useTranslation } from '../i18n/I18nContext';
import { mapModelSceneNodesToTreeViewItems } from './adapters/sharedModelUiAdapter';

interface SceneTreeProps {
  nodes: SceneNodeSnapshot[];
  selectedNodeId: string | null;
  onSelectNode: (id: string) => void;
  onSetNodeVisible?: (id: string, visible: boolean) => void;
  visibilityDisabled?: boolean;
  showHeader?: boolean;
}

interface VisibilityLabels {
  hide: string;
  show: string;
}

/**
 * Scene hierarchy tree panel (left sidebar).
 */
export function SceneTree({
  nodes,
  selectedNodeId,
  onSelectNode,
  onSetNodeVisible,
  visibilityDisabled = false,
  showHeader = true,
}: SceneTreeProps): React.JSX.Element {
  const { t } = useTranslation();
  const treeContainerRef = React.useRef<HTMLDivElement | null>(null);
  const [treeHeight, setTreeHeight] = React.useState(240);
  const visibilityLabels: VisibilityLabels = {
    hide: t('sceneTree.hideNode'),
    show: t('sceneTree.showNode'),
  };
  const [focusedId, setFocusedId] = React.useState<string | undefined>(selectedNodeId ?? undefined);
  const treeItems = React.useMemo(
    () => mapModelSceneNodesToTreeViewItems(nodes, selectedNodeId),
    [nodes, selectedNodeId],
  );

  React.useEffect(() => {
    const container = treeContainerRef.current;
    if (!container) return;

    const updateTreeHeight = () => {
      setTreeHeight(Math.max(1, Math.floor(container.getBoundingClientRect().height)));
    };
    updateTreeHeight();

    if (typeof ResizeObserver === 'undefined') {
      return;
    }
    const observer = new ResizeObserver(updateTreeHeight);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="model-tree-panel flex h-full min-h-0 w-full flex-col overflow-hidden text-xs">
      {showHeader && (
        <div className="border-b border-[var(--model-divider)] p-2 font-semibold text-[var(--model-fg)]">
          {t('sceneTree.title')}
        </div>
      )}
      <div ref={treeContainerRef} className="min-h-0 flex-1 p-1">
        <TreeView
          className="h-full"
          focusedId={focusedId ?? selectedNodeId ?? nodes[0]?.nodeId}
          height={treeHeight}
          items={treeItems}
          label={t('sceneTree.title')}
          onFocusItem={setFocusedId}
          onSelect={(id) => {
            setFocusedId(id);
            onSelectNode(id);
          }}
          onToggleVisibility={onSetNodeVisible}
          selectedIds={selectedNodeId ? [selectedNodeId] : undefined}
          visibilityDisabled={visibilityDisabled || !onSetNodeVisible}
          visibilityLabels={visibilityLabels}
          virtualization={MODEL_SCENE_TREE_VIRTUALIZATION}
        />
      </div>
    </div>
  );
}

const MODEL_SCENE_TREE_VIRTUALIZATION = {
  itemHeight: 24,
  overscan: 8,
  threshold: 200,
} as const;
