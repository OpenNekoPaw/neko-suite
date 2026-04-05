/**
 * Maps ARKit-compatible blend shape names (sent by VMC/iFacialMocap/VSeeFace)
 * to VRM 1.0 expression preset names.
 *
 * VMC applications typically send the Apple ARKit 52 blend shape names.
 * VRM uses a smaller set of semantic expression presets.
 *
 * Reference:
 * - ARKit: https://developer.apple.com/documentation/arkit/arfaceanchor/blendshapelocation
 * - VRM 1.0: https://vrm.dev/en/vrm1/expression
 */

/** VRM expression presets we can drive from ARKit blend shapes */
export interface VrmExpressionValues {
  happy: number;
  angry: number;
  sad: number;
  relaxed: number;
  surprised: number;
  aa: number;
  ih: number;
  ou: number;
  ee: number;
  oh: number;
  blink: number;
  blinkLeft: number;
  blinkRight: number;
  lookUp: number;
  lookDown: number;
  lookLeft: number;
  lookRight: number;
}

/**
 * Convert ARKit blend shape values to VRM expression preset values.
 * Input: Record of ARKit blend shape names → float [0, 1]
 * Output: VRM expression values clamped to [0, 1]
 */
export function mapVmcToVrmExpressions(arkit: Record<string, number>): VrmExpressionValues {
  const get = (name: string): number => arkit[name] ?? 0;

  // Eye blinks
  const blinkLeft = get('eyeBlinkLeft');
  const blinkRight = get('eyeBlinkRight');

  // Mouth shapes — map ARKit shapes to VRM visemes
  const jawOpen = get('jawOpen');
  const mouthFunnel = get('mouthFunnel');
  const mouthPucker = get('mouthPucker');
  const mouthSmileLeft = get('mouthSmileLeft');
  const mouthSmileRight = get('mouthSmileRight');
  const mouthStretchLeft = get('mouthStretchLeft');
  const mouthStretchRight = get('mouthStretchRight');

  // Emotions — derived from facial muscle combinations
  const browDownLeft = get('browDownLeft');
  const browDownRight = get('browDownRight');
  const browInnerUp = get('browInnerUp');
  const cheekSquintLeft = get('cheekSquintLeft');
  const cheekSquintRight = get('cheekSquintRight');

  // Eye gaze
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
    // Emotions
    happy: clamp(smile * 0.8 + cheekSquint * 0.2),
    angry: clamp(browDown * 0.7 + (1 - smile) * browDown * 0.3),
    sad: clamp(browInnerUp * 0.6 + (1 - smile) * 0.2),
    relaxed: clamp((1 - browDown) * (1 - jawOpen) * smile * 0.5),
    surprised: clamp(browInnerUp * 0.5 + jawOpen * 0.5),

    // Visemes (mouth shapes for lip sync)
    aa: clamp(jawOpen * 0.8 + (mouthStretchLeft + mouthStretchRight) * 0.1),
    ih: clamp(jawOpen * 0.3 + (mouthStretchLeft + mouthStretchRight) * 0.35),
    ou: clamp(mouthFunnel * 0.6 + mouthPucker * 0.4),
    ee: clamp((mouthStretchLeft + mouthStretchRight) * 0.5 * (1 - jawOpen * 0.5)),
    oh: clamp(jawOpen * 0.5 + mouthFunnel * 0.3),

    // Eye blinks
    blink: clamp(Math.min(blinkLeft, blinkRight)),
    blinkLeft,
    blinkRight,

    // Eye gaze
    lookUp: clamp((eyeLookUpLeft + eyeLookUpRight) / 2),
    lookDown: clamp((eyeLookDownLeft + eyeLookDownRight) / 2),
    lookLeft: clamp((eyeLookOutLeft + eyeLookInRight) / 2),
    lookRight: clamp((eyeLookInLeft + eyeLookOutRight) / 2),
  };
}

function clamp(value: number, min = 0, max = 1): number {
  return Math.max(min, Math.min(max, value));
}
