// Hooks barrel export
export { useVSCodeMessaging } from './useVSCodeMessaging';
export { useKeyboardShortcuts } from './useKeyboardShortcuts';
export { useShallowStore, selectors } from './useShallowStore';

// Keyframe Cache Manager Hook
export { useKeyframeCacheManager } from './useKeyframeCacheManager';

// Media Info Cache Hook
export { useMediaInfoCache } from './useMediaInfoCache';

// Canvas 2D Render Hook
export { useCanvas2DRender } from './useCanvas2DRender';
export type {
  Canvas2DRenderState,
  Canvas2DRenderOptions,
  Canvas2DRenderHook,
} from './useCanvas2DRender';

// Universal Render Engine Hook (GPU/Canvas2D auto-switching)
export { useRenderEngine } from './useRenderEngine';
export type {
  RenderEngineState,
  RenderEngineOptions,
  RenderEngineHook,
} from './useRenderEngine';

// Compatible Mode Export Hook
export { useCompatibleExport } from './useCompatibleExport';
export type {
  ExportState,
  UseCompatibleExportReturn,
  PreviewFrameData,
} from './useCompatibleExport';
