import { mkdtemp, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  materializeImageRequestFileUris,
  materializeVideoRequestFileUris,
} from '../media-request-assets';

describe('media request asset materialization', () => {
  it('reads reference image and mask file URIs into base64 fields', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'neko-media-assets-'));
    const referencePath = join(dir, 'reference.png');
    const maskPath = join(dir, 'mask.png');
    const controlPath = join(dir, 'control.png');
    await writeFile(referencePath, Buffer.from('reference'));
    await writeFile(maskPath, Buffer.from('mask'));
    await writeFile(controlPath, Buffer.from('control'));

    const request = await materializeImageRequestFileUris({
      prompt: 'edit image',
      referenceImageUri: pathToFileURL(referencePath).toString(),
      maskUri: pathToFileURL(maskPath).toString(),
      controlImageUri: pathToFileURL(controlPath).toString(),
    });

    expect(request.referenceImageBase64).toBe(Buffer.from('reference').toString('base64'));
    expect(request.maskBase64).toBe(Buffer.from('mask').toString('base64'));
    expect(request.controlImageBase64).toBe(Buffer.from('control').toString('base64'));
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

  it('reads video reference image file URIs into base64 fields', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'neko-video-assets-'));
    const referencePath = join(dir, 'video-reference.png');
    await writeFile(referencePath, Buffer.from('video-reference'));

    const request = await materializeVideoRequestFileUris({
      prompt: 'animate image',
      referenceImageUri: pathToFileURL(referencePath).toString(),
    });

    expect(request.referenceImageBase64).toBe(Buffer.from('video-reference').toString('base64'));
  });

  it('does not overwrite explicit video reference image base64 values', async () => {
    const request = await materializeVideoRequestFileUris({
      prompt: 'animate image',
      referenceImageUri: '/tmp/does-not-need-to-exist.png',
      referenceImageBase64: 'already-video-base64',
    });

    expect(request.referenceImageBase64).toBe('already-video-base64');
  });
});
