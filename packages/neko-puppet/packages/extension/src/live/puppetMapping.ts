import type { TrackingData } from '@neko/shared';

const ARKIT_TO_PUPPET: Record<string, string> = {
  eyeBlinkLeft: 'ParamEyeLOpen',
  eyeBlinkRight: 'ParamEyeROpen',
  eyeLookUpLeft: 'ParamEyeBallY',
  eyeLookDownLeft: 'ParamEyeBallY',
  eyeLookInLeft: 'ParamEyeBallX',
  eyeLookOutLeft: 'ParamEyeBallX',
  eyeSquintLeft: 'ParamEyeLSmile',
  eyeSquintRight: 'ParamEyeRSmile',
  browDownLeft: 'ParamBrowLY',
  browDownRight: 'ParamBrowRY',
  browInnerUp: 'ParamBrowLY',
  browOuterUpLeft: 'ParamBrowLAngle',
  browOuterUpRight: 'ParamBrowRAngle',
  jawOpen: 'ParamMouthOpenY',
  mouthSmileLeft: 'ParamMouthForm',
  mouthSmileRight: 'ParamMouthForm',
  mouthFunnel: 'ParamMouthOpenY',
  cheekPuff: 'ParamCheek',
};

const INVERTED_PARAMS = new Set(['eyeBlinkLeft', 'eyeBlinkRight']);

const AVERAGED_PARAMS: Record<string, readonly [string, string]> = {
  ParamMouthForm: ['mouthSmileLeft', 'mouthSmileRight'],
};

export function mapTrackingToPuppetParams(
  data: TrackingData,
  availableParams: ReadonlySet<string>,
): Record<string, number> {
  return {
    ...mapVmcToPuppetParams(data.blendShapes, availableParams),
    ...(data.headRotation ? headRotationToPuppetAngles(data.headRotation, availableParams) : {}),
  };
}

export function mapVmcToPuppetParams(
  arkit: Readonly<Record<string, number>>,
  availableParams: ReadonlySet<string>,
): Record<string, number> {
  const result: Record<string, number> = {};
  const get = (name: string): number => arkit[name] ?? 0;

  for (const [arkitName, puppetName] of Object.entries(ARKIT_TO_PUPPET)) {
    if (!availableParams.has(puppetName) || puppetName in result) continue;

    const avgPair = AVERAGED_PARAMS[puppetName];
    if (avgPair) {
      result[puppetName] = clamp((get(avgPair[0]) + get(avgPair[1])) / 2);
      continue;
    }

    const rawValue = get(arkitName);
    const value = INVERTED_PARAMS.has(arkitName) ? 1 - rawValue : rawValue;
    result[puppetName] = clamp(value);
  }

  return result;
}

export function headRotationToPuppetAngles(
  quat: readonly [number, number, number, number],
  availableParams: ReadonlySet<string>,
): Record<string, number> {
  const [x, y, z, w] = quat;
  const result: Record<string, number> = {};

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
  if (availableParams.has('ParamBodyAngleX')) result['ParamBodyAngleX'] = clamp(yaw * 0.3, -10, 10);
  if (availableParams.has('ParamBodyAngleY')) {
    result['ParamBodyAngleY'] = clamp(pitch * 0.3, -10, 10);
  }
  if (availableParams.has('ParamBodyAngleZ'))
    result['ParamBodyAngleZ'] = clamp(roll * 0.3, -10, 10);

  return result;
}

function clamp(value: number, min = 0, max = 1): number {
  return Math.max(min, Math.min(max, value));
}
