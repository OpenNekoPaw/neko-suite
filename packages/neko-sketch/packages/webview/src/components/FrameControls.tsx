/**
 * FrameControls - frame operation buttons for frame-by-frame animation
 *
 * Provides add/duplicate/delete frame operations in the side panel.
 */
import { useCallback } from 'react';
import { useSketchStore } from '../stores';

export function FrameControls() {
  const frameLayers = useSketchStore((s) => s.frameLayers);
  const selectedLayerId = useSketchStore((s) => s.selectedFrameLayerId);
  const addFrame = useSketchStore((s) => s.addFrame);
  const addBlankFrame = useSketchStore((s) => s.addBlankFrame);
  const duplicateFrame = useSketchStore((s) => s.duplicateFrame);
  const removeCurrentFrame = useSketchStore((s) => s.removeCurrentFrame);
  const addFrameLayer = useSketchStore((s) => s.addFrameLayer);

  const currentLayer = frameLayers.find((l) => l.id === selectedLayerId);

  const handleAddLayer = useCallback(() => {
    const name = `Layer ${frameLayers.length + 1}`;
    addFrameLayer(name);
  }, [frameLayers.length, addFrameLayer]);

  if (frameLayers.length === 0) {
    return (
      <div className="sketch-panel" role="region" aria-label="Frame Animation">
        <h3 className="sketch-panel-title m-0 mb-1">Frames</h3>
        <button
          className="w-full text-xs py-1 rounded border border-[var(--vscode-button-border)] hover:bg-[var(--vscode-button-hoverBackground)]"
          onClick={handleAddLayer}
        >
          + New Frame Layer
        </button>
      </div>
    );
  }

  return (
    <div className="sketch-panel" role="region" aria-label="Frame Animation">
      <h3 className="sketch-panel-title m-0 mb-1">Frames</h3>

      {/* Layer selector */}
      <div className="flex items-center gap-1 mb-1">
        <select
          className="flex-1 text-xs bg-transparent border border-[var(--vscode-input-border)] rounded px-1 py-0.5"
          value={selectedLayerId ?? ''}
          onChange={(e) => useSketchStore.getState().setSelectedFrameLayer(e.target.value || null)}
          aria-label="Frame layer"
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
          title="Add frame layer"
          aria-label="Add frame layer"
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
            title="Add frame (F6)"
            aria-label="Add frame"
          >
            + Frame
          </button>
          <button
            className="flex-1 text-xs py-0.5 rounded border border-[var(--vscode-button-border)] hover:bg-[var(--vscode-button-hoverBackground)]"
            onClick={addBlankFrame}
            title="Add blank frame"
            aria-label="Add blank frame"
          >
            + Blank
          </button>
          <button
            className="text-xs px-1.5 py-0.5 rounded border border-[var(--vscode-button-border)] hover:bg-[var(--vscode-button-hoverBackground)]"
            onClick={duplicateFrame}
            title="Duplicate frame"
            aria-label="Duplicate current frame"
          >
            ⧉
          </button>
          <button
            className="text-xs px-1.5 py-0.5 rounded border border-[var(--vscode-button-border)] hover:bg-[var(--vscode-button-hoverBackground)] text-red-400"
            onClick={removeCurrentFrame}
            title="Delete frame"
            aria-label="Delete current frame"
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
          title="Export as sprite sheet"
          aria-label="Export sprite sheet"
        >
          Export Sprite Sheet
        </button>
      )}
    </div>
  );
}
