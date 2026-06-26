import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  materializeImageRequestFileUris,
  materializeVideoRequestFileUris,
} from '../media-request-assets';

describe('media request asset materialization', () => {
  it('materializes reference image and mask file URIs through the host adapter', async () => {
    const materializer = createMaterializer({
      '/tmp/reference.png': 'reference',
      '/tmp/mask.png': 'mask',
      '/tmp/control.png': 'control',
    });

    const request = await materializeImageRequestFileUris(
      {
        prompt: 'edit image',
        referenceImageUri: pathToFileURL('/tmp/reference.png').toString(),
        maskUri: pathToFileURL('/tmp/mask.png').toString(),
        controlImageUri: pathToFileURL('/tmp/control.png').toString(),
      },
      materializer,
    );

    expect(request.referenceImageBase64).toBe(Buffer.from('reference').toString('base64'));
    expect(request.maskBase64).toBe(Buffer.from('mask').toString('base64'));
    expect(request.controlImageBase64).toBe(Buffer.from('control').toString('base64'));
    expect(materializer.calls).toEqual(['/tmp/reference.png', '/tmp/mask.png', '/tmp/control.png']);
  });

  it('does not overwrite explicit base64 values', async () => {
    const request = await materializeImageRequestFileUris({
      prompt: 'edit image',
      referenceImageUri: '/tmp/does-not-need-to-exist.png',
      referenceImageBase64: 'already-base64',
    });

    expect(request.referenceImageBase64).toBe('already-base64');
  });

  it('does not overwrite explicit control image base64 values', async () => {
    const request = await materializeImageRequestFileUris({
      prompt: 'control image',
      controlImageUri: '/tmp/does-not-need-to-exist.png',
      controlImageBase64: 'already-control-base64',
    });

    expect(request.controlImageBase64).toBe('already-control-base64');
  });

  it('materializes video reference image file URIs through the host adapter', async () => {
    const materializer = createMaterializer({
      '/tmp/video-reference.png': 'video-reference',
    });

    const request = await materializeVideoRequestFileUris(
      {
        prompt: 'animate image',
        referenceImageUri: pathToFileURL('/tmp/video-reference.png').toString(),
      },
      materializer,
    );

    expect(request.referenceImageBase64).toBe(Buffer.from('video-reference').toString('base64'));
    expect(materializer.calls).toEqual(['/tmp/video-reference.png']);
  });

  it('does not overwrite explicit video reference image base64 values', async () => {
    const request = await materializeVideoRequestFileUris({
      prompt: 'animate image',
      referenceImageUri: '/tmp/does-not-need-to-exist.png',
      referenceImageBase64: 'already-video-base64',
    });

    expect(request.referenceImageBase64).toBe('already-video-base64');
  });

  it('fails visibly when file URI materialization has no host adapter', async () => {
    await expect(
      materializeImageRequestFileUris({
        prompt: 'edit image',
        referenceImageUri: pathToFileURL('/tmp/reference.png').toString(),
      }),
    ).rejects.toThrow('requires host content access materialization');
  });
});

function createMaterializer(files: Record<string, string>) {
  const calls: string[] = [];
  return {
    calls,
    async readAsBase64(filePath: string): Promise<string> {
      calls.push(filePath);
      const value = files[filePath];
      if (value === undefined) throw new Error(`unexpected file: ${filePath}`);
      return Buffer.from(value).toString('base64');
    },
  };
}
