import { describe, expect, it } from 'vitest';
import { KNOWN_PSD_BLEND_MODES, mapPsdBlendMode } from './psd-blend-mode-map';

const EXPECTED_BLEND_MODES = [
  // Raw PSD four-character keys.
  'norm',
  'diss',
  'pass',
  'mul ',
  'scrn',
  'over',
  'sLit',
  'hLit',
  'dark',
  'lite',
  'diff',
  'smud',
  'cDdg',
  'cBrn',
  'lddg',
  'lbrn',
  'pLit',
  'vLit',
  'lLit',
  'pinL',
  'hMix',
  'fsub',
  'fdiv',
  'hue ',
  'sat ',
  'colr',
  'lum ',
  // ag-psd normalized BlendMode strings.
  'pass through',
  'normal',
  'dissolve',
  'darken',
  'multiply',
  'color burn',
  'linear burn',
  'darker color',
  'lighten',
  'screen',
  'color dodge',
  'linear dodge',
  'lighter color',
  'overlay',
  'soft light',
  'hard light',
  'vivid light',
  'linear light',
  'pin light',
  'hard mix',
  'difference',
  'exclusion',
  'subtract',
  'divide',
  'hue',
  'saturation',
  'color',
  'luminosity',
] as const;

describe('PSD blend mode mapping', () => {
  it('covers the expected PSD blend mode keys', () => {
    for (const mode of EXPECTED_BLEND_MODES) {
      expect(KNOWN_PSD_BLEND_MODES).toContain(mode);
    }
  });

  it('maps supported PSD blend modes to sketch blend modes', () => {
    expect(mapPsdBlendMode('norm', ['Layer']).blendMode).toBe('normal');
    expect(mapPsdBlendMode('mul ', ['Layer']).blendMode).toBe('multiply');
    expect(mapPsdBlendMode('cDdg', ['Layer']).blendMode).toBe('color-dodge');
    expect(mapPsdBlendMode('cBrn', ['Layer']).blendMode).toBe('color-burn');
    expect(mapPsdBlendMode('multiply', ['Layer']).blendMode).toBe('multiply');
    expect(mapPsdBlendMode('soft light', ['Layer']).blendMode).toBe('soft-light');
    expect(mapPsdBlendMode('color dodge', ['Layer']).blendMode).toBe('color-dodge');
    expect(mapPsdBlendMode('color burn', ['Layer']).blendMode).toBe('color-burn');
  });

  it('returns an explicit issue for unsupported PSD blend modes', () => {
    const result = mapPsdBlendMode('lddg', ['Layer']);
    expect(result.blendMode).toBe('normal');
    expect(result.issue?.code).toBe('unsupported-blend-mode');
    expect(mapPsdBlendMode('linear dodge', ['Layer']).issue?.code).toBe('unsupported-blend-mode');
  });
});
