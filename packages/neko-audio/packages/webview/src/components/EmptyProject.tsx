/**
 * EmptyProject - Placeholder UI for .nka projects without an audio source.
 *
 * Renders a centered call-to-action prompting the user to import an audio file.
 * Supports both click-to-import and drag-and-drop from VSCode explorer.
 */

import { useRef } from 'react';
import { postMessage } from '../shared/useVscodeMessage';
import { useDragDrop } from '../hooks/useDragDrop';
import { t } from '../i18n';

export function EmptyProject() {
  const containerRef = useRef<HTMLDivElement>(null);
  const { isDragOver, handleDragOver, handleDragLeave, handleDrop } = useDragDrop(containerRef);

  const handleImport = () => {
    postMessage({ type: 'project:importSource' });
  };

  return (
    <div
      ref={containerRef}
      className={`audio-editor__empty ${isDragOver ? 'audio-editor__empty--drag-over' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="audio-editor__empty-icon">{isDragOver ? '⬇' : '♫'}</div>
      <div className="audio-editor__empty-text">
        {isDragOver ? t('audio.import.drop') : t('audio.import.empty')}
      </div>
      <button className="btn" onClick={handleImport}>
        {t('audio.import.button')}
      </button>
    </div>
  );
}
