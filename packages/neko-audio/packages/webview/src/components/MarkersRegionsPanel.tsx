import { useAudioProjectStore } from '../stores/audioProjectStore';
import { useAudioStore } from '../stores/audioStore';
import { AudioButton } from './shared/AudioUiPrimitives';
import { t } from '../i18n';

export function MarkersRegionsPanel() {
  const project = useAudioProjectStore((s) => s.audioProjectData);
  const addMarker = useAudioProjectStore((s) => s.addMarker);
  const removeMarker = useAudioProjectStore((s) => s.removeMarker);
  const currentTime = useAudioStore((s) => s.currentTime);
  const setCurrentTime = useAudioStore((s) => s.setCurrentTime);
  const setSelectedWorkbenchTarget = useAudioStore((s) => s.setSelectedWorkbenchTarget);

  const markers = project?.markers ?? [];

  const createMarker = () => {
    addMarker({
      id: crypto.randomUUID(),
      label: t('audio.markers.newMarker'),
      time: currentTime,
    });
  };

  return (
    <div className="markers-regions-panel">
      <div className="audio-panel-title">
        <span>{t('audio.markers.title')}</span>
        <small>{t('audio.markers.subtitle')}</small>
      </div>
      <AudioButton variant="secondary" onClick={createMarker}>
        {t('audio.markers.add')}
      </AudioButton>
      {markers.length === 0 ? (
        <div className="audio-panel-note">{t('audio.markers.empty')}</div>
      ) : (
        <div className="markers-regions-list">
          {markers.map((marker) => (
            <div key={marker.id} className="markers-regions-row">
              <button
                onClick={() => {
                  setCurrentTime(marker.time);
                  setSelectedWorkbenchTarget({ kind: 'marker', markerId: marker.id });
                }}
              >
                <strong>{marker.label}</strong>
                <span>{marker.time.toFixed(2)}s</span>
              </button>
              <button onClick={() => removeMarker(marker.id)}>{t('audio.common.remove')}</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
