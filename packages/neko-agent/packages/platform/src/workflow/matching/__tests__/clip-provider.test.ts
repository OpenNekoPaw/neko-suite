import { describe, expect, it } from 'vitest';
import {
  ClipUnavailableError,
  InMemoryClipProvider,
  UnimplementedClipProvider,
  cosineSimilarity,
} from '../clip-provider';

describe('cosineSimilarity', () => {
  it('returns 1 for identical vectors', () => {
    const v = new Float32Array([0.1, 0.2, 0.3, 0.4]);
    expect(cosineSimilarity(v, v)).toBeCloseTo(1, 5);
  });

  it('returns −1 for opposite vectors', () => {
    const a = new Float32Array([1, 0, 0]);
    const b = new Float32Array([-1, 0, 0]);
    expect(cosineSimilarity(a, b)).toBeCloseTo(-1, 5);
  });

  it('returns 0 for orthogonal vectors', () => {
    const a = new Float32Array([1, 0]);
    const b = new Float32Array([0, 1]);
    expect(cosineSimilarity(a, b)).toBeCloseTo(0, 5);
  });

  it('returns 0 when one vector is zero (avoids NaN)', () => {
    const a = new Float32Array([0, 0, 0]);
    const b = new Float32Array([1, 2, 3]);
    expect(cosineSimilarity(a, b)).toBe(0);
  });

  it('throws on length mismatch', () => {
    const a = new Float32Array([1, 2]);
    const b = new Float32Array([1, 2, 3]);
    expect(() => cosineSimilarity(a, b)).toThrow(/length mismatch/);
  });
});

describe('UnimplementedClipProvider', () => {
  it('throws ClipUnavailableError on encodeImage', async () => {
    const p = new UnimplementedClipProvider();
    await expect(p.encodeImage()).rejects.toBeInstanceOf(ClipUnavailableError);
  });

  it('throws ClipUnavailableError on encodeText', async () => {
    const p = new UnimplementedClipProvider();
    await expect(p.encodeText()).rejects.toBeInstanceOf(ClipUnavailableError);
  });

  it('exposes embeddingDim=512', () => {
    expect(new UnimplementedClipProvider().embeddingDim).toBe(512);
  });
});

describe('InMemoryClipProvider', () => {
  it('returns stored embedding for image paths', async () => {
    const v = new Float32Array([1, 0, 0]);
    const p = new InMemoryClipProvider({ 'image:/a.png': v }, 3);
    expect(await p.encodeImage('/a.png')).toBe(v);
  });

  it('lower-cases text lookups', async () => {
    const v = new Float32Array([0, 1]);
    const p = new InMemoryClipProvider({ 'text:alice': v }, 2);
    expect(await p.encodeText('Alice')).toBe(v);
  });

  it('returns zero vector on miss', async () => {
    const p = new InMemoryClipProvider(undefined, 4);
    const got = await p.encodeImage('/missing.png');
    expect(Array.from(got)).toEqual([0, 0, 0, 0]);
  });
});
