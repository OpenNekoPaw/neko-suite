/**
 * EmptyProject - Placeholder UI for .nka projects without an audio source.
 *
 * Renders a centered call-to-action prompting the user to import an audio file.
 * Supports both click-to-import and drag-and-drop from VSCode explorer.
 */

import { useRef } from 'react';
import { postMessage } from '../shared/useVscodeMessage';
import { useDragDrop } from '../hooks/useDragDrop';
import { MacButton } from '@neko/shared/components';
import { t } from '../i18n';

export function EmptyProject() {
  const containerRef = useRef<HTMLDivElement>(null);
  const { isDragOver, handleDragOver, handleDragLeave, handleDrop } = useDragDrop(containerRef);

  const handleImport = () => {
    postMessage({ type: 'project:importAudio' });
  };

  return (
    <div
      ref={containerRef}
      className={`flex flex-col items-center justify-center w-full h-full gap-4 transition-colors duration-200
        ${isDragOver ? 'neko-drag-over-bg' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="text-5xl opacity-40">{isDragOver ? '⬇' : '♫'}</div>
      <div className="text-sm text-[var(--editor-fg)] opacity-60">
        {isDragOver ? t('audio.import.drop') : t('audio.import.empty')}
      </div>
      <MacButton variant="secondary" size="sm" onClick={handleImport}>
        {t('audio.import.button')}
      </MacButton>
    </div>
  );
}
