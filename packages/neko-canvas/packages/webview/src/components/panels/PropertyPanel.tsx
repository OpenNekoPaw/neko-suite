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
import type { CanvasNode, CanvasConnection, CanvasNodeType, ConnectionType } from '@neko/shared';
import { CollapsibleSection } from '@neko/shared/components';
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

interface NodeSpecificPropertiesProps {
  node: CanvasNode;
  onUpdateData: (data: Record<string, unknown>) => void;
}

type NodePropertiesRenderer = (props: NodeSpecificPropertiesProps) => React.ReactNode;
type NodePropertiesRendererRegistry = Partial<Record<CanvasNodeType, NodePropertiesRenderer>>;

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
          backgroundColor: 'var(--neko-surface)',
          borderLeft: '1px solid var(--neko-border)',
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
          backgroundColor: 'var(--neko-surface)',
          borderLeft: '1px solid var(--neko-border)',
          width,
        }}
      >
        <PanelHeader title={t('panel.properties')} />
        <div className="flex-1 flex items-center justify-center">
          <p className="text-xs" style={{ color: 'var(--neko-fg-secondary)' }}>
            {t('panel.noSelection')}
          </p>
        </div>
      </div>
    );
  }

  const isMulti = selectedNodes.length > 1;
  const node = selectedNodes[0]!;

  // Creator nodes (shot/scene/gallery) collapse technical fields by default
  const isCreatorNode = node.type === 'shot' || node.type === 'scene' || node.type === 'gallery';

  return (
    <div
      className="flex flex-col h-full overflow-y-auto"
      style={{
        backgroundColor: 'var(--neko-surface)',
        borderLeft: '1px solid var(--neko-border)',
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
          {/* Node-specific properties */}
          <NodeSpecificProperties
            node={node}
            onUpdateData={(data) => onUpdateNodeData(node.id, data)}
          />

          {/* Technical sections — hidden for creator nodes */}
          {!isCreatorNode && (
            <>
              <CollapsibleSection title={t('panel.transform')}>
                <div className="grid grid-cols-2 gap-2">
                  <NumberField
                    label="X"
                    value={node.position.x}
                    onChange={(v) =>
                      onUpdateNode(node.id, { position: { ...node.position, x: v } })
                    }
                  />
                  <NumberField
                    label="Y"
                    value={node.position.y}
                    onChange={(v) =>
                      onUpdateNode(node.id, { position: { ...node.position, y: v } })
                    }
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
                    onChange={(v) => onUpdateNode(node.id, { rotation: ((v % 360) + 360) % 360 })}
                  />
                </div>
              </CollapsibleSection>

              <CollapsibleSection title={t('panel.layer')}>
                <div className="flex items-center justify-between">
                  <span className="text-xs" style={{ color: 'var(--neko-fg-secondary)' }}>
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
                      color: '#ffffff',
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
              </CollapsibleSection>

              {onUpdatePorts && <PortEditor node={node} onUpdatePorts={onUpdatePorts} />}
            </>
          )}

          {/* Actions */}
          <CollapsibleSection title={t('panel.actions')}>
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
          </CollapsibleSection>
        </>
      )}
    </div>
  );
}

// =============================================================================
// Sub-components
// =============================================================================

