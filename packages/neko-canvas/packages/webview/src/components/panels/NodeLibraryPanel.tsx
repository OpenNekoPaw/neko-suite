import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getKeyboardBoundaryMetadata } from '@neko/ui/keyboard';
import type { CanvasNodeType, CanvasSubsystemManifest } from '@neko/shared';
import { TreeView } from '@neko/ui/creative';
import { toCodiconClassName } from '@neko/ui/icons';
import { t } from '../../i18n';
import { writeNodeLibraryDragPayload } from '../../utils/nodeLibraryDrag';
import {
  getNodeLibraryCreationPolicy,
  isNodeLibraryFileBoundType,
  isNodeLibraryVisibleCreateType,
  type NodeLibraryPickerMessageType,
} from '../../utils/nodeLibraryPolicy';
import type { NodeTypeDescriptorRegistry } from '../nodes/nodeTypeDescriptor';
import { mapCanvasNodeLibraryGroupToTreeItems } from '../adapters/sharedCanvasUiAdapter';

export interface NodeLibraryPanelProps {
  coreDescriptors: NodeTypeDescriptorRegistry;
  subsystemManifests: readonly CanvasSubsystemManifest[];
  nodeTypeDescriptors?: NodeTypeDescriptorRegistry;
  activeSubsystemIds?: readonly string[];
  onCreateNode: (type: CanvasNodeType) => void;
  onPickNodeSource?: (
    type: CanvasNodeType,
    pickerMessageType: NodeLibraryPickerMessageType,
  ) => void;
  onLoadSubsystem?: (subsystemId: CanvasSubsystemManifest['id']) => void;
}

export interface NodeLibraryGroup {
  id: string;
  label: string;
  nodeTypes: readonly CanvasNodeType[];
  subsystemId?: CanvasSubsystemManifest['id'];
}

const FILE_REFERENCE_GROUP_ID = 'file-references';

export function NodeLibraryPanel({
  coreDescriptors,
  subsystemManifests,
  nodeTypeDescriptors = {},
  activeSubsystemIds = [],
  onCreateNode,
  onPickNodeSource,
  onLoadSubsystem,
}: NodeLibraryPanelProps) {
  const [expandedGroupIds, setExpandedGroupIds] = useState<Set<string>>(
    () => new Set(['core', 'storyboard', FILE_REFERENCE_GROUP_ID]),
  );
  const requestedSubsystemIdsRef = useRef<Set<CanvasSubsystemManifest['id']>>(new Set());

  const groups = useMemo(
    () => createNodeLibraryGroups(coreDescriptors, subsystemManifests),
    [coreDescriptors, subsystemManifests],
  );

  const descriptors = useMemo(
    () => ({ ...coreDescriptors, ...nodeTypeDescriptors }),
    [coreDescriptors, nodeTypeDescriptors],
  );

  const requestSubsystemLoad = useCallback(
    (subsystemId: CanvasSubsystemManifest['id']) => {
      requestSubsystemLoadOnce(requestedSubsystemIdsRef.current, subsystemId, onLoadSubsystem);
    },
    [onLoadSubsystem],
  );

  useEffect(() => {
    for (const group of groups) {
      if (group.subsystemId && expandedGroupIds.has(group.id)) {
        requestSubsystemLoad(group.subsystemId);
      }
    }
  }, [expandedGroupIds, groups, requestSubsystemLoad]);

  return (
    <aside
      id="canvas-right-node-tree-panel"
      aria-label={t('library.title')}
      className="flex h-full w-[220px] flex-shrink-0 flex-col overflow-hidden"
      data-canvas-right-node-tree="true"
      {...getKeyboardBoundaryMetadata({
        scope: 'property-panel',
        ownerId: 'canvas-node-library',
        priority: 10,
        ownedKeys: [
          'Enter',
          'Escape',
          'Space',
          'Tab',
          'ArrowUp',
          'ArrowDown',
          'ArrowLeft',
          'ArrowRight',
        ],
      })}
      style={{
        backgroundColor: 'var(--toolbar-bg)',
        borderLeft: '1px solid var(--toolbar-border)',
        color: 'var(--toolbar-fg)',
      }}
    >
      <div
        className="flex h-10 items-center px-3 text-xs font-semibold uppercase"
        style={{ borderBottom: '1px solid var(--toolbar-border)' }}
      >
        {t('library.title')}
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {groups.map((group) => {
          const isExpanded = expandedGroupIds.has(group.id);
          const treeItems = mapCanvasNodeLibraryGroupToTreeItems({
            activeSubsystemIds,
            descriptors,
            group,
          });
          const nodeItems = treeItems[0]?.children ?? [];
          return (
            <section key={group.id} className="mb-2" data-node-library-group-id={group.id}>
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs"
                style={{
                  backgroundColor: isExpanded ? 'var(--control-active)' : 'transparent',
                  color: 'var(--toolbar-fg)',
                }}
                onClick={() => {
                  setExpandedGroupIds((current) => {
                    const next = new Set(current);
                    if (next.has(group.id)) {
                      next.delete(group.id);
                    } else {
                      next.add(group.id);
                      if (group.subsystemId) {
                        requestSubsystemLoad(group.subsystemId);
                      }
                    }
                    return next;
                  });
                }}
              >
                <span
                  aria-hidden="true"
                  className={toCodiconClassName(isExpanded ? 'chevron-down' : 'chevron-right')}
                />
                <span className="min-w-0 flex-1 truncate">{group.label}</span>
                {group.subsystemId && (
                  <span
                    className="rounded px-1.5 py-0.5 text-[10px]"
                    style={{
                      backgroundColor: activeSubsystemIds.includes(group.subsystemId)
                        ? 'var(--selection-bg)'
                        : 'var(--badge-neutral-bg)',
                      color: activeSubsystemIds.includes(group.subsystemId)
                        ? 'var(--badge-fg)'
                        : 'var(--toolbar-fg-secondary)',
                    }}
                  >
                    {activeSubsystemIds.includes(group.subsystemId)
                      ? t('library.active')
                      : t('library.available')}
                  </span>
                )}
              </button>

              {isExpanded && (
                <TreeView
                  className="mt-1 border-0 bg-transparent"
                  height={Math.min(320, 32 + group.nodeTypes.length * 28)}
                  items={nodeItems}
                  label={group.label}
                  virtualization={{ itemHeight: 28, threshold: 200 }}
                  onDragStart={(id, event) => {
                    const nodeType = id as CanvasNodeType;
                    const creationPolicy = getNodeLibraryCreationPolicy(nodeType);
                    if (group.subsystemId) {
                      requestSubsystemLoad(group.subsystemId);
                    }
                    if (!creationPolicy.canDragToCreate || !event.dataTransfer) {
                      event.preventDefault();
                      return;
                    }
                    writeNodeLibraryDragPayload(event.dataTransfer, nodeType);
                  }}
                  onSelect={(id) => {
                    const nodeType = id as CanvasNodeType;
                    const creationPolicy = getNodeLibraryCreationPolicy(nodeType);
                    if (group.subsystemId) {
                      requestSubsystemLoad(group.subsystemId);
                    }
                    if (creationPolicy.kind === 'create') {
                      onCreateNode(nodeType);
                      return;
                    }
                    if (creationPolicy.pickerMessageType) {
                      onPickNodeSource?.(nodeType, creationPolicy.pickerMessageType);
                    }
                  }}
                />
              )}
            </section>
          );
        })}
      </div>
    </aside>
  );
}

