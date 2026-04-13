import { memo } from 'react';

export interface CheckboxInputProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

export const CheckboxInput = memo(function CheckboxInput({
  label,
  checked,
  onChange,
  disabled,
}: CheckboxInputProps) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
        className="h-4 w-4 accent-[var(--nk-accent)]"
      />
      <label className="text-[11px] text-[var(--nk-fg)]">{label}</label>
    </div>
  );
});
