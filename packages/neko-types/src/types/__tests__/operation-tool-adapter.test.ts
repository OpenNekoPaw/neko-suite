import { describe, expect, it } from 'vitest';
import type {
  IOperationToolAdapter,
  OperationTool,
  OperationToolAdapterContext,
  OperationToolIntent,
  OperationToolPlan,
} from '../operation-tool-adapter';
import {
  createOperationToolAdapterRegistry,
  createDomainRouter,
  getOperationToolCreativeDomain,
  isOperationTool,
  isOperationToolPlanTraceable,
  operationToolDomainMetadata,
} from '../operation-tool-adapter';

const operationTool: OperationTool = {
  kind: 'operation',
  name: 'timeline.element.update',
  description: 'Update a timeline element via EditOperation.',
  category: 'timeline',
  parameters: { type: 'object', properties: {} },
  requiresConfirmation: true,
  traits: {
    cost: 'free',
    reversible: true,
    locality: 'local',
    impactLevel: 'low',
  },
  operation: {
    kind: 'operation',
    domain: 'timeline',
    editOperationTypes: ['element.update'],
    requiresRationale: true,
    reversible: true,
  },
};

function createOperationPlan(): OperationToolPlan {
  return {
    id: 'plan-update-shot-3',
    intentId: 'intent-update-shot-3',
    rationaleId: 'rat-shot-3-recovery-guidance',
    requiresUserApproval: false,
    reversible: true,
    createdAt: 1_771_718_408_000,
    operations: [
      {
        type: 'element.update',
        meta: {
          id: 'op-update-shot-3',
          timestamp: 1_771_718_408_000,
          source: 'ai',
          description: 'Update shot 3 prompt metadata.',
        },
        payload: {
          trackId: 'video-track-1',
          elementId: 'clip-3',
          updates: { name: 'Shot 3 — adjusted' },
        },
        before: { updates: { name: 'Shot 3' } },
      },
    ],
  };
}

describe('operation tool adapter contracts', () => {
  it('identifies Tool(kind=operation) metadata without a separate capability type', () => {
    expect(isOperationTool(operationTool)).toBe(true);
    expect(isOperationTool({ ...operationTool, perception: { kind: 'perception' } })).toBe(false);
    expect(
      isOperationTool({
        kind: 'perception',
        name: 'perception.image.classify',
        description: 'Classify image labels.',
        category: 'analysis',
        parameters: { type: 'object', properties: {} },
        isReadOnly: true,
        execute: async () => ({ success: true }),
      }),
    ).toBe(false);
  });

  it('requires planned EditOperations to remain traceable to a rationale', () => {
    const plan = createOperationPlan();

    expect(isOperationToolPlanTraceable(plan)).toBe(true);
    expect(JSON.parse(JSON.stringify(plan))).toEqual(plan);
  });

  it('registers domain adapters and finds the planner for an intent', async () => {
    const context: OperationToolAdapterContext = {
      rationale: {
        id: 'rat-1',
        decision: 'update-timeline-clip',
        reason: 'The selected clip should be renamed.',
        confidence: 'high',
        observationIds: ['obs-1'],
        evidenceIds: [],
        createdAt: 1,
      },
      contextPacketId: 'ctx-1',
    };
    const intent: OperationToolIntent = {
      id: 'intent-1',
      domain: 'timeline',
      summary: 'Rename selected timeline clip.',
      rationaleId: 'rat-1',
      targetIds: ['clip-3'],
      createdAt: 2,
    };
    const adapter: IOperationToolAdapter = {
      domain: 'timeline',
      canPlan: (candidate) => candidate.domain === 'timeline',
      plan: async (candidate) => ({
        ...createOperationPlan(),
        id: 'plan-1',
        intentId: candidate.id,
        rationaleId: candidate.rationaleId,
        createdAt: 3,
      }),
    };

    const registry = createOperationToolAdapterRegistry();
    registry.register(adapter);

    const planner = registry.findPlanner(intent, context);
    expect(planner).toBe(adapter);
    await expect(planner?.plan(intent, context)).resolves.toEqual(
      expect.objectContaining({ intentId: 'intent-1', rationaleId: 'rat-1' }),
    );

    registry.unregister('timeline');
    expect(registry.findPlanner(intent, context)).toBeUndefined();
  });

  it('maps operation domains to normalized creative domains', () => {
    expect(operationToolDomainMetadata('model')).toEqual({
      id: 'scene',
      source: 'operation-tool',
      operationDomain: 'model',
      servicePortId: 'scene-render',
    });
    expect(operationToolDomainMetadata('puppet')).toEqual({
      id: 'puppet',
      source: 'operation-tool',
      operationDomain: 'puppet',
      servicePortId: 'puppet-render',
    });
    expect(getOperationToolCreativeDomain(operationTool)).toEqual(
      expect.objectContaining({
        id: 'timeline',
        operationDomain: 'timeline',
      }),
    );
  });

  it('routes domain metadata to service port identity without runtime imports', () => {
    const router = createDomainRouter();
    const plan = router.route(
      {
        id: 'intent-model-1',
        domain: operationToolDomainMetadata('model'),
      },
      [
        {
          id: 'scene-tools',
          domain: { id: 'scene', source: 'capability' },
          servicePortId: 'scene-render',
        },
      ],
    );

    expect(plan).toEqual({
      intentId: 'intent-model-1',
      domain: operationToolDomainMetadata('model'),
      servicePortId: 'scene-render',
      capabilityId: 'scene-tools',
    });
  });
});
