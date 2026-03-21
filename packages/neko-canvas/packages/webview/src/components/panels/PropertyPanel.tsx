/**
 * PropertyPanel - Node property inspector panel
 *
 * Displays and allows editing of selected node properties:
 * - Position (x, y)
 * - Size (width, height)
 * - Lock state
 * - Node-type-specific properties
 */

import { useCallback } from 'react';
import type { CanvasNode, CanvasConnection, ConnectionType } from '@neko/shared';
import { t } from '../../i18n';
import { PortEditor } from './PortEditor';

// =============================================================================
// Types
// =============================================================================

export interface PropertyPanelProps {
  selectedNodes: CanvasNode[];
  selectedConnections?: CanvasConnection[];
  onUpdateNode: (id: string, updates: Partial<CanvasNode>) => void;
  onUpdateNodeData: (id: string, data: Record<string, unknown>) => void;
  onUpdateConnection?: (id: string, updates: Partial<CanvasConnection>) => void;
  onUpdatePorts?: (id: string, ports: import('@neko/shared').PortDefinition[]) => void;
  onDeleteNode: (id: string) => void;
  onToggleLock: (id: string) => void;
  width?: number;
}

// =============================================================================
// Component
// =============================================================================

export function PropertyPanel({
  selectedNodes,
  selectedConnections = [],
  onUpdateNode,
  onUpdateNodeData,
  onUpdateConnection,
  onUpdatePorts,
  onDeleteNode,
  onToggleLock,
  width = 240,
}: PropertyPanelProps) {
  // Show connection properties when a connection is selected and no nodes
  if (selectedNodes.length === 0 && selectedConnections.length === 1) {
    const conn = selectedConnections[0]!;
    return (
      <div
        className="flex flex-col h-full overflow-y-auto"
        style={{
          backgroundColor: 'var(--toolbar-bg)',
          borderLeft: '1px solid var(--toolbar-border)',
          width,
        }}
      >
        <PanelHeader title={t('panel.connection')} />
        <ConnectionProperties connection={conn} onUpdate={onUpdateConnection} />
      </div>
    );
  }

  if (selectedNodes.length === 0) {
    return (
      <div
        className="flex flex-col h-full"
        style={{
          backgroundColor: 'var(--toolbar-bg)',
          borderLeft: '1px solid var(--toolbar-border)',
          width,
        }}
      >
        <PanelHeader title={t('panel.properties')} />
        <div className="flex-1 flex items-center justify-center">
          <p className="text-xs" style={{ color: 'var(--panel-fg-secondary)' }}>
            {t('panel.noSelection')}
          </p>
        </div>
      </div>
    );
  }

  const isMulti = selectedNodes.length > 1;
  const node = selectedNodes[0]!;

  return (
    <div
      className="flex flex-col h-full overflow-y-auto"
      style={{
        backgroundColor: 'var(--toolbar-bg)',
        borderLeft: '1px solid var(--toolbar-border)',
        width,
        minWidth: 200,
        maxWidth: 400,
      }}
    >
      <PanelHeader
        title={
          isMulti
            ? t('panel.multiSelected', { count: selectedNodes.length })
            : getNodeTypeLabel(node.type)
        }
      />

      {isMulti ? (
        <MultiSelectionInfo nodes={selectedNodes} />
      ) : (
        <>
          {/* Position & Size */}
          <PanelSection title={t('panel.transform')}>
            <div className="grid grid-cols-2 gap-2">
              <NumberField
                label="X"
                value={node.position.x}
                onChange={(v) => onUpdateNode(node.id, { position: { ...node.position, x: v } })}
              />
              <NumberField
                label="Y"
                value={node.position.y}
                onChange={(v) => onUpdateNode(node.id, { position: { ...node.position, y: v } })}
              />
              <NumberField
                label="W"
                value={node.size.width}
                onChange={(v) =>
                  onUpdateNode(node.id, { size: { ...node.size, width: Math.max(50, v) } })
                }
              />
              <NumberField
                label="H"
                value={node.size.height}
                onChange={(v) =>
                  onUpdateNode(node.id, { size: { ...node.size, height: Math.max(30, v) } })
                }
              />
              <NumberField
                label="R"
                value={node.rotation ?? 0}
                onChange={(v) =>
                  onUpdateNode(node.id, { rotation: ((v % 360) + 360) % 360 })
                }
              />
            </div>
          </PanelSection>

          {/* Layer */}
          <PanelSection title={t('panel.layer')}>
            <div className="flex items-center justify-between">
              <span className="text-xs" style={{ color: 'var(--panel-fg-secondary)' }}>
                Z-Index: {node.zIndex}
              </span>
              <button
                style={{
                  fontSize: 11,
                  padding: '3px 8px',
                  borderRadius: 5,
                  border: 'none',
                  cursor: 'pointer',
                  transition: 'background 0.15s',
                  color: node.locked ? '#ffffff' : '#ffffff',
                  backgroundColor: node.locked ? '#f59e0b' : '#6b7280',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = node.locked ? '#d97706' : '#4b5563';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = node.locked ? '#f59e0b' : '#6b7280';
                }}
                onClick={() => onToggleLock(node.id)}
              >
                {node.locked ? '🔒 ' + t('menu.unlock') : '🔓 ' + t('menu.lock')}
              </button>
            </div>
          </PanelSection>

          {/* Node-specific properties */}
          <NodeSpecificProperties
            node={node}
            onUpdateData={(data) => onUpdateNodeData(node.id, data)}
          />

          {/* Port editor */}
          {onUpdatePorts && (
            <PortEditor node={node} onUpdatePorts={onUpdatePorts} />
          )}

          {/* Actions */}
          <PanelSection title={t('panel.actions')}>
            <button
              style={{
                width: '100%',
                fontSize: 12,
                padding: '5px 0',
                borderRadius: 6,
                border: 'none',
                backgroundColor: '#ef4444',
                color: '#ffffff',
                cursor: 'pointer',
                transition: 'background 0.15s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#dc2626';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = '#ef4444';
              }}
              onClick={() => onDeleteNode(node.id)}
            >
              🗑 {t('menu.delete')}
            </button>
          </PanelSection>
        </>
      )}
    </div>
  );
}