function PanelHeader({ title }: { title: string }) {
  return <div className="neko-panel-header">{title}</div>;
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
          color: 'var(--neko-fg-secondary)',
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
          e.currentTarget.style.boxShadow = '0 0 0 2.5px var(--control-focus-ring)';
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
      <p className="text-xs mb-2" style={{ color: 'var(--neko-fg-secondary)' }}>
        {t('panel.multiSelected', { count: nodes.length })}
      </p>
      <div className="space-y-1">
        {Array.from(typeCounts.entries()).map(([type, count]) => (
          <div
            key={type}
            className="flex items-center justify-between text-xs"
            style={{ color: 'var(--neko-fg)' }}
          >
            <span>{getNodeTypeLabel(type)}</span>
            <span style={{ color: 'var(--neko-fg-secondary)' }}>×{count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function NodeSpecificProperties({ node, onUpdateData }: NodeSpecificPropertiesProps) {
  return renderNodeSpecificProperties(NODE_PROPERTIES_RENDERERS, { node, onUpdateData });
}

function AnnotationNodeProperties({ node, onUpdateData }: NodeSpecificPropertiesProps) {
  const data = node.data as Record<string, unknown>;
  return (
    <CollapsibleSection title={t('panel.content')}>
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
    </CollapsibleSection>
  );
}

function StoryboardNodeProperties({ node, onUpdateData }: NodeSpecificPropertiesProps) {
  const data = node.data as Record<string, unknown>;
  return (
    <CollapsibleSection title={t('panel.storyboard')}>
      <div className="space-y-2">
        <div>
          <label className="text-xs block mb-1" style={{ color: 'var(--neko-fg-secondary)' }}>
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
          <label className="text-xs block mb-1" style={{ color: 'var(--neko-fg-secondary)' }}>
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
    </CollapsibleSection>
  );
}

function TextNodeProperties({ node, onUpdateData }: NodeSpecificPropertiesProps) {
  const data = node.data as Record<string, unknown>;
  const textStyle = (data.style as Record<string, unknown>) ?? {};
  return (
    <CollapsibleSection title={t('panel.textStyle')}>
      <div className="space-y-2">
        <div>
          <label className="text-xs block mb-1" style={{ color: 'var(--neko-fg-secondary)' }}>
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
          <label className="text-xs" style={{ color: 'var(--neko-fg-secondary)' }}>
            {t('panel.fontWeight')}
          </label>
          <button
            className="text-xs px-2 py-0.5 rounded border transition-colors"
            style={{
              backgroundColor:
                textStyle.fontWeight === 'bold' ? 'var(--node-selected)' : 'var(--control-bg)',
              borderColor: 'var(--control-border)',
              color: textStyle.fontWeight === 'bold' ? 'var(--neko-fg)' : 'var(--control-fg)',
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
          <label className="text-xs block mb-1" style={{ color: 'var(--neko-fg-secondary)' }}>
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
                      ? 'var(--selection-bg)'
                      : 'var(--control-bg)',
                  borderColor:
                    (textStyle.textAlign ?? 'left') === align
                      ? 'var(--selection-border)'
                      : 'var(--control-border)',
                  color:
                    (textStyle.textAlign ?? 'left') === align
                      ? 'var(--badge-fg)'
                      : 'var(--neko-fg)',
                }}
                onClick={() => onUpdateData({ style: { ...textStyle, textAlign: align } })}
              >
                {align.charAt(0).toUpperCase() + align.slice(1)}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs" style={{ color: 'var(--neko-fg-secondary)' }}>
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
    </CollapsibleSection>
  );
}

function GroupNodeProperties({ node, onUpdateData }: NodeSpecificPropertiesProps) {
  const data = node.data as Record<string, unknown>;
  const childIds = (data.childIds as string[]) ?? [];
  return (
    <CollapsibleSection title={t('panel.group')}>
      <div className="space-y-2">
        <div>
          <label className="text-xs block mb-1" style={{ color: 'var(--neko-fg-secondary)' }}>
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
          <label className="text-xs" style={{ color: 'var(--neko-fg-secondary)' }}>
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
          <label className="text-xs block mb-1" style={{ color: 'var(--neko-fg-secondary)' }}>
            {t('panel.groupChildren')} ({childIds.length})
          </label>
          <div className="space-y-0.5 max-h-[120px] overflow-auto">
            {childIds.length === 0 ? (
              <span className="text-[10px] italic" style={{ color: 'var(--neko-fg-secondary)' }}>
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
    </CollapsibleSection>
  );
}

function MediaNodeProperties({ node }: NodeSpecificPropertiesProps) {
  const data = node.data as Record<string, unknown>;
  return (
    <CollapsibleSection title={t('panel.media')}>
      <div className="space-y-1 text-xs" style={{ color: 'var(--neko-fg-secondary)' }}>
        <div className="flex justify-between">
          <span>{t('panel.type')}</span>
          <span style={{ color: 'var(--neko-fg)' }}>{(data.mediaType as string) ?? 'unknown'}</span>
        </div>
        {typeof data.assetPath === 'string' && (
          <div className="truncate" title={data.assetPath}>
            {data.assetPath.split('/').pop()}
          </div>
        )}
        {data.duration != null && (
          <div className="flex justify-between">
            <span>{t('panel.duration')}</span>
            <span style={{ color: 'var(--neko-fg)' }}>
              {formatDuration(data.duration as number)}
            </span>
          </div>
        )}
      </div>
    </CollapsibleSection>
  );
}

export function createBuiltInNodePropertiesRendererRegistry(): NodePropertiesRendererRegistry {
  return {
    annotation: AnnotationNodeProperties,
    storyboard: StoryboardNodeProperties,
    text: TextNodeProperties,
    group: GroupNodeProperties,
    media: MediaNodeProperties,
    shot: ({ node, onUpdateData }) => (
      <ShotProperties data={node.data as Record<string, unknown>} onUpdateData={onUpdateData} />
    ),
    scene: ({ node, onUpdateData }) => (
      <SceneProperties data={node.data as Record<string, unknown>} onUpdateData={onUpdateData} />
    ),
    gallery: ({ node, onUpdateData }) => (
      <GalleryProperties data={node.data as Record<string, unknown>} onUpdateData={onUpdateData} />
    ),
  };
}

export function renderNodeSpecificProperties(
  registry: NodePropertiesRendererRegistry,
  props: NodeSpecificPropertiesProps,
): React.ReactNode {
  const renderer = registry[props.node.type];
  return renderer ? renderer(props) : null;
}

const NODE_PROPERTIES_RENDERERS = createBuiltInNodePropertiesRendererRegistry();

// =============================================================================
// Creator node property panels
// =============================================================================

function getShotScaleOptions() {
  return [
    { value: 'ECU', label: t('panel.shotScale.ecu') },
    { value: 'CU', label: t('panel.shotScale.cu') },
    { value: 'MCU', label: t('panel.shotScale.mcu') },
    { value: 'MS', label: t('panel.shotScale.ms') },
    { value: 'MLS', label: t('panel.shotScale.mls') },
    { value: 'LS', label: t('panel.shotScale.ls') },
    { value: 'VLS', label: t('panel.shotScale.vls') },
    { value: 'ELS', label: t('panel.shotScale.els') },
  ];
}

function getCameraMovementOptions() {
  return [
    { value: '', label: t('panel.none') },
    { value: 'static', label: t('panel.cameraMovement.static') },
    { value: 'pan', label: t('panel.cameraMovement.pan') },
    { value: 'tilt', label: t('panel.cameraMovement.tilt') },
    { value: 'zoom-in', label: t('panel.cameraMovement.zoomIn') },
    { value: 'zoom-out', label: t('panel.cameraMovement.zoomOut') },
    { value: 'dolly', label: t('panel.cameraMovement.dolly') },
    { value: 'handheld', label: t('panel.cameraMovement.handheld') },
  ];
}

function getCameraAngleOptions() {
  return [
    { value: '', label: t('panel.none') },
    { value: 'eye-level', label: t('panel.cameraAngle.eyeLevel') },
    { value: 'high-angle', label: t('panel.cameraAngle.highAngle') },
    { value: 'low-angle', label: t('panel.cameraAngle.lowAngle') },
    { value: 'bird-eye', label: t('panel.cameraAngle.birdEye') },
    { value: 'dutch', label: t('panel.cameraAngle.dutch') },
  ];
}

function getTimeOfDayOptions() {
  return [
    { value: '', label: t('panel.timeOfDay.any') },
    { value: 'dawn', label: t('panel.timeOfDay.dawn') },
    { value: 'morning', label: t('panel.timeOfDay.morning') },
    { value: 'noon', label: t('panel.timeOfDay.noon') },
    { value: 'afternoon', label: t('panel.timeOfDay.afternoon') },
    { value: 'dusk', label: t('panel.timeOfDay.dusk') },
    { value: 'night', label: t('panel.timeOfDay.night') },
  ];
}

function getGalleryPresetOptions() {
  return [
    { value: 'character-3view', label: t('panel.galleryPreset.character3View') },
    { value: 'character-4view', label: t('panel.galleryPreset.character4View') },
    { value: 'expression-9', label: t('panel.galleryPreset.expression9') },
    { value: 'turnaround-8', label: t('panel.galleryPreset.turnaround8') },
    { value: 'scene-views', label: t('panel.galleryPreset.sceneViews') },
    { value: 'custom', label: t('panel.galleryPreset.custom') },
  ];
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="text-xs block mb-1" style={{ color: 'var(--neko-fg-secondary)' }}>
      {children}
    </label>
  );
}

function TextareaField({
  label,
  value,
  onChange,
  minHeight = 52,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  minHeight?: number;
}) {
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <textarea
        className="w-full text-xs px-2 py-1.5 rounded border outline-none resize-none"
        style={{
          backgroundColor: 'var(--control-bg)',
          borderColor: 'var(--control-border)',
          color: 'var(--control-fg)',
          minHeight,
        }}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={(e) => {
          e.currentTarget.style.borderColor = 'var(--node-selected)';
        }}
        onBlur={(e) => {
          e.currentTarget.style.borderColor = 'var(--control-border)';
        }}
      />
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <input
        type="text"
        className="w-full text-xs px-2 py-1 rounded border outline-none"
        style={{
          backgroundColor: 'var(--control-bg)',
          borderColor: 'var(--control-border)',
          color: 'var(--control-fg)',
        }}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onFocus={(e) => {
          e.currentTarget.style.borderColor = 'var(--node-selected)';
        }}
        onBlur={(e) => {
          e.currentTarget.style.borderColor = 'var(--control-border)';
        }}
      />
    </div>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <select
        className="w-full text-xs px-2 py-1 rounded border outline-none"
        style={{
          backgroundColor: 'var(--control-bg)',
          borderColor: 'var(--control-border)',
          color: 'var(--control-fg)',
        }}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function ShotProperties({
  data,
  onUpdateData,
}: {
  data: Record<string, unknown>;
  onUpdateData: (data: Record<string, unknown>) => void;
}) {
  return (
    <>
      <CollapsibleSection title={t('panel.shotVisual')}>
        <div className="space-y-2">
          <TextareaField
            label={t('panel.visualDescription')}
            value={(data.visualDescription as string) ?? ''}
            onChange={(v) => onUpdateData({ visualDescription: v })}
            minHeight={72}
          />
          <div className="grid grid-cols-3 gap-1.5">
            <SelectField
              label={t('panel.shotScale')}
              value={(data.shotScale as string) ?? 'MS'}
              options={getShotScaleOptions()}
              onChange={(v) => onUpdateData({ shotScale: v })}
            />
            <SelectField
              label={t('panel.cameraMovement')}
              value={(data.cameraMovement as string) ?? ''}
              options={getCameraMovementOptions()}
              onChange={(v) => onUpdateData({ cameraMovement: v || undefined })}
            />
            <SelectField
              label={t('panel.cameraAngle')}
              value={(data.cameraAngle as string) ?? ''}
              options={getCameraAngleOptions()}
              onChange={(v) => onUpdateData({ cameraAngle: v || undefined })}
            />
          </div>
          <div>
            <FieldLabel>{t('panel.durationSeconds')}</FieldLabel>
            <input
              type="number"
              min={0.5}
              step={0.5}
              className="w-full text-xs px-2 py-1 rounded border outline-none"
              style={{
                backgroundColor: 'var(--control-bg)',
                borderColor: 'var(--control-border)',
                color: 'var(--control-fg)',
              }}
              value={(data.duration as number) ?? 3}
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                if (!isNaN(v) && v > 0) onUpdateData({ duration: v });
              }}
            />
          </div>
        </div>
      </CollapsibleSection>

      <CollapsibleSection title={t('panel.dialogueAndSound')} defaultExpanded={false}>
        <div className="space-y-2">
          <TextareaField
            label={t('panel.dialogue')}
            value={(data.dialogue as string) ?? ''}
            onChange={(v) => onUpdateData({ dialogue: v || undefined })}
          />
          <TextareaField
            label={t('panel.voiceOver')}
            value={(data.voiceOver as string) ?? ''}
            onChange={(v) => onUpdateData({ voiceOver: v || undefined })}
          />
          <TextField
            label={t('panel.soundCue')}
            value={(data.soundCue as string) ?? ''}
            onChange={(v) => onUpdateData({ soundCue: v || undefined })}
            placeholder={t('panel.soundCuePlaceholder')}
          />
        </div>
      </CollapsibleSection>
    </>
  );
}

function SceneProperties({
  data,
  onUpdateData,
}: {
  data: Record<string, unknown>;
  onUpdateData: (data: Record<string, unknown>) => void;
}) {
  return (
    <CollapsibleSection title={t('panel.sceneInfo')}>
      <div className="space-y-2">
        <TextField
          label={t('panel.sceneTitle')}
          value={(data.sceneTitle as string) ?? ''}
          onChange={(v) => onUpdateData({ sceneTitle: v })}
          placeholder={t('panel.sceneTitlePlaceholder')}
        />
        <div className="grid grid-cols-2 gap-1.5">
          <TextField
            label={t('panel.location')}
            value={(data.location as string) ?? ''}
            onChange={(v) => onUpdateData({ location: v || undefined })}
            placeholder={t('panel.locationPlaceholder')}
          />
          <SelectField
            label={t('panel.timeOfDay')}
            value={(data.timeOfDay as string) ?? ''}
            options={getTimeOfDayOptions()}
            onChange={(v) => onUpdateData({ timeOfDay: v || undefined })}
          />
        </div>
        <div>
          <FieldLabel>{t('panel.includedShotCount')}</FieldLabel>
          <span className="text-xs" style={{ color: 'var(--neko-fg)' }}>
            {((data.shotIds as string[]) ?? []).length}
          </span>
        </div>
      </div>
    </CollapsibleSection>
  );
}

function GalleryProperties({
  data,
  onUpdateData,
}: {
  data: Record<string, unknown>;
  onUpdateData: (data: Record<string, unknown>) => void;
}) {
  return (
    <CollapsibleSection title={t('panel.gallerySettings')}>
      <div className="space-y-2">
        <TextField
          label={t('panel.characterName')}
          value={(data.characterName as string) ?? ''}
          onChange={(v) => onUpdateData({ characterName: v || undefined })}
          placeholder={t('panel.characterNamePlaceholder')}
        />
        <SelectField
          label={t('panel.galleryPreset')}
          value={(data.preset as string) ?? 'character-3view'}
          options={getGalleryPresetOptions()}
          onChange={(v) => onUpdateData({ preset: v })}
        />
        <TextareaField
          label={t('panel.globalPromptPrefix')}
          value={(data.globalPromptPrefix as string) ?? ''}
          onChange={(v) => onUpdateData({ globalPromptPrefix: v || undefined })}
          minHeight={48}
        />
      </div>
    </CollapsibleSection>
  );
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
      <CollapsibleSection title={t('panel.connectionLabel')}>
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
      </CollapsibleSection>

      <CollapsibleSection title={t('panel.connectionType')}>
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
      </CollapsibleSection>

      <CollapsibleSection title={t('panel.connectionInfo')}>
        <div className="space-y-1 text-xs" style={{ color: 'var(--neko-fg-secondary)' }}>
          <div className="flex justify-between">
            <span>ID</span>
            <span className="truncate max-w-[120px]" style={{ color: 'var(--neko-fg)' }}>
              {connection.id.slice(-8)}
            </span>
          </div>
          <div className="flex justify-between">
            <span>Source</span>
            <span className="truncate max-w-[120px]" style={{ color: 'var(--neko-fg)' }}>
              {connection.sourceId.slice(-8)}
            </span>
          </div>
          <div className="flex justify-between">
            <span>Target</span>
            <span className="truncate max-w-[120px]" style={{ color: 'var(--neko-fg)' }}>
              {connection.targetId.slice(-8)}
            </span>
          </div>
        </div>
      </CollapsibleSection>
    </>
  );
}

// =============================================================================
// Helpers
// =============================================================================

function getNodeTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    media: t('node.media'),
    storyboard: t('node.storyboard'),
    annotation: t('toolbar.annotation'),
    group: t('node.group'),
    text: t('toolbar.text'),
    artboard: t('node.artboard'),
    shot: t('node.shot'),
    scene: t('node.sceneGroup'),
    gallery: t('node.gallery'),
    script: t('node.script'),
    document: t('node.document'),
    model: t('node.model'),
    'canvas-embed': t('node.canvasEmbed'),
  };
  return labels[type] ?? type;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}
