import React, { useEffect } from 'react';
import { ConsoleLogger, LogLevel } from '@neko/shared';

const logger = new ConsoleLogger('FaceEditorPanel', LogLevel.Info);
import { FaceParameterCategory } from './FaceParameterCategory';
import { useModelStore } from '../../stores/modelStore';
import {
  FACE_PARAMETERS,
  getParametersByCategory,
  getDefaultFaceParams,
  type FaceCategory,
} from '../../types/faceParameters';

/**
 * Face Editor Panel - Parametric face customization UI.
 *
 * Features:
 * - 5 categories (face, eyes, nose, mouth, eyebrows)
 * - 20-25 parameters total
 * - Random / Reset / AI Generate buttons
 * - Real-time Morph Target updates (< 1ms)
 */
export function FaceEditorPanel(): React.JSX.Element {
  const faceParams = useModelStore((s) => s.faceParams);
  const setFaceParam = useModelStore((s) => s.setFaceParam);
  const setFaceParams = useModelStore((s) => s.setFaceParams);

  // Initialize default params on mount
  useEffect(() => {
    if (Object.keys(faceParams).length === 0) {
      setFaceParams(getDefaultFaceParams());
    }
  }, []);

  const handleReset = () => {
    setFaceParams(getDefaultFaceParams());
  };

  const handleRandomize = () => {
    const randomized: Record<string, number> = {};
    for (const param of FACE_PARAMETERS) {
      randomized[param.name] = Math.random() * (param.max - param.min) + param.min;
    }
    setFaceParams(randomized);
  };

  const handleAIGenerate = () => {
    // TODO: Call AI MCP Tool (face.generate_params)
    logger.info('AI Generate clicked — not implemented yet');
  };

  const categories: FaceCategory[] = ['face', 'eyes', 'nose', 'mouth', 'eyebrows'];

  return (
    <div className="model-side-panel h-full w-64">
      <div className="model-panel-header">
        <h2 className="model-title">面部编辑器</h2>
      </div>

      <div className="model-panel-section flex gap-2">
        <button onClick={handleRandomize} className="model-btn-primary flex-1">
          随机
        </button>
        <button onClick={handleReset} className="model-btn-secondary flex-1">
          重置
        </button>
      </div>

      <div className="model-panel-section">
        <button onClick={handleAIGenerate} className="model-btn-primary w-full">
          AI 生成
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {categories.map((category) => (
          <FaceParameterCategory
            key={category}
            category={category}
            parameters={getParametersByCategory(category)}
            values={faceParams}
            onChange={setFaceParam}
          />
        ))}
      </div>

      <div className="model-panel-footer text-xs">{FACE_PARAMETERS.length} 个参数</div>
    </div>
  );
}
