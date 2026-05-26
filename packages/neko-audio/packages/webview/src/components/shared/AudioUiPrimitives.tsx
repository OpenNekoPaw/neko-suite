import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Button, IconButton, Select, Slider } from '@neko/ui/primitives';

export interface AudioButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly children: ReactNode;
  readonly variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
}

export interface AudioIconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly children: ReactNode;
  readonly label: string;
  readonly active?: boolean;
  readonly variant?: 'default' | 'primary' | 'danger';
}

export interface AudioSelectOption<TValue extends string | number> {
  readonly value: TValue;
  readonly label: string;
  readonly disabled?: boolean;
}

export interface AudioSelectProps<TValue extends string | number> {
  readonly label: string;
  readonly value: TValue;
  readonly options: readonly AudioSelectOption<TValue>[];
  readonly disabled?: boolean;
  readonly className?: string;
  readonly onChange: (value: TValue) => void;
}

export interface AudioSliderProps {
  readonly label: string;
  readonly value: number;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly className?: string;
  readonly onChange: (value: number) => void;
}

const buttonVariantMap: Record<
  NonNullable<AudioButtonProps['variant']>,
  'default' | 'secondary' | 'ghost' | 'danger'
> = {
  danger: 'danger',
  ghost: 'ghost',
  primary: 'default',
  secondary: 'secondary',
};

const iconVariantMap: Record<
  NonNullable<AudioIconButtonProps['variant']>,
  'default' | 'ghost' | 'danger'
> = {
  danger: 'danger',
  default: 'ghost',
  primary: 'default',
};

export function AudioButton({
  children,
  className = '',
  variant = 'secondary',
  ...props
}: AudioButtonProps) {
  return (
    <Button className={className} size="xs" variant={buttonVariantMap[variant]} {...props}>
      {children}
    </Button>
  );
}

export function AudioIconButton({
  active = false,
  children,
  className = '',
  label,
  title,
  variant = 'default',
  ...props
}: AudioIconButtonProps) {
  const activeClass = active ? 'bg-[var(--neko-hover)] text-[var(--activity-fg)]' : '';

  return (
    <IconButton
      className={`h-6 w-6 rounded-full ${activeClass} ${className}`}
      icon={children}
      label={label}
      size="xs"
      title={title}
      variant={iconVariantMap[variant]}
      {...props}
    />
  );
}

export function AudioSelect<TValue extends string | number>({
  className = '',
  disabled,
  label,
  onChange,
  options,
  value,
}: AudioSelectProps<TValue>) {
  return (
    <Select
      className={`h-6 min-w-16 text-[11px] ${className}`}
      disabled={disabled}
      label={label}
      onValueChange={(next) => {
        const option = options.find((candidate) => String(candidate.value) === next);
        if (option) {
          onChange(option.value);
        }
      }}
      options={options.map((option) => ({
        disabled: option.disabled,
        label: option.label,
        value: String(option.value),
      }))}
      value={String(value)}
    />
  );
}

export function AudioSlider({
  className = '',
  label,
  max,
  min,
  onChange,
  step,
  value,
}: AudioSliderProps) {
  return (
    <Slider
      className={className}
      label={label}
      max={max}
      min={min}
      onCommit={onChange}
      onPreviewChange={onChange}
      step={step}
      value={value}
    />
  );
}
