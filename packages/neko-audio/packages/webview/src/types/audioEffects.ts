/**
 * Audio Effects Types
 * 音频特效类型定义
 */

import {
  getAudioEffectParameterMetadata,
  type AudioEffectParameterMetadata,
  type AudioEffectType as SharedAudioEffectType,
  type RenderableAudioEffectType,
} from '@neko/shared';

// =============================================================================
// Audio Effect Types
// =============================================================================

/**
 * UI-visible audio effect types backed by the shared audio contract.
 */
export type AudioEffectType = Extract<
  SharedAudioEffectType,
  | 'noise-reduction'
  | 'compressor'
  | 'limiter'
  | 'reverb'
  | 'delay'
  | 'chorus'
  | 'distortion'
  | 'pitch-shift'
  | 'time-stretch'
  | 'high-pass'
  | 'low-pass'
  | 'band-pass'
>;

/**
 * Audio effect category
 */
export type AudioEffectCategory =
  | 'dynamics' // 动态处理
  | 'filter' // 滤波器
  | 'spatial' // 空间效果
  | 'modulation' // 调制
  | 'utility'; // 实用工具

// =============================================================================
// Audio Effect Parameters
// =============================================================================

/**
 * Noise Reduction parameters
 */
export interface NoiseReductionParams {
  /** Noise reduction amount (0-1) */
  amount: number;
  /** Frequency threshold (20-20000 Hz) */
  threshold: number;
  /** Smoothing (0-1) */
  smoothing: number;
}

/**
 * Compressor parameters
 */
export interface CompressorParams {
  /** Threshold in dB (-60 to 0) */
  threshold: number;
  /** Ratio (1 to 20) */
  ratio: number;
  /** Attack time in ms (0-1000) */
  attack: number;
  /** Release time in ms (0-3000) */
  release: number;
  /** Knee (0-40 dB) */
  knee: number;
  /** Makeup gain in dB (0-40) */
  makeupGain: number;
}

/**
 * Limiter parameters
 */
export interface LimiterParams {
  /** Threshold in dB (-20 to 0) */
  threshold: number;
  /** Release time in ms (0-1000) */
  release: number;
  /** Output ceiling in dB (-1 to 0) */
  ceiling: number;
}

/**
 * Reverb parameters
 */
export interface ReverbParams {
  /** Room size (0-1) */
  roomSize: number;
  /** Damping (0-1) */
  damping: number;
  /** Wet/dry mix (0-1) */
  wetDry: number;
  /** Stereo width (0-1) */
  width: number;
  /** Pre-delay in ms (0-500) */
  preDelay: number;
  /** Type */
  type: 'room' | 'hall' | 'plate' | 'spring' | 'chamber';
}

/**
 * Delay parameters
 */
export interface DelayParams {
  /** Delay time in ms (0-2000) */
  delayTime: number;
  /** Feedback (0-1) */
  feedback: number;
  /** Wet/dry mix (0-1) */
  wetDry: number;
  /** Stereo */
  stereo: boolean;
  /** Ping-pong mode */
  pingPong: boolean;
}

/**
 * Chorus parameters
 */
export interface ChorusParams {
  /** Rate in Hz (0.1-10) */
  rate: number;
  /** Depth (0-1) */
  depth: number;
  /** Delay in ms (0-50) */
  delay: number;
  /** Feedback (0-1) */
  feedback: number;
  /** Wet/dry mix (0-1) */
  wetDry: number;
}

/**
 * Distortion parameters
 */
export interface DistortionParams {
  /** Drive amount (0-1) */
  drive: number;
  /** Output gain (0-1) */
  outputGain: number;
  /** Type */
  type: 'soft' | 'hard' | 'tube' | 'fuzz';
}

/**
 * Pitch Shift parameters
 */
export interface PitchShiftParams {
  /** Pitch shift in semitones (-12 to +12) */
  semitones: number;
  /** Preserve formants */
  preserveFormants: boolean;
}

/**
 * Time Stretch parameters
 */
export interface TimeStretchParams {
  /** Time stretch ratio (0.5-2) */
  ratio: number;
  /** Preserve pitch */
  preservePitch: boolean;
}

/**
 * High-Pass Filter parameters
 */
export interface HighPassParams {
  /** Cutoff frequency in Hz (20-20000) */
  frequency: number;
  /** Resonance (0-20) */
  resonance: number;
}

/**
 * Low-Pass Filter parameters
 */
export interface LowPassParams {
  /** Cutoff frequency in Hz (20-20000) */
  frequency: number;
  /** Resonance (0-20) */
  resonance: number;
}

