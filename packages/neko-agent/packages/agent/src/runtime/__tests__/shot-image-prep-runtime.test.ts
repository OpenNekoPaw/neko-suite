import { describe, expect, it, vi } from 'vitest';
import type {
  ReferenceDescriptor,
  ReferenceMaterializationRequest,
  ReferenceProviderInput,
  ReferenceResolverService,
  ShotImagePrepBatchRequest,
  ShotImagePrepPlan,
  StoryboardMediaRef,
  Tool,
} from '@neko/shared';
import {
  backfillShotImagePrepOutputRefs,
  createGenerateVideoReferenceToolArgs,
  createShotImagePrepToolCapabilities,
  createShotImagePrepToolRequest,
  estimateShotImagePrepCost,
  executeShotImagePrepBatch,
  executeShotImagePrepPlan,
  gateShotImagePrepBatch,
} from '../shot-image-prep-runtime';

describe('shot image prep runtime', () => {
  it('maps transform-original plans to the TransformImage facade request', () => {
    const request = createShotImagePrepToolRequest(makePlan());

    expect(request).toEqual({
      toolName: 'TransformImage',
      args: expect.objectContaining({
        planId: 'shot-1-image-prep',
        sourceImageRef: sourceRef,
        sourceMediaRefs: [sourceRef],
        editInstruction: 'Remove dialogue bubbles and fill the background.',
        operationPlan: ['crop-panel', 'remove-text', 'inpaint'],
      }),
    });
  });

  it('discovers TransformImage as source, mask, and reference capable', () => {
    const capabilities = createShotImagePrepToolCapabilities({
      list: () => [tool('TransformImage', { sourceImageRef: { type: 'object' } })],
    });

    expect(capabilities).toEqual([
      {
        toolName: 'TransformImage',
        supportsSourceImage: true,
        supportsMasks: true,
        supportsReferences: true,
      },
    ]);
  });

  it('degrades without fabricating output refs when the transform provider is unavailable', async () => {
    const result = await executeShotImagePrepPlan({
      artifactId: 'artifact-1',
      plan: makePlan({ status: 'approved' }),
      availableTools: [],
      toolPort: { execute: vi.fn() },
    });

    expect(result.result).toBeUndefined();
    expect(result.plan.outputMediaRefs).toBeUndefined();
    expect(result.summary.status).toBe('unavailable');
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: 'provider-unavailable',
        message: expect.stringContaining('TransformImage'),
      }),
    ]);
  });

  it('executes approved plans through the injected tool port', async () => {
    const execute = vi.fn().mockResolvedValue({
      success: true,
      data: { taskId: 'task-1' },
    });

    const result = await executeShotImagePrepPlan({
      artifactId: 'artifact-1',
      plan: makePlan({ status: 'approved' }),
      availableTools: [
        {
          toolName: 'TransformImage',
          supportsSourceImage: true,
          supportsMasks: true,
          supportsReferences: true,
        },
      ],
      toolPort: { execute },
      providerId: 'provider-edit',
    });

    expect(execute).toHaveBeenCalledWith(
      'TransformImage',
      expect.objectContaining({
        providerId: 'provider-edit',
        planId: 'shot-1-image-prep',
      }),
      undefined,
    );
    expect(result.summary.status).toBe('succeeded');
  });

  it('materializes stable refs into TransformImage provider args without persisting them in request', async () => {
    const execute = vi.fn().mockResolvedValue({
      success: true,
      data: { taskId: 'task-1' },
    });
    const referenceResolver = resolverWithProviderInputs((request) =>
      request.references.flatMap((descriptor): readonly ReferenceProviderInput[] => {
        if (descriptor.role === 'source') {
          return [
            {
              inputId: `${descriptor.referenceId}:image-uri`,
              referenceId: descriptor.referenceId,
              inputKind: 'image-uri' as const,
              value: 'file:///resolved/source-panel-1.png',
            },
          ];
        }
        if (descriptor.role === 'mask') {
          return [
            {
              inputId: `${descriptor.referenceId}:mask-uri`,
              referenceId: descriptor.referenceId,
              inputKind: 'mask-uri' as const,
              value: 'file:///resolved/speech-mask.png',
            },
          ];
        }
        if (descriptor.role === 'style') {
          return [
            {
              inputId: `${descriptor.referenceId}:ip-adapter-ref`,
              referenceId: descriptor.referenceId,
              inputKind: 'ip-adapter-ref' as const,
              value: { imageBase64: 'style-ref', mimeType: 'image/png', mode: 'style' },
            },
          ];
        }
        return [];
      }),
    );
    const plan = makePlan({
      status: 'approved',
      maskRefs: [maskRef],
      referenceBundle: { styleRefs: [styleRef] },
    });

    const result = await executeShotImagePrepPlan({
      artifactId: 'artifact-1',
      plan,
      availableTools: [transformCapability],
      toolPort: { execute },
      referenceResolver,
    });

    expect(execute).toHaveBeenCalledWith(
      'TransformImage',
      expect.objectContaining({
        sourceImageUri: 'file:///resolved/source-panel-1.png',
        maskUri: 'file:///resolved/speech-mask.png',
        ipAdapterRefs: [{ imageBase64: 'style-ref', mimeType: 'image/png', mode: 'style' }],
      }),
      undefined,
    );
    expect(result.request?.args).not.toHaveProperty('sourceImageUri');
    expect(result.request?.args).not.toHaveProperty('maskUri');
    expect(result.request?.args).not.toHaveProperty('ipAdapterRefs');
    expect(JSON.stringify(result.summary)).not.toContain('file:///resolved');
    expect(result.summary.status).toBe('succeeded');
  });

  it('blocks provider execution when an entity reference has no usable representation', async () => {
    const execute = vi.fn();
    const plan = makePlan({
      status: 'approved',
      imageStrategy: 'generate-new',
      generationPrompt: 'Clean anime keyframe',
      referenceBundle: {
        characterRefs: [{ entityRef: { entityId: 'char-1', entityKind: 'character' } }],
      },
    });

    const result = await executeShotImagePrepPlan({
      artifactId: 'artifact-1',
      plan,
      availableTools: [
        {
          toolName: 'GenerateImage',
          supportsSourceImage: true,
          supportsMasks: true,
          supportsReferences: true,
        },
      ],
      toolPort: { execute },
      referenceResolver: resolverWithProviderInputs(() => []),
    });

    expect(execute).not.toHaveBeenCalled();
    expect(result.summary.status).toBe('unavailable');
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        code: 'provider-unavailable',
        message: expect.stringContaining('Entity reference has no usable representation'),
      }),
    ]);
  });

  it('rejects unsafe runtime projections returned by the reference resolver', async () => {
    const execute = vi.fn();
    const result = await executeShotImagePrepPlan({
      artifactId: 'artifact-1',
      plan: makePlan({ status: 'approved' }),
      availableTools: [transformCapability],
      toolPort: { execute },
      referenceResolver: resolverWithProviderInputs((request) => [
        {
          inputId: `${request.references[0]?.referenceId ?? 'ref'}:image-uri`,
          referenceId: request.references[0]?.referenceId ?? 'ref',
          inputKind: 'image-uri',
          value: 'blob:https://webview/source.png',
        },
      ]),
    });

    expect(execute).not.toHaveBeenCalled();
    expect(result.summary.status).toBe('unavailable');
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        code: 'unsafe-runtime-handle',
      }),
    ]);
  });

  it('maps prepared keyframe refs into GenerateVideo args at execution handoff time', () => {
    const descriptor = referenceDescriptor({
      referenceId: 'prep-1:outputMediaRefs:0',
      role: 'output',
    });

    const args = createGenerateVideoReferenceToolArgs({
      args: { prompt: 'Animate the prepared keyframe' },
      descriptors: [descriptor],
      providerInputs: [
        {
          inputId: 'prep-1:outputMediaRefs:0:video-keyframe-uri',
          referenceId: descriptor.referenceId,
          inputKind: 'video-keyframe-uri',
          value: 'file:///resolved/keyframe-1.png',
        },
      ],
    });

    expect(args).toEqual({
      prompt: 'Animate the prepared keyframe',
      referenceImageUri: 'file:///resolved/keyframe-1.png',
    });
  });

  it('backfills transform lineage as derived stable refs after completion', () => {
    const result = backfillShotImagePrepOutputRefs(makePlan({ status: 'running' }), {
      planId: 'shot-1-image-prep',
      toolCallId: 'transform-1',
      success: true,
      providerId: 'provider-edit',
      outputs: [{ assetIndex: 0, mimeType: 'image/png', label: 'Clean keyframe' }],
    });

    expect(result.status).toBe('succeeded');
    expect(result.outputMediaRefs).toEqual([
      {
        refId: 'tool-result:transform-1:0',
        role: 'derived',
        locator: {
          type: 'tool-result',
          toolCallId: 'transform-1',
          assetIndex: 0,
        },
        label: 'Clean keyframe',
        mimeType: 'image/png',
        metadata: {
          prepPlanId: 'shot-1-image-prep',
          imageStrategy: 'transform-original',
          operationPlan: ['crop-panel', 'remove-text', 'inpaint'],
          providerId: 'provider-edit',
        },
      },
    ]);
  });

  it('blocks approved batch execution when cost is unknown', () => {
    const plan = makePlan({ status: 'approved' });
    const result = gateShotImagePrepBatch({
      plans: [plan],
      request: batchRequest([plan.planId]),
      estimates: [estimateShotImagePrepCost(plan)],
      availableTools: [
        {
          toolName: 'TransformImage',
          supportsSourceImage: true,
          supportsMasks: true,
          supportsReferences: true,
        },
      ],
    });

    expect(result.runnablePlans).toEqual([]);
    expect(result.skippedPlans).toEqual([plan]);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: 'missing-cost-estimate',
      }),
    ]);
    expect(result.summary.metadata).toEqual(
      expect.objectContaining({
        requested: 1,
        queued: 0,
        skipped: 1,
      }),
    );
  });

  it('queues approved plans when capability and known estimate are available', () => {
    const plan = makePlan({ status: 'approved' });
    const result = gateShotImagePrepBatch({
      plans: [plan],
      request: batchRequest([plan.planId]),
      estimates: [
        {
          planId: plan.planId,
          operationPlan: plan.operationPlan,
          estimateState: 'known',
          estimatedCost: 0.25,
        },
      ],
      availableTools: [
        {
          toolName: 'TransformImage',
          supportsSourceImage: true,
          supportsMasks: true,
          supportsReferences: true,
        },
      ],
    });

    expect(result.runnablePlans).toEqual([expect.objectContaining({ status: 'queued' })]);
    expect(result.skippedPlans).toEqual([]);
    expect(result.diagnostics).toEqual([]);
  });

  it('executes approved batches with bounded concurrency and per-shot backfill', async () => {
    let active = 0;
    let maxActive = 0;
    const execute = vi.fn(async (_name: string, args: Record<string, unknown>) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await Promise.resolve();
      active -= 1;
      return {
        success: true,
        data: {
          toolCallId: `call-${String(args.planId)}`,
          outputs: [{ assetIndex: 0, mimeType: 'image/png' }],
        },
      };
    });
    const plans = [
      makePlan({ planId: 'prep-1', shotId: 'shot-1', status: 'approved' }),
      makePlan({ planId: 'prep-2', shotId: 'shot-2', status: 'approved' }),
      makePlan({ planId: 'prep-3', shotId: 'shot-3', status: 'approved' }),
    ];

    const result = await executeShotImagePrepBatch({
      artifactId: 'artifact-1',
      plans,
      request: batchRequest(
        plans.map((plan) => plan.planId),
        { maxConcurrency: 2 },
      ),
      estimates: knownEstimates(plans),
      availableTools: [transformCapability],
      toolPort: { execute },
    });

    expect(maxActive).toBeLessThanOrEqual(2);
    expect(execute).toHaveBeenCalledTimes(3);
    expect(result.summary.status).toBe('succeeded');
    expect(result.plans.map((plan) => plan.outputMediaRefs?.[0]?.locator)).toEqual([
      { type: 'tool-result', toolCallId: 'call-prep-1', assetIndex: 0 },
      { type: 'tool-result', toolCallId: 'call-prep-2', assetIndex: 0 },
      { type: 'tool-result', toolCallId: 'call-prep-3', assetIndex: 0 },
    ]);
  });

  it('retries transient timeout failures only and preserves successful outputs', async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce({ success: false, error: 'provider timeout' })
      .mockResolvedValueOnce({
        success: true,
        data: { toolCallId: 'retry-success', outputs: [{ assetIndex: 0 }] },
      })
      .mockResolvedValueOnce({ success: false, error: 'invalid prompt' });
    const plans = [
      makePlan({ planId: 'prep-retry', shotId: 'shot-retry', status: 'approved' }),
      makePlan({ planId: 'prep-fail', shotId: 'shot-fail', status: 'approved' }),
    ];

    const result = await executeShotImagePrepBatch({
      artifactId: 'artifact-1',
      plans,
      request: batchRequest(
        plans.map((plan) => plan.planId),
        { maxConcurrency: 1 },
      ),
      estimates: knownEstimates(plans),
      availableTools: [transformCapability],
      toolPort: { execute },
    });

    expect(execute).toHaveBeenCalledTimes(3);
    expect(result.summary.status).toBe('partial');
    expect(result.plans[0]?.status).toBe('succeeded');
    expect(result.plans[0]?.outputMediaRefs).toHaveLength(1);
    expect(result.plans[1]?.status).toBe('failed');
    expect(result.plans[1]?.outputMediaRefs).toBeUndefined();
  });

  it('blocks budget-exceeding batch plans before provider execution', async () => {
    const plan = makePlan({ status: 'approved' });
    const execute = vi.fn();

    const result = await executeShotImagePrepBatch({
      artifactId: 'artifact-1',
      plans: [plan],
      request: {
        ...batchRequest([plan.planId]),
        budgetLimit: { maxEstimatedCost: 0.1 },
      },
      estimates: [
        {
          planId: plan.planId,
          operationPlan: plan.operationPlan,
          estimateState: 'known',
          estimatedCost: 1,
        },
      ],
      availableTools: [transformCapability],
      toolPort: { execute },
    });

    expect(execute).not.toHaveBeenCalled();
    expect(result.summary.metadata).toEqual(expect.objectContaining({ skipped: 1, succeeded: 0 }));
    expect(result.diagnostics).toEqual([expect.objectContaining({ code: 'budget-exceeded' })]);
  });

  it('reports cancellation before queued batch work starts', async () => {
    const controller = new AbortController();
    controller.abort();
    const plan = makePlan({ status: 'approved' });

    const result = await executeShotImagePrepBatch({
      artifactId: 'artifact-1',
      plans: [plan],
      request: batchRequest([plan.planId]),
      estimates: knownEstimates([plan]),
      availableTools: [transformCapability],
      toolPort: { execute: vi.fn() },
      signal: controller.signal,
    });

    expect(result.executions).toEqual([]);
    expect(result.summary.status).toBe('cancelled');
    expect(result.diagnostics).toEqual([
      expect.objectContaining({ message: expect.stringContaining('cancelled') }),
    ]);
  });
});

