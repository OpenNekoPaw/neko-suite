import React, { useState } from 'react';
import { FaceParameterSlider } from './FaceParameterSlider';
import type { FaceCategory, FaceParameter } from '../../types/faceParameters';
import { FACE_CATEGORIES } from '../../types/faceParameters';

interface FaceParameterCategoryProps {
  category: FaceCategory;
  parameters: FaceParameter[];
  values: Record<string, number>;
  onChange: (name: string, value: number) => void;
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
}: FaceParameterCategoryProps): React.JSX.Element {
  const [isExpanded, setIsExpanded] = useState(true);

  const toggleExpanded = () => setIsExpanded(!isExpanded);

  return (
    <div className="border-b border-[var(--vscode-panel-border)]">
      <button
        onClick={toggleExpanded}
        className="w-full flex items-center justify-between px-3 py-2 text-sm font-medium
                   text-[var(--vscode-foreground)] hover:bg-[var(--vscode-list-hoverBackground)]
                   transition-colors"
      >
        <span>{FACE_CATEGORIES[category]}</span>
        <svg
          className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </button>

      {isExpanded && (
        <div className="px-3 py-2 space-y-1">
          {parameters.map((param) => (
            <FaceParameterSlider
              key={param.name}
              parameter={param}
              value={values[param.name] ?? param.default}
              onChange={(value) => onChange(param.name, value)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
