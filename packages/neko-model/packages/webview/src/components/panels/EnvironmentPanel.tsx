import React from 'react';
import type { EnvironmentDiagnostic, EnvironmentPatch } from '@neko/shared';
import { RefreshIcon, TrashIcon, UploadIcon } from '@neko/ui/icons';

export interface EnvironmentPanelProps {
  environment: EnvironmentPatch | null;
  diagnostics: readonly EnvironmentDiagnostic[];
  disabled?: boolean;
  onSet: (patch: Omit<EnvironmentPatch, 'environmentId'>) => void;
  onUpdate: (patch: Omit<EnvironmentPatch, 'environmentId'>) => void;
  onClear: () => void;
  onRetry: () => void;
  onPickPanorama: () => void;
}

const DEFAULT_ENVIRONMENT: Omit<EnvironmentPatch, 'environmentId'> = {
  mode: 'background-and-ibl',
  rotationDeg: 0,
  intensity: 1,
  exposure: 0,
  visibleAsBackground: true,
  backgroundColor: { x: 0.02, y: 0.025, z: 0.03, w: 1 },
};

export function EnvironmentPanel({
  environment,
  diagnostics,
  disabled = false,
  onSet,
  onUpdate,
  onClear,
  onRetry,
  onPickPanorama,
}: EnvironmentPanelProps): React.JSX.Element {
  const current = toEditableEnvironment(environment);
  const commit = (patch: Partial<Omit<EnvironmentPatch, 'environmentId'>>) => {
    if (environment) {
      onUpdate({ ...current, ...patch });
    } else {
      onSet({ ...current, ...patch });
    }
  };

  return (
    <div className="model-side-panel model-environment-panel h-full w-full overflow-y-auto text-xs">
      <div className="model-panel-header">
        <div className="model-title">Environment</div>
        <div className="mt-1 text-[10px] text-[var(--model-fg-secondary)]">
          {environment ? environment.environmentId : 'Default viewport background'}
        </div>
      </div>

      <div className="model-panel-section">
        <button
          type="button"
          className="model-btn-secondary w-full gap-1"
          disabled={disabled}
          title="Choose LDR panorama"
          onClick={onPickPanorama}
        >
          <UploadIcon size={12} />
          Panorama
        </button>
        <ColorQuad
          label="Background"
          value={current.backgroundColor ?? DEFAULT_ENVIRONMENT.backgroundColor!}
          disabled={disabled}
          onCommit={(backgroundColor) => commit({ backgroundColor })}
        />
        <label className="model-field-column">
          <span>Mode</span>
          <select
            value={current.mode}
            disabled={disabled}
            onChange={(event) =>
              commit({ mode: event.currentTarget.value as EnvironmentPatch['mode'] })
            }
          >
            <option value="skybox">Skybox</option>
            <option value="ibl">IBL</option>
            <option value="background-and-ibl">Background + IBL</option>
          </select>
        </label>
        <label className="model-field-row">
          <span>Visible background</span>
          <input
            type="checkbox"
            checked={current.visibleAsBackground}
            disabled={disabled}
            onChange={(event) => commit({ visibleAsBackground: event.currentTarget.checked })}
          />
        </label>
      </div>

      <div className="model-panel-section">
        <NumberField
          label="Rotation"
          value={current.rotationDeg}
          step={1}
          disabled={disabled}
          onCommit={(rotationDeg) => commit({ rotationDeg })}
        />
        <NumberField
          label="Intensity"
          value={current.intensity}
          min={0}
          step={0.05}
          disabled={disabled}
          onCommit={(intensity) => commit({ intensity })}
        />
        <NumberField
          label="Exposure"
          value={current.exposure}
          step={0.05}
          disabled={disabled}
          onCommit={(exposure) => commit({ exposure })}
        />
      </div>

      {diagnostics.length > 0 ? (
        <div className="model-panel-section">
          {diagnostics.map((diagnostic) => (
            <div key={`${diagnostic.code}:${diagnostic.message}`} className="model-diagnostic-row">
              <span>{diagnostic.code}</span>
              <span>{diagnostic.message}</span>
            </div>
          ))}
        </div>
      ) : null}

      <div className="model-panel-footer flex gap-1">
        <button
          type="button"
          className="model-btn-secondary gap-1"
          disabled={disabled}
          title="Retry environment loading"
          onClick={onRetry}
        >
          <RefreshIcon size={12} />
          Retry
        </button>
        <button
          type="button"
          className="model-btn-secondary gap-1"
          disabled={disabled || !environment}
          title="Clear environment"
          onClick={onClear}
        >
          <TrashIcon size={12} />
          Clear
        </button>
      </div>
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

function ColorQuad({
  label,
  value,
  disabled,
  onCommit,
}: {
  label: string;
  value: NonNullable<EnvironmentPatch['backgroundColor']>;
  disabled?: boolean;
  onCommit: (value: NonNullable<EnvironmentPatch['backgroundColor']>) => void;
}): React.JSX.Element {
  const commitAxis = (axis: 'x' | 'y' | 'z' | 'w', next: number) => {
    onCommit({ ...value, [axis]: next });
  };
  return (
    <div className="model-field-column">
      <span>{label}</span>
      <div className="model-field-grid">
        {(['x', 'y', 'z', 'w'] as const).map((axis) => (
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

function toEditableEnvironment(
  environment: EnvironmentPatch | null,
): Omit<EnvironmentPatch, 'environmentId'> {
  return {
    ...DEFAULT_ENVIRONMENT,
    ...environment,
    backgroundColor: environment?.backgroundColor ?? DEFAULT_ENVIRONMENT.backgroundColor,
  };
}
