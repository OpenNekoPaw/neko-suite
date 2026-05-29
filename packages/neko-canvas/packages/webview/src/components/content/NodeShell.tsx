import { useMemo, useCallback } from 'react';
import type { ContainerSection, DocumentArchiveResourceRef } from '@neko/shared';
import { NodeHeader } from './NodeHeader';
import type { NodeHeaderBadge } from './NodeHeader';
import { ContainerRenderer } from './ContainerRenderer';
import type { NodeContentRenderContext } from './types';
import { createBuiltInNodeTypeDescriptors } from '../nodes/nodeTypeDescriptors';
import { useCanvasStore } from '../../stores/canvasStore';
import { getGlobalVSCodeApi } from '../../utils/vscode';
import { t } from '../../i18n';
import { ContainerActionBar, readDocumentResourceRef } from './node-card';

export interface NodeShellProps {
  section: ContainerSection;
  context: NodeContentRenderContext;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}

export function NodeShell({ section, context, isCollapsed, onToggleCollapse }: NodeShellProps) {
  const descriptors = useMemo(() => createBuiltInNodeTypeDescriptors(), []);
  const openContentOverlay = useCanvasStore((s) => s.openContentOverlay);

  const { node } = context;
  const descriptor = context.nodeTypeDescriptors?.[node.type] ?? descriptors[node.type];
  const preview = node.preview;

  const tagLabel = descriptor?.tagLabel ?? node.type.toUpperCase();
  const tagColor = descriptor?.tagColor ?? '#6b7280';
  const title = resolveNodeTitle(node, preview?.title);
  const badges = resolveNodeHeaderBadges(node, (preview?.badges ?? []) as NodeHeaderBadge[]);

  const assetInfo = useMemo(() => getNodeAssetInfo(node), [node]);

  const handleOpenPreview = useCallback(() => {
    if (!assetInfo) return;
    const vscode = getGlobalVSCodeApi();
    vscode?.postMessage({
      type: 'openMediaPreview',
      assetPath: assetInfo.assetPath,
      mediaType: assetInfo.mediaType,
      ...(assetInfo.documentResourceRef
        ? { documentResourceRef: assetInfo.documentResourceRef }
        : {}),
    });
  }, [assetInfo]);

  const { controlSections, contentSections } = useMemo(() => {
    const rootSections = section.sections ?? [];
    return {
      controlSections: rootSections.filter(isControlSection),
      contentSections: rootSections.filter((s) => !isControlSection(s)),
    };
  }, [section.sections]);

  const bodyClassName = 'flex min-h-0 min-w-0 flex-1 flex-col overflow-auto';

  return (
    <div
      className="flex h-full min-h-0 min-w-0 flex-col"
      data-node-density={context.layout.density}
      data-node-overflow={context.layout.overflow}
    >
      <NodeHeader
        tagLabel={tagLabel}
        tagColor={tagColor}
        title={title}
        badges={badges}
        collapsible={true}
        isCollapsed={isCollapsed}
        onToggleCollapse={onToggleCollapse}
        onOpenPreview={assetInfo ? handleOpenPreview : undefined}
        onExpand={() => openContentOverlay(node.id)}
      />
      {!isCollapsed && (
        <div className={bodyClassName}>
          <ContainerActionBar
            node={node}
            allNodes={context.allNodes}
            selectedNodeIds={context.selectedNodeIds}
            isSelected={context.isSelected}
          />
          {controlSections.length > 0 && (
            <div style={{ borderBottom: '1px solid var(--node-divider)' }}>
              {controlSections.map((s) => (
                <ContainerRenderer
                  key={s.id}
                  section={s}
                  context={{ ...context, depth: context.depth + 1 }}
                />
              ))}
            </div>
          )}
          <ContainerRenderer
            section={{
              ...section,
              sections: contentSections.length > 0 ? contentSections : undefined,
            }}
            context={context}
          />
        </div>
      )}
    </div>
  );
}

function isControlSection(section: ContainerSection): boolean {
  return section.visibleWhen === 'selected' && section.layout === 'row';
}

function resolveNodeHeaderBadges(
  node: NodeShellProps['context']['node'],
  previewBadges: NodeHeaderBadge[],
): NodeHeaderBadge[] {
  switch (node.type) {
    case 'scene':
      return [
        {
          label: t('scene.shotCountCompact', { count: node.container?.childIds.length ?? 0 }),
          tone: 'info',
        },
      ];
    case 'gallery':
      return [
        {
          label: t('gallery.viewCountCompact', { count: node.container?.childIds.length ?? 0 }),
          tone: 'info',
        },
      ];
    default:
      return previewBadges;
  }
}

interface NodeAssetInfo {
  assetPath: string;
  mediaType?: string;
  documentResourceRef?: DocumentArchiveResourceRef;
}

function getNodeAssetInfo(node: NodeShellProps['context']['node']): NodeAssetInfo | undefined {
  const data = node.data as Record<string, unknown> | undefined;
  if (!data) return undefined;

  const assetPath = data['runtimeAssetPath'] ?? data['assetPath'];
  if (typeof assetPath === 'string' && assetPath) {
    const mediaType = data['mediaType'];
    const documentResourceRef = readDocumentResourceRef(node);
    return {
      assetPath,
      mediaType: typeof mediaType === 'string' ? mediaType : undefined,
      ...(documentResourceRef ? { documentResourceRef } : {}),
    };
  }

  return undefined;
}

const NODE_TYPE_I18N_KEY: Partial<Record<string, string>> = {
  annotation: 'node.note',
  scene: 'node.sceneGroup',
  text: 'node.newText',
  'canvas-embed': 'node.canvasEmbed',
};

function resolveNodeTitle(
  node: NodeShellProps['context']['node'],
  previewTitle: string | undefined,
): string {
  if (previewTitle) {
    return extractFilename(previewTitle);
  }
  const key = NODE_TYPE_I18N_KEY[node.type] ?? `node.${node.type}`;
  return t(key) || node.id;
}

function extractFilename(path: string): string {
  const lastSlash = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
  return lastSlash >= 0 ? path.slice(lastSlash + 1) : path;
}
