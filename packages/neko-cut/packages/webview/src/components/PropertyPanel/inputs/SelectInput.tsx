import { memo } from 'react';

export interface SelectInputProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  disabled?: boolean;
}

export const SelectInput = memo(function SelectInput({
  label,
  value,
  onChange,
  options,
  disabled,
}: SelectInputProps) {
  return (
    <div className="flex items-center gap-2">
      <label className="w-20 text-[11px] text-[var(--vscode-descriptionForeground)] truncate">
        {label}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="flex-1 px-2 py-1 text-[11px] bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] border border-[var(--vscode-input-border)] rounded disabled:opacity-50"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
});
