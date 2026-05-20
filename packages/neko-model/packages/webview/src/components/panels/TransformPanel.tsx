import React from 'react';
import type { SceneNodeSnapshot, TransformMode } from '../../types';
import { MODEL_COMPONENT_SCHEMA_REGISTRY } from '../../scene/ComponentSchemaRegistry';
import type { ComponentFieldSchema } from '../../scene/ComponentSchemaRegistry';
import type { EditableNodeTransform } from '../../scene/SceneEditingTypes';
import { useTranslation } from '../../i18n/I18nContext';

const MODE_I18N_KEY: Record<TransformMode, string> = {
  translate: 'transform.translate',
  rotate: 'transform.rotate',
  scale: 'transform.scaleMode',
};

export type { EditableNodeTransform } from '../../scene/SceneEditingTypes';

type TransformSection = keyof EditableNodeTransform;
type TransformAxis = 'x' | 'y' | 'z' | 'w';

interface TransformPanelProps {
  node: SceneNodeSnapshot | null;
  transformMode: TransformMode;
  onTransformModeChange: (mode: TransformMode) => void;
  onTransformCommit?: (nodeId: string, transform: EditableNodeTransform) => void | Promise<void>;
  disabled?: boolean;
}

/**
 * Transform properties panel (right sidebar).
 */
export function TransformPanel({
  node,
  transformMode,
  onTransformModeChange,
  onTransformCommit,
  disabled = false,
}: TransformPanelProps): React.JSX.Element {
  const { t } = useTranslation();
  const [draftTransform, setDraftTransform] = React.useState<EditableNodeTransform>(() =>
    toNodeTransform(node),
  );

  React.useEffect(() => {
    setDraftTransform(toNodeTransform(node));
  }, [node]);

  if (!node) {
    return (
      <div className="model-side-panel h-full w-full items-center justify-center px-4 text-center text-xs text-[var(--model-fg-secondary)]">
        {t('transform.noSelection')}
      </div>
    );
  }

  const commitValue = (section: TransformSection, axis: TransformAxis, value: number) => {
    const nextTransform = {
      ...draftTransform,
      [section]: {
        ...draftTransform[section],
        [axis]: value,
      },
    } as EditableNodeTransform;
    setDraftTransform(nextTransform);
    void onTransformCommit?.(node.nodeId, nextTransform);
  };

  return (
    <div className="model-side-panel h-full w-full overflow-y-auto text-xs">
      <div className="model-panel-header">
        <div className="font-semibold text-[var(--model-fg)]">{node.name}</div>
        <div className="mt-0.5 break-all text-[10px] text-[var(--model-fg-secondary)]">
          {node.nodeId}
        </div>
        {isCharacterNode(node) && (
          <div className="mt-1 text-[10px] text-[var(--model-fg-secondary)]">
            {t('transform.characterRoot')}
          </div>
        )}
      </div>

      <div className="model-panel-section">
        <div className="mb-1 font-semibold text-[var(--model-fg)]">{t('transform.mode')}</div>
        <div className="flex gap-1">
          {(['translate', 'rotate', 'scale'] as const).map((mode) => (
            <button
              key={mode}
              className={`${transformMode === mode ? 'model-btn-primary' : 'model-btn-secondary'} flex-1 px-2 py-1 text-[10px] ${
                transformMode === mode ? '' : ''
              }`}
              onClick={() => onTransformModeChange(mode)}
            >
              {t(MODE_I18N_KEY[mode])}
            </button>
          ))}
        </div>
      </div>

      <div className="model-panel-section">
        <div className="mb-1 font-semibold text-[var(--model-fg)]">{t('transform.position')}</div>
        <div className="grid grid-cols-3 gap-1">
          <PropertyField
            label="X"
            value={draftTransform.position.x}
            schema={transformFieldSchema('position.x')}
            disabled={disabled}
            onCommit={(value) => commitValue('position', 'x', value)}
          />
          <PropertyField
            label="Y"
            value={draftTransform.position.y}
            schema={transformFieldSchema('position.y')}
            disabled={disabled}
            onCommit={(value) => commitValue('position', 'y', value)}
          />
          <PropertyField
            label="Z"
            value={draftTransform.position.z}
            schema={transformFieldSchema('position.z')}
            disabled={disabled}
            onCommit={(value) => commitValue('position', 'z', value)}
          />
        </div>
      </div>

      <div className="model-panel-section">
        <div className="mb-1 font-semibold text-[var(--model-fg)]">{t('transform.rotation')}</div>
        <div className="grid grid-cols-2 gap-1">
          <PropertyField
            label="X"
            value={draftTransform.rotation.x}
            schema={transformFieldSchema('rotation.x')}
            disabled={disabled}
            onCommit={(value) => commitValue('rotation', 'x', value)}
          />
          <PropertyField
            label="Y"
            value={draftTransform.rotation.y}
            schema={transformFieldSchema('rotation.y')}
            disabled={disabled}
            onCommit={(value) => commitValue('rotation', 'y', value)}
          />
          <PropertyField
            label="Z"
            value={draftTransform.rotation.z}
            schema={transformFieldSchema('rotation.z')}
            disabled={disabled}
            onCommit={(value) => commitValue('rotation', 'z', value)}
          />
          <PropertyField
            label="W"
            value={draftTransform.rotation.w}
            schema={transformFieldSchema('rotation.w')}
            disabled={disabled}
            onCommit={(value) => commitValue('rotation', 'w', value)}
          />
        </div>
      </div>

      <div className="p-2">
        <div className="mb-1 font-semibold text-[var(--model-fg)]">{t('transform.scale')}</div>
        <div className="grid grid-cols-3 gap-1">
          <PropertyField
            label="X"
            value={draftTransform.scale.x}
            schema={transformFieldSchema('scale.x')}
            disabled={disabled}
            onCommit={(value) => commitValue('scale', 'x', value)}
          />
          <PropertyField
            label="Y"
            value={draftTransform.scale.y}
            schema={transformFieldSchema('scale.y')}
            disabled={disabled}
            onCommit={(value) => commitValue('scale', 'y', value)}
          />
          <PropertyField
            label="Z"
            value={draftTransform.scale.z}
            schema={transformFieldSchema('scale.z')}
            disabled={disabled}
            onCommit={(value) => commitValue('scale', 'z', value)}
          />
        </div>
      </div>

      <div className="model-panel-footer text-[10px]">
        <div className="flex flex-wrap gap-2">
          {(node.kind === 'mesh' || node.mesh) && <span>{t('transform.mesh')}</span>}
          {node.kind === 'light' && <span>{t('transform.light')}</span>}
          {node.kind === 'camera' && <span>{t('transform.camera')}</span>}
          {node.kind === 'skeleton' && <span>{t('transform.skeleton')}</span>}
        </div>
      </div>
    </div>
  );
}