function makePlan(overrides: Partial<ShotImagePrepPlan> = {}): ShotImagePrepPlan {
  return {
    schemaVersion: 1,
    kind: 'shot-image-prep-plan',
    planId: 'shot-1-image-prep',
    sceneId: 'scene-1',
    shotId: 'shot-1',
    sourceMediaRefs: [sourceRef],
    imageStrategy: 'transform-original',
    operationPlan: ['crop-panel', 'remove-text', 'inpaint'],
    editInstruction: 'Remove dialogue bubbles and fill the background.',
    status: 'planned',
    ...overrides,
  };
}

function batchRequest(
  planIds: readonly string[],
  overrides: Partial<ShotImagePrepBatchRequest> = {},
): ShotImagePrepBatchRequest {
  return {
    batchId: 'batch-1',
    planIds,
    maxConcurrency: 2,
    retryPolicy: {
      maxAttempts: 2,
      retryOn: ['provider-timeout', 'rate-limit'],
    },
    failurePolicy: 'continue',
    ...overrides,
  };
}

function knownEstimates(plans: readonly ShotImagePrepPlan[]) {
  return plans.map((plan) => ({
    planId: plan.planId,
    operationPlan: plan.operationPlan,
    estimateState: 'known' as const,
    estimatedCost: 0.05,
  }));
}

