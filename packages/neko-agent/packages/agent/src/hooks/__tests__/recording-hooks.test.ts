/**
 * Recording Hooks Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  RecordingHooks,
  createRecordingHooks,
  DEFAULT_RECORDING_CONFIG,
  type RecordingConfig,
  type AgentRecording,
} from '../recording-hooks';
import type { AgentContext, AgentResult, AgentStep, ToolCallInfo, ToolResultWithMeta } from '@neko/shared';

describe('RecordingHooks', () => {
  let hooks: RecordingHooks;

  const createMockContext = (): AgentContext => ({
    messages: [{ role: 'user', content: 'test' }],
    state: 'init',
    iteration: 0,
    toolResults: [],
    metadata: {},
  });

  const createMockResult = (): AgentResult => ({
    success: true,
    response: 'Test response',
    steps: [],
    iterations: 1,
    timing: { startTime: 0, endTime: 100, duration: 100 },
  });

  const createMockStep = (): AgentStep => ({
    type: 'think',
    content: 'Thinking...',
    thinking: 'Extended thinking content',
    timestamp: Date.now(),
  });

  beforeEach(() => {
    hooks = createRecordingHooks();
  });

  describe('configuration', () => {
    it('should use default config', () => {
      const config = hooks.getConfig();
      expect(config).toEqual(DEFAULT_RECORDING_CONFIG);
    });

    it('should accept custom config', () => {
      const customConfig: Partial<RecordingConfig> = {
        recordToolArgs: false,
        maxSteps: 50,
      };
      hooks = createRecordingHooks(customConfig);
      const config = hooks.getConfig();
      expect(config.recordToolArgs).toBe(false);
      expect(config.maxSteps).toBe(50);
      expect(config.recordToolResults).toBe(true); // default
    });
  });

  describe('recording lifecycle', () => {
    it('should start recording on execute start', async () => {
      const context = createMockContext();
      await hooks.onExecuteStart('test input', context);

      expect(hooks.isRecording()).toBe(true);
      const recording = hooks.getRecording();
      expect(recording).not.toBeNull();
      expect(recording?.input).toBe('test input');
      expect(recording?.sessionId).toMatch(/^rec_/);
    });

    it('should end recording on execute end', async () => {
      const context = createMockContext();
      const result = createMockResult();

      await hooks.onExecuteStart('test input', context);
      await hooks.onExecuteEnd(result);

      expect(hooks.isRecording()).toBe(false);
      const recording = hooks.getRecording();
      expect(recording?.endTime).toBeDefined();
      expect(recording?.response).toBe('Test response');
      expect(recording?.success).toBe(true);
    });

    it('should record steps', async () => {
      const context = createMockContext();
      const step = createMockStep();

      await hooks.onExecuteStart('test input', context);
      await hooks.afterThink(step, context);

      const recording = hooks.getRecording();
      expect(recording?.steps.length).toBe(1);
      expect(recording?.steps[0]?.type).toBe('think');
      expect(recording?.steps[0]?.index).toBe(0);
    });

    it('should respect maxSteps limit', async () => {
      hooks = createRecordingHooks({ maxSteps: 2 });
      const context = createMockContext();

      await hooks.onExecuteStart('test input', context);

      for (let i = 0; i < 5; i++) {
        await hooks.afterThink(createMockStep(), context);
      }

      const recording = hooks.getRecording();
      expect(recording?.steps.length).toBe(2);
    });
  });

  describe('export/import', () => {
    it('should export to JSON', async () => {
      const context = createMockContext();
      const result = createMockResult();

      await hooks.onExecuteStart('test input', context);
      await hooks.afterThink(createMockStep(), context);
      await hooks.onExecuteEnd(result);

      const json = hooks.exportToJSON();
      const parsed = JSON.parse(json);

      expect(parsed.input).toBe('test input');
      expect(parsed.steps.length).toBe(1);
    });

    it('should throw when exporting without recording', () => {
      expect(() => hooks.exportToJSON()).toThrow('No recording available');
    });

    it('should import from JSON', () => {
      const recording: AgentRecording = {
        sessionId: 'test_session',
        startTime: Date.now(),
        input: 'imported input',
        steps: [],
        metadata: {},
        config: DEFAULT_RECORDING_CONFIG,
      };

      const imported = hooks.importFromJSON(JSON.stringify(recording));
      expect(imported.sessionId).toBe('test_session');
      expect(hooks.getRecording()?.input).toBe('imported input');
    });
  });

  describe('replay', () => {
    it('should replay recorded steps', async () => {
      const context = createMockContext();
      const result = createMockResult();

      await hooks.onExecuteStart('test input', context);
      await hooks.afterThink({ ...createMockStep(), content: 'Step 1' }, context);
      await hooks.afterThink({ ...createMockStep(), content: 'Step 2' }, context);
      await hooks.onExecuteEnd(result);

      const replayedSteps: string[] = [];
      for await (const step of hooks.replay()) {
        replayedSteps.push(step.content);
      }

      expect(replayedSteps).toEqual(['Step 1', 'Step 2']);
    });

    it('should support replay options', async () => {
      const context = createMockContext();
      const result = createMockResult();

      await hooks.onExecuteStart('test input', context);
      for (let i = 0; i < 5; i++) {
        await hooks.afterThink({ ...createMockStep(), content: `Step ${i}` }, context);
      }
      await hooks.onExecuteEnd(result);

      const replayedSteps: string[] = [];
      for await (const step of hooks.replay({ startFromStep: 1, endAtStep: 3 })) {
        replayedSteps.push(step.content);
      }

      expect(replayedSteps).toEqual(['Step 1', 'Step 2']);
    });

    it('should call onStep callback during replay', async () => {
      const context = createMockContext();
      const result = createMockResult();
      const onStep = vi.fn();

      await hooks.onExecuteStart('test input', context);
      await hooks.afterThink(createMockStep(), context);
      await hooks.onExecuteEnd(result);

      for await (const _ of hooks.replay({ onStep })) {
        // consume iterator
      }

      expect(onStep).toHaveBeenCalledTimes(1);
    });
  });

  describe('clear', () => {
    it('should clear recording', async () => {
      const context = createMockContext();
      await hooks.onExecuteStart('test input', context);

      hooks.clear();

      expect(hooks.getRecording()).toBeNull();
      expect(hooks.isRecording()).toBe(false);
    });
  });

  describe('config options', () => {
    it('should strip thinking when recordThinking is false', async () => {
      hooks = createRecordingHooks({ recordThinking: false });
      const context = createMockContext();
      const step = createMockStep();

      await hooks.onExecuteStart('test input', context);
      await hooks.afterThink(step, context);

      const recording = hooks.getRecording();
      expect(recording?.steps[0]?.thinking).toBeUndefined();
    });

    it('should strip tool args when recordToolArgs is false', async () => {
      hooks = createRecordingHooks({ recordToolArgs: false });
      const context = createMockContext();
      const step: AgentStep = {
        type: 'act',
        content: 'Acting...',
        toolCalls: [{ name: 'TestTool', arguments: { secret: 'value' } }],
        timestamp: Date.now(),
      };

      await hooks.onExecuteStart('test input', context);
      await hooks.afterThink(step, context);

      const recording = hooks.getRecording();
      expect(recording?.steps[0]?.toolCalls?.[0]?.arguments).toEqual({});
    });
  });
});
