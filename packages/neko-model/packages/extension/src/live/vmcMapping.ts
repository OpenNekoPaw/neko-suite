import type { TrackingData } from '@neko/shared';

export type VrmExpressionPreset =
  | 'neutral'
  | 'happy'
  | 'angry'
  | 'sad'
  | 'relaxed'
  | 'surprised'
  | 'aa'
  | 'ih'
  | 'ou'
  | 'ee'
  | 'oh'
  | 'blink'
  | 'blinkLeft'
  | 'blinkRight'
  | 'lookUp'
  | 'lookDown'
  | 'lookLeft'
  | 'lookRight';

export type VrmExpressionValues = Partial<Record<VrmExpressionPreset, number>>;

export function mapTrackingToVrmExpressions(data: TrackingData): VrmExpressionValues {
  return mapVmcToVrmExpressions(data.blendShapes);
}

export function mapVmcToVrmExpressions(
  arkit: Readonly<Record<string, number>>,
): VrmExpressionValues {
  const get = (name: string): number => clamp(arkit[name] ?? 0);

  const blinkLeft = get('eyeBlinkLeft');
  const blinkRight = get('eyeBlinkRight');

  const jawOpen = get('jawOpen');
  const mouthFunnel = get('mouthFunnel');
  const mouthPucker = get('mouthPucker');
  const mouthSmileLeft = get('mouthSmileLeft');
  const mouthSmileRight = get('mouthSmileRight');
  const mouthStretchLeft = get('mouthStretchLeft');
  const mouthStretchRight = get('mouthStretchRight');

  const browDownLeft = get('browDownLeft');
  const browDownRight = get('browDownRight');
  const browInnerUp = get('browInnerUp');
  const cheekSquintLeft = get('cheekSquintLeft');
  const cheekSquintRight = get('cheekSquintRight');

  const eyeLookUpLeft = get('eyeLookUpLeft');
  const eyeLookUpRight = get('eyeLookUpRight');
  const eyeLookDownLeft = get('eyeLookDownLeft');
  const eyeLookDownRight = get('eyeLookDownRight');
  const eyeLookInLeft = get('eyeLookInLeft');
  const eyeLookInRight = get('eyeLookInRight');
  const eyeLookOutLeft = get('eyeLookOutLeft');
  const eyeLookOutRight = get('eyeLookOutRight');

  const smile = Math.max(mouthSmileLeft, mouthSmileRight);
  const browDown = (browDownLeft + browDownRight) / 2;
  const cheekSquint = (cheekSquintLeft + cheekSquintRight) / 2;

  return {
    happy: clamp(smile * 0.8 + cheekSquint * 0.2),
    angry: clamp(browDown * 0.7 + (1 - smile) * browDown * 0.3),
    sad: clamp(browInnerUp * 0.6 + (1 - smile) * 0.2),
    relaxed: clamp((1 - browDown) * (1 - jawOpen) * smile * 0.5),
    surprised: clamp(browInnerUp * 0.5 + jawOpen * 0.5),
    aa: clamp(jawOpen * 0.8 + (mouthStretchLeft + mouthStretchRight) * 0.1),
    ih: clamp(jawOpen * 0.3 + (mouthStretchLeft + mouthStretchRight) * 0.35),
    ou: clamp(mouthFunnel * 0.6 + mouthPucker * 0.4),
    ee: clamp((mouthStretchLeft + mouthStretchRight) * 0.5 * (1 - jawOpen * 0.5)),
    oh: clamp(jawOpen * 0.5 + mouthFunnel * 0.3),
    blink: clamp(Math.min(blinkLeft, blinkRight)),
    blinkLeft,
    blinkRight,
    lookUp: clamp((eyeLookUpLeft + eyeLookUpRight) / 2),
    lookDown: clamp((eyeLookDownLeft + eyeLookDownRight) / 2),
    lookLeft: clamp((eyeLookOutLeft + eyeLookInRight) / 2),
    lookRight: clamp((eyeLookInLeft + eyeLookOutRight) / 2),
  };
}

function clamp(value: number, min = 0, max = 1): number {
  return Math.max(min, Math.min(max, value));
}