const transformCapability = {
  toolName: 'TransformImage' as const,
  supportsSourceImage: true,
  supportsMasks: true,
  supportsReferences: true,
};

function tool(name: string, properties: Tool['parameters']['properties']): Tool {
  return {
    name,
    description: name,
    parameters: {
      type: 'object',
      properties,
    },
    category: 'generation',
    execute: async () => ({ success: true }),
  };
}

const sourceRef: StoryboardMediaRef = {
  refId: 'source-panel-1',
  role: 'source',
  locator: {
    type: 'tool-result',
    toolCallId: 'read-comic',
    assetIndex: 0,
  },
  label: 'Panel 1',
  mimeType: 'image/png',
};

const maskRef: StoryboardMediaRef = {
  refId: 'mask-1',
  role: 'mask',
  locator: {
    type: 'workspace-path',
    path: '${PROJECT}/masks/speech-mask.png',
  },
  label: 'Speech mask',
  mimeType: 'image/png',
};

const styleRef: StoryboardMediaRef = {
  refId: 'style-1',
  role: 'reference',
  locator: {
    type: 'workspace-path',
    path: '${PROJECT}/refs/style.png',
  },
  label: 'Style ref',
  mimeType: 'image/png',
};

function resolverWithProviderInputs(
  materializeProviderInputs: (
    request: ReferenceMaterializationRequest,
  ) => readonly ReferenceProviderInput[],
): ReferenceResolverService {
  return {
    materialize: async (request: ReferenceMaterializationRequest) => ({
      requestId: request.requestId,
      status: 'resolved' as const,
      providerInputs: materializeProviderInputs(request),
      diagnostics: [],
    }),
    resolveBatch: async () => ({
      batchId: 'unused',
      status: 'skipped' as const,
      items: [],
      summary: {
        total: 0,
        resolved: 0,
        unresolved: 0,
        partial: 0,
        skipped: 0,
        deduplicated: 0,
      },
      diagnostics: [],
    }),
  };
}

function referenceDescriptor(overrides: Partial<ReferenceDescriptor> = {}): ReferenceDescriptor {
  return {
    schemaVersion: 1,
    kind: 'reference-descriptor',
    referenceId: 'ref-1',
    sourceKind: 'shot-image-prep-plan',
    sourceId: 'prep-1',
    referenceKind: 'resource',
    role: 'source',
    modality: 'image',
    payload: {
      type: 'path',
      path: '${PROJECT}/keyframe.png',
      pathKind: 'variable',
    },
    ...overrides,
  };
}
