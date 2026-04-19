/**
 * Plan Wire — cross-extension broadcast.
 *
 * Tells sibling extensions (currently neko-canvas) when a plan enters
 * or leaves an actively-working state.  Fire-and-forget: the target
 * command may not be registered (the target extension is absent or
 * not yet activated).
 *
 * KNOWN COUPLING: this is still a string-keyed command contract.
 * Future work moves it behind a shared typed extension-API so the
 * producer and consumer can evolve together.  See docs
 * workflow-plan-handler review notes, item "cross-extension contract".
 */

import * as vscode from 'vscode';

export function broadcastPlanState(
  status: 'executing' | 'paused' | 'completed' | 'aborted' | 'failed',
  planId: string,
  pipelineId?: string,
): void {
  vscode.commands
    .executeCommand('neko.canvas.orchestrator.planStateChanged', {
      status,
      planId,
      ...(pipelineId !== undefined && { pipelineId }),
    })
    .then(undefined, () => {
      // neko-canvas not installed or not yet activated — fine.
    });
}