/**
 * Band-Pass Filter parameters
 */
export interface BandPassParams {
  /** Center frequency in Hz (20-20000) */
  frequency: number;
  /** Bandwidth in octaves (0.1-5) */
  bandwidth: number;
  /** Gain in dB (-20 to +20) */
  gain: number;
}

/**
 * Union type of all audio effect parameters
 */
export type AudioEffectParams =
  | NoiseReductionParams
  | CompressorParams
  | LimiterParams
  | ReverbParams
  | DelayParams
  | ChorusParams
  | DistortionParams
  | PitchShiftParams
  | TimeStretchParams
  | HighPassParams
  | LowPassParams
  | BandPassParams;

// =============================================================================
// Audio Effect Instance
// =============================================================================

/**
 * Audio effect instance
 */
export interface AudioEffectInstance {
  /** Unique ID */
  id: string;
  /** Effect type */
  type: AudioEffectType;
  /** Effect name */
  name: string;
  /** Whether enabled */
  enabled: boolean;
  /** Effect parameters */
  params: AudioEffectParams;
}

/**
 * Audio effect definition
 */
export interface AudioEffectDefinition {
  /** Effect type */
  type: AudioEffectType;
  /** Display name key (for i18n) */
  nameKey: string;
  /** Description key (for i18n) */
  descriptionKey: string;
  /** Category */
  category: AudioEffectCategory;
  /** Default parameters */
  defaultParams: AudioEffectParams;
  /** Parameter definitions */
  parameterDefinitions: AudioEffectParameterDefinition[];
}

/**
 * Audio effect parameter definition
 */
