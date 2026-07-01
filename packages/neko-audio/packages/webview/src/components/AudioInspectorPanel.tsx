import { DEFAULT_AUDIO_PROPERTIES } from '@neko/shared';
import { SliderPropertyRow } from '@neko/ui/creative';
import { useAudioProjectStore } from '../stores/audioProjectStore';
import { useAudioStore } from '../stores/audioStore';
import { resolveAudioSelection, resolveInspectorScope } from '../utils/audioWorkbench';
import { stopTextInputShortcutPropagation } from '../utils/focusEvents';
import { EffectsMiniRack } from './EffectsMiniRack';
import { t } from '../i18n';

export function AudioInspectorPanel() {
  const project = useAudioProjectStore((s) => s.audioProjectData);
  const selectedTarget = useAudioStore((s) => s.selectedWorkbenchTarget);
  const selection = useAudioStore((s) => s.selection);
  const inspectorScope = useAudioStore((s) => s.inspectorScope);
  const updateElement = useAudioProjectStore((s) => s.updateElement);
  const updateTrack = useAudioProjectStore((s) => s.updateTrack);
  const toggleTrackField = useAudioProjectStore((s) => s.toggleTrackField);
  const toggleSolo = useAudioProjectStore((s) => s.toggleSolo);
  const setTrackVolume = useAudioProjectStore((s) => s.setTrackVolume);
  const setTrackPan = useAudioProjectStore((s) => s.setTrackPan);
  const getTrackUIState = useAudioProjectStore((s) => s.getTrackUIState);
  const updateMarker = useAudioProjectStore((s) => s.updateMarker);
  const setMasterVolume = useAudioProjectStore((s) => s.setMasterVolume);

  const resolved = resolveAudioSelection(project, selectedTarget, selection);
  const scope = resolveInspectorScope(inspectorScope, resolved);

  if (resolved.diagnostic) {
    return <PanelNote>{t(resolved.diagnostic)}</PanelNote>;
  }

  if (scope === 'clip' && resolved.track && resolved.element) {
    const audio = { ...DEFAULT_AUDIO_PROPERTIES, ...(resolved.element.audio ?? {}) };
    return (
      <div className="audio-inspector-panel">
        <PanelTitle title={t('audio.inspector.clip')} subtitle={resolved.element.name} />
        <TextRow
          label={t('audio.inspector.name')}
          value={resolved.element.name}
          onCommit={(name) => updateElement(resolved.track!.id, resolved.element!.id, { name })}
        />
        <ReadOnlyRow
          label={t('audio.inspector.start')}
          value={`${resolved.element.startTime.toFixed(2)}s`}
        />
        <ReadOnlyRow
          label={t('audio.inspector.duration')}
          value={`${resolved.element.duration.toFixed(2)}s`}
        />
        <SliderPropertyRow
          density="compact"
          id="audio.inspector.clip.volume"
          label={t('audio.properties.volume')}
          max={200}
          min={0}
          onCommit={(_, value) =>
            updateElement(resolved.track!.id, resolved.element!.id, {
              audio: { ...audio, volume: value / 100 },
            })
          }
          onPreviewChange={(_, value) =>
            updateElement(resolved.track!.id, resolved.element!.id, {
              audio: { ...audio, volume: value / 100 },
            })
          }
          step={1}
          unit="%"
          value={Math.round(audio.volume * 100)}
        />
        <SliderPropertyRow
          density="compact"
          id="audio.inspector.clip.gain"
          label={t('audio.properties.gain')}
          max={20}
          min={-20}
          onCommit={(_, value) =>
            updateElement(resolved.track!.id, resolved.element!.id, {
              audio: { ...audio, gain: value },
            })
          }
          onPreviewChange={(_, value) =>
            updateElement(resolved.track!.id, resolved.element!.id, {
              audio: { ...audio, gain: value },
            })
          }
          step={0.5}
          unit="dB"
          value={audio.gain ?? 0}
        />
      </div>
    );
  }

  if (scope === 'track' && resolved.track) {
    const uiState = getTrackUIState(resolved.track.id);
    return (
      <div className="audio-inspector-panel">
        <PanelTitle title={t('audio.inspector.track')} subtitle={resolved.track.name} />
        <TextRow
          label={t('audio.inspector.name')}
          value={resolved.track.name}
          onCommit={(name) => updateTrack(resolved.track!.id, { name })}
        />
        <div className="audio-inspector-toggle-row">
          <button onClick={() => toggleTrackField(resolved.track!.id, 'muted')}>
            {resolved.track.muted ? t('audio.track.unmute') : t('audio.track.mute')}
          </button>
          <button onClick={() => toggleSolo(resolved.track!.id)}>{t('audio.track.solo')}</button>
        </div>
        <SliderPropertyRow
          density="compact"
          id="audio.inspector.track.volume"
          label={t('audio.properties.volume')}
          max={200}
          min={0}
          onCommit={(_, value) => setTrackVolume(resolved.track!.id, value / 100)}
          onPreviewChange={(_, value) => setTrackVolume(resolved.track!.id, value / 100)}
          step={1}
          unit="%"
          value={Math.round(uiState.volume * 100)}
        />
        <SliderPropertyRow
          density="compact"
          id="audio.inspector.track.pan"
          label={t('audio.properties.pan')}
          max={1}
          min={-1}
          onCommit={(_, value) => setTrackPan(resolved.track!.id, value)}
          onPreviewChange={(_, value) => setTrackPan(resolved.track!.id, value)}
          step={0.01}
          unit={formatPan(uiState.pan)}
          value={uiState.pan}
        />
        <EffectsMiniRack target={{ kind: 'track', trackId: resolved.track.id }} />
      </div>
    );
  }

  if (scope === 'marker' && resolved.marker) {
    return (
      <div className="audio-inspector-panel">
        <PanelTitle title={t('audio.inspector.marker')} subtitle={resolved.marker.label} />
        <TextRow
          label={t('audio.inspector.name')}
          value={resolved.marker.label}
          onCommit={(label) => updateMarker(resolved.marker!.id, { label })}
        />
        <ReadOnlyRow
          label={t('audio.inspector.start')}
          value={`${resolved.marker.time.toFixed(2)}s`}
        />
      </div>
    );
  }

  return (
    <div className="audio-inspector-panel">
      <PanelTitle
        title={t('audio.inspector.master')}
        subtitle={project?.name ?? t('audio.mixer.master')}
      />
      <SliderPropertyRow
        density="compact"
        id="audio.inspector.master.volume"
        label={t('audio.properties.volume')}
        max={200}
        min={0}
        onCommit={(_, value) => setMasterVolume(value / 100)}
        onPreviewChange={(_, value) => setMasterVolume(value / 100)}
        step={1}
        unit="%"
        value={Math.round((project?.masterVolume ?? 1) * 100)}
      />
      <EffectsMiniRack target={{ kind: 'master' }} />
    </div>
  );
}

function PanelTitle({ title, subtitle }: { readonly title: string; readonly subtitle?: string }) {
  return (
    <div className="audio-panel-title">
      <span>{title}</span>
      {subtitle && <small>{subtitle}</small>}
    </div>
  );
}

function TextRow({
  label,
  value,
  onCommit,
}: {
  readonly label: string;
  readonly value: string;
  readonly onCommit: (value: string) => void;
}) {
  return (
    <label className="audio-inspector-text-row">
      <span>{label}</span>
      <input
        defaultValue={value}
        onKeyDown={stopTextInputShortcutPropagation}
        onBlur={(event) => {
          if (event.currentTarget.value !== value) {
            onCommit(event.currentTarget.value);
          }
        }}
      />
    </label>
  );
}

function ReadOnlyRow({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="audio-inspector-readonly-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function PanelNote({ children }: { readonly children: React.ReactNode }) {
  return <div className="audio-panel-note">{children}</div>;
}

function formatPan(pan: number): string {
  if (pan === 0) return 'C';
  return pan < 0 ? `L${Math.round(Math.abs(pan) * 100)}` : `R${Math.round(pan * 100)}`;
}
