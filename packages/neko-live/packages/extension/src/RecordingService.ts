/**
 * RecordingService — manages live session recording.
 *
 * Video: captured in webview via canvas.captureStream() + MediaRecorder (WebM VP9)
 * Audio: recorded via EngineClient.recordStart() (cpal mic → WAV file)
 *
 * The webview handles video recording locally and sends the blob back.
 * The extension host handles audio recording via the engine and file management.
 */

import * as vscode from 'vscode';
import type { ILogger } from '@neko/shared';
import { EngineClient } from '@neko/neko-client/EngineClient';

export interface RecordingOptions {
  includeAudio: boolean;
  audioDeviceId?: string;
  authority?: 'local-preview' | 'compositor';
}

export interface RecordingResult {
  videoPath?: string;
  audioPath?: string;
  authority?: 'local-preview' | 'compositor';
  diagnostics?: readonly string[];
}

export class RecordingService {
  private isRecording = false;
  private audioStreamId: string | undefined;
  private recordingStartTime = 0;
  private authority: RecordingOptions['authority'] = 'local-preview';
  private progressInterval: ReturnType<typeof setInterval> | undefined;
  private readonly logger: ILogger;

  constructor(
    private readonly engineClient: EngineClient | undefined,
    private readonly onProgress: (elapsedMs: number) => void,
    logger: ILogger,
    private readonly storageUri?: vscode.Uri,
  ) {
    this.logger = logger.child('Recording');
  }

  get recording(): boolean {
    return this.isRecording;
  }

  async start(options: RecordingOptions): Promise<string | undefined> {
    if (this.isRecording) return undefined;

    this.isRecording = true;
    this.authority = options.authority ?? 'local-preview';
    this.recordingStartTime = Date.now();

    // Start audio recording via engine if requested
    if (options.includeAudio && this.engineClient) {
      try {
        const outputDir = await this.getRecordingDir();
        const audioPath = vscode.Uri.joinPath(
          vscode.Uri.file(outputDir),
          `live-audio-${Date.now()}.wav`,
        ).fsPath;

        const result = await this.engineClient.recordStart({
          outputPath: audioPath,
          deviceId: options.audioDeviceId,
        });
        this.audioStreamId = result.streamId;
        this.logger.info(`Audio recording started: ${audioPath}`);
      } catch (err) {
        this.logger.error('Failed to start audio recording', err);
        // Continue without audio — video-only recording is still useful
      }
    }

    // Start progress timer
    this.progressInterval = setInterval(() => {
      if (this.isRecording) {
        this.onProgress(Date.now() - this.recordingStartTime);
      }
    }, 200);

    this.logger.info('Recording started');
    return this.audioStreamId;
  }

  async stop(): Promise<RecordingResult> {
    if (!this.isRecording) return {};

    this.isRecording = false;

    if (this.progressInterval) {
      clearInterval(this.progressInterval);
      this.progressInterval = undefined;
    }

    const result: RecordingResult = {
      authority: this.authority,
      diagnostics: this.authority === 'local-preview' ? ['preview-non-authoritative'] : undefined,
    };

    // Stop audio recording
    if (this.audioStreamId && this.engineClient) {
      try {
        const audioResult = await this.engineClient.recordStop(this.audioStreamId);
        result.audioPath = getOutputPath(audioResult);
        this.logger.info(`Audio recording stopped: ${result.audioPath}`);
      } catch (err) {
        this.logger.error('Failed to stop audio recording', err);
      }
      this.audioStreamId = undefined;
    }

    this.logger.info('Recording stopped');
    return result;
  }

  private async getRecordingDir(): Promise<string> {
    // Use workspace folder or home directory
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (workspaceFolders?.[0]) {
      const dir = vscode.Uri.joinPath(workspaceFolders[0].uri, '.neko', 'recordings');
      await vscode.workspace.fs.createDirectory(dir);
      return dir.fsPath;
    }

    const dir = this.storageUri
      ? vscode.Uri.joinPath(this.storageUri, 'recordings')
      : vscode.Uri.joinPath(vscode.Uri.file(process.cwd()), '.neko', 'recordings');
    await vscode.workspace.fs.createDirectory(dir);
    return dir.fsPath;
  }

  dispose(): void {
    if (this.isRecording) {
      this.stop().catch(() => {});
    }
  }
}

function getOutputPath(value: unknown): string | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const outputPath = (value as { outputPath?: unknown }).outputPath;
  return typeof outputPath === 'string' ? outputPath : undefined;
}
