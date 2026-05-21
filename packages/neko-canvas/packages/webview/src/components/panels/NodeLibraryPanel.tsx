import { useMemo, useState } from 'react';
import type { CanvasNodeType, CanvasSubsystemManifest } from '@neko/shared';
import { ChevronDownIcon, ChevronRightIcon } from '@neko/shared/icons';
import { t } from '../../i18n';
import type { NodeTypeDescriptorRegistry } from '../nodes/nodeTypeDescriptor';

export interface NodeLibraryPanelProps {
  coreDescriptors: NodeTypeDescriptorRegistry;
  subsystemManifests: readonly CanvasSubsystemManifest[];
  nodeTypeDescriptors?: NodeTypeDescriptorRegistry;
  activeSubsystemIds?: readonly string[];
  onCreateNode: (type: CanvasNodeType) => void;
  onLoadSubsystem?: (subsystemId: CanvasSubsystemManifest['id']) => void;
}

interface NodeLibraryGroup {
  id: string;
  label: string;
  nodeTypes: readonly CanvasNodeType[];
  subsystemId?: CanvasSubsystemManifest['id'];
}

export function NodeLibraryPanel({
  coreDescriptors,
  subsystemManifests,
  nodeTypeDescriptors = {},
  activeSubsystemIds = [],
  onCreateNode,
  onLoadSubsystem,
}: NodeLibraryPanelProps) {
  const [expandedGroupIds, setExpandedGroupIds] = useState<Set<string>>(
    () => new Set(['core', 'storyboard']),
  );

  const groups = useMemo(
    () => createNodeLibraryGroups(coreDescriptors, subsystemManifests),
    [coreDescriptors, subsystemManifests],
  );

  const descriptors = useMemo(
    () => ({ ...coreDescriptors, ...nodeTypeDescriptors }),
    [coreDescriptors, nodeTypeDescriptors],
  );

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
                    if (next.has(group.id)) next.delete(group.id);
                    else next.add(group.id);
                    return next;
                  });
                  if (group.subsystemId) {
                    onLoadSubsystem?.(group.subsystemId);
                  }
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
                    return (
                      <button
                        key={nodeType}
                        type="button"
                        className="flex min-h-[34px] w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs"
                        style={{
                          backgroundColor: 'var(--control-bg)',
                          border: '1px solid var(--control-border)',
                          color: 'var(--control-fg)',
                        }}
                        onClick={() => {
                          if (group.subsystemId) {
                            onLoadSubsystem?.(group.subsystemId);
                          }
                          onCreateNode(nodeType);
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
                          {descriptor ? t(descriptor.labelKey) : nodeType}
                        </span>
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
  return [
    {
      id: 'core',
      label: t('library.basic'),
      nodeTypes: coreNodeTypes,
    },
    ...subsystemManifests.map((manifest) => ({
      id: manifest.id,
      label: manifest.label,
      nodeTypes: manifest.triggerNodeTypes,
      subsystemId: manifest.id,
    })),
  ];
}
