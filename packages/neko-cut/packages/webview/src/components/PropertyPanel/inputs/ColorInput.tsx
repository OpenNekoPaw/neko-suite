import { memo } from 'react';

export interface ColorInputProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

export const ColorInput = memo(function ColorInput({
  label,
  value,
  onChange,
  disabled,
}: ColorInputProps) {
  return (
    <div className="nk-prop-row">
      <label
        className="truncate text-[11px] text-[var(--nk-fg-secondary)]"
        style={{ width: '80px', flexShrink: 0 }}
      >
        {label}
      </label>
      <div className="flex-1 flex items-center gap-2">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className="h-6 w-6 cursor-pointer rounded border border-[var(--nk-input-border)] p-0 disabled:opacity-50"
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className="nk-prop-input flex-1 disabled:opacity-50"
        />
      </div>
    </div>
  );
});
