import React from 'react';
import { PropertyPanel as SharedPropertyPanel } from '@neko/ui/creative';
import type { PropertyValue } from '@neko/ui/creative';
import type { SceneNodeSnapshot, TransformMode } from '../../types';
import type { EditableNodeTransform } from '../../scene/SceneEditingTypes';
import { useTranslation } from '../../i18n/I18nContext';
import { mapModelTransformToProperties } from '../adapters/sharedModelUiAdapter';

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
  const sharedTransform = React.useMemo(
    () => mapModelTransformToProperties(draftTransform, t),
    [draftTransform, t],
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
  const previewValue = (section: TransformSection, axis: TransformAxis, value: number) => {
    setDraftTransform(
      (current) =>
        ({
          ...current,
          [section]: {
            ...current[section],
            [axis]: value,
          },
        }) as EditableNodeTransform,
    );
  };
  const handleSharedPreview = (propertyId: string, value: PropertyValue) => {
    if (typeof value !== 'number') return;
    const field = parseTransformPropertyId(propertyId);
    if (!field) return;
    previewValue(field.section, field.axis, value);
  };
  const handleSharedCommit = (propertyId: string, value: PropertyValue) => {
    if (typeof value !== 'number') return;
    const field = parseTransformPropertyId(propertyId);
    if (!field) return;
    commitValue(field.section, field.axis, value);
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
        <SharedPropertyPanel
          groups={sharedTransform.groups}
          onCommit={handleSharedCommit}
          onPreviewChange={handleSharedPreview}
          properties={sharedTransform.properties.map((property) => ({ ...property, disabled }))}
        />
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

function isCharacterNode(node: SceneNodeSnapshot): boolean {
  return node.kind === 'character' || node.kind === 'character-instance';
}

function parseTransformPropertyId(
  propertyId: string,
): { section: TransformSection; axis: TransformAxis } | null {
  const [section, axis] = propertyId.split('.');
  if (!isTransformSection(section) || !isTransformAxis(axis)) {
    return null;
  }
  if (section !== 'rotation' && axis === 'w') {
    return null;
  }
  return { section, axis };
}

function isTransformSection(value: string | undefined): value is TransformSection {
  return value === 'position' || value === 'rotation' || value === 'scale';
}

function isTransformAxis(value: string | undefined): value is TransformAxis {
  return value === 'x' || value === 'y' || value === 'z' || value === 'w';
}
