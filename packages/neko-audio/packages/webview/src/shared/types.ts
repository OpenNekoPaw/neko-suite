/**
 * Audio Editor message protocol types
 *
 * Defines the postMessage contract between Extension and Webview.
 */

// =============================================================================
// Audio Info (from Extension probe)
//
// NOTE: This type mirrors extension/src/types/api.ts AudioInfo.
// Duplication is intentional — webview cannot import from extension host
// due to VSCode sandbox isolation. Both definitions must stay in sync.
// =============================================================================

export interface AudioInfo {
  duration: number;
  codec: string;
  sampleRate: number;
  channels: number;
  bitrate?: number;
  format: string;
}

export interface WaveformData {
  peaks: number[];
  duration: number;
  sampleRate: number;
}

// =============================================================================
// Audio Project Data (v2, mirrors @neko/shared AudioProjectData)
//
// NOTE: Webview cannot import from extension host due to sandbox isolation.
// This is a lightweight mirror for the message protocol.
// =============================================================================

export interface AudioProjectDataMessage {
  version: string;
  name: string;
  sampleRate: number;
  channels: number;
  tracks: unknown[]; // TimelineTrack[] — typed loosely here, store will cast
  masterEffectsChain: unknown[];
  markers: unknown[];
}

// =============================================================================
// Extension → Webview Messages
// =============================================================================

export interface ProjectInitV2Message {
  type: 'project:init';
  payload: {
    projectData: AudioProjectDataMessage;
    waveforms: Record<string, WaveformData>;
  };
}

export interface EditorInitMessage {
  type: 'editor:init';
  payload: {
    filePath: string;
    fileName: string;
    audioInfo: AudioInfo;
  };
}

export interface EditorWaveformMessage {
  type: 'editor:waveform';
  payload: WaveformData;
}

export interface EditorStreamReadyMessage {
  type: 'editor:streamReady';
  payload: {
    streamId: string;
    streamUrl: string;
  };
}

export interface EditorTrimResultMessage {
  type: 'editor:trimResult';
  payload: {
    success: boolean;
    outputPath?: string;
    error?: string;
  };
}

export interface EditorRecordingSavedMessage {
  type: 'editor:recordingSaved';
  payload: {
    success: boolean;
    path?: string;
    error?: string;
  };
}

export interface EditorLoudnessResultMessage {
  type: 'editor:loudnessResult';
  payload: {
    integratedLoudness: number;
    truePeak: number;
    loudnessRange: number;
  };
}

export interface EditorSilenceResultMessage {
  type: 'editor:silenceResult';
  payload: {
    regions: Array<{ start: number; end: number }>;
  };
}

export interface EditorEffectsResultMessage {
  type: 'editor:effectsResult';
  payload: {
    success: boolean;
    outputPath?: string;
    error?: string;
  };
}

/** Command forwarded from VSCode command palette to webview */
export interface CommandMessage {
  type: 'command';
  command:
    | 'toggleRecording'
    | 'denoise'
    | 'normalize'
    | 'toggleSpectrum'
    | 'trim'
    | 'fadeIn'
    | 'fadeOut'
    | 'toggleExport';
}

/** Engine input devices result */
export interface EditorInputDevicesMessage {
  type: 'editor:inputDevices';
  payload: Array<{
    id: string;
    name: string;
    sampleRates: number[];
    channels: number[];
    isDefault: boolean;
  }>;
}

/** Engine recording started result */
export interface EditorRecordStartResultMessage {
  type: 'editor:recordStartResult';
  payload: { streamId: string; monitorUrl: string };
}

/** Engine recording stopped result */
export interface EditorRecordStopResultMessage {
  type: 'editor:recordStopResult';
  payload: {
    path: string;
    durationSeconds: number;
    format: string;
    sampleRate: number;
    channels: number;
  };
}

