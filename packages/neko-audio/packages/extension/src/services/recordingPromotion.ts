import { randomUUID } from 'node:crypto';
import { stat } from 'node:fs/promises';
import * as vscode from 'vscode';
import { RECORDING_PROMOTION_COMMAND, type RecordingPromotionResult } from '@neko/shared';

export async function promoteDurableAudioRecording(options: {
  readonly filePath: string;
  readonly workspaceRoot?: string;
}): Promise<readonly string[]> {
  const workspaceRoot = options.workspaceRoot;
  if (!workspaceRoot) return ['recording-project-fact-unavailable'];

  const metadata = await stat(options.filePath);
  const result = await vscode.commands.executeCommand<RecordingPromotionResult>(
    RECORDING_PROMOTION_COMMAND,
    {
      sourcePath: options.filePath,
      destinationPath: options.filePath,
      workspaceRoot,
      sourceRecordingId: randomUUID(),
      producer: 'neko-audio',
      mediaType: 'audio',
      recordedAt: metadata.mtimeMs,
      copyMode: 'already-durable',
    },
  );
  if (!result) throw new Error('Audio recording promotion did not return a project fact result.');
  return [];
}
