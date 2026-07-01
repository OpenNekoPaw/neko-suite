import type { AudioAnalysisKind } from '@neko/shared';
import { postMessage } from '../shared/useVscodeMessage';
import { useAudioStore } from '../stores/audioStore';

function createAudioAnalysisRequestId(kind: AudioAnalysisKind): string {
  return `audio-analysis-${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function requestAudioAnalysis(kind: AudioAnalysisKind): string {
  const requestId = createAudioAnalysisRequestId(kind);
  if (kind === 'loudness') {
    useAudioStore.getState().setLoudnessAnalysisPending(requestId);
  }
  postMessage({ type: 'audio:analyze', kind, requestId });
  return requestId;
}
