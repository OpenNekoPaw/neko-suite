/**
 * ArrangeOnTimeline Stage — Places generated media onto neko-cut timeline
 *
 * Sequentially adds each generated media file as a timeline element.
 * Supports both scene-level and shot-level granularity.
 * Skips failed items (empty paths). Optionally adds transitions between clips.
 */

import type { IPipelineStage, PipelineContext } from '../types';

/** Dependency: timeline manipulation API */
export interface ITimelineArranger {
  /** Add a media element to the timeline */
  addElement(config: {
    type: 'video' | 'image' | 'audio';
    source: string;
    startTime: number;
    duration?: number;
    trackName?: string;
  }): Promise<string>;

  /** Set transition between two elements */
  setTransition?(config: { elementId: string; type: string; duration: number }): Promise<void>;
}

export interface ArrangeOnTimelineStageDeps {
  timelineArranger: ITimelineArranger;
}

export function createArrangeOnTimelineStage(deps: ArrangeOnTimelineStageDeps): IPipelineStage {
  return {
    name: 'arrangeOnTimeline',
    type: 'linear',
    gate: 'auto',

    async execute(ctx: PipelineContext): Promise<PipelineContext> {
      const paths = ctx.generatedPaths;
      const scenes = ctx.scenes;

      if (!paths || paths.length === 0) {
        throw new Error('arrangeOnTimeline: No generated media paths available');
      }

      if (ctx.generationUnit === 'shot') {
        return arrangeShotLevel(deps, ctx, paths);
      }

      return arrangeSceneLevel(deps, ctx, paths, scenes);
    },
  };
}

async function arrangeSceneLevel(
  deps: ArrangeOnTimelineStageDeps,
  ctx: PipelineContext,
  paths: string[],
  scenes: PipelineContext['scenes'],
): Promise<PipelineContext> {
  const stageParams = ctx.stageParams?.['arrangeOnTimeline'] ?? {};
  const trackName = (stageParams['trackName'] as string) ?? 'Generated Scenes';
  const gap = (stageParams['gap'] as number) ?? 0;
  const transitions = stageParams['transitions'] as { type: string; duration: number } | undefined;

  const elementIds: string[] = [];
  let currentTime = 0;

  for (let i = 0; i < paths.length; i++) {
    const path = paths[i];

    if (!path) {
      const estimatedDuration = scenes?.[i]?.estimatedDuration ?? 4;
      currentTime += estimatedDuration + gap;
      continue;
    }

    const duration = scenes?.[i]?.estimatedDuration;

    const elementId = await deps.timelineArranger.addElement({
      type: 'video',
      source: path,
      startTime: currentTime,
      duration,
      trackName,
    });

    elementIds.push(elementId);

    if (transitions && elementIds.length > 1 && deps.timelineArranger.setTransition) {
      await deps.timelineArranger.setTransition({
        elementId,
        type: transitions.type,
        duration: transitions.duration,
      });
    }

    currentTime += (duration ?? 4) + gap;
  }

  return {
    ...ctx,
    elementIds,
    totalDuration: currentTime - gap,
  };
}

/**
 * Shot-level arrangement: each generated path corresponds to a shot.
 * Uses scene headings as track names for grouping.
 */
async function arrangeShotLevel(
  deps: ArrangeOnTimelineStageDeps,
  ctx: PipelineContext,
  paths: string[],
): Promise<PipelineContext> {
  const scenes = ctx.scenes ?? [];
  const stageParams = ctx.stageParams?.['arrangeOnTimeline'] ?? {};
  const gap = (stageParams['gap'] as number) ?? 0;
  const transitions = stageParams['transitions'] as { type: string; duration: number } | undefined;

  const elementIds: string[] = [];
  let currentTime = 0;
  let pathIndex = 0;

  for (const scene of scenes) {
    const shots = scene.shotPlans;
    const trackName = scene.heading || `Scene ${scene.index + 1}`;

    if (!shots || shots.length === 0) {
      // Scene without shots — use scene-level path
      const path = paths[pathIndex];
      pathIndex++;

      if (!path) {
        currentTime += scene.estimatedDuration + gap;
        continue;
      }

      const elementId = await deps.timelineArranger.addElement({
        type: 'video',
        source: path,
        startTime: currentTime,
        duration: scene.estimatedDuration,
        trackName,
      });

      elementIds.push(elementId);
      currentTime += scene.estimatedDuration + gap;
      continue;
    }

    for (const shot of shots) {
      const path = paths[pathIndex];
      pathIndex++;

      const shotDuration = shot.duration ?? 3;

      if (!path) {
        currentTime += shotDuration + gap;
        continue;
      }

      const elementId = await deps.timelineArranger.addElement({
        type: 'video',
        source: path,
        startTime: currentTime,
        duration: shotDuration,
        trackName,
      });

      elementIds.push(elementId);

      if (transitions && elementIds.length > 1 && deps.timelineArranger.setTransition) {
        await deps.timelineArranger.setTransition({
          elementId,
          type: transitions.type,
          duration: transitions.duration,
        });
      }

      currentTime += shotDuration + gap;
    }
  }

  return {
    ...ctx,
    elementIds,
    totalDuration: currentTime > 0 ? currentTime - gap : 0,
  };
}
