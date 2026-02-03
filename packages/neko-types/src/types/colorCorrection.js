// =============================================================================
// Color Correction
// =============================================================================
export const DEFAULT_BASIC_COLOR_ADJUSTMENT = {
    exposure: 0,
    contrast: 0,
    highlights: 0,
    shadows: 0,
    whites: 0,
    blacks: 0,
    temperature: 0,
    tint: 0,
    saturation: 0,
    vibrance: 0,
    clarity: 0,
    dehaze: 0,
};
export const DEFAULT_CURVE = {
    points: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
    enabled: true,
};
export const DEFAULT_CURVES_ADJUSTMENT = {
    rgb: { ...DEFAULT_CURVE },
    red: { ...DEFAULT_CURVE, enabled: false },
    green: { ...DEFAULT_CURVE, enabled: false },
    blue: { ...DEFAULT_CURVE, enabled: false },
    luma: { ...DEFAULT_CURVE, enabled: false },
};
export const DEFAULT_HSL_RANGE = { hue: 0, saturation: 0, luminance: 0 };
export const DEFAULT_HSL_ADJUSTMENT = {
    red: { ...DEFAULT_HSL_RANGE },
    orange: { ...DEFAULT_HSL_RANGE },
    yellow: { ...DEFAULT_HSL_RANGE },
    green: { ...DEFAULT_HSL_RANGE },
    cyan: { ...DEFAULT_HSL_RANGE },
    blue: { ...DEFAULT_HSL_RANGE },
    purple: { ...DEFAULT_HSL_RANGE },
    magenta: { ...DEFAULT_HSL_RANGE },
};
export const DEFAULT_LUT_ADJUSTMENT = {
    enabled: false,
    lutId: null,
    intensity: 100,
};
export const DEFAULT_VIGNETTE_PARAMS = {
    enabled: false,
    amount: 0,
    midpoint: 50,
    roundness: 0,
    feather: 50,
};
export const DEFAULT_COLOR_WHEEL_VALUE = {
    hue: 0,
    saturation: 100,
    luminance: 0,
};
export const DEFAULT_COLOR_WHEELS_PARAMS = {
    shadows: { ...DEFAULT_COLOR_WHEEL_VALUE },
    midtones: { ...DEFAULT_COLOR_WHEEL_VALUE },
    highlights: { ...DEFAULT_COLOR_WHEEL_VALUE },
    global: { ...DEFAULT_COLOR_WHEEL_VALUE },
};
export const DEFAULT_COLOR_CORRECTION = {
    enabled: false,
    basic: DEFAULT_BASIC_COLOR_ADJUSTMENT,
    curves: DEFAULT_CURVES_ADJUSTMENT,
    colorWheels: DEFAULT_COLOR_WHEELS_PARAMS,
    hsl: DEFAULT_HSL_ADJUSTMENT,
    lut: DEFAULT_LUT_ADJUSTMENT,
    vignette: DEFAULT_VIGNETTE_PARAMS,
};
//# sourceMappingURL=colorCorrection.js.map