// =============================================================================
// Sub-components
// =============================================================================

function PanelHeader({ title }: { title: string }) {
  return (
    <div
      className="flex items-center px-3 shrink-0"
      style={{
        height: 36,
        color: 'var(--panel-fg)',
        fontSize: 12,
        fontWeight: 600,
        letterSpacing: '0.02em',
        borderBottom: '1px solid var(--toolbar-border)',
        /* 与 canvas titlebar 背景统一，稍深于 panel body */
        backgroundColor: 'rgba(0,0,0,0.12)',
        userSelect: 'none',
      }}
    >
      {title}
    </div>
  );
}

function PanelSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      className="px-3"
      style={{
        paddingTop: 10,
        paddingBottom: 10,
        borderBottom: '1px solid var(--panel-divider)',
      }}
    >
      <div
        style={{
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: 'var(--panel-fg-secondary)',
          marginBottom: 8,
          userSelect: 'none',
        }}
      >
        {title}
      </div>
      {children}
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const v = parseFloat(e.target.value);
      if (!isNaN(v)) onChange(v);
    },
    [onChange],
  );

  return (
    <div className="flex items-center gap-1.5">
      <span
        style={{
          fontSize: 10,
          fontWeight: 600,
          width: 14,
          textAlign: 'center',
          color: 'var(--panel-fg-secondary)',
          userSelect: 'none',
          flexShrink: 0,
        }}
      >
        {label}
      </span>
      <input
        type="number"
        value={Math.round(value)}
        onChange={handleChange}
        className="flex-1 min-w-0 outline-none"
        style={{
          fontSize: 12,
          padding: '3px 6px',
          borderRadius: 5,
          border: '1px solid var(--control-border)',
          backgroundColor: 'var(--control-bg)',
          color: 'var(--control-fg)',
          fontVariantNumeric: 'tabular-nums',
          transition: 'border-color 0.15s, box-shadow 0.15s',
        }}
        onFocus={(e) => {
          e.currentTarget.style.borderColor = 'var(--accent-blue)';
          e.currentTarget.style.boxShadow = '0 0 0 2.5px rgba(59,130,246,0.20)';
        }}
        onBlur={(e) => {
          e.currentTarget.style.borderColor = 'var(--control-border)';
          e.currentTarget.style.boxShadow = 'none';
        }}
      />
    </div>
  );
}

