/**
 * Canvas Hooks - Public exports
 */

export { useViewportTransform } from './useViewportTransform';
export type {
  UseViewportTransformOptions,
  UseViewportTransformReturn,
  ViewportTransformState,
} from './useViewportTransform';
export { MIN_ZOOM, MAX_ZOOM, ZOOM_WHEEL_SENSITIVITY, ZOOM_PRESETS } from './useViewportTransform';

export { useCanvasCoordinates } from './useCanvasCoordinates';
export type { UseCanvasCoordinatesOptions, CanvasCoordinateMapper } from './useCanvasCoordinates';

export { useNodeDrag } from './useNodeDrag';
export type { UseNodeDragOptions, UseNodeDragReturn } from './useNodeDrag';

export { useNodeResize } from './useNodeResize';
export type { UseNodeResizeOptions, UseNodeResizeReturn, ResizeHandle } from './useNodeResize';

export { useConnectionDrag } from './useConnectionDrag';
export type {
  UseConnectionDragOptions,
  UseConnectionDragReturn,
  PendingConnection,
} from './useConnectionDrag';

export { useViewportCulling } from './useViewportCulling';
export type { UseViewportCullingOptions, UseViewportCullingReturn } from './useViewportCulling';

export { useSnap } from './useSnap';
export type { UseSnapOptions, UseSnapReturn } from './useSnap';

export { useVSCodeMessages } from './useVSCodeMessages';
export type {
  VSCodeAPI,
  UseVSCodeMessagesOptions,
  UseVSCodeMessagesReturn,
} from './useVSCodeMessages';

export { useNodeHelpers } from './useNodeHelpers';
export type { UseNodeHelpersOptions, UseNodeHelpersReturn } from './useNodeHelpers';

export { useClipboard } from './useClipboard';
export type { UseClipboardOptions, UseClipboardReturn } from './useClipboard';

export { useKeyboardActions } from './useKeyboardActions';
export type { UseKeyboardActionsOptions, UseKeyboardActionsReturn } from './useKeyboardActions';

export { useDragDrop } from './useDragDrop';
export type { UseDragDropOptions, UseDragDropReturn } from './useDragDrop';

export { useContextMenu } from './useContextMenu';
export type {
  ContextMenuState,
  UseContextMenuOptions,
  UseContextMenuReturn,
} from './useContextMenu';
