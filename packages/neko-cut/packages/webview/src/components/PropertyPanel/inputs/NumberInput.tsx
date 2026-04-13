import { memo } from 'react';

export interface NumberInputProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  disabled?: boolean;
}

export const NumberInput = memo(function NumberInput({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  unit,
  disabled,
}: NumberInputProps) {
  return (
    <div className="nk-prop-row">
      <label
        className="truncate text-[11px] text-[var(--nk-fg-secondary)]"
        style={{ width: '80px', flexShrink: 0 }}
      >
        {label}
      </label>
      <div className="flex-1 flex items-center gap-1">
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
          min={min}
          max={max}
          step={step}
          disabled={disabled}
          className="nk-prop-input flex-1 disabled:opacity-50"
        />
        {unit && <span className="nk-prop-unit">{unit}</span>}
      </div>
    </div>
  );
});
