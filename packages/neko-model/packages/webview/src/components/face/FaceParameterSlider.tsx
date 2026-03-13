import React from 'react';
import type { FaceParameter } from '../../types/faceParameters';

interface FaceParameterSliderProps {
  parameter: FaceParameter;
  value: number;
  onChange: (value: number) => void;
}

/**
 * Single face parameter slider component.
 * Displays label, slider, and numeric value.
 */
export function FaceParameterSlider({
  parameter,
  value,
  onChange,
}: FaceParameterSliderProps): React.JSX.Element {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(parseFloat(e.target.value));
  };

  return (
    <div className="flex items-center gap-2 py-1">
      <label
        htmlFor={`param-${parameter.name}`}
        className="text-xs text-[var(--vscode-foreground)] w-20 flex-shrink-0"
      >
        {parameter.label}
      </label>
      <input
        id={`param-${parameter.name}`}
        type="range"
        min={parameter.min}
        max={parameter.max}
        step={parameter.step}
        value={value}
        onChange={handleChange}
        className="flex-1 h-1 bg-[var(--vscode-input-background)] rounded-lg appearance-none cursor-pointer
                   [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3
                   [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[var(--vscode-button-background)]
                   [&::-webkit-slider-thumb]:cursor-pointer
                   [&::-moz-range-thumb]:w-3 [&::-moz-range-thumb]:h-3 [&::-moz-range-thumb]:rounded-full
                   [&::-moz-range-thumb]:bg-[var(--vscode-button-background)] [&::-moz-range-thumb]:border-0
                   [&::-moz-range-thumb]:cursor-pointer"
      />
      <span className="text-xs text-[var(--vscode-descriptionForeground)] w-10 text-right">
        {value.toFixed(2)}
      </span>
    </div>
  );
}
