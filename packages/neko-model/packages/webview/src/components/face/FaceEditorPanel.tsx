import React, { useEffect } from 'react';
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
    console.log('[FaceEditor] AI Generate clicked - not implemented yet');
  };

  const categories: FaceCategory[] = ['face', 'eyes', 'nose', 'mouth', 'eyebrows'];

  return (
    <div className="w-64 h-full bg-[var(--vscode-sideBar-background)] border-l border-[var(--vscode-panel-border)] flex flex-col">
      {/* Header */}
      <div className="px-3 py-2 border-b border-[var(--vscode-panel-border)]">
        <h2 className="text-sm font-semibold text-[var(--vscode-foreground)]">面部编辑器</h2>
      </div>

      {/* Action Buttons */}
      <div className="px-3 py-2 border-b border-[var(--vscode-panel-border)] flex gap-2">
        <button
          onClick={handleRandomize}
          className="flex-1 px-2 py-1 text-xs bg-[var(--vscode-button-background)]
                     text-[var(--vscode-button-foreground)] rounded hover:bg-[var(--vscode-button-hoverBackground)]
                     transition-colors"
        >
          随机
        </button>
        <button
          onClick={handleReset}
          className="flex-1 px-2 py-1 text-xs bg-[var(--vscode-button-secondaryBackground)]
                     text-[var(--vscode-button-secondaryForeground)] rounded
                     hover:bg-[var(--vscode-button-secondaryHoverBackground)] transition-colors"
        >
          重置
        </button>
      </div>

      <div className="px-3 py-2 border-b border-[var(--vscode-panel-border)]">
        <button
          onClick={handleAIGenerate}
          className="w-full px-2 py-1 text-xs bg-[var(--vscode-button-background)]
                     text-[var(--vscode-button-foreground)] rounded hover:bg-[var(--vscode-button-hoverBackground)]
                     transition-colors"
        >
          AI 生成
        </button>
      </div>

      {/* Parameter Categories */}
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

      {/* Footer Info */}
      <div className="px-3 py-2 border-t border-[var(--vscode-panel-border)] text-xs text-[var(--vscode-descriptionForeground)]">
        {FACE_PARAMETERS.length} 个参数
      </div>
    </div>
  );
}
