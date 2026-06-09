import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type { ImageGenerationRequest, VideoGenerationRequest } from './types';

export async function materializeImageRequestFileUris(
  request: ImageGenerationRequest,
): Promise<ImageGenerationRequest> {
  let next = request;

  if (request.referenceImageUri && !request.referenceImageBase64) {
    next = {
      ...next,
      referenceImageBase64: await readFileAsBase64(request.referenceImageUri),
    };
  }

  if (request.maskUri && !request.maskBase64) {
    next = {
      ...next,
      maskBase64: await readFileAsBase64(request.maskUri),
    };
  }

  if (request.controlImageUri && !request.controlImageBase64) {
    next = {
      ...next,
      controlImageBase64: await readFileAsBase64(request.controlImageUri),
    };
  }

  return next;
}

export async function materializeVideoRequestFileUris(
  request: VideoGenerationRequest,
): Promise<VideoGenerationRequest> {
  let next = request;

  if (request.referenceImageUri && !request.referenceImageBase64) {
    next = {
      ...next,
      referenceImageBase64: await readFileAsBase64(request.referenceImageUri),
    };
  }

  return next;
}

async function readFileAsBase64(uriOrPath: string): Promise<string> {
  return (await readFile(toFilePath(uriOrPath))).toString('base64');
}

function toFilePath(uriOrPath: string): string {
  if (uriOrPath.startsWith('file:')) {
    return fileURLToPath(uriOrPath);
  }
  if (uriOrPath.startsWith('/')) {
    return uriOrPath;
  }
  throw new Error(`Only local file URIs are supported for media request assets: ${uriOrPath}`);
}