export type ExtensionMessage =
  | EditorInitMessage
  | EditorWaveformMessage
  | EditorStreamReadyMessage
  | EditorTrimResultMessage
  | EditorRecordingSavedMessage
  | EditorLoudnessResultMessage
  | EditorSilenceResultMessage
  | EditorEffectsResultMessage
  | EditorInputDevicesMessage
  | EditorRecordStartResultMessage
  | EditorRecordStopResultMessage
  | ProjectInitV2Message
  | ProjectSaveRequestMessage
  | ProjectSaveAsRequestMessage
  | ProjectRevertMessage
  | CommandMessage;

// =============================================================================
// Webview → Extension Messages
// =============================================================================

export interface ReadyMessage {
  type: 'ready';
}

export interface PlayMessage {
  type: 'editor:play';
  startTime?: number;
}

export interface PauseMessage {
  type: 'editor:pause';
}

export interface ResumeMessage {
  type: 'editor:resume';
}

export interface StopMessage {
  type: 'editor:stop';
}

export interface SeekMessage {
  type: 'editor:seek';
  time: number;
}

export interface SpeedMessage {
  type: 'editor:speed';
  speed: number;
}

export interface TrimMessage {
  type: 'editor:trim';
  startTime: number;
  endTime: number;
  outputPath?: string;
}

export interface SaveRecordingMessage {
  type: 'editor:saveRecording';
  data: string;
  format: string;
}

export interface AnalyzeLoudnessMessage {
  type: 'editor:analyzeLoudness';
}

export interface DetectSilenceMessage {
  type: 'editor:detectSilence';
  threshold?: number;
  minDuration?: number;
}

export interface ApplyEffectsMessage {
  type: 'editor:applyEffects';
  effects: Array<{
    type: string;
    params: Record<string, unknown>;
  }>;
}

export interface DenoiseMessage {
  type: 'editor:denoise';
  amount?: number;
}

export interface NormalizeMessage {
  type: 'editor:normalize';
  targetLoudness?: number;
}

export interface ExportAsMessage {
  type: 'editor:exportAs';
  format: string;
  sampleRate?: number;
  bitrate?: number;
  channels?: number;
}

// =============================================================================
// Project Messages (for .nka files)
// =============================================================================

export interface ProjectSaveRequestMessage {
  type: 'save';
}

export interface ProjectSaveAsRequestMessage {
  type: 'saveAs';
  path: string;
}

export interface ProjectRevertMessage {
  type: 'revert';
}

export interface ProjectSaveDataMessage {
  type: 'project:saveData';
  data: {
    effectsChain: Array<{
      id: string;
      type: string;
      name: string;
      enabled: boolean;
      params: Record<string, unknown>;
    }>;
    markers: Array<{ id: string; time: number; label: string; color?: string }>;
  };
  path?: string;
}

export interface ProjectChangedMessage {
  type: 'project:changed';
}

/** Request engine input device list */
export interface ListInputDevicesMessage {
  type: 'editor:listInputDevices';
}

/** Start engine recording */
export interface RecordStartMessage {
  type: 'editor:recordStart';
  deviceId?: string;
  outputPath?: string;
  sampleRate?: number;
  channels?: number;
}

/** Stop engine recording */
export interface RecordStopMessage {
  type: 'editor:recordStop';
  streamId: string;
}

/** Request to import audio source into project */
export interface ProjectImportSourceMessage {
  type: 'project:importSource';
}

/** Request to import audio source via drag-and-drop */
export interface ProjectDropImportSourceMessage {
  type: 'project:dropImportSource';
  uris: string[];
}

export type WebviewMessage =
  | ReadyMessage
  | PlayMessage
  | PauseMessage
  | ResumeMessage
  | StopMessage
  | SeekMessage
  | SpeedMessage
  | TrimMessage
  | SaveRecordingMessage
  | AnalyzeLoudnessMessage
  | DetectSilenceMessage
  | ApplyEffectsMessage
  | DenoiseMessage
  | NormalizeMessage
  | ExportAsMessage
  | ListInputDevicesMessage
  | RecordStartMessage
  | RecordStopMessage
  | ProjectSaveDataMessage
  | ProjectChangedMessage
  | ProjectImportSourceMessage
  | ProjectDropImportSourceMessage;
