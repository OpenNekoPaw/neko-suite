import React from 'react';
import type { LightPatch } from '@neko/shared';
import type { SceneNodeSnapshot } from '../../types';
import { PlusIcon, TrashIcon } from '@neko/ui/icons';
import {
  disabledControl,
  formatControlAvailabilityTitle,
  isControlDisabled,
  type ModelControlAvailability,
} from '../../baseline/controlAvailability';
import { useTranslation } from '../../i18n/I18nContext';

export interface LightInspectorPanelProps {
  node: SceneNodeSnapshot | null;
  disabled?: boolean;
  availability?: ModelControlAvailability;
  onAddLight: (kind: LightPatch['kind']) => void;
  onDeleteLight: (nodeId: string) => void;
  onSetVisible: (nodeId: string, visible: boolean) => void;
  onLightUpdate: (nodeId: string, patch: Omit<LightPatch, 'nodeId'>) => void;
}

const DEFAULT_LIGHT_COLOR: NonNullable<LightPatch['color']> = { x: 1, y: 1, z: 1 };

const DEFAULT_LIGHT: Omit<LightPatch, 'nodeId'> = {
  kind: 'point',
  color: DEFAULT_LIGHT_COLOR,
  intensity: 1,
  range: 10,
  shadow: { enabled: false },
};

export function LightInspectorPanel({
  node,
  disabled = false,
  availability,
  onAddLight,
  onDeleteLight,
  onSetVisible,
  onLightUpdate,
}: LightInspectorPanelProps): React.JSX.Element {
  const { t } = useTranslation();
  const light = toEditableLight(node?.light);
  const selectedLight = node?.kind === 'light' ? node : null;
  const effectiveAvailability =
    availability ?? (disabled ? disabledControl('capability-unsupported') : null);
  const controlsDisabled =
    disabled || (effectiveAvailability ? isControlDisabled(effectiveAvailability) : false);
  const canEdit = Boolean(selectedLight) && !controlsDisabled;
  const availabilityTitle = (baseTitle: string) =>
    formatControlAvailabilityTitle(effectiveAvailability ?? { state: 'available' }, t, baseTitle);

  const commit = (patch: Partial<Omit<LightPatch, 'nodeId'>>) => {
    if (!selectedLight) return;
    onLightUpdate(selectedLight.nodeId, { ...light, ...patch });
  };

  return (
    <div className="model-side-panel model-light-inspector h-full w-full overflow-y-auto text-xs">
      <div className="model-panel-header">
        <div className="model-title">Lights</div>
        <div className="mt-1 flex gap-1">
          {(['point', 'directional', 'spot'] as const).map((kind) => (
            <button
              key={kind}
              type="button"
              className="model-btn-secondary flex-1 gap-1 px-2 py-1 text-[10px]"
              disabled={controlsDisabled}
              title={availabilityTitle(`Add ${kind} light`)}
              onClick={() => onAddLight(kind)}
            >
              <PlusIcon size={12} />
              {kind}
            </button>
          ))}
        </div>
      </div>

      {selectedLight ? (
        <>
          <div className="model-panel-section">
            <div className="mb-1 font-semibold text-[var(--model-fg)]">{selectedLight.name}</div>
            <div className="break-all text-[10px] text-[var(--model-fg-secondary)]">
              {selectedLight.nodeId}
            </div>
            <label className="model-field-row mt-2">
              <span>Visible</span>
              <input
                type="checkbox"
                checked={selectedLight.visible}
                disabled={controlsDisabled}
                onChange={(event) =>
                  onSetVisible(selectedLight.nodeId, event.currentTarget.checked)
                }
              />
            </label>
          </div>

          <div className="model-panel-section">
            <label className="model-field-column">
              <span>Kind</span>
              <select
                value={light.kind}
                disabled={!canEdit}
                onChange={(event) => commit({ kind: event.currentTarget.value })}
              >
                <option value="point">Point</option>
                <option value="directional">Directional</option>
                <option value="spot">Spot</option>
              </select>
            </label>
            <ColorTriplet
              label="Color"
              value={light.color ?? DEFAULT_LIGHT_COLOR}
              disabled={!canEdit}
              onCommit={(color) => commit({ color })}
            />
            <NumberField
              label="Intensity"
              value={light.intensity}
              min={0}
              step={0.1}
              disabled={!canEdit}
              onCommit={(intensity) => commit({ intensity })}
            />
            <NumberField
              label="Range"
              value={light.range ?? 10}
              min={0}
              step={0.1}
              disabled={!canEdit}
              onCommit={(range) => commit({ range })}
            />
          </div>

          <div className="model-panel-section">
            <label className="model-field-row">
              <span>Shadow</span>
              <input
                type="checkbox"
                checked={light.shadow?.enabled ?? false}
                disabled={!canEdit}
                onChange={(event) =>
                  commit({
                    shadow: {
                      ...light.shadow,
                      enabled: event.currentTarget.checked,
                    },
                  })
                }
              />
            </label>
            {light.kind === 'spot' ? (
              <div className="model-field-grid mt-2">
                <NumberField
                  label="Inner"
                  value={light.innerConeAngle ?? 0}
                  min={0}
                  step={0.05}
                  disabled={!canEdit}
                  onCommit={(innerConeAngle) => commit({ innerConeAngle })}
                />
                <NumberField
                  label="Outer"
                  value={light.outerConeAngle ?? 0.75}
                  min={0}
                  step={0.05}
                  disabled={!canEdit}
                  onCommit={(outerConeAngle) => commit({ outerConeAngle })}
                />
              </div>
            ) : null}
          </div>

          <div className="model-panel-footer">
            <button
              type="button"
              className="model-btn-secondary gap-1"
              disabled={!canEdit}
              title={availabilityTitle('Delete selected light')}
              onClick={() => onDeleteLight(selectedLight.nodeId)}
            >
              <TrashIcon size={12} />
              Delete
            </button>
          </div>
        </>
      ) : (
        <div
          className="model-panel-section text-[var(--model-fg-secondary)]"
          data-availability-state={effectiveAvailability?.state ?? 'available'}
          data-availability-reason={
            effectiveAvailability?.state === 'available' ? undefined : effectiveAvailability?.reason
          }
        >
          Select a light node or add one above.
          {effectiveAvailability && effectiveAvailability.state !== 'available' ? (
            <div className="mt-1">{formatControlAvailabilityTitle(effectiveAvailability, t)}</div>
          ) : null}
        </div>
      )}
    </div>
  );
}