export interface AudioEffectParameterDefinition {
  /** Parameter key */
  key: string;
  /** Label key (for i18n) */
  labelKey: string;
  /** Parameter type */
  type: 'slider' | 'select' | 'boolean';
  /** Min value (for slider) */
  min?: number;
  /** Max value (for slider) */
  max?: number;
  /** Step (for slider) */
  step?: number;
  /** Unit (for display) */
  unit?: string;
  /** Options (for select) */
  options?: Array<{ value: string; labelKey: string }>;
  /** Whether numeric parameter automation is supported by shared contracts */
  automatable?: boolean;
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Create audio effect instance
 */
export function createAudioEffectInstance(
  type: AudioEffectType,
  name?: string,
): AudioEffectInstance {
  const definition = AUDIO_EFFECT_DEFINITIONS[type];
  if (!definition) {
    throw new Error(`Unknown audio effect type: ${type}`);
  }

  return {
    id: `audio-effect-${crypto.randomUUID()}`,
    type,
    name: name || type,
    enabled: true,
    params: { ...definition.defaultParams },
  };
}

/**
 * Get audio effect definition
 */
export function getAudioEffectDefinition(type: AudioEffectType): AudioEffectDefinition | undefined {
  return AUDIO_EFFECT_DEFINITIONS[type];
}

function sharedSliderParam(
  effectType: RenderableAudioEffectType,
  key: string,
  defaults: Omit<AudioEffectParameterDefinition, 'key' | 'type'>,
): AudioEffectParameterDefinition {
  const metadata = getAudioEffectParameterMetadata(effectType, key);
  return {
    key,
    labelKey: metadata?.labelKey ?? defaults.labelKey,
    type: 'slider',
    min: metadata?.min ?? defaults.min,
    max: metadata?.max ?? defaults.max,
    step: metadata?.step ?? defaults.step,
    unit: metadata?.unit ?? defaults.unit,
    automatable: metadata?.automatable ?? defaults.automatable,
  };
}

function defaultParam(
  metadata: AudioEffectParameterMetadata | undefined,
  defaultValue: number,
): number {
  return typeof metadata?.defaultValue === 'number' ? metadata.defaultValue : defaultValue;
}

function sharedNumericDefault(
  effectType: RenderableAudioEffectType,
  key: string,
  defaultValue: number,
): number {
  return defaultParam(getAudioEffectParameterMetadata(effectType, key), defaultValue);
}

// =============================================================================
// Built-in Audio Effects
// =============================================================================

export const AUDIO_EFFECT_DEFINITIONS: Record<AudioEffectType, AudioEffectDefinition> = {
  'noise-reduction': {
    type: 'noise-reduction',
    nameKey: 'audioEffects.noiseReduction',
    descriptionKey: 'audioEffects.noiseReduction.description',
    category: 'utility',
    defaultParams: {
      amount: 0.5,
      threshold: 1000,
      smoothing: 0.5,
    },
    parameterDefinitions: [
      {
        key: 'amount',
        labelKey: 'audioEffects.params.amount',
        type: 'slider',
        min: 0,
        max: 1,
        step: 0.01,
      },
      {
        key: 'threshold',
        labelKey: 'audioEffects.params.threshold',
        type: 'slider',
        min: 20,
        max: 20000,
        step: 10,
        unit: 'Hz',
      },
      {
        key: 'smoothing',
        labelKey: 'audioEffects.params.smoothing',
        type: 'slider',
        min: 0,
        max: 1,
        step: 0.01,
      },
    ],
  },

  compressor: {
    type: 'compressor',
    nameKey: 'audioEffects.compressor',
    descriptionKey: 'audioEffects.compressor.description',
    category: 'dynamics',
    defaultParams: {
      threshold: sharedNumericDefault('compressor', 'threshold', -24),
      ratio: sharedNumericDefault('compressor', 'ratio', 4),
      attack: sharedNumericDefault('compressor', 'attack', 10),
      release: sharedNumericDefault('compressor', 'release', 100),
      knee: sharedNumericDefault('compressor', 'knee', 10),
      makeupGain: sharedNumericDefault('compressor', 'makeupGain', 0),
    },
    parameterDefinitions: [
      sharedSliderParam('compressor', 'threshold', {
        labelKey: 'audioEffects.params.threshold',
        min: -60,
        max: 0,
        step: 1,
        unit: 'dB',
      }),
      sharedSliderParam('compressor', 'ratio', {
        labelKey: 'audioEffects.params.ratio',
        min: 1,
        max: 20,
        step: 0.5,
      }),
      sharedSliderParam('compressor', 'attack', {
        labelKey: 'audioEffects.params.attack',
        min: 0,
        max: 1000,
        step: 1,
        unit: 'ms',
      }),
      sharedSliderParam('compressor', 'release', {
        labelKey: 'audioEffects.params.release',
        min: 0,
        max: 3000,
        step: 10,
        unit: 'ms',
      }),
      sharedSliderParam('compressor', 'knee', {
        labelKey: 'audioEffects.params.knee',
        min: 0,
        max: 40,
        step: 1,
        unit: 'dB',
      }),
      sharedSliderParam('compressor', 'makeupGain', {
        labelKey: 'audioEffects.params.makeupGain',
        min: 0,
        max: 40,
        step: 1,
        unit: 'dB',
      }),
    ],
  },

  limiter: {
    type: 'limiter',
    nameKey: 'audioEffects.limiter',
    descriptionKey: 'audioEffects.limiter.description',
    category: 'dynamics',
    defaultParams: {
      threshold: sharedNumericDefault('limiter', 'threshold', 0.95),
      release: sharedNumericDefault('limiter', 'release', 50),
      ceiling: sharedNumericDefault('limiter', 'ceiling', 1),
    },
    parameterDefinitions: [
      sharedSliderParam('limiter', 'threshold', {
        labelKey: 'audioEffects.params.threshold',
        min: 0,
        max: 1,
        step: 0.01,
      }),
      sharedSliderParam('limiter', 'release', {
        labelKey: 'audioEffects.params.release',
        min: 0,
        max: 1000,
        step: 5,
        unit: 'ms',
      }),
      sharedSliderParam('limiter', 'ceiling', {
        labelKey: 'audioEffects.params.ceiling',
        min: 0,
        max: 1,
        step: 0.01,
      }),
    ],
  },

  reverb: {
    type: 'reverb',
    nameKey: 'audioEffects.reverb',
    descriptionKey: 'audioEffects.reverb.description',
    category: 'spatial',
    defaultParams: {
      roomSize: sharedNumericDefault('reverb', 'roomSize', 0.5),
      damping: sharedNumericDefault('reverb', 'damping', 0.5),
      wetDry: sharedNumericDefault('reverb', 'wetDry', 0.3),
      width: sharedNumericDefault('reverb', 'width', 1),
      preDelay: sharedNumericDefault('reverb', 'preDelay', 0),
      type: 'room',
    },
    parameterDefinitions: [
      {
        key: 'type',
        labelKey: 'audioEffects.params.type',
        type: 'select',
        options: [
          { value: 'room', labelKey: 'audioEffects.reverbType.room' },
          { value: 'hall', labelKey: 'audioEffects.reverbType.hall' },
          { value: 'plate', labelKey: 'audioEffects.reverbType.plate' },
          { value: 'spring', labelKey: 'audioEffects.reverbType.spring' },
          { value: 'chamber', labelKey: 'audioEffects.reverbType.chamber' },
        ],
      },
      sharedSliderParam('reverb', 'roomSize', {
        labelKey: 'audioEffects.params.roomSize',
        min: 0,
        max: 1,
        step: 0.01,
      }),
      sharedSliderParam('reverb', 'damping', {
        labelKey: 'audioEffects.params.damping',
        min: 0,
        max: 1,
        step: 0.01,
      }),
      sharedSliderParam('reverb', 'wetDry', {
        labelKey: 'audioEffects.params.wetDry',
        min: 0,
        max: 1,
        step: 0.01,
      }),
      sharedSliderParam('reverb', 'width', {
        labelKey: 'audioEffects.params.width',
        min: 0,
        max: 1,
        step: 0.01,
      }),
      sharedSliderParam('reverb', 'preDelay', {
        labelKey: 'audioEffects.params.preDelay',
        min: 0,
        max: 500,
        step: 5,
        unit: 'ms',
      }),
    ],
  },

  delay: {
    type: 'delay',
    nameKey: 'audioEffects.delay',
    descriptionKey: 'audioEffects.delay.description',
    category: 'spatial',
    defaultParams: {
      delayTime: sharedNumericDefault('delay', 'delayTime', 500),
      feedback: sharedNumericDefault('delay', 'feedback', 0.3),
      wetDry: sharedNumericDefault('delay', 'wetDry', 0.3),
      stereo: true,
      pingPong: false,
    },
    parameterDefinitions: [
      sharedSliderParam('delay', 'delayTime', {
        labelKey: 'audioEffects.params.delayTime',
        min: 0,
        max: 2000,
        step: 10,
        unit: 'ms',
      }),
      sharedSliderParam('delay', 'feedback', {
        labelKey: 'audioEffects.params.feedback',
        min: 0,
        max: 1,
        step: 0.01,
      }),
      sharedSliderParam('delay', 'wetDry', {
        labelKey: 'audioEffects.params.wetDry',
        min: 0,
        max: 1,
        step: 0.01,
      }),
      { key: 'stereo', labelKey: 'audioEffects.params.stereo', type: 'boolean' },
      { key: 'pingPong', labelKey: 'audioEffects.params.pingPong', type: 'boolean' },
    ],
  },

  chorus: {
    type: 'chorus',
    nameKey: 'audioEffects.chorus',
    descriptionKey: 'audioEffects.chorus.description',
    category: 'modulation',
    defaultParams: {
      rate: sharedNumericDefault('chorus', 'rate', 1.5),
      depth: sharedNumericDefault('chorus', 'depth', 0.5),
      delay: sharedNumericDefault('chorus', 'delay', 25),
      feedback: sharedNumericDefault('chorus', 'feedback', 0.2),
      wetDry: sharedNumericDefault('chorus', 'wetDry', 0.5),
    },
    parameterDefinitions: [
      sharedSliderParam('chorus', 'rate', {
        labelKey: 'audioEffects.params.rate',
        min: 0.1,
        max: 10,
        step: 0.1,
        unit: 'Hz',
      }),
      sharedSliderParam('chorus', 'depth', {
        labelKey: 'audioEffects.params.depth',
        min: 0,
        max: 1,
        step: 0.01,
      }),
      sharedSliderParam('chorus', 'delay', {
        labelKey: 'audioEffects.params.delay',
        min: 0,
        max: 50,
        step: 1,
        unit: 'ms',
      }),
      sharedSliderParam('chorus', 'feedback', {
        labelKey: 'audioEffects.params.feedback',
        min: 0,
        max: 1,
        step: 0.01,
      }),
      sharedSliderParam('chorus', 'wetDry', {
        labelKey: 'audioEffects.params.wetDry',
        min: 0,
        max: 1,
        step: 0.01,
      }),
    ],
  },

  distortion: {
    type: 'distortion',
    nameKey: 'audioEffects.distortion',
    descriptionKey: 'audioEffects.distortion.description',
    category: 'modulation',
    defaultParams: {
      drive: sharedNumericDefault('distortion', 'drive', 12),
      outputGain: sharedNumericDefault('distortion', 'outputGain', -6),
      type: 'soft',
    },
    parameterDefinitions: [
      {
        key: 'type',
        labelKey: 'audioEffects.params.type',
        type: 'select',
        options: [
          { value: 'soft', labelKey: 'audioEffects.distortionType.soft' },
          { value: 'hard', labelKey: 'audioEffects.distortionType.hard' },
          { value: 'tube', labelKey: 'audioEffects.distortionType.tube' },
          { value: 'fuzz', labelKey: 'audioEffects.distortionType.fuzz' },
        ],
      },
      sharedSliderParam('distortion', 'drive', {
        labelKey: 'audioEffects.params.drive',
        min: 0,
        max: 60,
        step: 0.1,
        unit: 'dB',
      }),
      sharedSliderParam('distortion', 'outputGain', {
        labelKey: 'audioEffects.params.outputGain',
        min: -60,
        max: 20,
        step: 0.1,
        unit: 'dB',
      }),
    ],
  },

  'pitch-shift': {
    type: 'pitch-shift',
    nameKey: 'audioEffects.pitchShift',
    descriptionKey: 'audioEffects.pitchShift.description',
    category: 'utility',
    defaultParams: {
      semitones: 0,
      preserveFormants: true,
    },
    parameterDefinitions: [
      {
        key: 'semitones',
        labelKey: 'audioEffects.params.semitones',
        type: 'slider',
        min: -12,
        max: 12,
        step: 0.1,
      },
      {
        key: 'preserveFormants',
        labelKey: 'audioEffects.params.preserveFormants',
        type: 'boolean',
      },
    ],
  },

  'time-stretch': {
    type: 'time-stretch',
    nameKey: 'audioEffects.timeStretch',
    descriptionKey: 'audioEffects.timeStretch.description',
    category: 'utility',
    defaultParams: {
      ratio: 1,
      preservePitch: true,
    },
    parameterDefinitions: [
      {
        key: 'ratio',
        labelKey: 'audioEffects.params.ratio',
        type: 'slider',
        min: 0.5,
        max: 2,
        step: 0.01,
      },
      { key: 'preservePitch', labelKey: 'audioEffects.params.preservePitch', type: 'boolean' },
    ],
  },

  'high-pass': {
    type: 'high-pass',
    nameKey: 'audioEffects.highPass',
    descriptionKey: 'audioEffects.highPass.description',
    category: 'filter',
    defaultParams: {
      frequency: sharedNumericDefault('high-pass', 'frequency', 80),
      resonance: sharedNumericDefault('high-pass', 'resonance', 1),
    },
    parameterDefinitions: [
      sharedSliderParam('high-pass', 'frequency', {
        labelKey: 'audioEffects.params.frequency',
        min: 20,
        max: 20000,
        step: 10,
        unit: 'Hz',
      }),
      sharedSliderParam('high-pass', 'resonance', {
        labelKey: 'audioEffects.params.resonance',
        min: 0,
        max: 20,
        step: 0.1,
      }),
    ],
  },

  'low-pass': {
    type: 'low-pass',
    nameKey: 'audioEffects.lowPass',
    descriptionKey: 'audioEffects.lowPass.description',
    category: 'filter',
    defaultParams: {
      frequency: sharedNumericDefault('low-pass', 'frequency', 5000),
      resonance: sharedNumericDefault('low-pass', 'resonance', 1),
    },
    parameterDefinitions: [
      sharedSliderParam('low-pass', 'frequency', {
        labelKey: 'audioEffects.params.frequency',
        min: 20,
        max: 20000,
        step: 10,
        unit: 'Hz',
      }),
      sharedSliderParam('low-pass', 'resonance', {
        labelKey: 'audioEffects.params.resonance',
        min: 0,
        max: 20,
        step: 0.1,
      }),
    ],
  },

  'band-pass': {
    type: 'band-pass',
    nameKey: 'audioEffects.bandPass',
    descriptionKey: 'audioEffects.bandPass.description',
    category: 'filter',
    defaultParams: {
      frequency: sharedNumericDefault('band-pass', 'frequency', 1000),
      bandwidth: sharedNumericDefault('band-pass', 'bandwidth', 1),
      gain: 0,
    },
    parameterDefinitions: [
      sharedSliderParam('band-pass', 'frequency', {
        labelKey: 'audioEffects.params.frequency',
        min: 20,
        max: 20000,
        step: 10,
        unit: 'Hz',
      }),
      sharedSliderParam('band-pass', 'bandwidth', {
        labelKey: 'audioEffects.params.bandwidth',
        min: 0.1,
        max: 5,
        step: 0.1,
        unit: 'oct',
      }),
      {
        key: 'gain',
        labelKey: 'audioEffects.params.gain',
        type: 'slider',
        min: -20,
        max: 20,
        step: 0.5,
        unit: 'dB',
      },
    ],
  },
};