function PropertyField({
  label,
  value,
  schema,
  disabled,
  onCommit,
}: {
  label: string;
  value: number;
  schema?: ComponentFieldSchema;
  disabled: boolean;
  onCommit: (value: number) => void;
}): React.JSX.Element {
  const [draft, setDraft] = React.useState(formatNumber(value));

  React.useEffect(() => {
    setDraft(formatNumber(value));
  }, [value]);

  const commit = () => {
    const parsed = Number.parseFloat(draft);
    if (!Number.isFinite(parsed)) {
      setDraft(formatNumber(value));
      return;
    }
    let next = parsed;
    if (typeof schema?.min === 'number') {
      next = Math.max(schema.min, next);
    }
    if (typeof schema?.max === 'number') {
      next = Math.min(schema.max, next);
    }
    onCommit(next);
  };

  return (
    <div className="flex items-center gap-1">
      <span className="w-3 text-[var(--model-fg-secondary)]">{label}</span>
      <input
        type="number"
        step={schema?.step ?? 0.001}
        disabled={disabled}
        value={draft}
        onChange={(event) => setDraft(event.currentTarget.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.currentTarget.blur();
          }
        }}
        className="model-input w-full px-1.5 py-0.5 text-[10px] text-center"
      />
    </div>
  );
}

function transformFieldSchema(path: string): ComponentFieldSchema | undefined {
  return MODEL_COMPONENT_SCHEMA_REGISTRY.getField('transform', path);
}

function toNodeTransform(node: SceneNodeSnapshot | null): EditableNodeTransform {
  return {
    position: {
      x: node?.transform?.position?.x ?? 0,
      y: node?.transform?.position?.y ?? 0,
      z: node?.transform?.position?.z ?? 0,
    },
    rotation: {
      x: node?.transform?.rotation?.x ?? 0,
      y: node?.transform?.rotation?.y ?? 0,
      z: node?.transform?.rotation?.z ?? 0,
      w: node?.transform?.rotation?.w ?? 1,
    },
    scale: {
      x: node?.transform?.scale?.x ?? 1,
      y: node?.transform?.scale?.y ?? 1,
      z: node?.transform?.scale?.z ?? 1,
    },
  };
}

function formatNumber(value: number): string {
  return Number.isFinite(value) ? value.toFixed(3) : '0.000';
}

function isCharacterNode(node: SceneNodeSnapshot): boolean {
  return node.kind === 'character' || node.kind === 'character-instance';
}
