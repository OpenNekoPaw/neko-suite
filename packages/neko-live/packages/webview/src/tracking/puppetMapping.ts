/**
 * Maps ARKit-compatible blend shape names (from VMC) to puppet parameter names.
 *
 * Supports Live2D MOC3 parameter naming conventions.
 * Live2D models use standardized names (ParamAngleX, ParamEyeLOpen, etc.).
 *
 * The mapping is applied when avatarType is 'puppet' to translate VMC tracking
 * data into puppet parameter updates sent to the engine.
 */

/** Standard puppet ↔ ARKit mapping (Live2D MOC3 naming) */
const ARKIT_TO_PUPPET: Record<string, string> = {
  // Eyes — openness
  eyeBlinkLeft: 'ParamEyeLOpen',
  eyeBlinkRight: 'ParamEyeROpen',
  eyeLookUpLeft: 'ParamEyeBallY',
  eyeLookDownLeft: 'ParamEyeBallY',
  eyeLookInLeft: 'ParamEyeBallX',
  eyeLookOutLeft: 'ParamEyeBallX',

  // Eyes — smile (squint)
  eyeSquintLeft: 'ParamEyeLSmile',
  eyeSquintRight: 'ParamEyeRSmile',

  // Eyebrows
  browDownLeft: 'ParamBrowLY',
  browDownRight: 'ParamBrowRY',
  browInnerUp: 'ParamBrowLY',
  browOuterUpLeft: 'ParamBrowLAngle',
  browOuterUpRight: 'ParamBrowRAngle',

  // Mouth
  jawOpen: 'ParamMouthOpenY',
  mouthSmileLeft: 'ParamMouthForm',
  mouthSmileRight: 'ParamMouthForm',
  mouthFunnel: 'ParamMouthOpenY',

  // Cheek
  cheekPuff: 'ParamCheek',

  // Body
  // Body angle is typically driven by head tracking with reduced scale
};

/** Inverted blend shapes (1 - value) for parameters like eye openness */
const INVERTED_PARAMS = new Set(['eyeBlinkLeft', 'eyeBlinkRight']);

/** Parameters that should use the average of left/right */
const AVERAGED_PARAMS: Record<string, [string, string]> = {
  ParamMouthForm: ['mouthSmileLeft', 'mouthSmileRight'],
};

/**
 * Live2D standard parameter name aliases.
 *
 * Maps common alternative names to the canonical Live2D parameter names.
 * Used to auto-detect and map parameters regardless of naming convention
 * in the loaded model.
 */
export const LIVE2D_PARAM_ALIASES: Readonly<Record<string, string>> = {
  // Head angles
  ParamAngleX: 'ParamAngleX',
  ParamAngleY: 'ParamAngleY',
  ParamAngleZ: 'ParamAngleZ',
  // Body angles
  ParamBodyAngleX: 'ParamBodyAngleX',
  ParamBodyAngleY: 'ParamBodyAngleY',
  ParamBodyAngleZ: 'ParamBodyAngleZ',
  // Eyes
  ParamEyeLOpen: 'ParamEyeLOpen',
  ParamEyeROpen: 'ParamEyeROpen',
  ParamEyeBallX: 'ParamEyeBallX',
  ParamEyeBallY: 'ParamEyeBallY',
  ParamEyeLSmile: 'ParamEyeLSmile',
  ParamEyeRSmile: 'ParamEyeRSmile',
  // Eyebrows
  ParamBrowLY: 'ParamBrowLY',
  ParamBrowRY: 'ParamBrowRY',
  ParamBrowLAngle: 'ParamBrowLAngle',
  ParamBrowRAngle: 'ParamBrowRAngle',
  // Mouth
  ParamMouthOpenY: 'ParamMouthOpenY',
  ParamMouthForm: 'ParamMouthForm',
  // Extras
  ParamCheek: 'ParamCheek',
  ParamBreath: 'ParamBreath',
  // Alternative aliases → Live2D canonical
  eye_open_l: 'ParamEyeLOpen',
  eye_open_r: 'ParamEyeROpen',
  mouth_open: 'ParamMouthOpenY',
} as const;

/**
 * Convert ARKit blend shapes to puppet parameter updates.
 * Returns a Record of puppet parameter names → values,
 * filtered to only include parameters the loaded model actually has.
 */
export function mapVmcToPuppetParams(
  arkit: Record<string, number>,
  availableParams: ReadonlySet<string>,
): Record<string, number> {
  const result: Record<string, number> = {};
  const get = (name: string): number => arkit[name] ?? 0;

  // Direct mappings
  for (const [arkitName, puppetName] of Object.entries(ARKIT_TO_PUPPET)) {
    if (!availableParams.has(puppetName)) continue;

    // Skip if already set by averaging
    if (puppetName in result) continue;

    // Check if this is an averaged parameter
    const avgPair = AVERAGED_PARAMS[puppetName];
    if (avgPair) {
      result[puppetName] = (get(avgPair[0]) + get(avgPair[1])) / 2;
      continue;
    }

    let value = get(arkitName);

    // Invert for eye openness (blink=1 means closed, but ParamEyeOpen=1 means open)
    if (INVERTED_PARAMS.has(arkitName)) {
      value = 1 - value;
    }

    result[puppetName] = clamp(value);
  }

  // Head angle from bone transforms (if available)
  // This is handled separately via headRotation in the extension host

  return result;
}

/**
 * Convert head rotation quaternion to puppet angle parameters (degrees).
 * Returns ParamAngleX (yaw), ParamAngleY (pitch), ParamAngleZ (roll).
 */
export function headRotationToPuppetAngles(
  quat: readonly [number, number, number, number],
  availableParams: ReadonlySet<string>,
): Record<string, number> {
  const [x, y, z, w] = quat;
  const result: Record<string, number> = {};

  // Quaternion to Euler (YXZ order, standard for head tracking)
  const sinr = 2 * (w * x + y * z);
  const cosr = 1 - 2 * (x * x + y * y);
  const pitch = Math.atan2(sinr, cosr) * (180 / Math.PI);

  const sinp = 2 * (w * y - z * x);
  const yaw = Math.abs(sinp) >= 1 ? Math.sign(sinp) * 90 : Math.asin(sinp) * (180 / Math.PI);

  const siny = 2 * (w * z + x * y);
  const cosy = 1 - 2 * (y * y + z * z);
  const roll = Math.atan2(siny, cosy) * (180 / Math.PI);

  if (availableParams.has('ParamAngleX')) result['ParamAngleX'] = clamp(yaw, -30, 30);
  if (availableParams.has('ParamAngleY')) result['ParamAngleY'] = clamp(pitch, -30, 30);
  if (availableParams.has('ParamAngleZ')) result['ParamAngleZ'] = clamp(roll, -30, 30);

  // Body angle: reduced scale from head rotation (common in Live2D models)
  if (availableParams.has('ParamBodyAngleX')) result['ParamBodyAngleX'] = clamp(yaw * 0.3, -10, 10);
  if (availableParams.has('ParamBodyAngleY'))
    result['ParamBodyAngleY'] = clamp(pitch * 0.3, -10, 10);
  if (availableParams.has('ParamBodyAngleZ'))
    result['ParamBodyAngleZ'] = clamp(roll * 0.3, -10, 10);

  return result;
}

function clamp(value: number, min = 0, max = 1): number {
  return Math.max(min, Math.min(max, value));
}
