import { describe, expect, it } from 'vitest';
import { resolveImageGenerationType } from '../media-generation-kind';

describe('media generation type resolution', () => {
  it('uses text-to-image without reference inputs', () => {
    expect(resolveImageGenerationType({ prompt: 'paint a cat' })).toBe('text-to-image');
  });

  it('uses image-to-image for URL, base64, or local URI reference inputs', () => {
    expect(
      resolveImageGenerationType({
        prompt: 'edit',
        referenceImageUrl: 'https://example.test/image.png',
      }),
    ).toBe('image-to-image');
    expect(
      resolveImageGenerationType({
        prompt: 'edit',
        referenceImageBase64: 'base64',
      }),
    ).toBe('image-to-image');
    expect(
      resolveImageGenerationType({
        prompt: 'edit',
        referenceImageUri: 'file:///tmp/image.png',
      }),
    ).toBe('image-to-image');
  });

  it('uses image-to-image for ControlNet base64 or local URI inputs', () => {
    expect(
      resolveImageGenerationType({
        prompt: 'line art',
        controlImageBase64: 'base64',
      }),
    ).toBe('image-to-image');
    expect(
      resolveImageGenerationType({
        prompt: 'line art',
        controlImageUri: 'file:///tmp/control.png',
      }),
    ).toBe('image-to-image');
  });
});
