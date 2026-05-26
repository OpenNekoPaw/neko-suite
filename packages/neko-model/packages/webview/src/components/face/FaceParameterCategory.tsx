import React, { useState } from 'react';
import { toCodiconClassName } from '@neko/ui/icons';
import { FaceParameterSlider } from './FaceParameterSlider';
import type { FaceCategory, FaceParameter } from '../../types/faceParameters';
import { FACE_CATEGORIES } from '../../types/faceParameters';

interface FaceParameterCategoryProps {
  category: FaceCategory;
  parameters: FaceParameter[];
  values: Record<string, number>;
  onChange: (name: string, value: number) => void;
  onCommit?: (name: string, value: number) => void;
  onPreviewChange?: (name: string, value: number) => void;
  disabled?: boolean;
}

/**
 * Collapsible category panel for face parameters.
 * Groups related parameters (e.g., all eye-related sliders).
 */
export function FaceParameterCategory({
  category,
  parameters,
  values,
  onChange,
  onCommit,
  onPreviewChange,
  disabled = false,
}: FaceParameterCategoryProps): React.JSX.Element {
  const [isExpanded, setIsExpanded] = useState(true);

  const toggleExpanded = () => setIsExpanded(!isExpanded);

  return (
    <div className="border-b border-[var(--model-divider)] last:border-b-0">
      <button
        onClick={toggleExpanded}
        className="model-section-toggle flex w-full items-center justify-between px-3 py-2 text-sm font-medium"
      >
        <span>{FACE_CATEGORIES[category]}</span>
        <span
          aria-hidden="true"
          className={`${toCodiconClassName('chevron-right')} transition-transform ${isExpanded ? 'rotate-90' : ''}`}
        />
      </button>

      {isExpanded && (
        <div className="space-y-1.5 px-3 py-2">
          {parameters.map((param) => (
            <FaceParameterSlider
              key={param.name}
              parameter={param}
              value={values[param.name] ?? param.default}
              onChange={(value) => onChange(param.name, value)}
              onCommit={(value) => (onCommit ?? onChange)(param.name, value)}
              onPreviewChange={(value) => (onPreviewChange ?? onChange)(param.name, value)}
              disabled={disabled}
            />
          ))}
        </div>
      )}
    </div>
  );
}
