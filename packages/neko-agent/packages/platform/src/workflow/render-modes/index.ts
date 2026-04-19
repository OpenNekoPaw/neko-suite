/**
 * Render Modes barrel (Phase 5.4c stub).
 *
 * See docs/architecture/agent-media-architecture.md (three-mode cost
 * table) and docs/architecture/workflow-orchestration.md Phase 5.4c.
 */

export type {
  PuppetRenderAdapter,
  RenderAdapter,
  RenderAdapterRegistry,
  RenderAnimation,
  RenderMode,
  RenderModeCostHint,
  RenderRequest,
  RenderResult,
  RenderSource,
  RenderSourceKind,
  SceneRenderAdapter,
} from './types';

export { DEFAULT_RENDER_MODE_COSTS } from './types';

export {
  DisabledPuppetRenderAdapter,
  DisabledSceneRenderAdapter,
  StaticRenderAdapterRegistry,
  createDisabledRenderRegistry,
} from './disabled-adapter';

export { selectRenderMode } from './render-mode-selector';
export type { SelectRenderModeOptions, SelectRenderModeResult } from './render-mode-selector';
