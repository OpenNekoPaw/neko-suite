import { useState } from 'react';
import { useEditorStore } from '../stores/editor-store';
import { ExportPanel } from './Timeline/export';
import { formatTimeFull } from '../utils';
import {
  PlayIcon,
  PauseIcon,
  SkipBackIcon,
  SkipForwardIcon,
  UndoIcon,
  RedoIcon,
  ZoomInIcon,
  ZoomOutIcon,
} from '@neko/ui/icons';

export function Toolbar() {
  const {
    isPlaying,
    togglePlayback,
    currentTime,
    seek,
    snappingEnabled,
    toggleSnapping,
    rippleEditingEnabled,
    toggleRippleEditing,
    frameAlignEnabled,
    toggleFrameAlign,
    zoomLevel,
    setZoomLevel,
    getTotalDuration,
    opUndo,
    opRedo,
    opUndoStack,
    opRedoStack,
  } = useEditorStore();

  const [showExportPanel, setShowExportPanel] = useState(false);

  const totalDuration = getTotalDuration() || 10;

  return (
    <div className="flex items-center justify-between px-4 py-2 border-t border-b border-vscode-panel-border bg-vscode-sidebar-bg">
      {/* Left: Playback controls */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => seek(0)}
          className="p-1.5 hover:bg-vscode-list-hover rounded text-vscode-fg"
          title="Go to start"
        >
          <SkipBackIcon className="w-4 h-4" />
        </button>

        <button
          onClick={() => seek(Math.max(0, currentTime - 5))}
          className="p-1.5 hover:bg-vscode-list-hover rounded text-vscode-fg"
          title="Rewind 5s"
        >
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path d="M18 3l-8 7 8 7V3zM10 3l-8 7 8 7V3z" />
          </svg>
        </button>

        <button
          onClick={togglePlayback}
          className="p-2 bg-vscode-button hover:bg-vscode-button-hover rounded text-vscode-button-fg"
          title={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? <PauseIcon className="w-4 h-4" /> : <PlayIcon className="w-4 h-4" />}
        </button>

        <button
          onClick={() => seek(Math.min(totalDuration, currentTime + 5))}
          className="p-1.5 hover:bg-vscode-list-hover rounded text-vscode-fg"
          title="Forward 5s"
        >
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path d="M2 3l8 7-8 7V3zm10 0l8 7-8 7V3z" />
          </svg>
        </button>

        <button
          onClick={() => seek(totalDuration)}
          className="p-1.5 hover:bg-vscode-list-hover rounded text-vscode-fg"
          title="Go to end"
        >
          <SkipForwardIcon className="w-4 h-4" />
        </button>

        <span className="ml-2 text-sm font-mono text-vscode-fg">
          {formatTimeFull(currentTime)} / {formatTimeFull(totalDuration)}
        </span>
      </div>

      {/* Center: Edit tools */}
      <div className="flex items-center gap-2">
        <button
          onClick={opUndo}
          disabled={opUndoStack.length === 0}
          className="p-1.5 hover:bg-vscode-list-hover rounded disabled:opacity-30 text-vscode-fg"
          title="Undo (Cmd+Z)"
        >
          <UndoIcon className="w-4 h-4" />
        </button>

        <button
          onClick={opRedo}
          disabled={opRedoStack.length === 0}
          className="p-1.5 hover:bg-vscode-list-hover rounded disabled:opacity-30 text-vscode-fg"
          title="Redo (Cmd+Shift+Z)"
        >
          <RedoIcon className="w-4 h-4" />
        </button>

        <div className="w-px h-4 bg-vscode-panel-border mx-1" />

        <button
          onClick={toggleSnapping}
          className={`p-1.5 rounded ${snappingEnabled ? 'bg-vscode-accent text-white' : 'hover:bg-vscode-list-hover text-vscode-fg'}`}
          title={`Snapping ${snappingEnabled ? 'ON' : 'OFF'} (N)`}
        >
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path d="M10 2a1 1 0 011 1v1.323l3.954 1.582 1.599-.8a1 1 0 01.894 1.79l-1.233.617 1.738 5.42a1 1 0 01-.285 1.05l-.054.045a2 2 0 01-2.613 0l-.054-.045a1 1 0 01-.285-1.05l1.738-5.42-3.4 1.7V15a1 1 0 11-2 0V9.212l-3.4-1.7 1.738 5.42a1 1 0 01-.285 1.05l-.054.045a2 2 0 01-2.613 0l-.054-.045a1 1 0 01-.285-1.05l1.738-5.42-1.233-.617a1 1 0 01.894-1.79l1.599.8L9 4.323V3a1 1 0 011-1z" />
          </svg>
        </button>

        <button
          onClick={toggleRippleEditing}
          className={`p-1.5 rounded ${rippleEditingEnabled ? 'bg-vscode-accent text-white' : 'hover:bg-vscode-list-hover text-vscode-fg'}`}
          title={`Ripple Edit ${rippleEditingEnabled ? 'ON' : 'OFF'} (R)`}
        >
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path d="M11 17a1 1 0 001.447.894l4-2A1 1 0 0017 15V9.236a1 1 0 00-1.447-.894l-4 2a1 1 0 00-.553.894V17zM3 15a1 1 0 001.447.894l4-2A1 1 0 009 13V7.236a1 1 0 00-1.447-.894l-4 2A1 1 0 003 9.236V15z" />
          </svg>
        </button>

        <button
          onClick={toggleFrameAlign}
          className={`p-1.5 rounded ${frameAlignEnabled ? 'bg-vscode-accent text-white' : 'hover:bg-vscode-list-hover text-vscode-fg'}`}
          title={`Frame Align ${frameAlignEnabled ? 'ON' : 'OFF'} (F)`}
        >
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M4 2a2 2 0 00-2 2v12a2 2 0 002 2h12a2 2 0 002-2V4a2 2 0 00-2-2H4zm1 2h10v2H5V4zm0 4h2v2H5V8zm4 0h2v2H9V8zm4 0h2v2h-2V8zm-8 4h2v2H5v-2zm4 0h2v2H9v-2zm4 0h2v2h-2v-2z"
              clipRule="evenodd"
            />
          </svg>
        </button>
      </div>

      {/* Right: Zoom controls */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setZoomLevel(zoomLevel / 1.5)}
          className="p-1.5 hover:bg-vscode-list-hover rounded text-vscode-fg"
          title="Zoom out"
        >
          <ZoomOutIcon className="w-4 h-4" />
        </button>

        <span className="text-xs text-vscode-description w-12 text-center">
          {Math.round(zoomLevel * 100)}%
        </span>

        <button
          onClick={() => setZoomLevel(zoomLevel * 1.5)}
          className="p-1.5 hover:bg-vscode-list-hover rounded text-vscode-fg"
          title="Zoom in"
        >
          <ZoomInIcon className="w-4 h-4" />
        </button>

        <div className="w-px h-4 bg-vscode-panel-border mx-1" />

        <button
          onClick={() => setShowExportPanel(true)}
          className="px-3 py-1.5 bg-vscode-button hover:bg-vscode-button-hover rounded text-sm font-medium text-vscode-button-fg"
          title="Export video"
        >
          Export
        </button>
      </div>

      {/* Export Panel Modal */}
      <ExportPanel isOpen={showExportPanel} onClose={() => setShowExportPanel(false)} />
    </div>
  );
}
