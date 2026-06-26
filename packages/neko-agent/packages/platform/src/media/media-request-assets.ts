import { fileURLToPath } from 'node:url';
import type { ImageGenerationRequest, VideoGenerationRequest } from './types';

export interface MediaRequestAssetMaterializer {
  readAsBase64(uriOrPath: string): Promise<string>;
}

export async function materializeImageRequestFileUris(
  request: ImageGenerationRequest,
  materializer?: MediaRequestAssetMaterializer,
): Promise<ImageGenerationRequest> {
  let next = request;

  if (request.referenceImageUri && !request.referenceImageBase64) {
    next = {
      ...next,
      referenceImageBase64: await readFileAsBase64(request.referenceImageUri, materializer),
    };
  }

  if (request.maskUri && !request.maskBase64) {
    next = {
      ...next,
      maskBase64: await readFileAsBase64(request.maskUri, materializer),
    };
  }

  if (request.controlImageUri && !request.controlImageBase64) {
    next = {
      ...next,
      controlImageBase64: await readFileAsBase64(request.controlImageUri, materializer),
    };
  }

  return next;
}

export async function materializeVideoRequestFileUris(
  request: VideoGenerationRequest,
  materializer?: MediaRequestAssetMaterializer,
): Promise<VideoGenerationRequest> {
  let next = request;

  if (request.referenceImageUri && !request.referenceImageBase64) {
    next = {
      ...next,
      referenceImageBase64: await readFileAsBase64(request.referenceImageUri, materializer),
    };
  }

  return next;
}

async function readFileAsBase64(
  uriOrPath: string,
  materializer: MediaRequestAssetMaterializer | undefined,
): Promise<string> {
  if (!materializer) {
    throw new Error(
      `Media request asset requires host content access materialization: ${uriOrPath}`,
    );
  }
  return materializer.readAsBase64(toFilePath(uriOrPath));
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
