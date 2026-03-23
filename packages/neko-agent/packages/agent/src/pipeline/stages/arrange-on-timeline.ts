/**
 * ArrangeOnTimeline Stage — Places generated media onto neko-cut timeline
 *
 * Sequentially adds each generated media file as a timeline element.
 * Skips failed scenes (empty paths). Optionally adds transitions between clips.
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

      const stageParams = ctx.stageParams?.['arrangeOnTimeline'] ?? {};
      const trackName = (stageParams['trackName'] as string) ?? 'Generated Scenes';
      const gap = (stageParams['gap'] as number) ?? 0;
      const transitions = stageParams['transitions'] as
        | { type: string; duration: number }
        | undefined;

      const elementIds: string[] = [];
      let currentTime = 0;

      for (let i = 0; i < paths.length; i++) {
        const path = paths[i];

        // Skip failed scenes (empty paths)
        if (!path) {
          // Still advance time by estimated duration to leave gap
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

        // Add transition to previous element (if configured and not first)
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
        totalDuration: currentTime - gap, // Remove trailing gap
      };
    },
  };
}
