/**
 * Checkpoint Hooks Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  CheckpointHooks,
  createCheckpointHooks,
  InMemoryCheckpointStorage,
  createInMemoryCheckpointStorage,
  DEFAULT_CHECKPOINT_POLICY,
  type CheckpointPolicy,
} from '../checkpoint-hooks';
import type { AgentContext, AgentCheckpoint, ToolResultWithMeta } from '@uniedit/shared';

describe('CheckpointHooks', () => {
  let hooks: CheckpointHooks;
  let storage: InMemoryCheckpointStorage;

  const createMockContext = (iteration = 0): AgentContext => ({
    messages: [{ role: 'user', content: 'test' }],
    state: 'think',
    iteration,
    toolResults: [],
    metadata: { testKey: 'testValue' },
  });

  beforeEach(() => {
    storage = createInMemoryCheckpointStorage();
    hooks = createCheckpointHooks({
      agentName: 'test-agent',
      storage,
    });
  });

  describe('InMemoryCheckpointStorage', () => {
    it('should save and load checkpoint', async () => {
      const checkpoint: AgentCheckpoint = {
        id: 'cp_1',
        agentName: 'test-agent',
        context: createMockContext(),
        timestamp: Date.now(),
      };

      await storage.save(checkpoint);
      const loaded = await storage.load('cp_1');

      expect(loaded).toEqual(checkpoint);
    });

    it('should list checkpoints', async () => {
      await storage.save({
        id: 'cp_1',
        agentName: 'test-agent',
        context: createMockContext(),
        timestamp: Date.now(),
      });
      await storage.save({
        id: 'cp_2',
        agentName: 'other-agent',
        context: createMockContext(),
        timestamp: Date.now(),
      });

      const all = await storage.list();
      expect(all.length).toBe(2);

      const filtered = await storage.list('test-agent');
      expect(filtered.length).toBe(1);
      expect(filtered[0]?.agentName).toBe('test-agent');
    });

    it('should delete checkpoint', async () => {
      await storage.save({
        id: 'cp_1',
        agentName: 'test-agent',
        context: createMockContext(),
        timestamp: Date.now(),
      });

      await storage.delete('cp_1');
      const loaded = await storage.load('cp_1');

      expect(loaded).toBeUndefined();
    });

    it('should clear checkpoints', async () => {
      await storage.save({
        id: 'cp_1',
        agentName: 'test-agent',
        context: createMockContext(),
        timestamp: Date.now(),
      });
      await storage.save({
        id: 'cp_2',
        agentName: 'test-agent',
        context: createMockContext(),
        timestamp: Date.now(),
      });

      await storage.clear('test-agent');
      const all = await storage.list();

      expect(all.length).toBe(0);
    });
  });

  describe('CheckpointHooks', () => {
    describe('configuration', () => {
      it('should use default policy', () => {
        const policy = hooks.getPolicy();
        expect(policy).toEqual(DEFAULT_CHECKPOINT_POLICY);
      });

      it('should accept custom policy', () => {
        const customPolicy: Partial<CheckpointPolicy> = {
          iterationInterval: 10,
          afterToolCall: false,
        };
        hooks = createCheckpointHooks({
          agentName: 'test-agent',
          policy: customPolicy,
          storage,
        });

        const policy = hooks.getPolicy();
        expect(policy.iterationInterval).toBe(10);
        expect(policy.afterToolCall).toBe(false);
        expect(policy.maxCheckpoints).toBe(10); // default
      });
    });

    describe('manual checkpoint', () => {
      it('should create checkpoint manually', async () => {
        const context = createMockContext();
        await hooks.onExecuteStart('test input', context);

        const checkpoint = await hooks.createCheckpoint();

        expect(checkpoint.id).toMatch(/^cp_test-agent_/);
        expect(checkpoint.agentName).toBe('test-agent');
        expect(checkpoint.context.iteration).toBe(0);
      });

      it('should throw when no context available', async () => {
        await expect(hooks.createCheckpoint()).rejects.toThrow('No context available');
      });

      it('should call onCheckpointCreated callback', async () => {
        const onCreated = vi.fn();
        hooks = createCheckpointHooks({
          agentName: 'test-agent',
          storage,
          onCheckpointCreated: onCreated,
        });

        const context = createMockContext();
        await hooks.onExecuteStart('test input', context);
        await hooks.createCheckpoint();

        expect(onCreated).toHaveBeenCalledTimes(1);
      });
    });

    describe('restore checkpoint', () => {
      it('should restore from checkpoint', async () => {
        const context = createMockContext(5);
        await hooks.onExecuteStart('test input', context);
        const checkpoint = await hooks.createCheckpoint();

        const restored = await hooks.restoreCheckpoint(checkpoint.id);

        expect(restored.iteration).toBe(5);
        expect(restored.metadata.testKey).toBe('testValue');
      });

      it('should throw when checkpoint not found', async () => {
        await expect(hooks.restoreCheckpoint('nonexistent')).rejects.toThrow('not found');
      });

      it('should call onCheckpointRestored callback', async () => {
        const onRestored = vi.fn();
        hooks = createCheckpointHooks({
          agentName: 'test-agent',
          storage,
          onCheckpointRestored: onRestored,
        });

        const context = createMockContext();
        await hooks.onExecuteStart('test input', context);
        const checkpoint = await hooks.createCheckpoint();
        await hooks.restoreCheckpoint(checkpoint.id);

        expect(onRestored).toHaveBeenCalledTimes(1);
      });
    });

    describe('automatic checkpoint', () => {
      it('should create checkpoint based on iteration interval', async () => {
        hooks = createCheckpointHooks({
          agentName: 'test-agent',
          policy: { iterationInterval: 2, afterToolCall: false },
          storage,
        });

        const context = createMockContext(0);
        await hooks.onExecuteStart('test input', context);

        // Iteration 1 - no checkpoint
        await hooks.onIterationComplete(1, { ...context, iteration: 1 });
        let checkpoints = await hooks.listCheckpoints();
        expect(checkpoints.length).toBe(0);

        // Iteration 2 - checkpoint created
        await hooks.onIterationComplete(2, { ...context, iteration: 2 });
        checkpoints = await hooks.listCheckpoints();
        expect(checkpoints.length).toBe(1);
      });

      it('should create checkpoint after tool call', async () => {
        hooks = createCheckpointHooks({
          agentName: 'test-agent',
          policy: { iterationInterval: 0, afterToolCall: true },
          storage,
        });

        const context = createMockContext();
        await hooks.onExecuteStart('test input', context);

        const results: ToolResultWithMeta[] = [
          { success: true, callId: '1', name: 'TestTool' },
        ];
        await hooks.afterAct(results);

        const checkpoints = await hooks.listCheckpoints();
        expect(checkpoints.length).toBe(1);
      });

      it('should create checkpoint on error', async () => {
        const context = createMockContext();
        await hooks.onExecuteStart('test input', context);

        await hooks.onError(new Error('Test error'), context);

        const checkpoints = await hooks.listCheckpoints();
        expect(checkpoints.length).toBe(1);
      });
    });

    describe('checkpoint management', () => {
      it('should get latest checkpoint', async () => {
        const context = createMockContext();
        await hooks.onExecuteStart('test input', context);

        await hooks.createCheckpoint({ ...context, iteration: 1 });
        await new Promise((r) => setTimeout(r, 10)); // ensure different timestamp
        await hooks.createCheckpoint({ ...context, iteration: 2 });

        const latest = await hooks.getLatestCheckpoint();
        expect(latest?.context.iteration).toBe(2);
      });

      it('should list checkpoints', async () => {
        const context = createMockContext();
        await hooks.onExecuteStart('test input', context);

        await hooks.createCheckpoint();
        await hooks.createCheckpoint();

        const checkpoints = await hooks.listCheckpoints();
        expect(checkpoints.length).toBe(2);
      });

      it('should delete checkpoint', async () => {
        const context = createMockContext();
        await hooks.onExecuteStart('test input', context);

        const checkpoint = await hooks.createCheckpoint();
        await hooks.deleteCheckpoint(checkpoint.id);

        const checkpoints = await hooks.listCheckpoints();
        expect(checkpoints.length).toBe(0);
      });

      it('should clear all checkpoints', async () => {
        const context = createMockContext();
        await hooks.onExecuteStart('test input', context);

        await hooks.createCheckpoint();
        await hooks.createCheckpoint();
        await hooks.clearCheckpoints();

        const checkpoints = await hooks.listCheckpoints();
        expect(checkpoints.length).toBe(0);
      });
    });

    describe('auto cleanup', () => {
      it('should cleanup old checkpoints when exceeding maxCheckpoints', async () => {
        hooks = createCheckpointHooks({
          agentName: 'test-agent',
          policy: { maxCheckpoints: 2, autoCleanup: true },
          storage,
        });

        const context = createMockContext();
        await hooks.onExecuteStart('test input', context);

        await hooks.createCheckpoint({ ...context, iteration: 1 });
        await new Promise((r) => setTimeout(r, 10));
        await hooks.createCheckpoint({ ...context, iteration: 2 });
        await new Promise((r) => setTimeout(r, 10));
        await hooks.createCheckpoint({ ...context, iteration: 3 });

        const checkpoints = await hooks.listCheckpoints();
        expect(checkpoints.length).toBe(2);

        // Should keep the newest ones
        const iterations = checkpoints.map((cp) => cp.context.iteration).sort();
        expect(iterations).toEqual([2, 3]);
      });
    });

    describe('context cloning', () => {
      it('should clone context to prevent mutation', async () => {
        const context = createMockContext();
        await hooks.onExecuteStart('test input', context);

        const checkpoint = await hooks.createCheckpoint();

        // Mutate original context
        context.iteration = 999;
        context.metadata.testKey = 'mutated';

        // Checkpoint should be unchanged
        expect(checkpoint.context.iteration).toBe(0);
        expect(checkpoint.context.metadata.testKey).toBe('testValue');
      });
    });
  });
});
