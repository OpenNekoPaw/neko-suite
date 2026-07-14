import { describe, expect, it, vi } from 'vitest';
import type { IProjectMemoryManager } from '@neko/shared';
import {
  composeBeforeThinkHooks,
  createValidationCoordinator,
  createValidationCoordinatorFactory,
} from './validation-coordinator';

describe('ValidationCoordinator', () => {
  it('evaluates ordinary tool failures without stage state', () => {
    const coordinator = createValidationCoordinator({ now: () => 18 });
    coordinator.observe({
      kind: 'tool-failure',
      observedAt: 15,
      toolCallId: 'call-1',
      toolName: 'Write',
      error: 'permission denied',
    });

    const cycle = coordinator.evaluatePending();

    expect(cycle).toEqual(
      expect.objectContaining({
        timestamp: 18,
        signals: [expect.objectContaining({ kind: 'tool-failure', toolCallId: 'call-1' })],
        decisions: [expect.objectContaining({ action: 'repair', signalKind: 'tool-failure' })],
        actions: [expect.objectContaining({ kind: 'set-guidance' })],
      }),
    );
    expect(cycle).not.toHaveProperty('currentStage');
    expect(coordinator.evaluatePending()).toBeNull();
  });

  it('records provider observations and reports router failures without poisoning evaluation', async () => {
    const logger = { warn: vi.fn() };
    const coordinator = createValidationCoordinator({
      providerCardProject: {
        workspaceRoot: '/workspace',
        fsOps: {
          mkdir: vi.fn(async () => undefined),
          readFile: vi.fn(async () => ''),
          writeFile: vi.fn(async () => undefined),
        },
      },
      providerCardProjectRouterFactory: () => ({
        writeObservation: vi.fn(async () => {
          throw new Error('write failed');
        }),
      }),
      logger,
      now: () => 1,
    });
    coordinator.observe({
      kind: 'provider-card-observation',
      observedAt: 1,
      toolCallId: 'call-image',
      toolName: 'GenerateImage',
      mode: 'agentic',
      providerId: 'provider-1',
    });

    expect(coordinator.evaluatePending()).toEqual(
      expect.objectContaining({
        decisions: [expect.objectContaining({ action: 'continue' })],
      }),
    );
    await Promise.resolve();
    await Promise.resolve();
    expect(logger.warn).toHaveBeenCalledWith(
      'provider-card observation write failed',
      expect.objectContaining({ error: expect.any(Error) }),
    );
  });

  it('keeps memory extraction optional and factory-owned by ordinary session ports', async () => {
    const disabled = createValidationCoordinator({ now: () => 2 });
    await expect(
      disabled.extractMemory({ messages: [], sourceEventIds: ['event-1'] }),
    ).resolves.toEqual({
      kind: 'skipped',
      timestamp: 2,
      sourceEventIds: ['event-1'],
      reason: 'disabled',
    });

    const projectMemoryManager = createProjectMemory();
    const factory = createValidationCoordinatorFactory();
    const coordinator = factory({ projectMemoryManager, autoMemoryExtraction: true });
    expect(coordinator.getBeforeThinkHooks()).toEqual([]);
  });

  it('composes validation hooks after the base hook', async () => {
    const order: string[] = [];
    const hooks = composeBeforeThinkHooks(
      {
        beforeThink: async () => {
          order.push('base');
        },
      },
      [
        {
          name: 'validation',
          beforeThink: async () => {
            order.push('validation');
          },
        },
      ],
    );
    const context = { messages: [], iteration: 0 } as never;

    await hooks.beforeThink?.(context);

    expect(order).toEqual(['base', 'validation']);
  });
});

function createProjectMemory(): IProjectMemoryManager {
  return {
    load: vi.fn(async () => undefined),
    getContent: vi.fn(() => null),
    upsertEntry: vi.fn(async () => undefined),
    removeEntry: vi.fn(async () => undefined),
    on: vi.fn(),
    off: vi.fn(),
  };
}
