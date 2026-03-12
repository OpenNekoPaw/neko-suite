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
      <div className="w-56 bg-[var(--vscode-sideBar-background,#252526)] border-l border-[var(--vscode-sideBar-border,#3c3c3c)] flex items-center justify-center text-xs opacity-40">
        No node selected
      </div>
    );
  }

  return (
    <div className="w-56 bg-[var(--vscode-sideBar-background,#252526)] border-l border-[var(--vscode-sideBar-border,#3c3c3c)] overflow-y-auto text-xs">
      <div className="p-2 border-b border-[var(--vscode-sideBar-border,#3c3c3c)]">
        <div className="font-semibold text-[var(--vscode-sideBarTitle-foreground,#bbbbbb)]">
          {node.name}
        </div>
        <div className="opacity-50 mt-0.5">{node.id}</div>
      </div>

      {/* Transform mode selector */}
      <div className="p-2 border-b border-[var(--vscode-sideBar-border,#3c3c3c)]">
        <div className="font-semibold mb-1">Transform Mode</div>
        <div className="flex gap-1">
          {(['translate', 'rotate', 'scale'] as const).map((mode) => (
            <button
              key={mode}
              className={`px-2 py-0.5 rounded text-[10px] ${
                transformMode === mode
                  ? 'bg-[var(--vscode-button-background,#0e639c)] text-[var(--vscode-button-foreground,#ffffff)]'
                  : 'bg-[var(--vscode-button-secondaryBackground,#3a3d41)] text-[var(--vscode-button-secondaryForeground,#cccccc)]'
              }`}
              onClick={() => onTransformModeChange(mode)}
            >
              {mode.charAt(0).toUpperCase() + mode.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Position */}
      <div className="p-2 border-b border-[var(--vscode-sideBar-border,#3c3c3c)]">
        <div className="font-semibold mb-1">Position</div>
        <div className="grid grid-cols-3 gap-1">
          <PropertyField label="X" value={node.position[0]} />
          <PropertyField label="Y" value={node.position[1]} />
          <PropertyField label="Z" value={node.position[2]} />
        </div>
      </div>

      {/* Rotation (displayed as quaternion) */}
      <div className="p-2 border-b border-[var(--vscode-sideBar-border,#3c3c3c)]">
        <div className="font-semibold mb-1">Rotation (XYZW)</div>
        <div className="grid grid-cols-2 gap-1">
          <PropertyField label="X" value={node.rotation[0]} />
          <PropertyField label="Y" value={node.rotation[1]} />
          <PropertyField label="Z" value={node.rotation[2]} />
          <PropertyField label="W" value={node.rotation[3]} />
        </div>
      </div>

      {/* Scale */}
      <div className="p-2">
        <div className="font-semibold mb-1">Scale</div>
        <div className="grid grid-cols-3 gap-1">
          <PropertyField label="X" value={node.scale[0]} />
          <PropertyField label="Y" value={node.scale[1]} />
          <PropertyField label="Z" value={node.scale[2]} />
        </div>
      </div>

      {/* Flags */}
      <div className="p-2 border-t border-[var(--vscode-sideBar-border,#3c3c3c)] opacity-50">
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
      <span className="opacity-50 w-3">{label}</span>
      <input
        type="text"
        readOnly
        value={(value ?? 0).toFixed(3)}
        className="bg-[var(--vscode-input-background,#3c3c3c)] text-[var(--vscode-input-foreground,#cccccc)] border border-[var(--vscode-input-border,#555)] rounded px-1 py-0.5 w-full text-[10px]"
      />
    </div>
  );
}