function NumberField({
  label,
  value,
  min,
  step,
  disabled,
  onCommit,
}: {
  label: string;
  value: number;
  min?: number;
  step?: number;
  disabled?: boolean;
  onCommit: (value: number) => void;
}): React.JSX.Element {
  const [draft, setDraft] = React.useState(String(value));
  React.useEffect(() => setDraft(String(value)), [value]);
  return (
    <label className="model-field-column">
      <span>{label}</span>
      <input
        type="number"
        min={min}
        step={step}
        value={draft}
        disabled={disabled}
        onChange={(event) => setDraft(event.currentTarget.value)}
        onBlur={() => {
          const next = Number(draft);
          if (Number.isFinite(next)) onCommit(next);
        }}
      />
    </label>
  );
}

function ColorTriplet({
  label,
  value,
  disabled,
  onCommit,
}: {
  label: string;
  value: NonNullable<LightPatch['color']>;
  disabled?: boolean;
  onCommit: (value: NonNullable<LightPatch['color']>) => void;
}): React.JSX.Element {
  const commitAxis = (axis: 'x' | 'y' | 'z', next: number) => {
    onCommit({ ...value, [axis]: next });
  };
  return (
    <div className="model-field-column">
      <span>{label}</span>
      <div className="model-field-grid">
        {(['x', 'y', 'z'] as const).map((axis) => (
          <NumberField
            key={axis}
            label={axis.toUpperCase()}
            value={value[axis]}
            min={0}
            step={0.01}
            disabled={disabled}
            onCommit={(next) => commitAxis(axis, next)}
          />
        ))}
      </div>
    </div>
  );
}

function toEditableLight(light: SceneNodeSnapshot['light']): Omit<LightPatch, 'nodeId'> {
  return {
    ...DEFAULT_LIGHT,
    ...light,
    color: light?.color ?? DEFAULT_LIGHT_COLOR,
    shadow: light?.shadow ?? DEFAULT_LIGHT.shadow,
  };
}
