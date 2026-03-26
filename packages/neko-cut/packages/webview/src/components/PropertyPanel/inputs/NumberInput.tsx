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
    <div className="flex items-center gap-2">
      <label className="w-20 text-[11px] text-[var(--vscode-descriptionForeground)] truncate">
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
          className="w-full px-2 py-1 text-[11px] bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] border border-[var(--vscode-input-border)] rounded disabled:opacity-50"
        />
        {unit && (
          <span className="text-[10px] text-[var(--vscode-descriptionForeground)]">{unit}</span>
        )}
      </div>
    </div>
  );
});
