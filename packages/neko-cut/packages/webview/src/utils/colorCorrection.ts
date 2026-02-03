/**
 * Color Correction Utilities
 * 颜色校正工具函数
 */

import type {
  ColorCorrection,
  CurvePoint,
  HSLColorRange,
  LUTData,
} from '../types/colorCorrection';

// =============================================================================
// Curve Interpolation
// =============================================================================

/**
 * Interpolate curve value at given x using cubic spline
 * 使用三次样条插值计算曲线在给定x处的值
 */
export function interpolateCurve(points: CurvePoint[], x: number): number {
  if (points.length === 0) return x;
  if (points.length === 1) return points[0].y;

  // Sort points by x
  const sorted = [...points].sort((a, b) => a.x - b.x);

  // Clamp x to curve range
  if (x <= sorted[0].x) return sorted[0].y;
  if (x >= sorted[sorted.length - 1].x) return sorted[sorted.length - 1].y;

  // Find surrounding points
  let i = 0;
  while (i < sorted.length - 1 && sorted[i + 1].x < x) {
    i++;
  }

  const p0 = sorted[Math.max(0, i - 1)];
  const p1 = sorted[i];
  const p2 = sorted[i + 1];
  const p3 = sorted[Math.min(sorted.length - 1, i + 2)];

  // Catmull-Rom spline interpolation
  const t = (x - p1.x) / (p2.x - p1.x);
  const t2 = t * t;
  const t3 = t2 * t;

  const v0 = p0.y;
  const v1 = p1.y;
  const v2 = p2.y;
  const v3 = p3.y;

  const result =
    0.5 *
    (2 * v1 +
      (-v0 + v2) * t +
      (2 * v0 - 5 * v1 + 4 * v2 - v3) * t2 +
      (-v0 + 3 * v1 - 3 * v2 + v3) * t3);

  return Math.max(0, Math.min(1, result));
}

// =============================================================================
// Color Space Conversions
// =============================================================================

/**
 * RGB to HSL conversion
 */
export function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        break;
      case g:
        h = ((b - r) / d + 2) / 6;
        break;
      case b:
        h = ((r - g) / d + 4) / 6;
        break;
    }
  }

  return [h * 360, s * 100, l * 100];
}

/**
 * HSL to RGB conversion
 */
export function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  h /= 360;
  s /= 100;
  l /= 100;

  let r: number, g: number, b: number;

  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };

    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }

  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

/**
 * Get HSL color range for a hue value
 */
export function getHslColorRange(hue: number): HSLColorRange {
  // Normalize hue to 0-360
  hue = ((hue % 360) + 360) % 360;

  if (hue < 15 || hue >= 345) return 'red';
  if (hue < 45) return 'orange';
  if (hue < 75) return 'yellow';
  if (hue < 165) return 'green';
  if (hue < 195) return 'cyan';
  if (hue < 255) return 'blue';
  if (hue < 285) return 'purple';
  return 'magenta';
}

// =============================================================================
// Basic Adjustments
// =============================================================================

/**
 * Apply exposure adjustment
 */
export function applyExposure(value: number, exposure: number): number {
  return value * Math.pow(2, exposure);
}

/**
 * Apply contrast adjustment
 */
export function applyContrast(value: number, contrast: number): number {
  const factor = (259 * (contrast + 255)) / (255 * (259 - contrast));
  return factor * (value - 0.5) + 0.5;
}

/**
 * Apply temperature adjustment (shift between warm/cool)
 */
export function applyTemperature(
  r: number,
  g: number,
  b: number,
  temperature: number
): [number, number, number] {
  const t = temperature / 100;
  return [
    r + t * 30,     // Add red for warm
    g,
    b - t * 30,     // Subtract blue for warm
  ];
}

/**
 * Apply tint adjustment (shift between green/magenta)
 */
export function applyTint(
  r: number,
  g: number,
  b: number,
  tint: number
): [number, number, number] {
  const t = tint / 100;
  return [
    r + t * 10,     // Slight red for magenta
    g - t * 20,     // Subtract green for magenta
    b + t * 10,     // Slight blue for magenta
  ];
}

// =============================================================================
// Apply Color Correction to Pixel
// =============================================================================

/**
 * Apply full color correction to RGB pixel
 * 对RGB像素应用完整的颜色校正
 */
