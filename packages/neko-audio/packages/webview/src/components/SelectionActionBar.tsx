import { useAudioProjectStore } from '../stores/audioProjectStore';
import { useAudioStore } from '../stores/audioStore';
import { t } from '../i18n';
import { resolveAudioSelection } from '../utils/audioWorkbench';
import {
  AUDIO_WORKBENCH_ACTIONS,
  type AudioWorkbenchActionDefinition,
} from '../utils/audioWorkbenchActions';

function createAiOperationId(): string {
  return `audio-ai-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function SelectionActionBar() {
  const project = useAudioProjectStore((s) => s.audioProjectData);
  const currentTime = useAudioStore((s) => s.currentTime);
  const selection = useAudioStore((s) => s.selection);
  const selectedTarget = useAudioStore((s) => s.selectedWorkbenchTarget);
  const setWorkbenchDiagnostic = useAudioStore((s) => s.setWorkbenchDiagnostic);
  const addAiOperation = useAudioStore((s) => s.addAiOperation);
  const updateElement = useAudioProjectStore((s) => s.updateElement);
  const splitElementAt = useAudioProjectStore((s) => s.splitElementAt);

  const resolvedSelection = resolveAudioSelection(project, selectedTarget, selection);
  const hasContext = Boolean(resolvedSelection.target ?? resolvedSelection.region);

  if (!hasContext) return null;

  const input = {
    project,
    selection: resolvedSelection,
    currentTime,
    updateElement,
    splitElementAt,
    showToast: useAudioStore.getState().showToast,
  };

  const runAction = (action: AudioWorkbenchActionDefinition) => {
    const availability = action.evaluate(input);
    if (!availability.enabled) {
      setWorkbenchDiagnostic(availability.reasonKey ?? 'audio.workbench.actions.unavailable');
      return;
    }

    const result = action.run(input);
    if (!result.ok) {
      setWorkbenchDiagnostic(result.reasonKey);
      return;
    }

    setWorkbenchDiagnostic(null);
    if (action.aiAssisted) {
      addAiOperation({
        id: createAiOperationId(),
        actionId: action.id,
        label: t(action.labelKey),
        target: resolvedSelection.target,
        status: result.reviewState === 'unsupported' ? 'unsupported' : 'completed',
        createdAt: Date.now(),
        affectedTrackIds: resolvedSelection.track ? [resolvedSelection.track.id] : [],
        affectedElementIds: resolvedSelection.element ? [resolvedSelection.element.id] : [],
        affectedEffectIds: [],
        affectedMarkerIds: resolvedSelection.marker ? [resolvedSelection.marker.id] : [],
        reviewState: result.reviewState ?? 'apply-only',
      });
    }
  };

  return (
    <div
      className="selection-action-bar"
      role="toolbar"
      aria-label={t('audio.selectionActions.label')}
    >
      <span className="selection-action-target">{getTargetLabel(resolvedSelection)}</span>
      {AUDIO_WORKBENCH_ACTIONS.map((action) => {
        const availability = action.evaluate(input);
        return (
          <button
            key={action.id}
            type="button"
            disabled={!availability.enabled}
            title={
              availability.enabled
                ? t(action.labelKey)
                : t(availability.reasonKey ?? action.labelKey)
            }
            onClick={() => runAction(action)}
          >
            <span aria-hidden="true">{action.icon}</span>
            <span>{t(action.labelKey)}</span>
          </button>
        );
      })}
    </div>
  );
}

function getTargetLabel(selection: ReturnType<typeof resolveAudioSelection>): string {
  if (selection.element) return selection.element.name || selection.element.id;
  if (selection.track) return selection.track.name || selection.track.id;
  if (selection.marker) return selection.marker.label || selection.marker.id;
  if (selection.region) {
    return `${selection.region.start.toFixed(2)}-${selection.region.end.toFixed(2)}s`;
  }
  return t('audio.mixer.master');
}
