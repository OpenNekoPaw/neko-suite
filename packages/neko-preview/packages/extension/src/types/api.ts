/**
 * NekoPreviewAPI - Public API exported to other extensions
 *
 * Other extensions can access this via:
 *   const ext = vscode.extensions.getExtension('neko.neko-preview');
 *   const api = ext?.exports as NekoPreviewAPI;
 */

export interface MediaInfo {
  duration: number;
  width: number;
  height: number;
  fps: number;
  codec: string;
  format: string;
  bitrate?: number;
  hasAudio: boolean;
  audioCodec?: string;
  audioSampleRate?: number;
  audioChannels?: number;
}

export interface PlaybackResult {
  videoStreamId: string | null;
  audioStreamId: string | null;
}

export interface NekoPreviewAPI {
  /** Whether the native engine is available */
  readonly isAvailable: boolean;

  /** Frame server port (null if not started) */
  readonly port: number | null;

  /** Build WebSocket URL for a stream ID */
  getStreamWebSocketUrl(streamId: string): string | null;

  /** Probe media file metadata */
  probeMedia(filePath: string): Promise<MediaInfo>;

  /** Start H.264 + PCM playback streams */
  startPlayback(
    filePath: string,
    mediaInfo: MediaInfo,
    startTime?: number,
    speed?: number,
  ): Promise<PlaybackResult>;

  /** Stop streams */
  stopStreams(videoStreamId: string | null, audioStreamId: string | null): Promise<void>;

  /** Seek streams to time */
  seekStreams(
    videoStreamId: string | null,
    audioStreamId: string | null,
    time: number,
  ): Promise<void>;

  /** Pause streams */
  pauseStreams(videoStreamId: string | null, audioStreamId: string | null): Promise<void>;

  /** Resume streams */
  resumeStreams(videoStreamId: string | null, audioStreamId: string | null): Promise<void>;

  /** Set playback speed */
  setStreamSpeed(
    videoStreamId: string | null,
    audioStreamId: string | null,
    speed: number,
  ): Promise<void>;

  /** Capture a single frame as base64 JPEG */
  captureFrame(filePath: string, time: number, quality?: number): Promise<string>;
}
