/**
 * EmptyProject - Placeholder UI for .nka projects without an audio source.
 *
 * Renders a centered call-to-action prompting the user to import an audio file.
 * Supports both click-to-import and drag-and-drop from VSCode explorer.
 */

import { useRef } from 'react';
import { createProjectSourceAddClient } from '@neko/shared';
import { getVsCodeApi } from '../shared/useVscodeMessage';
import { useDragDrop } from '../hooks/useDragDrop';
import { AudioButton } from './shared/AudioUiPrimitives';
import { t } from '../i18n';

const PROJECT_SOURCE_ADD_TIMEOUT_MS = 30000;

export function EmptyProject() {
  const containerRef = useRef<HTMLDivElement>(null);
  const { isDragOver, handleDragOver, handleDragLeave, handleDrop } = useDragDrop(containerRef);

  const handleImport = () => {
    const vscode = getVsCodeApi();
    const client = createProjectSourceAddClient({
      postMessage: (message) => vscode.postMessage(message),
      addMessageListener: (listener) => {
        const handleMessage = (event: MessageEvent) => listener(event.data);
        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
      },
      timeoutMs: PROJECT_SOURCE_ADD_TIMEOUT_MS,
    });
    void client.addSource({
      kind: 'file-picker',
      formatId: 'nka',
      target: { role: 'audio' },
      destination: { kind: 'project', directory: 'audio', copyMode: 'link' },
      ingestMode: 'link',
      metadata: { audioAdd: true },
    });
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
      <AudioButton variant="secondary" onClick={handleImport}>
        {t('audio.import.button')}
      </AudioButton>
    </div>
  );
}
