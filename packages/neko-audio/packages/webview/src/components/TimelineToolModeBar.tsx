import { useAudioStore } from '../stores/audioStore';
import { AUDIO_TIMELINE_TOOL_MODES, type AudioTimelineToolMode } from '../utils/audioWorkbench';
import { t } from '../i18n';

const TOOL_ICONS: Record<AudioTimelineToolMode, string> = {
  select: 'P',
  split: 'S',
  trim: 'T',
  fade: 'F',
  gain: 'G',
  marker: 'M',
  automation: 'A',
};

export function TimelineToolModeBar() {
  const activeTimelineTool = useAudioStore((s) => s.activeTimelineTool);
  const setActiveTimelineTool = useAudioStore((s) => s.setActiveTimelineTool);

  return (
    <div className="audio-tool-mode-bar" role="toolbar" aria-label={t('audio.toolMode.label')}>
      {AUDIO_TIMELINE_TOOL_MODES.map((mode) => (
        <button
          key={mode}
          type="button"
          aria-pressed={activeTimelineTool === mode}
          className={activeTimelineTool === mode ? 'active' : undefined}
          title={t(`audio.toolMode.${mode}`)}
          onClick={() => setActiveTimelineTool(mode)}
        >
          <span aria-hidden="true">{TOOL_ICONS[mode]}</span>
        </button>
      ))}
    </div>
  );
}
