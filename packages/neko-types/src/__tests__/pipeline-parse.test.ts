import { describe, it, expect } from 'vitest';
import { parsePipelineSkip, parsePipelineParams } from '../types/skill';

describe('parsePipelineSkip', () => {
  it('should return undefined for undefined input', () => {
    expect(parsePipelineSkip(undefined)).toBeUndefined();
  });

  it('should return undefined for empty string', () => {
    expect(parsePipelineSkip('')).toBeUndefined();
  });

  it('should parse single stage name', () => {
    expect(parsePipelineSkip('generateMusic')).toEqual(['generateMusic']);
  });

  it('should parse comma-separated stage names', () => {
    expect(parsePipelineSkip('generateMusic,addSubtitles')).toEqual([
      'generateMusic',
      'addSubtitles',
    ]);
  });

  it('should trim whitespace', () => {
    expect(parsePipelineSkip(' generateMusic , addSubtitles ')).toEqual([
      'generateMusic',
      'addSubtitles',
    ]);
  });

  it('should filter empty entries', () => {
    expect(parsePipelineSkip('a,,b,')).toEqual(['a', 'b']);
  });
});

describe('parsePipelineParams', () => {
  it('should return undefined for undefined input', () => {
    expect(parsePipelineParams(undefined)).toBeUndefined();
  });

  it('should return undefined for empty string', () => {
    expect(parsePipelineParams('')).toBeUndefined();
  });

  it('should parse single dot-notation param', () => {
    const result = parsePipelineParams('batchGenerate.style=anime');
    expect(result).toEqual({ batchGenerate: { style: 'anime' } });
  });

  it('should parse multiple params for same stage', () => {
    const result = parsePipelineParams('batchGenerate.style=anime,batchGenerate.resolution=1080p');
    expect(result).toEqual({
      batchGenerate: { style: 'anime', resolution: '1080p' },
    });
  });

  it('should parse params across different stages', () => {
    const result = parsePipelineParams('batchGenerate.style=anime,arrangeOnTimeline.gap=2');
    expect(result).toEqual({
      batchGenerate: { style: 'anime' },
      arrangeOnTimeline: { gap: 2 },
    });
  });

  it('should parse numeric values', () => {
    const result = parsePipelineParams('stage.count=5,stage.ratio=0.5');
    expect(result).toEqual({ stage: { count: 5, ratio: 0.5 } });
  });

  it('should parse boolean values', () => {
    const result = parsePipelineParams('stage.enabled=true,stage.debug=false');
    expect(result).toEqual({ stage: { enabled: true, debug: false } });
  });

  it('should ignore entries without dot notation', () => {
    const result = parsePipelineParams('noStage=value,stage.key=value');
    expect(result).toEqual({ stage: { key: 'value' } });
  });

  it('should ignore entries without equals sign', () => {
    const result = parsePipelineParams('stage.key,stage.valid=yes');
    expect(result).toEqual({ stage: { valid: 'yes' } });
  });

  it('should handle values containing equals signs', () => {
    const result = parsePipelineParams('stage.url=https://example.com?a=1');
    expect(result).toEqual({ stage: { url: 'https://example.com?a=1' } });
  });

  it('should trim whitespace in keys and values', () => {
    const result = parsePipelineParams(' stage.key = value ');
    expect(result).toEqual({ stage: { key: 'value' } });
  });
});
