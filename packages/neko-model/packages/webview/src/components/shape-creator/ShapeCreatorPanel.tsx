import React, { useState, useMemo, useCallback } from 'react';
import { SHAPE_PARAMS, SHAPE_ICONS, type ShapeType } from '../../types/shapeParams';

// Acquire VSCode API if available
declare function acquireVsCodeApi(): {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
};

const vscode = typeof acquireVsCodeApi === 'function' ? acquireVsCodeApi() : null;

const SHAPE_TYPES: ShapeType[] = ['cube', 'sphere', 'cylinder', 'cone', 'torus', 'plane'];

/**
 * Shape Creator Panel - Create parametric 3D primitives.
 *
 * Select a shape type, adjust parameters, and create the mesh.
 */
export function ShapeCreatorPanel(): React.JSX.Element {
  const [shapeType, setShapeType] = useState<ShapeType>('cube');
  const [params, setParams] = useState<Record<string, number>>(() => buildDefaults('cube'));

  const paramDefs = useMemo(() => SHAPE_PARAMS[shapeType], [shapeType]);

  const handleShapeChange = useCallback((type: ShapeType) => {
    setShapeType(type);
    setParams(buildDefaults(type));
  }, []);

  const handleParamChange = useCallback((name: string, value: number) => {
    setParams((prev) => ({ ...prev, [name]: value }));
  }, []);

  const handleCreate = useCallback(() => {
    vscode?.postMessage({
      type: 'createShape',
      shapeType,
      params,
    });
  }, [shapeType, params]);

  return (
    <div className="w-64 h-full bg-[var(--vscode-sideBar-background)] border-l border-[var(--vscode-panel-border)] flex flex-col">
      {/* Header */}
      <div className="px-3 py-2 border-b border-[var(--vscode-panel-border)]">
        <h2 className="text-sm font-semibold text-[var(--vscode-foreground)]">Shape Creator</h2>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Shape Type Selector */}
        <div className="px-3 py-2 border-b border-[var(--vscode-panel-border)]">
          <div className="text-xs font-semibold text-[var(--vscode-foreground)] mb-2">Shape</div>
          <div className="grid grid-cols-3 gap-1">
            {SHAPE_TYPES.map((type) => (
              <button
                key={type}
                onClick={() => handleShapeChange(type)}
                className={`flex flex-col items-center px-1 py-1.5 rounded transition-colors ${
                  shapeType === type
                    ? 'bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)]'
                    : 'bg-[var(--vscode-button-secondaryBackground)] text-[var(--vscode-button-secondaryForeground)] hover:bg-[var(--vscode-button-secondaryHoverBackground)]'
                }`}
                title={type.charAt(0).toUpperCase() + type.slice(1)}
              >
                <span className="text-base leading-none">{SHAPE_ICONS[type]}</span>
                <span className="text-[10px] mt-0.5 capitalize">{type}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Dynamic Parameters */}
        <div className="px-3 py-2 border-b border-[var(--vscode-panel-border)]">
          <div className="text-xs font-semibold text-[var(--vscode-foreground)] mb-2">
            Parameters
          </div>
          {paramDefs.map((def) => (
            <div key={def.name} className="mb-2">
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-[10px] text-[var(--vscode-descriptionForeground)]">
                  {def.label}
                </span>
                <span className="text-[10px] text-[var(--vscode-descriptionForeground)]">
                  {(params[def.name] ?? def.default).toFixed(def.step < 1 ? 2 : 0)}
                </span>
              </div>
              <input
                type="range"
                min={def.min}
                max={def.max}
                step={def.step}
                value={params[def.name] ?? def.default}
                onChange={(e) => handleParamChange(def.name, parseFloat(e.target.value))}
                className="w-full h-1 accent-[var(--vscode-button-background)]"
              />
            </div>
          ))}
        </div>

        {/* Create Button */}
        <div className="px-3 py-3">
          <button
            onClick={handleCreate}
            className="w-full px-2 py-1.5 text-xs rounded transition-colors
                       bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)]
                       hover:bg-[var(--vscode-button-hoverBackground)]"
          >
            Create {shapeType.charAt(0).toUpperCase() + shapeType.slice(1)}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Build default parameter values for a given shape type. */
function buildDefaults(type: ShapeType): Record<string, number> {
  const defaults: Record<string, number> = {};
  for (const def of SHAPE_PARAMS[type]) {
    defaults[def.name] = def.default;
  }
  return defaults;
}
