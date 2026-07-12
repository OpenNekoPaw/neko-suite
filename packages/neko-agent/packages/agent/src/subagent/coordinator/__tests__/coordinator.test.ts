/**
 * Coordinator Tests — multi-phase SubAgent orchestration
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Coordinator, createCoordinator } from '../coordinator';
import type { CoordinatorConfig, CoordinatorDeps, CoordinatorEvent } from '../types';
import type { SubAgentResult, SubAgentEvent } from '../../types';
import type { ChildRunScope } from '@neko-agent/types';

// =============================================================================
// Mock Helpers
// =============================================================================

type EventCallback = (event: SubAgentEvent) => void;

function createMockDeps(): CoordinatorDeps & { _eventCallbacks: EventCallback[] } {
  const eventCallbacks: EventCallback[] = [];

  return {
    _eventCallbacks: eventCallbacks,
    subAgentManager: {
      spawn: vi.fn().mockImplementation(async (scope: ChildRunScope) => scope),
      spawnBatch: vi.fn(),
      getStatus: vi.fn().mockReturnValue('completed'),
      getResult: vi
        .fn()
        .mockImplementation(async (scope: ChildRunScope): Promise<SubAgentResult> => {
          return {
            scope,
            id: scope.childRunId,
            status: 'completed',
            response: `Result for ${scope.childRunId}`,
            duration: 1000,
            iterations: 3,
          };
        }),
      getResults: vi.fn(),
      cancel: vi.fn(),
      cancelRun: vi.fn(),
      listByRun: vi.fn().mockReturnValue([]),
      onEvent: vi.fn().mockImplementation((cb: EventCallback) => {
        eventCallbacks.push(cb);
        return () => {
          const idx = eventCallbacks.indexOf(cb);
          if (idx >= 0) eventCallbacks.splice(idx, 1);
        };
      }),
      cleanupRun: vi.fn(),
    },
    contextBridge: {
      extractSummary: vi.fn().mockReturnValue('summary'),
      mergeResults: vi.fn().mockReturnValue([]),
    },
    runScope: { conversationId: 'conv-1', runId: 'run-1' },
    parentRunId: 'parent-1',
  };
}

function createConfig(overrides: Partial<CoordinatorConfig> = {}): CoordinatorConfig {
  return {
    id: 'coord-1',
    description: 'Test coordinator',
    tasks: [
      { id: 'task-1', description: 'First task', prompt: 'Do task 1', agentType: 'general' },
      { id: 'task-2', description: 'Second task', prompt: 'Do task 2', agentType: 'general' },
    ],
    requireConfirmation: false, // Skip confirmation for most tests
    ...overrides,
  };
}

async function collectEvents(
  coordinator: Coordinator,
  options: { confirmAfter?: number } = {},
): Promise<CoordinatorEvent[]> {
  const events: CoordinatorEvent[] = [];

  for await (const event of coordinator.start()) {
    events.push(event);

    // Auto-confirm if requested
    if (event.type === 'confirmation_required' && options.confirmAfter !== undefined) {
      setTimeout(() => coordinator.confirm(true), options.confirmAfter);
    }
  }

  return events;
}

// =============================================================================
// Tests
// =============================================================================

describe('Coordinator', () => {
  let deps: ReturnType<typeof createMockDeps>;

  beforeEach(() => {
    deps = createMockDeps();
  });

  describe('initialization', () => {
    it('should create with config', () => {
      const coord = createCoordinator(createConfig(), deps);
      expect(coord.id).toBe('coord-1');
      expect(coord.phase).toBe('plan');
    });

    it('should initialize task pool from config', () => {
      const coord = createCoordinator(createConfig(), deps);
      const progress = coord.getProgress();
      expect(progress.total).toBe(2);
      expect(progress.pending).toBe(2);
    });
  });

  describe('plan phase', () => {
    it('should emit plan event with summary', async () => {
      const events = await collectEvents(createCoordinator(createConfig(), deps));
      const planEvent = events.find((e) => e.type === 'phase_changed' && e.phase === 'plan');
      expect(planEvent).toBeDefined();
      expect(planEvent!.summary).toContain('Test coordinator');
      expect(planEvent!.summary).toContain('2 task(s)');
    });
  });

  describe('confirmation phase', () => {
    it('should emit confirmation_required when requireConfirmation=true', async () => {
      const config = createConfig({ requireConfirmation: true });
      const coord = createCoordinator(config, deps);

      const events: CoordinatorEvent[] = [];
      for await (const event of coord.start()) {
        events.push(event);
        if (event.type === 'confirmation_required') {
          // Confirm immediately
          coord.confirm(true);
        }
      }

      const confirmEvent = events.find((e) => e.type === 'confirmation_required');
      expect(confirmEvent).toBeDefined();
    });

    it('should abort when user denies confirmation', async () => {
      const config = createConfig({ requireConfirmation: true });
      const coord = createCoordinator(config, deps);

      const events: CoordinatorEvent[] = [];
      for await (const event of coord.start()) {
        events.push(event);
        if (event.type === 'confirmation_required') {
          coord.confirm(false); // Deny
        }
      }

      const doneEvent = events.find((e) => e.type === 'coordinator_done');
      expect(doneEvent).toBeDefined();
      expect(doneEvent!.summary).toContain('cancelled');

      // Should NOT have spawned any SubAgents
      expect(deps.subAgentManager.spawn).not.toHaveBeenCalled();
    });

    it('should skip confirmation when requireConfirmation=false', async () => {
      const events = await collectEvents(createCoordinator(createConfig(), deps));
      const confirmEvent = events.find((e) => e.type === 'confirmation_required');
      expect(confirmEvent).toBeUndefined();
    });
  });

  describe('execute phase', () => {
    it('should dispatch tasks and collect results', async () => {
      const events = await collectEvents(createCoordinator(createConfig(), deps));

      // Should have spawned 2 SubAgents
      expect(deps.subAgentManager.spawn).toHaveBeenCalledTimes(2);

      // Should have completion events
      const completedEvents = events.filter((e) => e.type === 'task_completed');
      expect(completedEvents.length).toBeGreaterThanOrEqual(1);

      // Should end with done
      const doneEvent = events.find((e) => e.type === 'coordinator_done');
      expect(doneEvent).toBeDefined();
    });

    it('should respect maxConcurrency', async () => {
      const config = createConfig({
        maxConcurrency: 1,
        tasks: [
          { id: 'a', description: 'A', prompt: 'Do A', agentType: 'general' },
          { id: 'b', description: 'B', prompt: 'Do B', agentType: 'general' },
          { id: 'c', description: 'C', prompt: 'Do C', agentType: 'general' },
        ],
      });

      await collectEvents(createCoordinator(config, deps));

      // All 3 should eventually be spawned
      expect(deps.subAgentManager.spawn).toHaveBeenCalledTimes(3);
    });

    it('should handle task dependencies', async () => {
      const config = createConfig({
        tasks: [
          { id: 'step-1', description: 'First', prompt: 'Do 1', agentType: 'general' },
          {
            id: 'step-2',
            description: 'Second',
            prompt: 'Do 2',
            agentType: 'general',
            dependencies: ['step-1'],
          },
        ],
      });

      const events = await collectEvents(createCoordinator(config, deps));

      // Both should complete
      const doneEvent = events.find((e) => e.type === 'coordinator_done');
      expect(doneEvent).toBeDefined();
      expect(doneEvent!.progress?.completed).toBe(2);
    });

    it('should include parent context in SubAgent prompt', async () => {
      const config = createConfig({ parentContext: 'We are editing a sci-fi video' });
      await collectEvents(createCoordinator(config, deps));

      const spawnCall = (deps.subAgentManager.spawn as ReturnType<typeof vi.fn>).mock.calls[0];
      const subConfig = spawnCall?.[1];
      expect(subConfig?.prompt).toContain('Context from Coordinator');
      expect(subConfig?.prompt).toContain('sci-fi video');
    });

    it('should localize worker prompt wrappers and pass locale to SubAgents', async () => {
      const config = createConfig({
        parentContext: '我们正在编辑中文分镜',
        locale: 'zh-CN',
      });
      await collectEvents(createCoordinator(config, deps));

      const spawnCall = (deps.subAgentManager.spawn as ReturnType<typeof vi.fn>).mock.calls[0];
      const subConfig = spawnCall?.[1];
      expect(subConfig?.prompt).toContain('## 协调器上下文');
      expect(subConfig?.prompt).toContain('## 任务');
      expect(subConfig?.prompt).not.toContain('## Context from Coordinator');
      expect(subConfig?.locale).toBe('zh-CN');
    });
  });

  describe('cancel', () => {
    it('should cancel all workers', async () => {
      const config = createConfig({ requireConfirmation: true });
      const coord = createCoordinator(config, deps);

      const events: CoordinatorEvent[] = [];
      for await (const event of coord.start()) {
        events.push(event);
        if (event.type === 'confirmation_required') {
          coord.cancel();
        }
      }

      expect(deps.subAgentManager.cancel).not.toHaveBeenCalled();
      // Should end with done event
      const doneEvent = events.find((e) => e.type === 'coordinator_done');
      expect(doneEvent).toBeDefined();
    }, 10000);
  });

  describe('getResults', () => {
    it('should return collected notifications', async () => {
      const coord = createCoordinator(createConfig(), deps);
      await collectEvents(coord);

      const results = coord.getResults();
      expect(results.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('error handling', () => {
    it('should handle SubAgent spawn failure gracefully', async () => {
      (deps.subAgentManager.spawn as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Spawn limit exceeded'),
      );

      const events = await collectEvents(createCoordinator(createConfig(), deps));

      // Should still reach done phase
      const doneEvent = events.find((e) => e.type === 'coordinator_done');
      expect(doneEvent).toBeDefined();
    });

    it('should handle failed SubAgent results', async () => {
      (deps.subAgentManager.getResult as ReturnType<typeof vi.fn>).mockImplementation(
        async (scope: ChildRunScope) => ({
          scope,
          id: scope.childRunId,
          status: 'failed',
          error: 'Agent crashed',
          duration: 500,
        }),
      );

      const events = await collectEvents(createCoordinator(createConfig(), deps));

      const failedEvents = events.filter((e) => e.type === 'task_failed');
      expect(failedEvents.length).toBeGreaterThanOrEqual(1);
    });
  });
});