export function applyColorCorrection(
  r: number,
  g: number,
  b: number,
  correction: ColorCorrection,
  lutData?: LUTData
): [number, number, number] {
  if (!correction.enabled) {
    return [r, g, b];
  }

  // Normalize to 0-1 range
  let rn = r / 255;
  let gn = g / 255;
  let bn = b / 255;

  const basic = correction.basic;

  // 1. Apply exposure
  if (basic.exposure !== 0) {
    rn = applyExposure(rn, basic.exposure);
    gn = applyExposure(gn, basic.exposure);
    bn = applyExposure(bn, basic.exposure);
  }

  // 2. Apply contrast
  if (basic.contrast !== 0) {
    const contrastFactor = basic.contrast / 100;
    rn = applyContrast(rn, contrastFactor * 255);
    gn = applyContrast(gn, contrastFactor * 255);
    bn = applyContrast(bn, contrastFactor * 255);
  }

  // 3. Apply highlights and shadows
  const luminance = 0.299 * rn + 0.587 * gn + 0.114 * bn;

  if (basic.highlights !== 0) {
    const highlightMask = Math.pow(luminance, 2);
    const highlightAdjust = basic.highlights / 100 * highlightMask;
    rn += highlightAdjust;
    gn += highlightAdjust;
    bn += highlightAdjust;
  }

  if (basic.shadows !== 0) {
    const shadowMask = Math.pow(1 - luminance, 2);
    const shadowAdjust = basic.shadows / 100 * shadowMask;
    rn += shadowAdjust;
    gn += shadowAdjust;
    bn += shadowAdjust;
  }

  // 4. Apply temperature and tint
  if (basic.temperature !== 0 || basic.tint !== 0) {
    [rn, gn, bn] = applyTemperature(rn * 255, gn * 255, bn * 255, basic.temperature);
    [rn, gn, bn] = applyTint(rn, gn, bn, basic.tint);
    rn /= 255;
    gn /= 255;
    bn /= 255;
  }

  // 5. Apply saturation and vibrance
  if (basic.saturation !== 0 || basic.vibrance !== 0) {
    const [h, s, l] = rgbToHsl(rn * 255, gn * 255, bn * 255);
    let newS = s;

    // Saturation affects all colors equally
    newS = s * (1 + basic.saturation / 100);

    // Vibrance affects less saturated colors more
    const vibranceFactor = (1 - s / 100) * (basic.vibrance / 100);
    newS = newS * (1 + vibranceFactor);

    newS = Math.max(0, Math.min(100, newS));
    [rn, gn, bn] = hslToRgb(h, newS, l).map(v => v / 255) as [number, number, number];
  }

  // 6. Apply curves
  const curves = correction.curves;
  if (curves.rgb.enabled) {
    const lum = interpolateCurve(curves.rgb.points, (rn + gn + bn) / 3);
    const lumDiff = lum - (rn + gn + bn) / 3;
    rn += lumDiff;
    gn += lumDiff;
    bn += lumDiff;
  }
  if (curves.red.enabled) {
    rn = interpolateCurve(curves.red.points, rn);
  }
  if (curves.green.enabled) {
    gn = interpolateCurve(curves.green.points, gn);
  }
  if (curves.blue.enabled) {
    bn = interpolateCurve(curves.blue.points, bn);
  }

  // 7. Apply color wheels
  const wheels = correction.colorWheels;
  const applyWheel = (value: number, wheel: { hue: number; saturation: number; luminance: number }, mask: number) => {
    return value + (wheel.luminance / 100) * mask;
  };

  const shadowMask = Math.pow(Math.max(0, 1 - luminance * 2), 2);
  const highlightMask = Math.pow(Math.max(0, luminance * 2 - 1), 2);
  const midtoneMask = 1 - shadowMask - highlightMask;

  rn = applyWheel(rn, wheels.shadows, shadowMask);
  rn = applyWheel(rn, wheels.midtones, midtoneMask);
  rn = applyWheel(rn, wheels.highlights, highlightMask);

  gn = applyWheel(gn, wheels.shadows, shadowMask);
  gn = applyWheel(gn, wheels.midtones, midtoneMask);
  gn = applyWheel(gn, wheels.highlights, highlightMask);

  bn = applyWheel(bn, wheels.shadows, shadowMask);
  bn = applyWheel(bn, wheels.midtones, midtoneMask);
  bn = applyWheel(bn, wheels.highlights, highlightMask);

  // 8. Apply LUT if present
  if (correction.lut.enabled && lutData) {
    const lutResult = applyLUT(rn, gn, bn, lutData, correction.lut.intensity / 100);
    rn = lutResult[0];
    gn = lutResult[1];
    bn = lutResult[2];
  }

  // Clamp and convert back to 0-255
  return [
    Math.max(0, Math.min(255, Math.round(rn * 255))),
    Math.max(0, Math.min(255, Math.round(gn * 255))),
    Math.max(0, Math.min(255, Math.round(bn * 255))),
  ];
}

