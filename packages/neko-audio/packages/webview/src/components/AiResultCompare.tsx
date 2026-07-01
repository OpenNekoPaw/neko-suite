import type { AudioAiOperationItem } from '../utils/audioWorkbench';
import { AudioButton } from './shared/AudioUiPrimitives';
import { t } from '../i18n';

interface AiResultCompareProps {
  readonly operation: AudioAiOperationItem | null;
  readonly onApply?: (operationId: string) => void;
  readonly onDismiss?: (operationId: string) => void;
}

export function AiResultCompare({ operation, onApply, onDismiss }: AiResultCompareProps) {
  if (!operation) {
    return <div className="audio-panel-note">{t('audio.aiReview.none')}</div>;
  }

  const state = operation.reviewState;
  const canApply = state === 'previewable' || state === 'apply-only';

  return (
    <div className={`ai-result-compare ${state}`}>
      <div className="audio-panel-title compact">
        <span>{t('audio.aiReview.title')}</span>
        <small>{t(`audio.aiReview.${state}`)}</small>
      </div>
      {state === 'previewable' ? (
        <div className="ai-result-compare-ab" aria-label={t('audio.aiReview.previewable')}>
          <span>{t('audio.aiReview.original')}</span>
          <span>{t('audio.aiReview.processed')}</span>
        </div>
      ) : (
        <div className="audio-panel-note">{t(`audio.aiReview.description.${state}`)}</div>
      )}
      <div className="ai-result-compare-actions">
        <AudioButton variant="primary" disabled={!canApply} onClick={() => onApply?.(operation.id)}>
          {t('audio.aiReview.apply')}
        </AudioButton>
        <AudioButton variant="ghost" onClick={() => onDismiss?.(operation.id)}>
          {t('audio.aiReview.dismiss')}
        </AudioButton>
      </div>
    </div>
  );
}
