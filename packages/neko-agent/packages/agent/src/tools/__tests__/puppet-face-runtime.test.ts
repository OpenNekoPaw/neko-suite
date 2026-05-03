import { describe, expect, it, vi } from 'vitest';
import {
  createPuppetFaceRuntime,
  detectPuppetFaceImageMimeType,
  diffPuppetFaceParams,
  parsePuppetFaceJsonResponse,
  validateAndClampPuppetFaceParams,
} from '../puppet-face-runtime';

describe('puppet face runtime', () => {
  it('parses fenced or noisy JSON responses', () => {
    expect(parsePuppetFaceJsonResponse('```json\n{"faceWidth": 0.5}\n```')).toEqual({
      faceWidth: 0.5,
    });
    expect(parsePuppetFaceJsonResponse('first broken { nope }\nthen {"eyeSize": 1} ok')).toEqual({
      eyeSize: 1,
    });
  });

  it('validates known parameters and clamps values to schema bounds', () => {
    expect(
      validateAndClampPuppetFaceParams({
        faceWidth: 5,
        faceLength: '-0.5',
        unknownParam: 1,
        jawWidth: '',
      }),
    ).toEqual({
      faceWidth: 1,
      faceLength: -0.5,
    });
  });

  it('detects image MIME types for prompt payloads', () => {
    expect(detectPuppetFaceImageMimeType('/tmp/ref.jpg')).toBe('image/jpeg');
    expect(detectPuppetFaceImageMimeType('/tmp/ref.webp')).toBe('image/webp');
    expect(detectPuppetFaceImageMimeType('/tmp/ref.unknown')).toBe('image/png');
  });

  it('generates full puppet params from a text description', async () => {
    const generateWithLLM = vi.fn().mockResolvedValue('{"faceWidth": 0.7, "eyeSize": 0.4}');
    const runtime = createPuppetFaceRuntime({ generateWithLLM });

    const result = await runtime.generateParams({ description: 'round face and big eyes' });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.description).toBe('round face and big eyes');
    expect(result.params.faceWidth).toBe(0.7);
    expect(result.params.eyeSize).toBe(0.4);
    expect(result.params.faceLength).toBe(0);
    expect(result.modifiedCount).toBe(2);
    expect(generateWithLLM.mock.calls[0]?.[0]).toContain('2D character face parameter expert');
    expect(generateWithLLM.mock.calls[0]?.[1]).toContain('round face and big eyes');
  });

  it('infers full puppet params from an image payload', async () => {
    const generateWithLLM = vi.fn().mockResolvedValue('{"chinSharpness": -0.2}');
    const runtime = createPuppetFaceRuntime({ generateWithLLM });

    const result = await runtime.inferParamsFromImage({
      imageBase64: 'abc123',
      mimeType: 'image/webp',
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.params.chinSharpness).toBe(-0.2);
    expect(result.modifiedCount).toBe(1);
    expect(generateWithLLM.mock.calls[0]?.[1]).toContain('data:image/webp;base64,abc123');
  });

  it('adjusts current params and reports changed values', async () => {
    const generateWithLLM = vi.fn().mockResolvedValue('{"faceWidth": 0.3, "eyeSize": 0.8}');
    const runtime = createPuppetFaceRuntime({ generateWithLLM });

    const result = await runtime.adjustParams({
      instruction: 'make eyes bigger',
      currentParams: { faceWidth: 0.3, eyeSize: 0.2 },
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.params).toEqual({ faceWidth: 0.3, eyeSize: 0.8 });
    expect(result.changes).toEqual({ eyeSize: { from: 0.2, to: 0.8 } });
    expect(result.changedCount).toBe(1);
  });

  it('returns the empty-current-state error from the runtime', async () => {
    const runtime = createPuppetFaceRuntime({ generateWithLLM: vi.fn() });

    const result = await runtime.adjustParams({
      instruction: 'smile',
      currentParams: {},
    });

    expect(result).toEqual({
      success: false,
      error: 'No puppet editor is active or no face parameters are set. Open a puppet model first.',
    });
  });

  it('computes changed params with tolerance', () => {
    expect(
      diffPuppetFaceParams({ faceWidth: 0.1, eyeSize: 0.2 }, { faceWidth: 0.1005, eyeSize: 0.4 }),
    ).toEqual({
      eyeSize: { from: 0.2, to: 0.4 },
    });
  });
});
