/**
 * Pressure Mapper
 *
 * Maps raw tablet pressure values to brush-specific curves.
 * Supports configurable pressure response curves.
 */

export type PressureCurveType = 'linear' | 'soft' | 'firm' | 'sCurve';

/** Pressure curve presets */
const PRESSURE_CURVES: Record<PressureCurveType, (p: number) => number> = {
  linear: (p) => p,
  soft: (p) => Math.pow(p, 0.5),
  firm: (p) => Math.pow(p, 2.0),
  sCurve: (p) => {
    // Smooth S-curve: steeper in middle, gentle at extremes
    if (p <= 0.5) {
      return 2 * p * p;
    }
    return 1 - 2 * (1 - p) * (1 - p);
  },
};

/** Map raw pressure to output value using a curve */
export function mapPressure(
  rawPressure: number,
  curve: PressureCurveType = 'linear',
  minOutput = 0.0,
  maxOutput = 1.0,
): number {
  const clamped = Math.max(0, Math.min(1, rawPressure));
  const mapped = PRESSURE_CURVES[curve](clamped);
  return minOutput + mapped * (maxOutput - minOutput);
}

/** Map pressure to brush size */
export function pressureToSize(
  rawPressure: number,
  baseSize: number,
  minSizeFraction = 0.1,
  curve: PressureCurveType = 'linear',
): number {
  const mapped = mapPressure(rawPressure, curve, minSizeFraction, 1.0);
  return baseSize * mapped;
}

/** Map pressure to opacity */
export function pressureToOpacity(
  rawPressure: number,
  baseOpacity: number,
  minOpacityFraction = 0.0,
  curve: PressureCurveType = 'soft',
): number {
  const mapped = mapPressure(rawPressure, curve, minOpacityFraction, 1.0);
  return baseOpacity * mapped;
}
