import type { ImageGenerationRequest, MediaGenerationType } from './types';

export function resolveImageGenerationType(request: ImageGenerationRequest): MediaGenerationType {
  return request.referenceImageUrl ||
    request.referenceImageBase64 ||
    request.referenceImageUri ||
    request.controlImageBase64 ||
    request.controlImageUri
    ? 'image-to-image'
    : 'text-to-image';
}
