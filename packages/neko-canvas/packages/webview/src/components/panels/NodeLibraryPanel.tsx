import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CanvasNodeType, CanvasSubsystemManifest } from '@neko/shared';
import { ChevronDownIcon, ChevronRightIcon } from '@neko/shared/icons';
import { t } from '../../i18n';
import { writeNodeLibraryDragPayload } from '../../utils/nodeLibraryDrag';
import {
  getNodeLibraryCreationPolicy,
  isNodeLibraryFileBoundType,
  isNodeLibraryVisibleCreateType,
  type NodeLibraryPickerMessageType,
} from '../../utils/nodeLibraryPolicy';
import type { NodeTypeDescriptorRegistry } from '../nodes/nodeTypeDescriptor';

export interface NodeLibraryPanelProps {
  coreDescriptors: NodeTypeDescriptorRegistry;
  subsystemManifests: readonly CanvasSubsystemManifest[];
  nodeTypeDescriptors?: NodeTypeDescriptorRegistry;
  activeSubsystemIds?: readonly string[];
  onCreateNode: (type: CanvasNodeType) => void;
  onPickNodeSource?: (type: CanvasNodeType, pickerMessageType: NodeLibraryPickerMessageType) => void;
  onLoadSubsystem?: (subsystemId: CanvasSubsystemManifest['id']) => void;
}

interface NodeLibraryGroup {
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
    () => new Set(['core', 'storyboard']),
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
      className="flex h-full w-[220px] flex-shrink-0 flex-col overflow-hidden"
      style={{
        backgroundColor: 'var(--toolbar-bg)',
        borderRight: '1px solid var(--toolbar-border)',
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
          const isActive = group.subsystemId
            ? activeSubsystemIds.includes(group.subsystemId)
            : true;
          return (
            <section key={group.id} className="mb-2">
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
                {isExpanded ? <ChevronDownIcon size={14} /> : <ChevronRightIcon size={14} />}
                <span className="min-w-0 flex-1 truncate">{group.label}</span>
                {group.subsystemId && (
                  <span
                    className="rounded px-1.5 py-0.5 text-[10px]"
                    style={{
                      backgroundColor: isActive
                        ? 'var(--selection-bg)'
                        : 'var(--badge-neutral-bg)',
                      color: isActive ? 'var(--badge-fg)' : 'var(--toolbar-fg-secondary)',
                    }}
                  >
                    {isActive ? t('library.active') : t('library.available')}
                  </span>
                )}
              </button>

              {isExpanded && (
                <div className="mt-1 grid gap-1">
                  {group.nodeTypes.map((nodeType) => {
                    const descriptor = descriptors[nodeType];
                    const creationPolicy = getNodeLibraryCreationPolicy(nodeType);
                    const canCreateDirectly = creationPolicy.kind === 'create';
                    const canPickSource = Boolean(creationPolicy.pickerMessageType);
                    const isActionable = canCreateDirectly || canPickSource;
                    const badge = creationPolicy.badgeKey ? t(creationPolicy.badgeKey) : undefined;
                    const title = t(creationPolicy.titleKey, {
                      node: resolveNodeLibraryLabel(nodeType, descriptor),
                    });
                    return (
                      <button
                        key={nodeType}
                        type="button"
                        draggable={creationPolicy.canDragToCreate}
                        aria-disabled={!isActionable ? true : undefined}
                        title={title}
                        className="flex min-h-[34px] w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs"
                        style={{
                          backgroundColor: 'var(--control-bg)',
                          border: '1px solid var(--control-border)',
                          color: canCreateDirectly ? 'var(--control-fg)' : 'var(--toolbar-fg)',
                          opacity: isActionable ? 1 : 0.72,
                        }}
                        onClick={() => {
                          if (group.subsystemId) {
                            requestSubsystemLoad(group.subsystemId);
                          }
                          if (canCreateDirectly) {
                            onCreateNode(nodeType);
                            return;
                          }
                          if (creationPolicy.pickerMessageType) {
                            onPickNodeSource?.(nodeType, creationPolicy.pickerMessageType);
                          }
                        }}
                        onDragStart={(event) => {
                          if (group.subsystemId) {
                            requestSubsystemLoad(group.subsystemId);
                          }
                          if (!creationPolicy.canDragToCreate) {
                            event.preventDefault();
                            return;
                          }
                          writeNodeLibraryDragPayload(event.dataTransfer, nodeType);
                        }}
                      >
                        <span
                          className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded text-sm"
                          style={{
                            backgroundColor: `${descriptor?.tagColor ?? '#6b7280'}20`,
                            color: descriptor?.tagColor ?? 'var(--toolbar-fg-secondary)',
                          }}
                        >
                          {descriptor?.icon ?? nodeType.charAt(0).toUpperCase()}
                        </span>
                        <span className="min-w-0 flex-1 truncate">
                          {resolveNodeLibraryLabel(nodeType, descriptor)}
                        </span>
                        {badge && (
                          <span
                            className="rounded px-1.5 py-0.5 text-[10px]"
                            style={{
                              backgroundColor: 'var(--badge-neutral-bg)',
                              color: 'var(--toolbar-fg-secondary)',
                            }}
                          >
                            {badge}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
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
