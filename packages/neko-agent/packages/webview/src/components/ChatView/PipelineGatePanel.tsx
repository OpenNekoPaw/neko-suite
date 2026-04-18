/**
 * PipelineGatePanel — renders a paused pipeline gate with Resume / Cancel
 * controls.
 *
 * Fires when the executor hits either a stage with `gate: 'confirm'` or one
 * the plan has flagged via `userCheckpoint` (see pipeline-executor.ts).
 *
 * See docs/architecture/plan-mode.md §8 (Checkpoint).
 */

import { memo } from 'react';
import type { PipelineGatePreview, PipelineGateSceneCard } from '@neko-agent/types';
import { vscode } from '@/messages';

interface PipelineGatePanelProps {
  pipelineId: string;
  preview: PipelineGatePreview;
  /** Called after the user resumed / cancelled — clears the pending gate state. */
  onResolved: () => void;
}

export const PipelineGatePanel = memo(function PipelineGatePanel({
  pipelineId,
  preview,
  onResolved,
}: PipelineGatePanelProps) {
  const handleResume = (): void => {
    vscode?.postMessage({ type: 'pipelineGateConfirm', pipelineId });
    onResolved();
  };
  const handleCancel = (): void => {
    vscode?.postMessage({ type: 'pipelineGateCancel', pipelineId });
    onResolved();
  };

  const hasScenes = preview.scenes && preview.scenes.length > 0;
  const failedCount = preview.failedIndices?.length ?? 0;

  return (
    <div
      className="my-2 rounded-md border border-[var(--vscode-charts-orange)] bg-[var(--agent-bg-secondary)] p-3"
      data-testid="pipeline-gate-panel"
      data-pipeline-id={pipelineId}
      role="alert"
    >
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2 text-[13px] font-semibold">
          <span>🛑</span>
          <span>Checkpoint — {preview.stage}</span>
        </div>
        {failedCount > 0 && (
          <span className="rounded bg-[var(--agent-danger-bg,rgba(230,70,70,0.15))] px-2 py-0.5 text-[10px] text-[var(--agent-danger)]">
            {failedCount} failed
          </span>
        )}
      </div>

      <div className="mb-2 text-[11px] text-[var(--agent-fg-secondary)]">
        Pipeline paused. Review below, then resume or cancel.
        {preview.totalScenes !== undefined && (
          <>
            {' '}
            ({preview.generatedCount ?? 0} of {preview.totalScenes} produced)
          </>
        )}
      </div>

      {hasScenes && <GateScenesGrid scenes={preview.scenes} />}

      <div className="mt-3 flex gap-2 border-t border-[var(--agent-divider)] pt-2">
        <button
          type="button"
          className="vscode-button-primary px-3 py-1 text-[12px]"
          onClick={handleResume}
        >
          Resume
        </button>
        <button
          type="button"
          className="vscode-button-secondary px-3 py-1 text-[12px]"
          onClick={handleCancel}
        >
          Cancel
        </button>
      </div>
    </div>
  );
});

// =============================================================================
// Scene preview strip
// =============================================================================

function GateScenesGrid({ scenes }: { scenes: readonly PipelineGateSceneCard[] }) {
  // Show at most 6 thumbs inline; the rest are summarised.
  const visible = scenes.slice(0, 6);
  const hidden = scenes.length - visible.length;

  return (
    <div>
      <div className="grid grid-cols-3 gap-1.5">
        {visible.map((scene) => (
          <GateSceneCard key={scene.sceneIndex} scene={scene} />
        ))}
      </div>
      {hidden > 0 && (
        <div className="mt-1 text-[10px] text-[var(--agent-fg-secondary)]">
          … +{hidden} more scene{hidden === 1 ? '' : 's'}
        </div>
      )}
    </div>
  );
}

function GateSceneCard({ scene }: { scene: PipelineGateSceneCard }) {
  const border = scene.failed ? 'border-[var(--agent-danger)]' : 'border-[var(--agent-divider)]';

  return (
    <div
      className={`flex flex-col rounded border ${border} bg-[var(--vscode-editor-background)] p-1`}
      title={scene.description}
    >
      <div className="mb-0.5 truncate text-[10px] font-medium">
        #{scene.sceneIndex + 1} {scene.heading}
      </div>
      {scene.mediaPath ? (
        <div
          className="flex h-[48px] items-center justify-center overflow-hidden rounded bg-[var(--vscode-panel-background)] text-[9px] opacity-80"
          aria-label={scene.failed ? 'Scene failed' : 'Scene media ready'}
        >
          {scene.failed ? '❌' : scene.mediaType === 'video' ? '🎬' : '🖼️'}
        </div>
      ) : (
        <div className="flex h-[48px] items-center justify-center rounded bg-[var(--vscode-panel-background)] text-[9px] opacity-60">
          (no media)
        </div>
      )}
    </div>
  );
}