// =============================================================================
// LUT Application
// =============================================================================

/**
 * Apply 3D LUT to RGB values
 */
export function applyLUT(
  r: number,
  g: number,
  b: number,
  lut: LUTData,
  intensity: number = 1
): [number, number, number] {
  const size = lut.size;
  const data = lut.data;

  // Scale input to LUT indices
  const rIdx = r * (size - 1);
  const gIdx = g * (size - 1);
  const bIdx = b * (size - 1);

  // Get integer indices for trilinear interpolation
  const r0 = Math.floor(rIdx);
  const r1 = Math.min(r0 + 1, size - 1);
  const g0 = Math.floor(gIdx);
  const g1 = Math.min(g0 + 1, size - 1);
  const b0 = Math.floor(bIdx);
  const b1 = Math.min(b0 + 1, size - 1);

  // Fractional parts
  const rFrac = rIdx - r0;
  const gFrac = gIdx - g0;
  const bFrac = bIdx - b0;

  // Helper to get LUT value
  const getLutValue = (ri: number, gi: number, bi: number, channel: number): number => {
    const idx = (ri + gi * size + bi * size * size) * 3 + channel;
    return data[idx];
  };

  // Trilinear interpolation for each channel
  const interpolate = (channel: number): number => {
    const c000 = getLutValue(r0, g0, b0, channel);
    const c001 = getLutValue(r0, g0, b1, channel);
    const c010 = getLutValue(r0, g1, b0, channel);
    const c011 = getLutValue(r0, g1, b1, channel);
    const c100 = getLutValue(r1, g0, b0, channel);
    const c101 = getLutValue(r1, g0, b1, channel);
    const c110 = getLutValue(r1, g1, b0, channel);
    const c111 = getLutValue(r1, g1, b1, channel);

    const c00 = c000 * (1 - rFrac) + c100 * rFrac;
    const c01 = c001 * (1 - rFrac) + c101 * rFrac;
    const c10 = c010 * (1 - rFrac) + c110 * rFrac;
    const c11 = c011 * (1 - rFrac) + c111 * rFrac;

    const c0 = c00 * (1 - gFrac) + c10 * gFrac;
    const c1 = c01 * (1 - gFrac) + c11 * gFrac;

    return c0 * (1 - bFrac) + c1 * bFrac;
  };

  const lutR = interpolate(0);
  const lutG = interpolate(1);
  const lutB = interpolate(2);

  // Blend with intensity
  return [
    r * (1 - intensity) + lutR * intensity,
    g * (1 - intensity) + lutG * intensity,
    b * (1 - intensity) + lutB * intensity,
  ];
}

// =============================================================================
// LUT Parsing
// =============================================================================

/**
 * Parse .cube LUT file
 */
export function parseCubeLUT(content: string, fileName: string): LUTData | null {
  const lines = content.split('\n');
  let size = 0;
  const values: number[] = [];

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip comments and empty lines
    if (trimmed.startsWith('#') || trimmed === '') continue;

    // Parse LUT size
    if (trimmed.startsWith('LUT_3D_SIZE')) {
      size = parseInt(trimmed.split(/\s+/)[1], 10);
      continue;
    }

    // Skip other metadata
    if (trimmed.startsWith('TITLE') || trimmed.startsWith('DOMAIN_')) continue;

    // Parse RGB values
    const parts = trimmed.split(/\s+/);
    if (parts.length >= 3) {
      values.push(parseFloat(parts[0]));
      values.push(parseFloat(parts[1]));
      values.push(parseFloat(parts[2]));
    }
  }

  if (size === 0 || values.length !== size * size * size * 3) {
    return null;
  }

  return {
    id: `lut-${Date.now()}`,
    name: fileName.replace(/\.cube$/i, ''),
    size,
    data: new Float32Array(values),
    fileName,
  };
}
