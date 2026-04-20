/**
 * ImportStoryboardToCanvas Stage — Optionally imports semantic storyboard plans into canvas.
 *
 * This stage is a no-op unless explicitly enabled via:
 *   ctx.stageParams.importStoryboardToCanvas.enabled = true
 */

import type { CreatedCanvasStoryboard } from '@neko/shared';
import type { IWorkflowStage, WorkflowContext } from '../types';

export interface IStoryboardCanvasSink {
  importStoryboard(ctx: WorkflowContext): Promise<CreatedCanvasStoryboard | undefined>;
}

export interface ImportStoryboardToCanvasStageDeps {
  storyboardCanvasSink: IStoryboardCanvasSink;
}

export function createImportStoryboardToCanvasStage(
  deps: ImportStoryboardToCanvasStageDeps,
): IWorkflowStage {
  return {
    name: 'importStoryboardToCanvas',
    type: 'linear',
    gate: 'auto',

    async execute(ctx: WorkflowContext): Promise<WorkflowContext> {
      const stageParams = ctx.stageParams?.['importStoryboardToCanvas'] ?? {};
      const enabled = stageParams['enabled'] === true;
      if (!enabled) {
        return ctx;
      }

      if (ctx.sourceFormat !== 'fountain' || !ctx.scenePlans || ctx.scenePlans.length === 0) {
        return ctx;
      }

      const canvasStoryboard = await deps.storyboardCanvasSink.importStoryboard(ctx);
      if (!canvasStoryboard) {
        return ctx;
      }

      return { ...ctx, canvasStoryboard };
    },
  };
}
