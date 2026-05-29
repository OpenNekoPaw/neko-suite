/**
 * Audio Editor message protocol types
 *
 * Defines the postMessage contract between Extension and Webview.
 */

import type {
  AudioRequestMessage,
  AudioResponseMessage,
  AudioInfoMessage,
  AudioProjectData,
  ProjectSyncMessage,
  WaveformDataMessage,
  EditOperation,
} from '@neko/shared';

export type AudioInfo = AudioInfoMessage;
export type WaveformData = WaveformDataMessage;

export type AudioProjectDataMessage = AudioProjectData;

// =============================================================================
// Extension → Webview Messages
// =============================================================================

export interface ProjectInitMessage {
  type: 'project:init';
  payload: {
    projectData: AudioProjectDataMessage;
    waveforms: Record<string, WaveformData>;
  };
}

export interface ProjectImportAudioResultMessage {
  type: 'project:importAudioResult';
  payload: {
    success: boolean;
    importedCount?: number;
    error?: string;
  };
}

export type AudioUserCommand =
  | 'toggleRecording'
  | 'denoise'
  | 'normalize'
  | 'toggleSpectrum'
  | 'trim'
  | 'fadeIn'
  | 'fadeOut'
  | 'toggleExport';

/** Command forwarded from VSCode command palette to webview */
export interface CommandMessage {
  type: 'command';
  command: AudioUserCommand;
}

/** Focus-routed keyboard action forwarded by the Extension Host registry. */
export interface KeyboardActionMessage {
  type: 'keyboardAction';
  action: AudioUserCommand;
}

export type AudioCommandMessage = CommandMessage | KeyboardActionMessage;

export function isAudioUserCommand(value: unknown): value is AudioUserCommand {
  return (
    value === 'toggleRecording' ||
    value === 'denoise' ||
    value === 'normalize' ||
    value === 'toggleSpectrum' ||
    value === 'trim' ||
    value === 'fadeIn' ||
    value === 'fadeOut' ||
    value === 'toggleExport'
  );
}

export function readAudioCommandMessage(message: AudioCommandMessage): AudioUserCommand {
  return message.type === 'keyboardAction' ? message.action : message.command;
}

/** Preset list response */
export interface PresetListMessage {
  type: 'presets:list';
  payload: PresetEntry[];
}

export interface PresetEntry {
  id: string;
  name: string;
  description: string;
  category: string;
  effectChain: Array<{
    effectType: string;
    enabled: boolean;
    params: Record<string, unknown>;
  }>;
}

export type ExtensionMessage =
  | AudioResponseMessage
  | ProjectSyncMessage
  | ProjectInitMessage
  | ProjectImportAudioResultMessage
  | ProjectSaveRequestMessage
  | ProjectSaveAsRequestMessage
  | ProjectRevertMessage
  | PresetListMessage
  | { type: 'keyboardFocus'; focused: boolean }
  | AudioCommandMessage;

// =============================================================================
// Webview → Extension Messages
// =============================================================================

export interface ReadyMessage {
  type: 'ready';
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

export interface ProjectImportAudioMessage {
  type: 'project:importAudio';
}

export interface ProjectDropImportAudioMessage {
  type: 'project:dropImportAudio';
  uris: string[];
}

/** Request preset list from extension */
export interface PresetListRequestMessage {
  type: 'presets:listRequest';
}

/** Apply a preset to a track or master */
export interface PresetApplyMessage {
  type: 'presets:apply';
  presetId: string;
  trackId?: string;
}

export interface OperationAppliedMessage {
  type: 'operationApplied';
  operation: EditOperation;
}

export type WebviewMessage =
  | AudioRequestMessage
  | ReadyMessage
  | ProjectImportAudioMessage
  | ProjectDropImportAudioMessage
  | PresetListRequestMessage
  | PresetApplyMessage
  | OperationAppliedMessage;
