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
    <div className="flex items-center gap-2">
      <label className="w-20 text-[11px] text-[var(--vscode-descriptionForeground)] truncate">
        {label}
      </label>
      <div className="flex-1 flex items-center gap-2">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className="w-6 h-6 p-0 border border-[var(--vscode-input-border)] rounded cursor-pointer disabled:opacity-50"
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className="flex-1 px-2 py-1 text-[11px] bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] border border-[var(--vscode-input-border)] rounded disabled:opacity-50"
        />
      </div>
    </div>
  );
});
