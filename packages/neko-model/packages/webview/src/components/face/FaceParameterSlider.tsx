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
        className="w-20 shrink-0 text-xs text-[var(--model-fg)]"
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
        className="model-range flex-1"
      />
      <span className="w-10 text-right text-xs text-[var(--model-fg-secondary)]">
        {value.toFixed(2)}
      </span>
    </div>
  );
}
