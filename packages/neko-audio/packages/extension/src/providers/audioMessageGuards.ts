import type {
  AudioAnalyzeRequestMessage,
  AudioEffectsRequestMessage,
  AudioExportRequestMessage,
  AudioPlaybackRequestMessage,
  AudioRecordingRequestMessage,
  AudioRequestMessage,
  AudioTrimRequestMessage,
} from '@neko/shared';

export type AudioRequestGuard<T extends AudioRequestMessage> = (value: unknown) => value is T;

export function isAudioPlaybackRequestMessage(
  value: unknown,
): value is AudioPlaybackRequestMessage {
  if (!isRecord(value)) return false;
  if (value.type !== 'audio:playback' || !isOneOf(value.action, AUDIO_PLAYBACK_ACTIONS)) {
    return false;
  }
  if (value.action === 'seek' && !isOptionalFiniteNumber(value.time)) return false;
  if (value.action === 'setSpeed' && !isOptionalFiniteNumber(value.speed)) return false;
  if (value.action === 'setLoop') {
    return (
      (value.loop === undefined || typeof value.loop === 'boolean') &&
      isOptionalFiniteNumber(value.startTime) &&
      isOptionalFiniteNumber(value.time)
    );
  }
  return true;
}

export function isAudioTrimRequestMessage(value: unknown): value is AudioTrimRequestMessage {
  if (!isRecord(value)) return false;
  return (
    value.type === 'audio:trim' &&
    isFiniteNumber(value.startTime) &&
    isFiniteNumber(value.endTime) &&
    isOptionalString(value.outputPath)
  );
}

export function isAudioEffectsRequestMessage(value: unknown): value is AudioEffectsRequestMessage {
  if (!isRecord(value)) return false;
  return (
    value.type === 'audio:effects' &&
    Array.isArray(value.effects) &&
    isOptionalString(value.outputPath)
  );
}

export function isAudioAnalyzeRequestMessage(value: unknown): value is AudioAnalyzeRequestMessage {
  if (!isRecord(value)) return false;
  return value.type === 'audio:analyze' && isOneOf(value.kind, AUDIO_ANALYSIS_KINDS);
}

export function isAudioExportRequestMessage(value: unknown): value is AudioExportRequestMessage {
  if (!isRecord(value)) return false;
  return (
    value.type === 'audio:export' &&
    isOptionalString(value.outputPath) &&
    isOptionalString(value.format) &&
    isOptionalString(value.codec) &&
    isOptionalFiniteNumber(value.sampleRate) &&
    isOptionalFiniteNumber(value.channels) &&
    isOptionalFiniteNumber(value.bitrate)
  );
}

export function isAudioRecordingRequestMessage(
  value: unknown,
): value is AudioRecordingRequestMessage {
  if (!isRecord(value)) return false;
  if (value.type !== 'audio:recording' || !isOneOf(value.action, AUDIO_RECORDING_ACTIONS)) {
    return false;
  }
  if (value.action === 'saveBlob' && typeof value.data !== 'string') return false;
  if (value.action === 'stop' && typeof value.streamId !== 'string') return false;
  return (
    isOptionalString(value.deviceId) &&
    isOptionalString(value.streamId) &&
    isOptionalString(value.outputPath) &&
    isOptionalString(value.format) &&
    isOptionalString(value.data) &&
    isOptionalString(value.mimeType)
  );
}

export async function postInvalidAudioMessage(
  message: Record<string, unknown>,
  webviewPanel: { webview: { postMessage(message: Record<string, unknown>): Thenable<boolean> } },
  documentUri: { toString(): string },
): Promise<void> {
  await webviewPanel.webview.postMessage({
    type: 'audio:error',
    requestId: typeof message.requestId === 'string' ? message.requestId : undefined,
    documentUri: documentUri.toString(),
    success: false,
    error: `Invalid ${typeof message.type === 'string' ? message.type : 'audio'} message`,
  });
}

const AUDIO_PLAYBACK_ACTIONS = ['play', 'pause', 'resume', 'stop', 'seek', 'setSpeed', 'setLoop'];
const AUDIO_ANALYSIS_KINDS = ['loudness', 'silence'];
const AUDIO_RECORDING_ACTIONS = ['listDevices', 'start', 'stop', 'saveBlob'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isOneOf(value: unknown, candidates: readonly string[]): value is string {
  return typeof value === 'string' && candidates.includes(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isOptionalFiniteNumber(value: unknown): value is number | undefined {
  return value === undefined || isFiniteNumber(value);
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === 'string';
}
