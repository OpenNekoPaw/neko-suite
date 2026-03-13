/**
 * FrameControls - frame operation buttons for frame-by-frame animation
 *
 * Provides add/duplicate/delete frame operations in the side panel.
 */
import { useCallback } from 'react';
import { useSketchStore } from '../stores';
import { useTranslation } from '../i18n/I18nContext';

export function FrameControls() {
  const { t } = useTranslation();
  const frameLayers = useSketchStore((s) => s.frameLayers);
  const selectedLayerId = useSketchStore((s) => s.selectedFrameLayerId);
  const addFrame = useSketchStore((s) => s.addFrame);
  const addBlankFrame = useSketchStore((s) => s.addBlankFrame);
  const duplicateFrame = useSketchStore((s) => s.duplicateFrame);
  const removeCurrentFrame = useSketchStore((s) => s.removeCurrentFrame);
  const addFrameLayer = useSketchStore((s) => s.addFrameLayer);

  const currentLayer = frameLayers.find((l) => l.id === selectedLayerId);

  const handleAddLayer = useCallback(() => {
    const name = t('sketch.layer.defaultName', { index: String(frameLayers.length + 1) });
    addFrameLayer(name);
  }, [frameLayers.length, addFrameLayer, t]);

  if (frameLayers.length === 0) {
    return (
      <div className="sketch-panel" role="region" aria-label={t('sketch.panel.frames')}>
        <h3 className="sketch-panel-title m-0 mb-1">{t('sketch.panel.frames')}</h3>
        <button
          className="w-full text-xs py-1 rounded border border-[var(--vscode-button-border)] hover:bg-[var(--vscode-button-hoverBackground)]"
          onClick={handleAddLayer}
        >
          {t('sketch.frame.newFrameLayer')}
        </button>
      </div>
    );
  }

  return (
    <div className="sketch-panel" role="region" aria-label={t('sketch.panel.frames')}>
      <h3 className="sketch-panel-title m-0 mb-1">{t('sketch.panel.frames')}</h3>

      {/* Layer selector */}
      <div className="flex items-center gap-1 mb-1">
        <select
          className="flex-1 text-xs bg-transparent border border-[var(--vscode-input-border)] rounded px-1 py-0.5"
          value={selectedLayerId ?? ''}
          onChange={(e) => useSketchStore.getState().setSelectedFrameLayer(e.target.value || null)}
          aria-label={t('sketch.frame.frameLayer')}
        >
          {frameLayers.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
        <button
          className="text-xs px-1.5 py-0.5 rounded border border-[var(--vscode-button-border)]"
          onClick={handleAddLayer}
          title={t('sketch.frame.addFrameLayer')}
          aria-label={t('sketch.frame.addFrameLayer')}
        >
          +
        </button>
      </div>

      {/* Frame operations */}
      {currentLayer && (
        <div className="flex items-center gap-0.5">
          <button
            className="flex-1 text-xs py-0.5 rounded border border-[var(--vscode-button-border)] hover:bg-[var(--vscode-button-hoverBackground)]"
            onClick={addFrame}
            title={t('sketch.frame.addFrameKey')}
            aria-label={t('sketch.frame.addFrame')}
          >
            {t('sketch.frame.addFrameButton')}
          </button>
          <button
            className="flex-1 text-xs py-0.5 rounded border border-[var(--vscode-button-border)] hover:bg-[var(--vscode-button-hoverBackground)]"
            onClick={addBlankFrame}
            title={t('sketch.frame.addBlank')}
            aria-label={t('sketch.frame.addBlank')}
          >
            {t('sketch.frame.addBlankButton')}
          </button>
          <button
            className="text-xs px-1.5 py-0.5 rounded border border-[var(--vscode-button-border)] hover:bg-[var(--vscode-button-hoverBackground)]"
            onClick={duplicateFrame}
            title={t('sketch.frame.duplicate')}
            aria-label={t('sketch.frame.duplicateTooltip')}
          >
            ⧉
          </button>
          <button
            className="text-xs px-1.5 py-0.5 rounded border border-[var(--vscode-button-border)] hover:bg-[var(--vscode-button-hoverBackground)] text-red-400"
            onClick={removeCurrentFrame}
            title={t('sketch.frame.delete')}
            aria-label={t('sketch.frame.deleteTooltip')}
            disabled={currentLayer.frames.length <= 1}
          >
            ✕
          </button>
        </div>
      )}

      {/* Sprite sheet export */}
      {currentLayer && currentLayer.frames.length > 1 && (
        <button
          className="w-full text-xs py-0.5 mt-1 rounded border border-[var(--vscode-button-border)] hover:bg-[var(--vscode-button-hoverBackground)]"
          onClick={() => {
            void (async () => {
              try {
                const { exportSpriteSheet } = await import('../utils/spritesheet-export');
                const state = useSketchStore.getState();
                const result = await exportSpriteSheet(currentLayer.frames, {
                  frameWidth: state.canvas.width,
                  frameHeight: state.canvas.height,
                });
                // Download sprite sheet image
                const url = URL.createObjectURL(result.image);
                const a = document.createElement('a');
                a.href = url;
                a.download = `${currentLayer.name}_spritesheet.png`;
                a.click();
                URL.revokeObjectURL(url);
                // Download JSON metadata
                const metaBlob = new Blob([JSON.stringify(result.meta, null, 2)], {
                  type: 'application/json',
                });
                const metaUrl = URL.createObjectURL(metaBlob);
                const b = document.createElement('a');
                b.href = metaUrl;
                b.download = `${currentLayer.name}_spritesheet.json`;
                b.click();
                URL.revokeObjectURL(metaUrl);
              } catch {
                // Export failed
              }
            })();
          }}
          title={t('sketch.frame.exportSpriteSheetTooltip')}
          aria-label={t('sketch.frame.exportSpriteSheet')}
        >
          {t('sketch.frame.exportSpriteSheet')}
        </button>
      )}
    </div>
  );
}
