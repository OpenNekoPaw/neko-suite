import React from 'react';
import type { SceneNodeSnapshot, TransformMode } from '../../types';

interface TransformPanelProps {
  node: SceneNodeSnapshot | null;
  transformMode: TransformMode;
  onTransformModeChange: (mode: TransformMode) => void;
}

/**
 * Transform properties panel (right sidebar).
 */
export function TransformPanel({
  node,
  transformMode,
  onTransformModeChange,
}: TransformPanelProps): React.JSX.Element {
  if (!node) {
    return (
      <div className="model-side-panel w-56 items-center justify-center px-4 text-center text-xs text-[var(--model-fg-secondary)]">
        No node selected
      </div>
    );
  }

  return (
    <div className="model-side-panel w-56 overflow-y-auto text-xs">
      <div className="model-panel-header">
        <div className="font-semibold text-[var(--model-fg)]">{node.name}</div>
        <div className="mt-0.5 break-all text-[10px] text-[var(--model-fg-secondary)]">
          {node.id}
        </div>
      </div>

      <div className="model-panel-section">
        <div className="mb-1 font-semibold text-[var(--model-fg)]">Transform Mode</div>
        <div className="flex gap-1">
          {(['translate', 'rotate', 'scale'] as const).map((mode) => (
            <button
              key={mode}
              className={`${transformMode === mode ? 'model-btn-primary' : 'model-btn-secondary'} flex-1 px-2 py-1 text-[10px] ${
                transformMode === mode ? '' : ''
              }`}
              onClick={() => onTransformModeChange(mode)}
            >
              {mode.charAt(0).toUpperCase() + mode.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div className="model-panel-section">
        <div className="mb-1 font-semibold text-[var(--model-fg)]">Position</div>
        <div className="grid grid-cols-3 gap-1">
          <PropertyField label="X" value={node.position[0]} />
          <PropertyField label="Y" value={node.position[1]} />
          <PropertyField label="Z" value={node.position[2]} />
        </div>
      </div>

      <div className="model-panel-section">
        <div className="mb-1 font-semibold text-[var(--model-fg)]">Rotation (XYZW)</div>
        <div className="grid grid-cols-2 gap-1">
          <PropertyField label="X" value={node.rotation[0]} />
          <PropertyField label="Y" value={node.rotation[1]} />
          <PropertyField label="Z" value={node.rotation[2]} />
          <PropertyField label="W" value={node.rotation[3]} />
        </div>
      </div>

      <div className="p-2">
        <div className="mb-1 font-semibold text-[var(--model-fg)]">Scale</div>
        <div className="grid grid-cols-3 gap-1">
          <PropertyField label="X" value={node.scale[0]} />
          <PropertyField label="Y" value={node.scale[1]} />
          <PropertyField label="Z" value={node.scale[2]} />
        </div>
      </div>

      <div className="model-panel-footer text-[10px]">
        <div className="flex flex-wrap gap-2">
          {node.hasMesh && <span>Mesh</span>}
          {node.hasLight && <span>Light</span>}
          {node.hasCamera && <span>Camera</span>}
          {node.hasSkeleton && <span>Skeleton</span>}
        </div>
      </div>
    </div>
  );
}

function PropertyField({
  label,
  value,
}: {
  label: string;
  value: number | undefined;
}): React.JSX.Element {
  return (
    <div className="flex items-center gap-1">
      <span className="w-3 text-[var(--model-fg-secondary)]">{label}</span>
      <input
        type="text"
        readOnly
        value={(value ?? 0).toFixed(3)}
        className="model-input w-full px-1.5 py-0.5 text-[10px] text-center"
      />
    </div>
  );
}
