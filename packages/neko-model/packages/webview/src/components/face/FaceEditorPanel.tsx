import React, { useEffect } from 'react';
import { useTranslation } from '../../i18n/I18nContext';
import { FaceParameterCategory } from './FaceParameterCategory';
import { useModelStore } from '../../stores/modelStore';
import { getLogger } from '../../platform/logger';
import {
  FACE_PARAMETERS,
  getParametersByCategory,
  getDefaultFaceParams,
  type FaceCategory,
} from '../../types/faceParameters';

const logger = getLogger('FaceEditorPanel');

interface FaceEditorPanelProps {
  characterId: string | null;
  disabled?: boolean;
  onSetMorph: (morphId: string, weight: number) => void;
}

/**
 * Face Editor Panel - Parametric face customization UI.
 *
 * Features:
 * - 5 categories (face, eyes, nose, mouth, eyebrows)
 * - 20-25 parameters total
 * - Random / Reset / AI Generate buttons
 * - Real-time Morph Target updates (< 1ms)
 */
export function FaceEditorPanel({
  characterId,
  disabled = false,
  onSetMorph,
}: FaceEditorPanelProps): React.JSX.Element {
  const faceParams = useModelStore((s) => s.faceParams);
  const setFaceParam = useModelStore((s) => s.setFaceParam);
  const setFaceParams = useModelStore((s) => s.setFaceParams);

  // Initialize default params on mount
  useEffect(() => {
    if (Object.keys(faceParams).length === 0) {
      setFaceParams(getDefaultFaceParams(), { replace: true });
    }
  }, []);

  const handleReset = () => {
    setFaceParams(getDefaultFaceParams(), { replace: true });
    for (const [name, value] of Object.entries(getDefaultFaceParams())) {
      onSetMorph(name, value);
    }
  };

  const handleRandomize = () => {
    const randomized: Record<string, number> = {};
    for (const param of FACE_PARAMETERS) {
      randomized[param.name] = Math.random() * (param.max - param.min) + param.min;
    }
    setFaceParams(randomized, { replace: true });
    for (const [name, value] of Object.entries(randomized)) {
      onSetMorph(name, value);
    }
  };

  const handleAIGenerate = () => {
    // TODO: Call AI MCP Tool (face.generate_params)
    logger.info('AI Generate clicked — not implemented yet');
  };

  const categories: FaceCategory[] = ['face', 'eyes', 'nose', 'mouth', 'eyebrows'];
  const handleParamChange = (name: string, value: number) => {
    setFaceParam(name, value);
    onSetMorph(name, value);
  };
  const controlsDisabled = disabled || !characterId;
  const { t } = useTranslation();

  return (
    <div className="model-side-panel h-full w-64">
      <div className="model-panel-header">
        <h2 className="model-title">{t('face.title')}</h2>
      </div>

      <div className="model-panel-section flex gap-2">
        <button
          onClick={handleRandomize}
          disabled={controlsDisabled}
          className="model-btn-primary flex-1"
        >
          {t('face.random')}
        </button>
        <button
          onClick={handleReset}
          disabled={controlsDisabled}
          className="model-btn-secondary flex-1"
        >
          {t('face.reset')}
        </button>
      </div>

      <div className="model-panel-section">
        <button onClick={handleAIGenerate} className="model-btn-primary w-full">
          {t('face.aiGenerate')}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {categories.map((category) => (
          <FaceParameterCategory
            key={category}
            category={category}
            parameters={getParametersByCategory(category)}
            values={faceParams}
            onChange={handleParamChange}
            disabled={controlsDisabled}
          />
        ))}
      </div>

      <div className="model-panel-footer text-xs">
        {t('face.paramCount', { count: FACE_PARAMETERS.length })}
      </div>
    </div>
  );
}
