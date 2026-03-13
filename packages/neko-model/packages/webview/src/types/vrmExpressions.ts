/**
 * VRM 1.0 Standard Expression Presets
 * Based on VRM specification: https://github.com/vrm-c/vrm-specification
 */

export type VRMExpressionPreset =
  // Basic emotions
  | 'neutral'
  | 'happy'
  | 'angry'
  | 'sad'
  | 'relaxed'
  | 'surprised'
  // Mouth shapes (visemes)
  | 'aa'
  | 'ih'
  | 'ou'
  | 'ee'
  | 'oh'
  // Eye movements
  | 'blink'
  | 'blinkLeft'
  | 'blinkRight'
  | 'lookUp'
  | 'lookDown'
  | 'lookLeft'
  | 'lookRight';

export interface VRMExpressionCategory {
  name: string;
  label: string;
  expressions: VRMExpressionPreset[];
}

export const VRM_EXPRESSION_CATEGORIES: VRMExpressionCategory[] = [
  {
    name: 'emotions',
    label: '情绪',
    expressions: ['neutral', 'happy', 'angry', 'sad', 'relaxed', 'surprised'],
  },
  {
    name: 'mouth',
    label: '口型',
    expressions: ['aa', 'ih', 'ou', 'ee', 'oh'],
  },
  {
    name: 'eyes',
    label: '眼神',
    expressions: [
      'blink',
      'blinkLeft',
      'blinkRight',
      'lookUp',
      'lookDown',
      'lookLeft',
      'lookRight',
    ],
  },
];

export const VRM_EXPRESSION_LABELS: Record<VRMExpressionPreset, string> = {
  // Emotions
  neutral: '中性',
  happy: '开心',
  angry: '生气',
  sad: '悲伤',
  relaxed: '放松',
  surprised: '惊讶',
  // Mouth
  aa: 'あ (aa)',
  ih: 'い (ih)',
  ou: 'う (ou)',
  ee: 'え (ee)',
  oh: 'お (oh)',
  // Eyes
  blink: '眨眼',
  blinkLeft: '左眼眨',
  blinkRight: '右眼眨',
  lookUp: '向上看',
  lookDown: '向下看',
  lookLeft: '向左看',
  lookRight: '向右看',
};
