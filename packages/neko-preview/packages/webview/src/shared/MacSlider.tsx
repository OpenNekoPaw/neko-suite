import type { InputHTMLAttributes } from 'react';
import { Slider } from '@neko/ui/primitives';

export interface MacSliderProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'type' | 'onChange'
> {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (value: number) => void;
}

export function MacSlider({
  className = '',
  disabled,
  max = 1,
  min = 0,
  onChange,
  step = 0.01,
  title,
  value,
}: MacSliderProps) {
  return (
    <Slider
      className={className}
      disabled={disabled}
      label={typeof title === 'string' ? title : undefined}
      max={max}
      min={min}
      onCommit={onChange}
      onPreviewChange={onChange}
      step={step}
      value={value}
    />
  );
}
