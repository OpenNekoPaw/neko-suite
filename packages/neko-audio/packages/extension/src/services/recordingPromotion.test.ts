import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RECORDING_PROMOTION_COMMAND } from '@neko/shared';

const vscodeMocks = vi.hoisted(() => ({
  executeCommand: vi.fn(),
}));

vi.mock('vscode', () => ({
  commands: { executeCommand: vscodeMocks.executeCommand },
}));

import { promoteDurableAudioRecording } from './recordingPromotion';

const temporaryDirectories: string[] = [];

beforeEach(() => {
  vscodeMocks.executeCommand.mockReset();
});

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

describe('Audio recording promotion Host adapter', () => {
  it('registers an already-durable audio file through the shared Assets command', async () => {
    const workDir = await mkdtemp(join(tmpdir(), 'neko-audio-promotion-'));
    temporaryDirectories.push(workDir);
    const filePath = join(workDir, 'media', 'recording.wav');
    await mkdir(join(filePath, '..'), { recursive: true });
    await writeFile(filePath, 'audio bytes', 'utf8');
    vscodeMocks.executeCommand.mockResolvedValue({
      destinationPath: filePath,
      projectFact: {
        entityId: 'entity-audio',
        variantId: 'variant-audio',
        fileId: 'file-audio',
        storedPath: '${WORKSPACE}/media/recording.wav',
      },
      provenance: {
        sourceRecordingId: 'generated-by-adapter',
        producer: 'neko-audio',
        recordedAt: 1,
        sourceAuthority: 'preview-recording',
      },
    });

    await expect(
      promoteDurableAudioRecording({ filePath, workspaceRoot: workDir }),
    ).resolves.toEqual([]);

    expect(vscodeMocks.executeCommand).toHaveBeenCalledWith(
      RECORDING_PROMOTION_COMMAND,
      expect.objectContaining({
        sourcePath: filePath,
        destinationPath: filePath,
        workspaceRoot: workDir,
        producer: 'neko-audio',
        mediaType: 'audio',
        copyMode: 'already-durable',
      }),
    );
  });

  it('reports that project provenance is unavailable without a workspace', async () => {
    await expect(
      promoteDurableAudioRecording({
        filePath: '/tmp/recording.wav',
      }),
    ).resolves.toEqual(['recording-project-fact-unavailable']);
    expect(vscodeMocks.executeCommand).not.toHaveBeenCalled();
  });
});
