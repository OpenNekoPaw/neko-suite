/**
 * Audio Editor API types
 *
 * Defines the public API exported from the extension for other extensions.
 */

export interface AudioInfo {
  duration: number;
  codec: string;
  sampleRate: number;
  channels: number;
  bitrate?: number;
  format: string;
}

export interface WaveformData {
  /** Downmixed mono peaks kept for compatibility with existing callers. */
  peaks: number[];
  /** Optional per-channel peaks: channelPeaks[channel][sampleIndex]. */
  channelPeaks?: number[][];
  duration: number;
  sampleRate: number;
  channels?: number;
  peaksPerSecond?: number;
}

export interface NekoAudioAPI {
  readonly isAvailable: boolean;
  readonly port: number | null;
  probeAudio(filePath: string): Promise<AudioInfo>;
  getWaveform(filePath: string): Promise<WaveformData>;
}
