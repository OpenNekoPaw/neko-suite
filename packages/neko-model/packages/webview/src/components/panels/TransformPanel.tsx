import React from 'react';
import { AxisGroup } from '@neko/ui/creative';
import type { SceneNodeSnapshot, TransformMode } from '../../types';
import type { EditableNodeTransform } from '../../scene/SceneEditingTypes';
import { MODEL_COMPONENT_SCHEMA_REGISTRY } from '../../scene/ComponentSchemaRegistry';
import { useTranslation } from '../../i18n/I18nContext';
import {
  disabledControl,
  formatControlAvailabilityTitle,
  isControlDisabled,
  type ModelControlAvailability,
} from '../../baseline/controlAvailability';

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
  availability?: ModelControlAvailability;
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
  availability,
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
  const effectiveAvailability =
    availability ?? (disabled ? disabledControl('scene-control-disconnected') : null);
  const controlsDisabled =
    disabled || (effectiveAvailability ? isControlDisabled(effectiveAvailability) : false);
  const modeTitle = (mode: TransformMode) =>
    formatControlAvailabilityTitle(
      effectiveAvailability ?? { state: 'available' },
      t,
      t(MODE_I18N_KEY[mode]),
    );

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
  const previewValue = (section: TransformSection, axis: TransformAxis, value: number) => {
    const nextTransform = updateTransformAxis(draftTransform, section, axis, value);
    setDraftTransform(nextTransform);
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
              disabled={controlsDisabled}
              title={modeTitle(mode)}
              onClick={() => onTransformModeChange(mode)}
            >
              {t(MODE_I18N_KEY[mode])}
            </button>
          ))}
        </div>
      </div>

      <div className="model-panel-section" data-model-transform-path="axis-composition">
        {TRANSFORM_GROUPS.map((group) => (
          <AxisGroup
            density="compact"
            disabled={controlsDisabled}
            key={group.section}
            label={t(group.labelKey)}
          >
            {group.axes.map((axis) => {
              const id = `${group.section}.${axis}`;
              const schema = MODEL_COMPONENT_SCHEMA_REGISTRY.getField('transform', id);
              return (
                <AxisGroup.Axis
                  axis={axis.toUpperCase()}
                  disabled={controlsDisabled}
                  id={id}
                  key={id}
                  max={schema?.max}
                  min={schema?.min}
                  onCommit={(_, value) => commitValue(group.section, axis, value)}
                  onPreviewChange={(_, value) => previewValue(group.section, axis, value)}
                  step={schema?.step}
                  value={getTransformAxisValue(draftTransform, group.section, axis)}
                />
              );
            })}
          </AxisGroup>
        ))}
      </div>

      <div
        className="model-panel-footer text-[10px]"
        data-availability-state={effectiveAvailability?.state ?? 'available'}
        data-availability-reason={
          effectiveAvailability?.state === 'available' ? undefined : effectiveAvailability?.reason
        }
      >
        <div className="flex flex-wrap gap-2">
          {(node.kind === 'mesh' || node.mesh) && <span>{t('transform.mesh')}</span>}
          {node.kind === 'light' && <span>{t('transform.light')}</span>}
          {node.kind === 'camera' && <span>{t('transform.camera')}</span>}
          {node.kind === 'skeleton' && <span>{t('transform.skeleton')}</span>}
        </div>
        {effectiveAvailability && effectiveAvailability.state !== 'available' ? (
          <div className="mt-1 text-[var(--model-fg-secondary)]">
            {formatControlAvailabilityTitle(effectiveAvailability, t)}
          </div>
        ) : null}
      </div>
    </div>
  );
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

function getTransformAxisValue(
  transform: EditableNodeTransform,
  section: TransformSection,
  axis: TransformAxis,
): number {
  switch (section) {
    case 'position':
      if (axis === 'w') throw new Error('Model position transform does not support W axis');
      return transform.position[axis];
    case 'rotation':
      return transform.rotation[axis];
    case 'scale':
      if (axis === 'w') throw new Error('Model scale transform does not support W axis');
      return transform.scale[axis];
    default:
      return assertNever(section);
  }
}

function updateTransformAxis(
  transform: EditableNodeTransform,
  section: TransformSection,
  axis: TransformAxis,
  value: number,
): EditableNodeTransform {
  switch (section) {
    case 'position':
      if (axis === 'w') throw new Error('Model position transform does not support W axis');
      return {
        ...transform,
        position: { ...transform.position, [axis]: value },
      };
    case 'rotation':
      return {
        ...transform,
        rotation: { ...transform.rotation, [axis]: value },
      };
    case 'scale':
      if (axis === 'w') throw new Error('Model scale transform does not support W axis');
      return {
        ...transform,
        scale: { ...transform.scale, [axis]: value },
      };
    default:
      return assertNever(section);
  }
}

function isCharacterNode(node: SceneNodeSnapshot): boolean {
  return node.kind === 'character' || node.kind === 'character-instance';
}

function assertNever(value: never): never {
  throw new Error(`Unsupported Model transform section: ${String(value)}`);
}

const TRANSFORM_GROUPS: readonly {
  readonly section: TransformSection;
  readonly labelKey: string;
  readonly axes: readonly TransformAxis[];
}[] = [
  { section: 'position', labelKey: 'transform.position', axes: ['x', 'y', 'z'] },
  { section: 'rotation', labelKey: 'transform.rotation', axes: ['x', 'y', 'z', 'w'] },
  { section: 'scale', labelKey: 'transform.scale', axes: ['x', 'y', 'z'] },
];