export function createNodeLibraryGroups(
  coreDescriptors: NodeTypeDescriptorRegistry,
  subsystemManifests: readonly CanvasSubsystemManifest[],
): readonly NodeLibraryGroup[] {
  const coreNodeTypes = Object.keys(coreDescriptors) as CanvasNodeType[];
  const fileReferenceNodeTypes: CanvasNodeType[] = [];
  const fileReferenceNodeTypeSet = new Set<CanvasNodeType>();

  const collectVisibleNodeTypes = (nodeTypes: readonly CanvasNodeType[]): CanvasNodeType[] =>
    nodeTypes.filter((nodeType) => {
      if (isNodeLibraryFileBoundType(nodeType)) {
        if (!fileReferenceNodeTypeSet.has(nodeType)) {
          fileReferenceNodeTypeSet.add(nodeType);
          fileReferenceNodeTypes.push(nodeType);
        }
        return false;
      }
      return isNodeLibraryVisibleCreateType(nodeType);
    });

  const groups: NodeLibraryGroup[] = [];
  const coreVisibleNodeTypes = collectVisibleNodeTypes(coreNodeTypes);
  if (coreVisibleNodeTypes.length > 0) {
    groups.push({
      id: 'core',
      label: t('library.basic'),
      nodeTypes: coreVisibleNodeTypes,
    });
  }

  for (const manifest of subsystemManifests) {
    const visibleNodeTypes = collectVisibleNodeTypes(manifest.triggerNodeTypes);
    if (visibleNodeTypes.length === 0) {
      continue;
    }
    groups.push({
      id: manifest.id,
      label: t(`library.group.${manifest.id}`),
      nodeTypes: visibleNodeTypes,
      subsystemId: manifest.id,
    });
  }

  if (fileReferenceNodeTypes.length > 0) {
    groups.push({
      id: FILE_REFERENCE_GROUP_ID,
      label: t('library.group.fileReferences'),
      nodeTypes: fileReferenceNodeTypes,
    });
  }

  return groups;
}

const NODE_TYPE_LABEL_KEY_FALLBACK: Partial<Record<CanvasNodeType, string>> = {
  annotation: 'node.note',
  text: 'toolbar.text',
  scene: 'node.sceneGroup',
  'canvas-embed': 'node.canvasEmbed',
  'narrative-scene': 'node.narrativeScene',
  'narrative-note': 'node.narrativeNote',
  'representation-slot': 'node.representationSlot',
  'generated-asset': 'node.generatedAsset',
};

export function resolveNodeLibraryLabel(
  nodeType: CanvasNodeType,
  descriptor?: NodeTypeDescriptorRegistry[CanvasNodeType],
): string {
  const key = descriptor?.labelKey ?? NODE_TYPE_LABEL_KEY_FALLBACK[nodeType] ?? `node.${nodeType}`;
  const label = t(key);
  return label === key ? nodeType : label;
}

export function requestSubsystemLoadOnce(
  requestedSubsystemIds: Set<CanvasSubsystemManifest['id']>,
  subsystemId: CanvasSubsystemManifest['id'],
  onLoadSubsystem?: (subsystemId: CanvasSubsystemManifest['id']) => void,
): boolean {
  if (requestedSubsystemIds.has(subsystemId)) {
    return false;
  }
  requestedSubsystemIds.add(subsystemId);
  onLoadSubsystem?.(subsystemId);
  return true;
}
