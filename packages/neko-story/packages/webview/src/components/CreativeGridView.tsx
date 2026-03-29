/**
 * CreativeGridView — Visual card grid for storyboard overview.
 *
 * Each card represents one scene and shows:
 *   - Generated image placeholder (or actual image if available)
 *   - Scene number + heading
 *   - Action description preview
 *   - Character badges
 *   - Duration estimate
 */

import type { FountainDocument } from '../types';
import {
  buildSceneBreakdowns,
  formatDurationShort,
  type SceneBreakdown,
} from '../utils/sceneBreakdown';

// =============================================================================
// Types
// =============================================================================

interface CreativeGridViewProps {
  document: FountainDocument | null;
  onNavigate?: (line: number) => void;
  /** Optional: map from sceneIndex → generated image data URL */
  generatedImages?: Record<number, string>;
}

// =============================================================================
// Sub-components
// =============================================================================

function SceneCard({
  scene,
  image,
  onNavigate,
}: {
  scene: SceneBreakdown;
  image?: string;
  onNavigate?: (line: number) => void;
}) {
  const intExtColor =
    scene.intExt === 'EXT' ? '#16a34a' : scene.intExt === 'INT' ? '#3b82f6' : '#6b7280';

  return (
    <div
      className="flex flex-col rounded-md overflow-hidden cursor-pointer"
      style={{
        border: '1px solid var(--vscode-panel-border)',
        backgroundColor: 'var(--vscode-editor-background)',
        transition: 'opacity 0.15s, transform 0.1s',
      }}
      onClick={() => onNavigate?.(scene.line)}
      onMouseEnter={(e) => ((e.currentTarget as HTMLDivElement).style.opacity = '0.85')}
      onMouseLeave={(e) => ((e.currentTarget as HTMLDivElement).style.opacity = '1')}
    >
      {/* Image area */}
      <div
        className="relative flex items-center justify-center"
        style={{
          aspectRatio: '16 / 9',
          backgroundColor: 'var(--vscode-input-background)',
          overflow: 'hidden',
        }}
      >
        {image ? (
          <img src={image} alt={scene.heading} className="w-full h-full object-cover" />
        ) : (
          <div
            className="flex flex-col items-center gap-1 opacity-30 select-none"
            style={{ color: 'var(--vscode-foreground)' }}
          >
            <span style={{ fontSize: 24 }}>🎬</span>
            <span style={{ fontSize: 10 }}>未生成</span>
          </div>
        )}

        {/* Scene number badge */}
        <div
          className="absolute top-1.5 left-1.5 font-mono text-xs px-1.5 py-0.5 rounded"
          style={{ backgroundColor: '#00000099', color: '#fff', fontSize: 10 }}
        >
          #{scene.sceneNumber ?? String(scene.sceneIndex).padStart(2, '0')}
        </div>

        {/* INT/EXT badge */}
        <div
          className="absolute top-1.5 right-1.5 text-xs px-1 py-0.5 rounded"
          style={{
            backgroundColor: `${intExtColor}33`,
            color: intExtColor,
            fontSize: 10,
            fontWeight: 600,
          }}
        >
          {scene.intExt ?? '—'}
        </div>
      </div>

      {/* Content */}
      <div className="flex flex-col gap-1 p-2">
        {/* Heading */}
        <div
          className="font-medium line-clamp-1 text-xs"
          style={{ color: 'var(--vscode-foreground)' }}
          title={scene.heading}
        >
          {scene.location}
          {scene.time ? (
            <span style={{ color: 'var(--vscode-descriptionForeground)' }}> · {scene.time}</span>
          ) : null}
        </div>

        {/* Action preview */}
        {scene.actionPreview && (
          <div
            className="line-clamp-2"
            style={{ color: 'var(--vscode-descriptionForeground)', fontSize: 10 }}
          >
            {scene.actionPreview}
          </div>
        )}

        {/* Footer: characters + duration */}
        <div className="flex items-center gap-1 flex-wrap mt-0.5">
          {scene.characters.slice(0, 4).map((char) => (
            <span
              key={char}
              className="text-xs px-1 py-0.5 rounded"
              style={{
                backgroundColor: 'var(--vscode-badge-background)',
                color: 'var(--vscode-badge-foreground)',
                fontSize: 9,
              }}
            >
              {char}
            </span>
          ))}
          {scene.characters.length > 4 && (
            <span style={{ color: 'var(--vscode-descriptionForeground)', fontSize: 9 }}>
              +{scene.characters.length - 4}
            </span>
          )}
          <div className="flex-1" />
          <span style={{ color: 'var(--vscode-descriptionForeground)', fontSize: 9 }}>
            {formatDurationShort(scene.estimatedDurationSec)}
          </span>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Component
// =============================================================================

export function CreativeGridView({
  document,
  onNavigate,
  generatedImages = {},
}: CreativeGridViewProps) {
  if (!document) {
    return (
      <div
        className="flex items-center justify-center h-full text-sm"
        style={{ color: 'var(--vscode-descriptionForeground)' }}
      >
        打开剧本文件以显示创意视图
      </div>
    );
  }

  const scenes = buildSceneBreakdowns(document);

  if (scenes.length === 0) {
    return (
      <div
        className="flex items-center justify-center h-full text-sm"
        style={{ color: 'var(--vscode-descriptionForeground)' }}
      >
        未找到场景标题（以 INT./EXT. 开头的行）
      </div>
    );
  }

  const totalDuration = scenes.reduce((acc, s) => acc + s.estimatedDurationSec, 0);

  return (
    <div
      className="h-full flex flex-col"
      style={{ backgroundColor: 'var(--vscode-editor-background)' }}
    >
      {/* Summary bar */}
      <div
        className="flex items-center gap-4 px-4 py-2 text-xs flex-shrink-0"
        style={{
          borderBottom: '1px solid var(--vscode-panel-border)',
          color: 'var(--vscode-descriptionForeground)',
        }}
      >
        <span>{scenes.length} 个场景</span>
        <span>预计 {formatDurationShort(totalDuration)}</span>
        <span>
          {scenes.filter((s) => generatedImages[s.sceneIndex]).length}/{scenes.length} 已生成
        </span>
      </div>

      {/* Grid */}
      <div
        className="flex-1 overflow-auto p-4"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
          gap: 12,
          alignContent: 'start',
        }}
      >
        {scenes.map((scene) => (
          <SceneCard
            key={scene.line}
            scene={scene}
            image={generatedImages[scene.sceneIndex]}
            onNavigate={onNavigate}
          />
        ))}
      </div>
    </div>
  );
}
