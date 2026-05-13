import type { CameraAngle, CameraMovement, ShotCharacter, ShotScale } from './canvas';
import type { NekoStoryScriptIndex } from './extension-api';

export type StoryboardImportMode = 'mechanical' | 'semantic';

export interface StoryShotPlan {
  readonly shotNumber?: number;
  readonly duration?: number;
  readonly visualDescription?: string;
  readonly characters?: readonly ShotCharacter[];
  readonly shotScale?: ShotScale;
  readonly cameraMovement?: CameraMovement;
  readonly cameraAngle?: CameraAngle;
  readonly characterAction?: string;
  readonly emotion?: readonly string[];
  readonly sceneTags?: readonly string[];
  readonly dialogue?: string;
  readonly voiceOver?: string;
  readonly soundCue?: string;
  readonly generationPrompt?: string;
  readonly visualStyle?: string;
  readonly referenceImagePath?: string;
  readonly vfx?: readonly string[];
}

export interface StoryScenePlan {
  readonly sceneId: string;
  readonly sceneTitle?: string;
  readonly summary?: string;
  readonly recommendedShotCount?: number;
  readonly shotPlans?: readonly StoryShotPlan[];
}

export interface CanvasStoryboardShotPlan {
  readonly shotNumber: number;
  readonly duration: number;
  readonly visualDescription: string;
  readonly characters: readonly ShotCharacter[];
  readonly shotScale: ShotScale;
  readonly cameraMovement?: CameraMovement;
  readonly cameraAngle?: CameraAngle;
  readonly characterAction: string;
  readonly emotion: readonly string[];
  readonly sceneTags: readonly string[];
  readonly dialogue?: string;
  readonly voiceOver?: string;
  readonly soundCue?: string;
  readonly generationPrompt?: string;
  readonly visualStyle?: string;
  readonly referenceImagePath?: string;
  readonly vfx?: readonly string[];
}

export interface CanvasStoryboardScenePlan {
  readonly sceneId: string;
  readonly sceneTitle: string;
  readonly sceneNumber: number;
  readonly location?: string;
  readonly timeOfDay?: string | null;
  readonly shotPlans: readonly CanvasStoryboardShotPlan[];
}

export interface CanvasStoryboardPayload {
  readonly mode: StoryboardImportMode;
  readonly sourceScriptUri: string;
  readonly scenes: readonly CanvasStoryboardScenePlan[];
}

export interface ApplyCanvasStoryboardOptions {
  readonly startX?: number;
  readonly startY?: number;
  /**
   * Phase 6.3 — Workflow Orchestration plan id.  When provided, every
   * imported shot node gets its `data.workflowPlanId` stamped so timeline
   * import downstream can populate `EngineElement.lineage.planId`.  Omit
   * for manual / non-orchestrated imports.
   */
  readonly workflowPlanId?: string;
}

export interface CreateStoryboardPayloadOptions {
  readonly mode?: StoryboardImportMode;
  readonly scenesLimit?: number;
  readonly scenePlans?: readonly StoryScenePlan[];
  readonly characterBindings?: Readonly<Record<string, string>>;
}

export interface CreatedCanvasStoryboardScene {
  readonly sourceSceneId: string;
  readonly sceneNodeId: string;
  readonly shotIds: readonly string[];
}

export interface CreatedCanvasStoryboard {
  readonly mode: StoryboardImportMode;
  readonly scenesCreated: number;
  readonly totalShots: number;
  readonly scenes: readonly CreatedCanvasStoryboardScene[];
}

export interface CreateStoryboardPayloadResult {
  readonly payload: CanvasStoryboardPayload;
  readonly sourceIndex: NekoStoryScriptIndex;
}
