// =============================================================================
// Shape System (形状系统)
// =============================================================================
// -----------------------------------------------------------------------------
// Default Shape Values
// -----------------------------------------------------------------------------
export const DEFAULT_SHAPE_FILL = {
    type: 'solid',
    color: '#4a90d9',
    opacity: 1,
};
export const DEFAULT_SHAPE_STROKE = {
    enabled: true,
    color: '#333333',
    width: 2,
    opacity: 1,
    lineCap: 'round',
    lineJoin: 'round',
    miterLimit: 10,
    dashArray: [],
    dashOffset: 0,
};
export const DEFAULT_SHAPE_SHADOW = {
    enabled: false,
    color: 'rgba(0, 0, 0, 0.3)',
    blur: 10,
    offsetX: 4,
    offsetY: 4,
};
export const DEFAULT_SHAPE_STYLE = {
    fill: DEFAULT_SHAPE_FILL,
    stroke: DEFAULT_SHAPE_STROKE,
    shadow: DEFAULT_SHAPE_SHADOW,
};
//# sourceMappingURL=shape.js.map