import { describe, it, expect } from 'vitest';
import { getAudioEffectParameterMetadata, type RenderableAudioEffectType } from '@neko/shared';
import {
  createAudioEffectInstance,
  getAudioEffectDefinition,
  AUDIO_EFFECT_DEFINITIONS,
  type AudioEffectType,
} from '../audioEffects';

// =============================================================================
// createAudioEffectInstance
// =============================================================================

describe('createAudioEffectInstance', () => {
  const allTypes: AudioEffectType[] = [
    'noise-reduction',
    'compressor',
    'limiter',
    'reverb',
    'delay',
    'chorus',
    'distortion',
    'pitch-shift',
    'time-stretch',
    'high-pass',
    'low-pass',
    'band-pass',
  ];

  it.each(allTypes)('creates instance for type "%s"', (type) => {
    const instance = createAudioEffectInstance(type);
    expect(instance.type).toBe(type);
    expect(instance.enabled).toBe(true);
    expect(instance.id).toMatch(/^audio-effect-/);
    expect(instance.params).toBeDefined();
  });

  it('generates unique IDs across instances', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 20; i++) {
      ids.add(createAudioEffectInstance('compressor').id);
    }
    expect(ids.size).toBe(20);
  });

  it('uses custom name when provided', () => {
    const instance = createAudioEffectInstance('reverb', 'My Reverb');
    expect(instance.name).toBe('My Reverb');
  });

  it('defaults name to type when no custom name', () => {
    const instance = createAudioEffectInstance('delay');
    expect(instance.name).toBe('delay');
  });

  it('clones default params (not shared reference)', () => {
    const a = createAudioEffectInstance('compressor');
    const b = createAudioEffectInstance('compressor');
    expect(a.params).not.toBe(b.params);
    expect(a.params).toEqual(b.params);
  });

  it('throws for unknown effect type', () => {
    expect(() => createAudioEffectInstance('nonexistent' as AudioEffectType)).toThrow(
      'Unknown audio effect type',
    );
  });
});

// =============================================================================
// getAudioEffectDefinition
// =============================================================================

describe('getAudioEffectDefinition', () => {
  it('returns definition for known types', () => {
    const def = getAudioEffectDefinition('compressor');
    expect(def).toBeDefined();
    expect(def!.type).toBe('compressor');
    expect(def!.category).toBe('dynamics');
    expect(def!.parameterDefinitions.length).toBeGreaterThan(0);
  });

  it('returns undefined for unknown types', () => {
    expect(getAudioEffectDefinition('nonexistent' as AudioEffectType)).toBeUndefined();
  });
});

// =============================================================================
// AUDIO_EFFECT_DEFINITIONS registry
// =============================================================================

describe('AUDIO_EFFECT_DEFINITIONS', () => {
  it('contains all 12 effect types', () => {
    expect(Object.keys(AUDIO_EFFECT_DEFINITIONS)).toHaveLength(12);
  });

  it.each(Object.entries(AUDIO_EFFECT_DEFINITIONS))(
    'definition for "%s" has valid structure',
    (key, def) => {
      expect(def.type).toBe(key);
      expect(def.nameKey).toBeTruthy();
      expect(def.descriptionKey).toBeTruthy();
      expect(['dynamics', 'filter', 'spatial', 'modulation', 'utility']).toContain(def.category);
      expect(def.defaultParams).toBeDefined();
      expect(def.parameterDefinitions).toBeInstanceOf(Array);

      // Each param def should have required fields
      for (const paramDef of def.parameterDefinitions) {
        expect(paramDef.key).toBeTruthy();
        expect(paramDef.labelKey).toBeTruthy();
        expect(['slider', 'select', 'boolean']).toContain(paramDef.type);

        if (paramDef.type === 'slider') {
          expect(typeof paramDef.min).toBe('number');
          expect(typeof paramDef.max).toBe('number');
          expect(typeof paramDef.step).toBe('number');
        }

        if (paramDef.type === 'select') {
          expect(paramDef.options).toBeInstanceOf(Array);
          expect(paramDef.options!.length).toBeGreaterThan(0);
        }
      }
    },
  );

  it('all param definition keys exist in default params', () => {
    for (const [, def] of Object.entries(AUDIO_EFFECT_DEFINITIONS)) {
      const paramKeys = Object.keys(def.defaultParams);
      for (const paramDef of def.parameterDefinitions) {
        expect(paramKeys).toContain(paramDef.key);
      }
    }
  });

  it('reuses shared metadata for automatable renderable slider params', () => {
    const checkedParams: Array<[RenderableAudioEffectType, string]> = [
      ['compressor', 'threshold'],
      ['delay', 'delayTime'],
      ['reverb', 'wetDry'],
      ['high-pass', 'frequency'],
    ];

    for (const [effectType, paramKey] of checkedParams) {
      const definition = AUDIO_EFFECT_DEFINITIONS[effectType as AudioEffectType];
      const paramDef = definition.parameterDefinitions.find((param) => param.key === paramKey);
      const metadata = getAudioEffectParameterMetadata(effectType, paramKey);

      expect(paramDef).toBeDefined();
      expect(metadata).toBeDefined();
      expect(paramDef?.automatable).toBe(true);
      expect(paramDef?.min).toBe(metadata?.min);
      expect(paramDef?.max).toBe(metadata?.max);
      expect(paramDef?.step).toBe(metadata?.step);
    }
  });
});