function MultiSelectionInfo({ nodes }: { nodes: CanvasNode[] }) {
  const typeCounts = new Map<string, number>();
  for (const node of nodes) {
    typeCounts.set(node.type, (typeCounts.get(node.type) ?? 0) + 1);
  }

  return (
    <div className="px-3 py-3">
      <p className="text-xs mb-2" style={{ color: 'var(--panel-fg-secondary)' }}>
        {t('panel.multiSelected', { count: nodes.length })}
      </p>
      <div className="space-y-1">
        {Array.from(typeCounts.entries()).map(([type, count]) => (
          <div
            key={type}
            className="flex items-center justify-between text-xs"
            style={{ color: 'var(--panel-fg)' }}
          >
            <span>{getNodeTypeLabel(type)}</span>
            <span style={{ color: 'var(--panel-fg-secondary)' }}>×{count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function NodeSpecificProperties({
  node,
  onUpdateData,
}: {
  node: CanvasNode;
  onUpdateData: (data: Record<string, unknown>) => void;
}) {
  const data = node.data as Record<string, unknown>;

  const nodeType = node.type as string;
  switch (nodeType) {
    case 'annotation':
      return (
        <PanelSection title={t('panel.content')}>
          <textarea
            className="w-full text-xs px-2 py-1.5 rounded border outline-none resize-none"
            style={{
              backgroundColor: 'var(--control-bg)',
              borderColor: 'var(--control-border)',
              color: 'var(--control-fg)',
              minHeight: 60,
            }}
            value={(data.content as string) ?? ''}
            onChange={(e) => onUpdateData({ content: e.target.value })}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = 'var(--node-selected)';
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = 'var(--control-border)';
            }}
          />
        </PanelSection>
      );

    case 'storyboard':
      return (
        <PanelSection title={t('panel.storyboard')}>
          <div className="space-y-2">
            <div>
              <label
                className="text-xs block mb-1"
                style={{ color: 'var(--panel-fg-secondary)' }}
              >
                {t('panel.title')}
              </label>
              <input
                type="text"
                className="w-full text-xs px-2 py-1 rounded border outline-none"
                style={{
                  backgroundColor: 'var(--control-bg)',
                  borderColor: 'var(--control-border)',
                  color: 'var(--control-fg)',
                }}
                value={(data.title as string) ?? ''}
                onChange={(e) => onUpdateData({ title: e.target.value })}
              />
            </div>
            <div>
              <label
                className="text-xs block mb-1"
                style={{ color: 'var(--panel-fg-secondary)' }}
              >
                {t('panel.description')}
              </label>
              <textarea
                className="w-full text-xs px-2 py-1.5 rounded border outline-none resize-none"
                style={{
                  backgroundColor: 'var(--control-bg)',
                  borderColor: 'var(--control-border)',
                  color: 'var(--control-fg)',
                  minHeight: 40,
                }}
                value={(data.description as string) ?? ''}
                onChange={(e) => onUpdateData({ description: e.target.value })}
              />
            </div>
          </div>
        </PanelSection>
      );

    case 'text': {
      const textStyle = (data.style as Record<string, unknown>) ?? {};
      return (
        <PanelSection title={t('panel.textStyle')}>
          <div className="space-y-2">
            <div>
              <label
                className="text-xs block mb-1"
                style={{ color: 'var(--panel-fg-secondary)' }}
              >
                {t('panel.fontSize')}
              </label>
              <select
                className="w-full text-xs px-2 py-1 rounded border outline-none"
                style={{
                  backgroundColor: 'var(--control-bg)',
                  borderColor: 'var(--control-border)',
                  color: 'var(--control-fg)',
                }}
                value={(textStyle.fontSize as number) ?? 14}
                onChange={(e) =>
                  onUpdateData({
                    style: { ...textStyle, fontSize: Number(e.target.value) },
                  })
                }
              >
                {[10, 12, 14, 16, 18, 20, 24, 28, 32].map((s) => (
                  <option key={s} value={s}>
                    {s}px
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs" style={{ color: 'var(--panel-fg-secondary)' }}>
                {t('panel.fontWeight')}
              </label>
              <button
                className="text-xs px-2 py-0.5 rounded border transition-colors"
                style={{
                  backgroundColor:
                    textStyle.fontWeight === 'bold' ? 'var(--node-selected)' : 'var(--control-bg)',
                  borderColor: 'var(--control-border)',
                  color: textStyle.fontWeight === 'bold' ? 'var(--panel-fg)' : 'var(--control-fg)',
                  fontWeight: 'bold',
                }}
                onClick={() =>
                  onUpdateData({
                    style: {
                      ...textStyle,
                      fontWeight: textStyle.fontWeight === 'bold' ? 'normal' : 'bold',
                    },
                  })
                }
              >
                B
              </button>
            </div>
            <div>
              <label
                className="text-xs block mb-1"
                style={{ color: 'var(--panel-fg-secondary)' }}
              >
                {t('panel.textAlign')}
              </label>
              <div className="flex gap-1">
                {(['left', 'center', 'right'] as const).map((align) => (
                  <button
                    key={align}
                    style={{
                      flex: 1,
                      fontSize: 11,
                      padding: '3px 0',
                      borderRadius: 5,
                      border: '1px solid',
                      cursor: 'pointer',
                      transition: 'background 0.15s, border-color 0.15s',
                      backgroundColor:
                        (textStyle.textAlign ?? 'left') === align
                          ? 'rgba(59,130,246,0.20)'
                          : 'rgba(0,0,0,0.18)',
                      borderColor:
                        (textStyle.textAlign ?? 'left') === align
                          ? 'rgba(59,130,246,0.45)'
                          : 'var(--control-border)',
                      color:
                        (textStyle.textAlign ?? 'left') === align
                          ? '#93bbfd'
                          : 'var(--panel-fg)',
                    }}
                    onClick={() => onUpdateData({ style: { ...textStyle, textAlign: align } })}
                  >
                    {align.charAt(0).toUpperCase() + align.slice(1)}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs" style={{ color: 'var(--panel-fg-secondary)' }}>
                {t('panel.textColor')}
              </label>
              <input
                type="color"
                className="w-6 h-6 rounded cursor-pointer border-0 p-0"
                value={(textStyle.color as string) ?? '#e5e5e5'}
                onChange={(e) => onUpdateData({ style: { ...textStyle, color: e.target.value } })}
              />
            </div>
          </div>
        </PanelSection>
      );
    }

    case 'group': {
      const childIds = (data.childIds as string[]) ?? [];
      return (
        <PanelSection title={t('panel.group')}>
          <div className="space-y-2">
            <div>
              <label
                className="text-xs block mb-1"
                style={{ color: 'var(--panel-fg-secondary)' }}
              >
                {t('panel.groupLabel')}
              </label>
              <input
                type="text"
                className="w-full text-xs px-2 py-1 rounded border outline-none"
                style={{
                  backgroundColor: 'var(--control-bg)',
                  borderColor: 'var(--control-border)',
                  color: 'var(--control-fg)',
                }}
                value={(data.label as string) ?? ''}
                onChange={(e) => onUpdateData({ label: e.target.value })}
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs" style={{ color: 'var(--panel-fg-secondary)' }}>
                {t('panel.groupColor')}
              </label>
              <input
                type="color"
                className="w-6 h-6 rounded cursor-pointer border-0 p-0"
                value={(data.color as string) ?? '#6b7280'}
                onChange={(e) => onUpdateData({ color: e.target.value })}
              />
            </div>
            <div>
              <label
                className="text-xs block mb-1"
                style={{ color: 'var(--panel-fg-secondary)' }}
              >
                {t('panel.groupChildren')} ({childIds.length})
              </label>
              <div className="space-y-0.5 max-h-[120px] overflow-auto">
                {childIds.length === 0 ? (
                  <span
                    className="text-[10px] italic"
                    style={{ color: 'var(--panel-fg-secondary)' }}
                  >
                    {t('group.empty')}
                  </span>
                ) : (
                  childIds.map((id) => (
                    <div
                      key={id}
                      className="text-[10px] px-1.5 py-0.5 rounded truncate"
                      style={{
                        backgroundColor: 'var(--control-bg)',
                        color: 'var(--control-fg)',
                      }}
                    >
                      {id.slice(-8)}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </PanelSection>
      );
    }

    case 'media':
      return (
        <PanelSection title={t('panel.media')}>
          <div className="space-y-1 text-xs" style={{ color: 'var(--panel-fg-secondary)' }}>
            <div className="flex justify-between">
              <span>{t('panel.type')}</span>
              <span style={{ color: 'var(--panel-fg)' }}>
                {(data.mediaType as string) ?? 'unknown'}
              </span>
            </div>
            {typeof data.assetPath === 'string' && (
              <div className="truncate" title={data.assetPath}>
                {data.assetPath.split('/').pop()}
              </div>
            )}
            {data.duration != null && (
              <div className="flex justify-between">
                <span>{t('panel.duration')}</span>
                <span style={{ color: 'var(--panel-fg)' }}>
                  {formatDuration(data.duration as number)}
                </span>
              </div>
            )}
          </div>
        </PanelSection>
      );

    default:
      return null;
  }
}

function ConnectionProperties({
  connection,
  onUpdate,
}: {
  connection: CanvasConnection;
  onUpdate?: (id: string, updates: Partial<CanvasConnection>) => void;
}) {
  return (
    <>
      <PanelSection title={t('panel.connectionLabel')}>
        <input
          type="text"
          className="w-full text-xs px-2 py-1 rounded border outline-none"
          style={{
            backgroundColor: 'var(--control-bg)',
            borderColor: 'var(--control-border)',
            color: 'var(--control-fg)',
          }}
          value={connection.label ?? ''}
          placeholder={t('panel.connectionLabelPlaceholder')}
          onChange={(e) => onUpdate?.(connection.id, { label: e.target.value || undefined })}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = 'var(--node-selected)';
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = 'var(--control-border)';
          }}
        />
      </PanelSection>

      <PanelSection title={t('panel.connectionType')}>
        <select
          className="w-full text-xs px-2 py-1 rounded border outline-none"
          style={{
            backgroundColor: 'var(--control-bg)',
            borderColor: 'var(--control-border)',
            color: 'var(--control-fg)',
          }}
          value={connection.type ?? 'default'}
          onChange={(e) => onUpdate?.(connection.id, { type: e.target.value as ConnectionType })}
        >
          <option value="default">Default</option>
          <option value="sequence">Sequence</option>
          <option value="reference">Reference</option>
        </select>
      </PanelSection>

      <PanelSection title={t('panel.connectionInfo')}>
        <div className="space-y-1 text-xs" style={{ color: 'var(--panel-fg-secondary)' }}>
          <div className="flex justify-between">
            <span>ID</span>
            <span className="truncate max-w-[120px]" style={{ color: 'var(--panel-fg)' }}>
              {connection.id.slice(-8)}
            </span>
          </div>
          <div className="flex justify-between">
            <span>Source</span>
            <span className="truncate max-w-[120px]" style={{ color: 'var(--panel-fg)' }}>
              {connection.sourceId.slice(-8)}
            </span>
          </div>
          <div className="flex justify-between">
            <span>Target</span>
            <span className="truncate max-w-[120px]" style={{ color: 'var(--panel-fg)' }}>
              {connection.targetId.slice(-8)}
            </span>
          </div>
        </div>
      </PanelSection>
    </>
  );
}

// =============================================================================
// Helpers
// =============================================================================

function getNodeTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    media: 'Media',
    storyboard: 'Storyboard',
    annotation: 'Annotation',
    group: 'Group',
    text: 'Text',
    artboard: 'Artboard',
  };
  return labels[type] ?? type;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}
