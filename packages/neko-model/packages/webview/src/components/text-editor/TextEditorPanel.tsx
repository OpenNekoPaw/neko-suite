import React, { useState, useCallback } from 'react';
import { postMessage } from '@neko/shared/vscode';

/**
 * Text Editor Panel - Create extruded 3D text meshes.
 *
 * Controls: text input, font size, extrusion depth, create button.
 */
export function TextEditorPanel(): React.JSX.Element {
  const [text, setText] = useState('Hello');
  const [fontSize, setFontSize] = useState(48);
  const [extrusionDepth, setExtrusionDepth] = useState(0.5);

  const handleCreate = useCallback(() => {
    if (!text.trim()) return;
    postMessage({
      type: 'createTextMesh',
      text: text.trim(),
      fontSize,
      extrusionDepth,
    });
  }, [text, fontSize, extrusionDepth]);

  return (
    <div className="w-64 h-full bg-[var(--vscode-sideBar-background)] border-l border-[var(--vscode-panel-border)] flex flex-col">
      {/* Header */}
      <div className="px-3 py-2 border-b border-[var(--vscode-panel-border)]">
        <h2 className="text-sm font-semibold text-[var(--vscode-foreground)]">Text Mesh</h2>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Text Input */}
        <div className="px-3 py-2 border-b border-[var(--vscode-panel-border)]">
          <div className="text-xs font-semibold text-[var(--vscode-foreground)] mb-1">Text</div>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            className="w-full text-xs px-2 py-1.5 rounded resize-none
                       bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)]
                       border border-[var(--vscode-input-border)]
                       focus:border-[var(--vscode-focusBorder)] focus:outline-none"
            placeholder="Enter text..."
          />
        </div>

        {/* Font Size */}
        <div className="px-3 py-2 border-b border-[var(--vscode-panel-border)]">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-semibold text-[var(--vscode-foreground)]">Font Size</span>
            <span className="text-[10px] text-[var(--vscode-descriptionForeground)]">
              {fontSize}
            </span>
          </div>
          <input
            type="range"
            min={1}
            max={200}
            step={1}
            value={fontSize}
            onChange={(e) => setFontSize(parseInt(e.target.value, 10))}
            className="w-full h-1 accent-[var(--vscode-button-background)]"
          />
        </div>

        {/* Extrusion Depth */}
        <div className="px-3 py-2 border-b border-[var(--vscode-panel-border)]">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-semibold text-[var(--vscode-foreground)]">
              Extrusion Depth
            </span>
            <span className="text-[10px] text-[var(--vscode-descriptionForeground)]">
              {extrusionDepth.toFixed(2)}
            </span>
          </div>
          <input
            type="range"
            min={0.01}
            max={10}
            step={0.01}
            value={extrusionDepth}
            onChange={(e) => setExtrusionDepth(parseFloat(e.target.value))}
            className="w-full h-1 accent-[var(--vscode-button-background)]"
          />
        </div>

        {/* Create Button */}
        <div className="px-3 py-3">
          <button
            onClick={handleCreate}
            disabled={!text.trim()}
            className="w-full px-2 py-1.5 text-xs rounded transition-colors
                       bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)]
                       hover:bg-[var(--vscode-button-hoverBackground)]
                       disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Create Text Mesh
          </button>
        </div>
      </div>
    </div>
  );
}
