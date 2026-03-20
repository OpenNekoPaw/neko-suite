/**
 * SidePanel - Right-side panel container for Effects / Recording / Export.
 *
 * Renders one panel at a time based on activeSidePanel state.
 * Supports horizontal resize via drag handle.
 */

import { useState, useCallback, useRef } from 'react';
import { useAudioStore } from '../stores/audioStore';
import type { SidePanelType } from '../stores/audioStore';
import { EffectsPanel } from './EffectsPanel';
import { RecordingPanel } from './RecordingPanel';
import { ExportPanel } from './ExportPanel';
import { useEffectsChain } from '../hooks/useEffectsChain';
import { MacIconButton } from '../shared/MacIconButton';
import { t } from '../i18n';

const PANEL_TITLES: Record<SidePanelType, string> = {
  effects: 'audio.effects.title',
  recording: 'audio.recording.title',
  export: 'audio.export.title',
};

const MIN_WIDTH = 200;
const MAX_WIDTH = 400;
const DEFAULT_WIDTH = 260;

export function SidePanel() {
  const { activeSidePanel, closeSidePanel } = useAudioStore();
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const rootRef = useRef<HTMLDivElement>(null);
  const effectsChain = useEffectsChain();

  // Horizontal resize handler
  const handleResizeStart = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      const startX = e.clientX;
      const startWidth = width;

      const handleMove = (moveEvent: PointerEvent) => {
        const delta = startX - moveEvent.clientX;
        setWidth(Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, startWidth + delta)));
      };

      const handleUp = () => {
        document.removeEventListener('pointermove', handleMove);
        document.removeEventListener('pointerup', handleUp);
      };

      document.addEventListener('pointermove', handleMove);
      document.addEventListener('pointerup', handleUp);
    },
    [width],
  );

  if (!activeSidePanel) return null;

  return (
    <>
      {/* Resize handle */}
      <div className="neko-resize-handle" onPointerDown={handleResizeStart} />

      {/* Panel */}
      <div
        ref={rootRef}
        className="flex flex-col shrink-0 bg-[var(--activity-bg)] border-l border-[var(--editor-border)] overflow-hidden"
        style={{ width }}
      >
        {/* Header */}
        <div className="flex items-center h-9 px-3 shrink-0 border-b border-[var(--editor-border)]">
          <span className="flex-1 text-xs font-medium text-[var(--editor-fg)] truncate">
            {t(PANEL_TITLES[activeSidePanel])}
          </span>
          <MacIconButton size="sm" onClick={closeSidePanel} title="Close">
            ✕
          </MacIconButton>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {activeSidePanel === 'effects' && <EffectsPanel chain={effectsChain} />}
          {activeSidePanel === 'recording' && <RecordingPanel />}
          {activeSidePanel === 'export' && <ExportPanel />}
        </div>
      </div>
    </>
  );
}
