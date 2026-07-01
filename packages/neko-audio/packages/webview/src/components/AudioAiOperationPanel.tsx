import { useState } from 'react';
import { useAudioStore } from '../stores/audioStore';
import { useAudioProjectStore } from '../stores/audioProjectStore';
import { resolveAudioSelection } from '../utils/audioWorkbench';
import {
  AUDIO_WORKBENCH_ACTIONS,
  describeAudioSelectionTarget,
  type AudioWorkbenchActionDefinition,
} from '../utils/audioWorkbenchActions';
import { stopTextInputShortcutPropagation } from '../utils/focusEvents';
import { AiResultCompare } from './AiResultCompare';
import { AudioButton } from './shared/AudioUiPrimitives';
import { t } from '../i18n';

function createAiOperationId(): string {
  return `audio-ai-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function AudioAiOperationPanel() {
  const [prompt, setPrompt] = useState('');
  const project = useAudioProjectStore((s) => s.audioProjectData);
  const selectedTarget = useAudioStore((s) => s.selectedWorkbenchTarget);
  const selection = useAudioStore((s) => s.selection);
  const currentTime = useAudioStore((s) => s.currentTime);
  const aiOperations = useAudioStore((s) => s.aiOperations);
  const activeAiOperationId = useAudioStore((s) => s.activeAiOperationId);
  const addAiOperation = useAudioStore((s) => s.addAiOperation);
  const clearAiOperation = useAudioStore((s) => s.clearAiOperation);
  const updateAiOperation = useAudioStore((s) => s.updateAiOperation);
  const setWorkbenchDiagnostic = useAudioStore((s) => s.setWorkbenchDiagnostic);
  const updateElement = useAudioProjectStore((s) => s.updateElement);
  const splitElementAt = useAudioProjectStore((s) => s.splitElementAt);

  const resolvedSelection = resolveAudioSelection(project, selectedTarget, selection);
  const input = {
    project,
    selection: resolvedSelection,
    currentTime,
    updateElement,
    splitElementAt,
  };
  const quickActions = AUDIO_WORKBENCH_ACTIONS.filter((action) => action.aiAssisted);
  const activeOperation =
    aiOperations.find((operation) => operation.id === activeAiOperationId) ??
    aiOperations[0] ??
    null;

  const runAction = (action: AudioWorkbenchActionDefinition) => {
    const availability = action.evaluate(input);
    if (!availability.enabled) {
      const reasonKey = availability.reasonKey ?? 'audio.workbench.actions.unavailable';
      setWorkbenchDiagnostic(reasonKey);
      addAiOperation({
        id: createAiOperationId(),
        actionId: action.id,
        label: t(action.labelKey),
        target: resolvedSelection.target,
        status: 'failed',
        createdAt: Date.now(),
        affectedTrackIds: [],
        affectedElementIds: [],
        affectedEffectIds: [],
        affectedMarkerIds: [],
        reviewState: 'failed',
        diagnostic: reasonKey,
      });
      return;
    }

    const result = action.run(input);
    addAiOperation({
      id: createAiOperationId(),
      actionId: action.id,
      label: t(action.labelKey),
      target: resolvedSelection.target,
      status: result.ok
        ? result.reviewState === 'unsupported'
          ? 'unsupported'
          : 'completed'
        : 'failed',
      createdAt: Date.now(),
      affectedTrackIds: resolvedSelection.track ? [resolvedSelection.track.id] : [],
      affectedElementIds: resolvedSelection.element ? [resolvedSelection.element.id] : [],
      affectedEffectIds: [],
      affectedMarkerIds: resolvedSelection.marker ? [resolvedSelection.marker.id] : [],
      reviewState: result.ok ? (result.reviewState ?? 'apply-only') : 'failed',
      ...(result.ok ? {} : { diagnostic: result.reasonKey }),
    });
  };

  const submitPrompt = () => {
    const trimmed = prompt.trim();
    if (!trimmed) return;
    addAiOperation({
      id: createAiOperationId(),
      actionId: 'prompt',
      label: trimmed,
      target: resolvedSelection.target,
      status: 'unsupported',
      createdAt: Date.now(),
      affectedTrackIds: [],
      affectedElementIds: [],
      affectedEffectIds: [],
      affectedMarkerIds: [],
      reviewState: 'unsupported',
      diagnostic: 'audio.aiPanel.promptUnsupported',
    });
    setPrompt('');
  };

  return (
    <div className="audio-ai-panel">
      <div className="audio-panel-title">
        <span>{t('audio.aiPanel.title')}</span>
        <small>{describeAudioSelectionTarget(resolvedSelection.target)}</small>
      </div>
      <div className="audio-ai-quick-actions">
        {quickActions.map((action) => {
          const availability = action.evaluate(input);
          const unavailableReason = availability.reasonKey
            ? t(availability.reasonKey)
            : t('audio.workbench.actions.unavailable');

          return (
            <AudioButton
              key={action.id}
              variant="secondary"
              disabled={!availability.enabled}
              title={availability.enabled ? t(action.labelKey) : unavailableReason}
              onClick={() => runAction(action)}
            >
              {t(action.labelKey)}
            </AudioButton>
          );
        })}
      </div>
      <label className="audio-ai-prompt">
        <span>{t('audio.aiPanel.prompt')}</span>
        <textarea
          value={prompt}
          onChange={(event) => setPrompt(event.currentTarget.value)}
          onKeyDown={stopTextInputShortcutPropagation}
          placeholder={t('audio.aiPanel.promptPlaceholder')}
        />
      </label>
      <AudioButton variant="primary" onClick={submitPrompt} disabled={!prompt.trim()}>
        {t('audio.aiPanel.run')}
      </AudioButton>
      <AiResultCompare
        operation={activeOperation}
        onApply={(operationId) =>
          updateAiOperation(operationId, {
            status: 'completed',
            reviewState: 'apply-only',
          })
        }
        onDismiss={clearAiOperation}
      />
      <div className="audio-ai-operation-list">
        {aiOperations.length === 0 ? (
          <div className="audio-panel-note">{t('audio.aiPanel.empty')}</div>
        ) : (
          aiOperations.map((operation) => (
            <div key={operation.id} className="audio-ai-operation-row">
              <strong>{operation.label}</strong>
              <span>{t(`audio.aiOperation.status.${operation.status}`)}</span>
              <small>{t(`audio.aiReview.${operation.reviewState}`)}</small>
              {operation.diagnostic && <em>{t(operation.diagnostic)}</em>}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
