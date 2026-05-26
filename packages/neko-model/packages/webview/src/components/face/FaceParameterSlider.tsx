import { NumberSlider } from '@neko/ui/creative';
import type { FaceParameter } from '../../types/faceParameters';

interface FaceParameterSliderProps {
  parameter: FaceParameter;
  value: number;
  onChange: (value: number) => void;
  onCommit?: (value: number) => void;
  onPreviewChange?: (value: number) => void;
  disabled?: boolean;
}

/**
 * Single face parameter slider component.
 * Displays label, slider, and numeric value.
 */
export function FaceParameterSlider({
  parameter,
  value,
  onChange,
  onCommit,
  onPreviewChange,
  disabled = false,
}: FaceParameterSliderProps): React.JSX.Element {
  const handlePreviewChange = onPreviewChange ?? onChange;
  const handleCommit = onCommit ?? onChange;

  return (
    <div className="flex items-center gap-2 py-1">
      <NumberSlider
        disabled={disabled}
        id={parameter.name}
        label={parameter.label}
        min={parameter.min}
        max={parameter.max}
        step={parameter.step}
        onCommit={(_, nextValue) => handleCommit(nextValue)}
        onPreviewChange={(_, nextValue) => handlePreviewChange(nextValue)}
        value={value}
      />
    </div>
  );
}
