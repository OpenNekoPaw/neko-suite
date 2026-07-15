import {
  COMPOSITE_ARTIFACT_KIND,
  COMPOSITE_ARTIFACT_SCHEMA_VERSION,
  type Task,
} from '@neko/shared';
import type { CreativeAiRunSnapshot } from '@neko/shared/types/creative-ai-invocation';
import { describe, expect, it, vi } from 'vitest';
import {
  HomeAigcLifecycleDiagnostic,
  HomeAigcLifecycleProjectionRuntime,
  type HomeAigcCreationObservation,
} from './home-aigc-lifecycle';

describe('Home AIGC lifecycle projection', () => {
  it('projects public Task/Run/Artifact contracts and delegates actions', async () => {
    const cancelTask = vi.fn(async () => undefined);
    const promoteOutput = vi.fn(async () => undefined);
    const runtime = new HomeAigcLifecycleProjectionRuntime({ cancelTask, promoteOutput });
    const observation = createObservation();

    expect(runtime.observe(observation)).toMatchObject({
      taskId: 'task-1',
      taskRunId: 'run-1',
      creationRunId: 'run-1',
      capabilityId: 'neko.image.generate',
      providerId: 'image-provider',
      progress: 45,
      actions: ['cancel', 'promote'],
      outputs: [{ outputId: 'output-1', validation: { ok: true } }],
    });

    await runtime.cancel('task-1');
    await runtime.promote('task-1', 'output-1');
    expect(cancelTask).toHaveBeenCalledWith(observation.task);
    expect(promoteOutput).toHaveBeenCalledWith(observation.outputs[0]);
  });

  it('rejects cache/runtime identity and mismatched Task/Run', () => {
    const runtime = new HomeAigcLifecycleProjectionRuntime();
    const observation = createObservation();
    const invalid: HomeAigcCreationObservation = {
      ...observation,
      outputs: observation.outputs.map((output) => ({
        ...output,
        resourceRef: {
          ...output.resourceRef,
          source: {
            ...output.resourceRef.source,
            projectRelativePath: '.neko/cache/generated/output-1.png',
          },
        },
      })),
    };
    expect(() => runtime.observe(invalid)).toThrowError(HomeAigcLifecycleDiagnostic);
    expect(() =>
      runtime.observe({ ...observation, run: { ...observation.run, runId: 'run-stale' } }),
    ).toThrow('Task and creative run identities do not match');
  });

  it('fails visibly when an owning action port is unavailable', async () => {
    const runtime = new HomeAigcLifecycleProjectionRuntime();
    runtime.observe(createObservation());
    await expect(runtime.cancel('task-1')).rejects.toMatchObject({
      code: 'aigc-action-unavailable',
    });
  });
});

function createObservation(): HomeAigcCreationObservation {
  const task: Task = {
    scope: {
      conversationId: 'conversation-1',
      runId: 'run-1',
      parentRunId: 'agent-run-1',
      childRunId: 'task-1',
      childKind: 'task',
    },
    id: 'task-1',
    type: 'image_generation',
    status: 'running',
    input: { type: 'image_generation', payload: {} },
    progress: 45,
    createdAt: 1,
    updatedAt: 2,
  };
  const run: CreativeAiRunSnapshot = {
    schemaVersion: 1,
    runId: 'run-1',
    conversationId: 'conversation-1',
    invocationId: 'invocation-1',
    invocationDomain: 'agent-internal',
    sourcePackage: '@neko/agent',
    routingReason: 'selected-agent-conversation',
    sourceRef: { kind: 'custom', packageId: '@neko/agent', id: 'source-1' },
    intent: 'Generate an image',
    mode: 'generate',
    writeback: { kind: 'candidate' },
    idempotencyKey: 'generation-1',
    status: 'running',
    createdAt: '2026-07-14T00:00:00.000Z',
  };
  return {
    task,
    run,
    capabilityId: 'neko.image.generate',
    providerId: 'image-provider',
    diagnostics: ['Provider accepted the generation.'],
    outputs: [
      {
        outputId: 'output-1',
        taskId: task.id,
        runId: run.runId,
        resourceRef: {
          id: 'resource-output-1',
          scope: 'project',
          provider: 'generated-output',
          kind: 'generated',
          source: {
            kind: 'generated-asset',
            projectRelativePath: 'generated/output-1.png',
            generatedAssetId: 'generated-output-1',
          },
          locator: { kind: 'generated-asset', assetId: 'generated-output-1' },
          fingerprint: { strategy: 'hash', value: 'sha256:output-1' },
        },
        artifact: {
          schemaVersion: COMPOSITE_ARTIFACT_SCHEMA_VERSION,
          kind: COMPOSITE_ARTIFACT_KIND,
          artifactId: 'artifact-output-1',
          title: 'Generated output',
          blocks: [],
          provenance: {
            source: 'tool',
            taskId: task.id,
            toolCallId: 'tool-call-1',
            createdAt: '2026-07-14T00:00:01.000Z',
          },
        },
        validation: { ok: true, diagnostics: [] },
      },
    ],
  };
}
