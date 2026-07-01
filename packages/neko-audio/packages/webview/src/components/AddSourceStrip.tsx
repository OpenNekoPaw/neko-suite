import { PlusIcon, UploadIcon } from '@neko/ui/icons';
import { createProjectSourceAddClient } from '@neko/shared';
import { useAudioProjectStore } from '../stores/audioProjectStore';
import { useAudioStore } from '../stores/audioStore';
import { getVsCodeApi } from '../shared/useVscodeMessage';
import { AudioButton } from './shared/AudioUiPrimitives';
import { t } from '../i18n';

const PROJECT_SOURCE_ADD_TIMEOUT_MS = 30000;

export function AddSourceStrip() {
  const project = useAudioProjectStore((s) => s.audioProjectData);
  const addTrack = useAudioProjectStore((s) => s.addTrack);
  const openSidePanel = useAudioStore((s) => s.openSidePanel);
  const setWorkbenchDiagnostic = useAudioStore((s) => s.setWorkbenchDiagnostic);

  const addEmptyTrack = () => {
    addTrack({
      id: crypto.randomUUID(),
      name: t('audio.addSource.newTrackName'),
      type: 'audio',
      elements: [],
      muted: false,
      locked: false,
      hidden: false,
      isMain: false,
    });
  };

  const importViaPicker = async () => {
    try {
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
      await client.addSource({
        kind: 'file-picker',
        formatId: 'nka',
        target: { role: 'audio' },
        destination: { kind: 'project', directory: 'audio', copyMode: 'link' },
        ingestMode: 'link',
        metadata: { audioAdd: true },
      });
      setWorkbenchDiagnostic(null);
    } catch {
      setWorkbenchDiagnostic('audio.addSource.importFailed');
    }
  };

  const requestAiGenerate = () => {
    openSidePanel('ai');
  };
  const isEmptyProject = !project?.tracks.length;

  return (
    <div
      className={isEmptyProject ? 'add-source-strip' : 'add-source-strip compact'}
      aria-label={t('audio.addSource.label')}
    >
      <AudioButton variant="primary" onClick={importViaPicker}>
        <UploadIcon size={13} />
        {t('audio.addSource.import')}
      </AudioButton>
      <AudioButton variant="secondary" onClick={addEmptyTrack}>
        <PlusIcon size={13} />
        {t('audio.addSource.track')}
      </AudioButton>
      {isEmptyProject && (
        <>
          <AudioButton variant="secondary" onClick={() => openSidePanel('recording')}>
            <span aria-hidden="true">R</span>
            {t('audio.addSource.record')}
          </AudioButton>
          <AudioButton variant="ghost" onClick={requestAiGenerate}>
            <span aria-hidden="true">AI</span>
            {t('audio.addSource.aiGenerate')}
          </AudioButton>
        </>
      )}
    </div>
  );
}
