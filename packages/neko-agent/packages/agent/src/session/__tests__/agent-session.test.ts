/**
 * AgentSession Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Draft, ExecutionPlan, Task } from '@neko-agent/types';
import { AgentSession, PLAN_MODE_SYSTEM_REMINDER } from '../agent-session';
import type { AgentSessionConfig, AgentEvent } from '../types';
import type {
  IService,
  IToolRegistry,
  AgentStep,
  ChatMessage,
  IProjectMemoryManager,
  ToolResultWithMeta,
} from '@neko/shared';
import type { IJournalWriter } from '../types';

vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
  return {
    ...actual,
    watch: vi.fn(() => ({ close() {} })),
  };
});

// =============================================================================
// Helpers
// =============================================================================

async function collectEvents(iterable: AsyncIterable<AgentEvent>): Promise<AgentEvent[]> {
  const events: AgentEvent[] = [];
  for await (const event of iterable) {
    events.push(event);
  }
  return events;
}

function getCompletedRuns(session: AgentSession) {
  return ((
    session as unknown as { _runStore?: { listCompleted(): readonly unknown[] } }
  )._runStore?.listCompleted() ?? []) as readonly unknown[];
}

function getInternalRunStore(session: AgentSession) {
  return (
    session as unknown as {
      _runStore?: { getActive(): unknown; listCompleted(): readonly unknown[] };
    }
  )._runStore;
}

function parseLatestWrite<T>(writes: readonly { path: string; data: string }[], path: string): T {
  const match = [...writes].reverse().find((write) => write.path === path);
  expect(match).toBeDefined();
  return JSON.parse(match!.data) as T;
}

// =============================================================================
// Mocks
// =============================================================================

/** Mock steps yielded by AgentExecutor.executeStream */
function createMockExecutorModule(steps: AgentStep[]) {
  return {
    executeStream: vi.fn(async function* (..._args: unknown[]) {
      for (const step of steps) {
        yield step;
      }
    }),
    execute: vi.fn(),
    abort: vi.fn(),
    getState: vi.fn().mockReturnValue('done'),
    addHook: vi.fn(),
    removeHook: vi.fn(),
    getHook: vi.fn(),
    createCheckpoint: vi.fn(),
    setToolInjectionManager: vi.fn(),
    updateServiceOptions: vi.fn(),
  };
}

function createMockService(): IService {
  return {
    chat: vi.fn(),
    chatStream: vi.fn(),
    embed: vi.fn(),
  };
}

function createMockToolRegistry(): IToolRegistry {
  return {
    register: vi.fn(),
    unregister: vi.fn(),
    get: vi.fn(),
    has: vi.fn(),
    list: vi.fn().mockReturnValue([]),
    listByCategory: vi.fn().mockReturnValue([]),
    execute: vi.fn(),
    toToolDefinitions: vi.fn().mockReturnValue([]),
  };
}

function createConfig(overrides?: Partial<AgentSessionConfig>): AgentSessionConfig {
  return {
    service: createMockService(),
    toolRegistry: createMockToolRegistry(),
    systemPrompt: 'You are a helpful assistant.',
    maxIterations: 10,
    ...overrides,
  };
}

function createMockProjectMemory(initialContent: string | null = null): IProjectMemoryManager {
  let content = initialContent;
  const listeners: Array<(value: string | null) => void> = [];

  return {
    load: vi.fn().mockResolvedValue(undefined),
    getContent: vi.fn(() => content),
    upsertEntry: vi.fn(async (key: string, body: string) => {
      const sections = parseSections(content);
      const next = new Map(sections.map((section) => [section.key, section.body]));
      next.set(key, body);
      content = Array.from(next.entries())
        .map(([sectionKey, sectionBody]) =>
          sectionBody.trim().length > 0
            ? `## ${sectionKey}\n${sectionBody.trimEnd()}`
            : `## ${sectionKey}`,
        )
        .join('\n\n');
      if (content) {
        content += '\n';
      }
      for (const listener of listeners) {
        listener(content);
      }
    }),
    removeEntry: vi.fn().mockResolvedValue(undefined),
    on: vi.fn((_event, listener) => {
      listeners.push(listener);
    }),
    off: vi.fn((_event, listener) => {
      const index = listeners.indexOf(listener);
      if (index >= 0) listeners.splice(index, 1);
    }),
  };
}

function createMockJournalWriter(): IJournalWriter & {
  appendEvent: ReturnType<typeof vi.fn>;
  appendSnapshot: ReturnType<typeof vi.fn>;
  flush: ReturnType<typeof vi.fn>;
  dispose: ReturnType<typeof vi.fn>;
} {
  return {
    appendEvent: vi.fn(async (seq: number) => `evt-${seq}`),
    appendSnapshot: vi.fn().mockResolvedValue(undefined),
    flush: vi.fn().mockResolvedValue(undefined),
    dispose: vi.fn().mockResolvedValue(undefined),
  };
}

function parseSections(content: string | null): Array<{ key: string; body: string }> {
  if (!content) return [];

  const lines = content.split('\n');
  const sections: Array<{ key: string; body: string }> = [];
  let currentKey: string | null = null;
  let currentLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith('## ')) {
      if (currentKey !== null) {
        sections.push({ key: currentKey, body: currentLines.join('\n') });
      }
      currentKey = line.slice(3).trim();
      currentLines = [];
    } else if (currentKey !== null) {
      currentLines.push(line);
    }
  }

  if (currentKey !== null) {
    sections.push({ key: currentKey, body: currentLines.join('\n') });
  }

  return sections;
}

// =============================================================================
// Mock AgentExecutor — we replace the internal _executor after construction
// =============================================================================

function injectMockExecutor(session: AgentSession, steps: AgentStep[]) {
  const mockExec = createMockExecutorModule(steps);
  // Access private _executor via bracket notation
  (session as unknown as Record<string, unknown>)['_executor'] = mockExec;
  return mockExec;
}

// =============================================================================
// Tests
// =============================================================================

describe('AgentSession', () => {
  let config: AgentSessionConfig;

  beforeEach(() => {
    config = createConfig();
  });

  // -------------------------------------------------------------------------
  // 1. Constructor
  // -------------------------------------------------------------------------

  describe('constructor', () => {
    it('should initialize with system prompt in history', () => {
      const session = new AgentSession(config);
      const history = session.getHistory();

      expect(history.length).toBe(1);
      expect(history[0]!.role).toBe('system');
      expect(history[0]!.content).toBe('You are a helpful assistant.');
    });

    it('should default execution mode to auto', () => {
      const session = new AgentSession(config);
      expect(session.getExecutionMode()).toBe('auto');
    });
  });

  // -------------------------------------------------------------------------
  // 2. execute() — simple text response
  // -------------------------------------------------------------------------

  describe('execute() simple response', () => {
    it('should yield text + iteration + done events', async () => {
      const session = new AgentSession(config);
      const steps: AgentStep[] = [{ type: 'think', content: 'Hello world', timestamp: Date.now() }];
      injectMockExecutor(session, steps);

      const events = await collectEvents(session.execute('Hi'));

      const textEvents = events.filter((e) => e.type === 'text');
      expect(textEvents.length).toBe(1);
      expect(textEvents[0]!.content).toBe('Hello world');

      const doneEvents = events.filter((e) => e.type === 'done');
      expect(doneEvents.length).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  // 3. execute() — with tool calls
  // -------------------------------------------------------------------------

  describe('execute() with tool calls', () => {
    it('should yield tool_call and tool_result events', async () => {
      const session = new AgentSession(config);
      const steps: AgentStep[] = [
        {
          type: 'think',
          content: '',
          toolCalls: [{ id: 'call_1', name: 'read_file', arguments: { path: '/a.ts' } }],
          timestamp: Date.now(),
        },
        {
          type: 'act',
          content: 'Executed 1 tool(s)',
          toolResults: [
            {
              success: true,
              data: 'file content',
              callId: 'call_1',
              name: 'read_file',
            } as ToolResultWithMeta,
          ],
          timestamp: Date.now(),
        },
        {
          type: 'think',
          content: 'Here is the file content.',
          timestamp: Date.now(),
        },
      ];
      injectMockExecutor(session, steps);

      const events = await collectEvents(session.execute('Read a.ts'));

      const toolCallEvents = events.filter((e) => e.type === 'tool_call');
      expect(toolCallEvents.length).toBe(1);
      expect(toolCallEvents[0]!.toolCall!.name).toBe('read_file');

      const toolResultEvents = events.filter((e) => e.type === 'tool_result');
      expect(toolResultEvents.length).toBe(1);
      expect(toolResultEvents[0]!.toolResult!.success).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // 4. execute() — user message added to history (not duplicated)
  // -------------------------------------------------------------------------

  describe('execute() user message in history', () => {
    it('should add user message to history and pass skipUserMessage', async () => {
      const session = new AgentSession(config);
      const steps: AgentStep[] = [{ type: 'think', content: 'Response', timestamp: Date.now() }];
      const mockExec = injectMockExecutor(session, steps);

      await collectEvents(session.execute('Hello'));

      // User message should be in history
      const history = session.getHistory();
      const userMessages = history.filter((m) => m.role === 'user');
      expect(userMessages.length).toBe(1);
      expect(userMessages[0]!.content).toBe('Hello');

      // Executor should receive skipUserMessage: true
      const callArgs = mockExec.executeStream.mock.calls[0] as
        | [string, { skipUserMessage?: boolean }]
        | undefined;
      expect(callArgs?.[1]?.skipUserMessage).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // 5. execute() — rejects concurrent execution
  // -------------------------------------------------------------------------

  describe('execute() concurrent rejection', () => {
    it('should yield error when already running', async () => {
      const session = new AgentSession(config);
      injectMockExecutor(session, []);

      // Simulate running state by setting _isRunning directly
      (session as unknown as Record<string, boolean>)['_isRunning'] = true;

      // Attempt execution while "running"
      const events = await collectEvents(session.execute('Second'));
      const errorEvents = events.filter((e) => e.type === 'error');
      expect(errorEvents.length).toBe(1);
      expect(errorEvents[0]!.error!.message).toContain('already running');
    });
  });

  describe('execute() failure lifecycle', () => {
    it('ends the IDC run as failed with a serializable error cause', async () => {
      const session = new AgentSession(
        createConfig({
          executionMode: 'plan',
          stageTracking: {},
        }),
      );
      const mockExec = injectMockExecutor(session, []);
      mockExec.executeStream.mockImplementationOnce(
        // eslint-disable-next-line require-yield
        async function* () {
          throw new Error('executor blew up');
        },
      );

      const events = await collectEvents(session.execute('Break the pipeline'));

      expect(events).toEqual([
        expect.objectContaining({
          type: 'error',
          error: expect.objectContaining({ message: 'executor blew up' }),
        }),
      ]);
      expect(session.getActiveIdcRun()).toBeNull();
      expect(getCompletedRuns(session)).toEqual([
        expect.objectContaining({
          runKind: 'plan-mode',
          workflowId: 'plan-mode',
          status: 'failed',
          error: expect.objectContaining({
            code: 'execute_failed',
            message: 'executor blew up',
            cause: expect.objectContaining({
              name: 'Error',
              message: 'executor blew up',
            }),
          }),
        }),
      ]);
    });
  });

  // -------------------------------------------------------------------------
  // 6. execute() — plan mode injects reminder
  // -------------------------------------------------------------------------

  describe('execute() plan mode', () => {
    it('should prepend PLAN_MODE_SYSTEM_REMINDER to input', async () => {
      const session = new AgentSession(createConfig({ executionMode: 'plan' }));
      const steps: AgentStep[] = [
        { type: 'think', content: 'Plan response', timestamp: Date.now() },
      ];
      const mockExec = injectMockExecutor(session, steps);

      await collectEvents(session.execute('Build a feature'));

      const callArgs = mockExec.executeStream.mock.calls[0] as [string] | undefined;
      const inputArg = callArgs?.[0] ?? '';
      expect(inputArg).toContain(PLAN_MODE_SYSTEM_REMINDER);
      expect(inputArg).toContain('Build a feature');
    });
  });

  describe('project memory integration', () => {
    it('writes extracted facts to project memory and logs memory_extraction', async () => {
      const projectMemory = createMockProjectMemory();
      const journalWriter = createMockJournalWriter();
      const session = new AgentSession(
        createConfig({
          projectMemoryManager: projectMemory,
          journalWriter,
        }),
      );
      const steps: AgentStep[] = [
        { type: 'think', content: '我会按你的偏好继续处理。', timestamp: Date.now() },
      ];
      injectMockExecutor(session, steps);

      await collectEvents(session.execute('我喜欢中文说明，避免 global-memory'));

      expect(projectMemory.upsertEntry).toHaveBeenCalledWith(
        'User Preferences',
        expect.stringContaining('我喜欢中文说明，避免 global-memory'),
      );
      expect(journalWriter.appendEvent).toHaveBeenCalledWith(
        expect.any(Number),
        expect.objectContaining({
          type: 'memory_extraction',
          memoryExtraction: expect.objectContaining({
            timestamp: expect.any(Number),
            writeStatus: 'written',
            sourceEventIds: expect.arrayContaining(['evt-1']),
          }),
        }),
      );
      expect(session.getFeedbackCycles()).toEqual([
        expect.objectContaining({
          currentStage: null,
          activeRunId: null,
          signals: [
            expect.objectContaining({
              kind: 'memory-extraction',
            }),
          ],
          decisions: [
            {
              action: 'memorize',
              signalKind: 'memory-extraction',
              factCount: 1,
              writeStatus: 'written',
            },
          ],
          actions: [
            {
              kind: 'clear-guidance',
              reason: 'memorize',
            },
          ],
        }),
      ]);
    });

    it('does not extract project memory when autoMemoryExtraction is disabled', async () => {
      const projectMemory = createMockProjectMemory();
      const session = new AgentSession(
        createConfig({
          projectMemoryManager: projectMemory,
          autoMemoryExtraction: false,
        }),
      );
      const steps: AgentStep[] = [{ type: 'think', content: '好的', timestamp: Date.now() }];
      injectMockExecutor(session, steps);

      await collectEvents(session.execute('我喜欢中文说明'));

      expect(projectMemory.upsertEntry).not.toHaveBeenCalled();
    });

    it('injects recalled project memories into the execution snapshot', async () => {
      const projectMemory = createMockProjectMemory(
        '## User Preferences\n- prefer dark theme for editor work\n',
      );
      const session = new AgentSession(
        createConfig({
          projectMemoryManager: projectMemory,
        }),
      );
      const steps: AgentStep[] = [{ type: 'think', content: 'Noted', timestamp: Date.now() }];
      const mockExec = injectMockExecutor(session, steps);
      let capturedSystemPrompt = '';
      mockExec.executeStream.mockImplementationOnce(async function* (...args: unknown[]) {
        const options = args[1] as { messages?: ChatMessage[] } | undefined;
        capturedSystemPrompt = String(options?.messages?.[0]?.content ?? '');
        for (const step of steps) {
          yield step;
        }
      });

      await collectEvents(session.execute('please keep dark theme settings'));

      expect(capturedSystemPrompt).toContain('## Recalled Memories');
      expect(capturedSystemPrompt).toContain('dark theme');
    });

    it('does not inject recalled memories when memoryRecall is disabled', async () => {
      const projectMemory = createMockProjectMemory(
        '## User Preferences\n- prefer dark theme for editor work\n',
      );
      const session = new AgentSession(
        createConfig({
          projectMemoryManager: projectMemory,
          memoryRecall: false,
        }),
      );
      const steps: AgentStep[] = [{ type: 'think', content: 'Noted', timestamp: Date.now() }];
      const mockExec = injectMockExecutor(session, steps);
      let capturedSystemPrompt = '';
      mockExec.executeStream.mockImplementationOnce(async function* (...args: unknown[]) {
        const options = args[1] as { messages?: ChatMessage[] } | undefined;
        capturedSystemPrompt = String(options?.messages?.[0]?.content ?? '');
        for (const step of steps) {
          yield step;
        }
      });

      await collectEvents(session.execute('please keep dark theme settings'));

      expect(capturedSystemPrompt).not.toContain('## Recalled Memories');
      expect(capturedSystemPrompt).toContain('## Project Memory');
    });

    it('does not backfill loaded history into project memory on the next turn', async () => {
      const projectMemory = createMockProjectMemory();
      const session = new AgentSession(
        createConfig({
          projectMemoryManager: projectMemory,
        }),
      );
      session.loadHistory(
        [
          { role: 'system', content: 'You are a helpful assistant.' },
          { role: 'user', content: '我喜欢中文说明' },
          { role: 'assistant', content: '收到' },
        ],
        [[], ['evt-old-user'], ['evt-old-assistant']],
      );

      const steps: AgentStep[] = [{ type: 'think', content: '继续处理', timestamp: Date.now() }];
      injectMockExecutor(session, steps);

      await collectEvents(session.execute('继续'));

      expect(projectMemory.upsertEntry).not.toHaveBeenCalled();
    });

    it('disables automatic extraction when journalAsSSOT is turned off', async () => {
      const projectMemory = createMockProjectMemory();
      const session = new AgentSession(
        createConfig({
          projectMemoryManager: projectMemory,
          journalAsSSOT: false,
        }),
      );
      const steps: AgentStep[] = [{ type: 'think', content: '好的', timestamp: Date.now() }];
      injectMockExecutor(session, steps);

      await collectEvents(session.execute('我喜欢中文说明'));

      expect(projectMemory.upsertEntry).not.toHaveBeenCalled();
    });
  });

  describe('compaction logging', () => {
    it('skips journal compaction events when compactLogging is disabled', async () => {
      const journalWriter = createMockJournalWriter();
      const session = new AgentSession(
        createConfig({
          journalWriter,
          compactLogging: false,
        }),
      );

      (session as unknown as Record<string, unknown>)['_history'] = [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'old user message' },
        { role: 'assistant', content: 'old assistant reply' },
      ] satisfies ChatMessage[];
      (session as unknown as Record<string, unknown>)['_historyEventIds'] = [
        [],
        ['evt-user'],
        ['evt-assistant'],
      ];
      (session as unknown as Record<string, unknown>)['_compressor'] = {
        compress: vi.fn().mockResolvedValue({
          messages: [
            {
              message: { role: 'system', content: 'You are a helpful assistant.' },
              sourceIndexes: [0],
              isSummary: false,
              compressedTokens: 5,
            },
            {
              message: { role: 'system', content: 'summary' },
              sourceIndexes: [1, 2],
              isSummary: true,
              compressedTokens: 5,
            },
          ],
          originalTokens: 100,
          compressedTokens: 20,
          compressionRatio: 0.2,
          messagesRemoved: 2,
          summariesCreated: 1,
          timestamp: Date.now(),
        }),
        estimateTokens: vi.fn().mockReturnValue(20),
      };

      await session.compressContext();

      expect(journalWriter.appendEvent).not.toHaveBeenCalledWith(
        expect.any(Number),
        expect.objectContaining({ type: 'compaction' }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // 7. cancel()
  // -------------------------------------------------------------------------

  describe('cancel()', () => {
    it('should call executor abort', () => {
      const session = new AgentSession(config);
      const mockExec = injectMockExecutor(session, []);

      session.cancel();

      expect(mockExec.abort).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // 8. clearHistory()
  // -------------------------------------------------------------------------

  describe('clearHistory()', () => {
    it('should preserve system prompt after clearing', async () => {
      const session = new AgentSession(config);
      const steps: AgentStep[] = [{ type: 'think', content: 'Hi', timestamp: Date.now() }];
      injectMockExecutor(session, steps);

      await collectEvents(session.execute('Hello'));
      expect(session.getHistory().length).toBeGreaterThan(1);

      session.clearHistory();

      const history = session.getHistory();
      expect(history.length).toBe(1);
      expect(history[0]!.role).toBe('system');
      expect(history[0]!.content).toBe('You are a helpful assistant.');
    });
  });

  // -------------------------------------------------------------------------
  // 9. Skill injection — permission rule lifecycle
  // -------------------------------------------------------------------------

  describe('skill injection permission rule cleanup', () => {
    it('should add allow rules on applySkillInjection and remove on removeSkillInjection', () => {
      const session = new AgentSession(config);

      // Access internal _permissionHooks
      const permHooks = (session as unknown as Record<string, unknown>)['_permissionHooks'] as
        | { addAllowRule: ReturnType<typeof vi.fn>; removeAllowRule: ReturnType<typeof vi.fn> }
        | undefined;

      // If permissionHooks exist, spy on them
      if (permHooks) {
        const addSpy = vi.spyOn(permHooks, 'addAllowRule');
        const removeSpy = vi.spyOn(permHooks, 'removeAllowRule');

        session.applySkillInjection({
          name: 'test-skill',
          systemPrompt: 'Test prompt',
          allowedTools: ['Read', 'Bash(git:*)'],
          type: 'skill',
        });

        expect(addSpy).toHaveBeenCalledWith('Read');
        expect(addSpy).toHaveBeenCalledWith('Bash(git:*)');

        session.removeSkillInjection('test-skill');

        expect(removeSpy).toHaveBeenCalledWith('Read');
        expect(removeSpy).toHaveBeenCalledWith('Bash(git:*)');
      }
    });

    it('should clear tracked rules even without permissionHooks', () => {
      const session = new AgentSession(config);

      session.applySkillInjection({
        name: 'test-skill',
        systemPrompt: 'Test prompt',
        allowedTools: ['Read'],
        type: 'skill',
      });

      // Should not throw when removing
      expect(() => session.removeSkillInjection('test-skill')).not.toThrow();
    });

    it('should remove prompt section on removeSkillInjection', () => {
      const session = new AgentSession(config);

      session.applySkillInjection({
        name: 'test-skill',
        systemPrompt: 'Skill-specific instructions',
        type: 'skill',
      });

      // System prompt should include skill content
      const historyBefore = session.getHistory();
      expect(historyBefore[0]!.content).toContain('Skill-specific instructions');

      session.removeSkillInjection('test-skill');

      // System prompt should no longer include skill content
      const historyAfter = session.getHistory();
      expect(historyAfter[0]!.content).not.toContain('Skill-specific instructions');
    });
  });

  // -------------------------------------------------------------------------
  // 10. dispose()
  // -------------------------------------------------------------------------

  describe('dispose()', () => {
    it('should cancel execution and clear pending confirmations', () => {
      const session = new AgentSession(config);
      const mockExec = injectMockExecutor(session, []);

      session.dispose();

      expect(mockExec.abort).toHaveBeenCalled();
      expect(session.isRunning()).toBe(false);
      expect(session.getPendingConfirmations()).toEqual([]);
    });

    it('aborts an active IDC run before tearing down stage tracking', () => {
      const session = new AgentSession(
        createConfig({
          stageTracking: {},
        }),
      );
      const runStore = getInternalRunStore(session);

      session.startWorkflowRun('wf', 'run-active');
      session.dispose();

      expect(runStore?.getActive()).toBeNull();
      expect(runStore?.listCompleted()).toEqual([
        expect.objectContaining({
          id: 'run-active',
          runKind: 'wf',
          workflowId: 'wf',
          status: 'aborted',
        }),
      ]);
    });

    it('disposes a runtime-provided artifact watcher', () => {
      const start = vi.fn().mockResolvedValue(undefined);
      const disposeWatcher = vi.fn().mockResolvedValue(undefined);
      const artifactWatcherFactory = vi.fn(() => ({
        start,
        dispose: disposeWatcher,
      }));
      const session = new AgentSession(
        createConfig({
          stageTracking: {},
          workspace: {
            root: '/tmp/proj',
            fsOps: {
              mkdir: vi.fn(async () => undefined),
              appendFile: vi.fn(async () => undefined),
            },
          },
          artifactWatcherFactory,
        }),
      );

      expect(artifactWatcherFactory).toHaveBeenCalledTimes(1);
      expect(start).toHaveBeenCalledTimes(1);

      session.dispose();

      expect(disposeWatcher).toHaveBeenCalledTimes(1);
    });
  });

  // -------------------------------------------------------------------------
  // IDC stage tracking
  // -------------------------------------------------------------------------

  describe('stage tracking', () => {
    it('without stageTracking config: getCurrentStage() returns null', () => {
      const session = new AgentSession(createConfig());
      expect(session.getCurrentStage()).toBeNull();
      expect(session.enterStage('apply')).toBe(false);
    });

    it('with stageTracking config: initial stage applies its persona and enterStage swaps to Implement', async () => {
      const creation = {
        name: 'creation-persona',
        description: 'creation persona',
        type: 'skill',
        source: 'builtin',
        allowedTools: [],
        content: '# creation-persona',
      };
      const execution = {
        name: 'execution-persona',
        description: 'execution persona',
        type: 'skill',
        source: 'builtin',
        allowedTools: [],
        content: '# execution-persona',
      };
      const registry = {
        getSkill: (n: string) =>
          n === 'creation-persona' ? creation : n === 'execution-persona' ? execution : undefined,
        listSkills: () => [creation, execution],
        getSkillByCommand: () => undefined,
        skillCount: 2,
      };
      const applyCalls: string[] = [];
      const service = {
        apply: vi.fn(async (s: { name: string }) => {
          applyCalls.push(s.name);
          return { name: s.name, systemPrompt: `prompt:${s.name}`, allowedTools: [] };
        }),
      };

      const session = new AgentSession(
        createConfig({
          stageTracking: {
            skillRegistry: registry as never,
            skillService: service as never,
            initialStage: 'draft',
          },
        }),
      );

      // Initial sync is fire-and-forget; wait for it.
      await session.syncStagePersona();

      expect(session.getCurrentStage()).toBe('draft');
      expect(applyCalls[0]).toBe('creation-persona');

      const changed = session.enterStage('apply');
      expect(changed).toBe(true);
      await new Promise((r) => setImmediate(r));

      expect(session.getCurrentStage()).toBe('apply');
      expect(applyCalls).toContain('execution-persona');
    });

    it('dispose unsubscribes the binding', async () => {
      const creation = {
        name: 'creation-persona',
        description: '',
        type: 'skill',
        source: 'builtin',
        allowedTools: [],
        content: '',
      };
      const registry = {
        getSkill: (n: string) => (n === 'creation-persona' ? creation : undefined),
        listSkills: () => [creation],
        getSkillByCommand: () => undefined,
        skillCount: 1,
      };
      const service = {
        apply: vi.fn(async (s: { name: string }) => ({
          name: s.name,
          systemPrompt: '',
          allowedTools: [],
        })),
      };

      const session = new AgentSession(
        createConfig({
          stageTracking: {
            skillRegistry: registry as never,
            skillService: service as never,
            initialStage: 'draft',
          },
        }),
      );
      await session.syncStagePersona();

      session.dispose();

      // After dispose, stage tracking goes dormant.
      expect(session.getCurrentStage()).toBeNull();
      expect(session.enterStage('apply')).toBe(false);
    });

    it('starts an IDC run automatically when execute() begins', async () => {
      const session = new AgentSession(
        createConfig({
          executionMode: 'plan',
          stageTracking: {},
        }),
      );
      injectMockExecutor(session, [
        { type: 'think', content: 'Draft first', timestamp: Date.now() },
      ]);

      await collectEvents(session.execute('Outline the implementation'));

      expect(session.getActiveIdcRun()).toBeNull();
      expect(getCompletedRuns(session)).toEqual([
        expect.objectContaining({
          runKind: 'plan-mode',
          workflowId: 'plan-mode',
          status: 'completed',
        }),
      ]);
    });

    it('startIdcRun writes runKind while keeping the legacy workflowId mirror', () => {
      const session = new AgentSession(
        createConfig({
          stageTracking: {},
        }),
      );

      session.startIdcRun('artifact-resume', 'run-kind');

      expect(session.getActiveIdcRun()).toEqual(
        expect.objectContaining({
          id: 'run-kind',
          runKind: 'artifact-resume',
          workflowId: 'artifact-resume',
          status: 'running',
        }),
      );
    });
  });

  describe('feedback observation', () => {
    it('captures tool failures as repair feedback cycles', async () => {
      const session = new AgentSession(config);
      injectMockExecutor(session, [
        {
          type: 'act',
          content: 'Executed 1 tool(s)',
          toolCalls: [{ id: 'call-write', name: 'Write', arguments: { path: 'draft.md' } }],
          toolResults: [
            {
              callId: 'call-write',
              success: false,
              error: 'permission denied',
            } as ToolResultWithMeta,
          ],
          timestamp: 100,
        },
      ]);

      await collectEvents(session.execute('write the draft'));

      expect(session.getFeedbackCycles()).toEqual([
        expect.objectContaining({
          currentStage: null,
          activeRunId: null,
          signals: [
            {
              kind: 'tool-failure',
              observedAt: 100,
              toolCallId: 'call-write',
              toolName: 'Write',
              error: 'permission denied',
            },
          ],
          decisions: [
            {
              action: 'repair',
              signalKind: 'tool-failure',
              toolCallId: 'call-write',
              toolName: 'Write',
              error: 'permission denied',
            },
          ],
          actions: [
            {
              kind: 'set-guidance',
              guidance:
                '- Repair the failed tool step for Write. Diagnose the error "permission denied" and choose a safer fallback if needed.',
              signalKinds: ['tool-failure'],
            },
          ],
        }),
      ]);
    });

    it('captures QualityCheck results as feedback cycles by correlating tool call ids', async () => {
      const session = new AgentSession(config);
      injectMockExecutor(session, [
        {
          type: 'act',
          content: 'Executed 1 tool(s)',
          toolCalls: [{ id: 'call-qc', name: 'QualityCheck', arguments: {} }],
          toolResults: [
            {
              callId: 'call-qc',
              success: true,
              data: {
                totalScenes: 2,
                passed: 1,
                failed: 1,
                evaluations: [
                  { index: 1, passed: true, finalScore: 82 },
                  {
                    index: 2,
                    passed: false,
                    finalScore: 41,
                    remediations: [{ action: 'regen' }],
                  },
                ],
              },
            } as ToolResultWithMeta,
          ],
          timestamp: 200,
        },
      ]);

      await collectEvents(session.execute('check scene quality'));

      expect(session.getFeedbackCycles()).toEqual([
        expect.objectContaining({
          currentStage: null,
          activeRunId: null,
          signals: [
            {
              kind: 'quality-check',
              observedAt: 200,
              toolCallId: 'call-qc',
              toolName: 'QualityCheck',
              totalScenes: 2,
              passed: 1,
              failed: 1,
              failingSceneIndexes: [2],
              remediationCount: 1,
            },
          ],
          decisions: [
            {
              action: 'repair',
              signalKind: 'quality-check',
              toolCallId: 'call-qc',
              toolName: 'QualityCheck',
              totalScenes: 2,
              failed: 1,
              failingSceneIndexes: [2],
              remediationCount: 1,
            },
          ],
          actions: [
            {
              kind: 'set-guidance',
              guidance:
                '- Repair the failing quality-check result. Focus on scene(s) 2 and apply 1 suggested remediation step(s) as needed.',
              signalKinds: ['quality-check'],
            },
          ],
        }),
      ]);
    });

    it('injects feedback guidance into the next turn only, then clears it after consumption', async () => {
      const session = new AgentSession(config);
      injectMockExecutor(session, [
        {
          type: 'act',
          content: 'Executed 1 tool(s)',
          toolCalls: [{ id: 'call-write', name: 'Write', arguments: { path: 'draft.md' } }],
          toolResults: [
            {
              callId: 'call-write',
              success: false,
              error: 'permission denied',
            } as ToolResultWithMeta,
          ],
          timestamp: 300,
        },
      ]);

      await collectEvents(session.execute('write the draft'));

      let secondTurnPrompt = '';
      const secondTurnExecutor = injectMockExecutor(session, [
        { type: 'think', content: 'Retrying with guidance', timestamp: 301 },
      ]);
      secondTurnExecutor.executeStream.mockImplementationOnce(async function* (...args: unknown[]) {
        const options = args[1] as { messages?: ChatMessage[] } | undefined;
        secondTurnPrompt = String(options?.messages?.[0]?.content ?? '');
        yield { type: 'think', content: 'Retrying with guidance', timestamp: 301 };
      });

      await collectEvents(session.execute('try again'));

      expect(secondTurnPrompt).toContain('## Feedback Guidance');
      expect(secondTurnPrompt).toContain('permission denied');

      let thirdTurnPrompt = '';
      const thirdTurnExecutor = injectMockExecutor(session, [
        { type: 'think', content: 'Normal turn', timestamp: 302 },
      ]);
      thirdTurnExecutor.executeStream.mockImplementationOnce(async function* (...args: unknown[]) {
        const options = args[1] as { messages?: ChatMessage[] } | undefined;
        thirdTurnPrompt = String(options?.messages?.[0]?.content ?? '');
        yield { type: 'think', content: 'Normal turn', timestamp: 302 };
      });

      await collectEvents(session.execute('one more turn'));

      expect(thirdTurnPrompt).not.toContain('## Feedback Guidance');
    });
  });

  // -------------------------------------------------------------------------
  // StageGuardian wiring
  // -------------------------------------------------------------------------

  describe('stage guardian', () => {
    function minimalStageTrackingConfig() {
      const skill = {
        name: 'creation-persona',
        description: 'creation persona',
        type: 'skill',
        source: 'builtin',
        allowedTools: [],
        content: '# creation-persona',
      };
      const registry = {
        getSkill: (n: string) => (n === 'creation-persona' ? skill : undefined),
        listSkills: () => [skill],
        getSkillByCommand: () => undefined,
        skillCount: 1,
      };
      const service = {
        apply: vi.fn(async (s: { name: string }) => ({
          name: s.name,
          systemPrompt: '',
          allowedTools: [],
        })),
      };
      return { registry, service };
    }

    it('disabled when stageTracking is not configured', () => {
      const session = new AgentSession(createConfig());
      expect(session.getStageGuardianIssues()).toEqual([]);
      // Subscribing when disabled returns a no-op unsubscriber.
      const unsub = session.onStageGuardianIssue(() => {});
      expect(typeof unsub).toBe('function');
      unsub();
    });

    it('flags stage-out-of-order when enterStage("implement") is the first entry', () => {
      const { registry, service } = minimalStageTrackingConfig();
      const session = new AgentSession(
        createConfig({
          stageTracking: {
            skillRegistry: registry as never,
            skillService: service as never,
          },
        }),
      );
      const issues: string[] = [];
      session.onStageGuardianIssue((i) => issues.push(i.code));

      session.enterStage('apply');

      expect(issues).toContain('stage-out-of-order');
      expect(session.getStageGuardianIssues().length).toBeGreaterThan(0);
    });

    it('no out-of-order issue when specify precedes implement', () => {
      const { registry, service } = minimalStageTrackingConfig();
      const session = new AgentSession(
        createConfig({
          stageTracking: {
            skillRegistry: registry as never,
            skillService: service as never,
          },
        }),
      );
      const issues: string[] = [];
      session.onStageGuardianIssue((i) => issues.push(i.code));

      session.enterStage('draft');
      session.enterStage('apply');

      expect(issues.filter((c) => c === 'stage-out-of-order')).toEqual([]);
    });

    it('opt-out via guardian:false leaves session without a guardian', () => {
      const { registry, service } = minimalStageTrackingConfig();
      const session = new AgentSession(
        createConfig({
          stageTracking: {
            skillRegistry: registry as never,
            skillService: service as never,
            guardian: false,
          },
        }),
      );
      const issues: string[] = [];
      session.onStageGuardianIssue((i) => issues.push(i.code));

      session.enterStage('apply');

      expect(issues).toEqual([]);
      expect(session.getStageGuardianIssues()).toEqual([]);
    });

    it('dispose clears guardian state', () => {
      const { registry, service } = minimalStageTrackingConfig();
      const session = new AgentSession(
        createConfig({
          stageTracking: {
            skillRegistry: registry as never,
            skillService: service as never,
          },
        }),
      );

      session.enterStage('apply'); // raises out-of-order
      expect(session.getStageGuardianIssues().length).toBeGreaterThan(0);

      session.dispose();
      expect(session.getStageGuardianIssues()).toEqual([]);
    });

    it('workspace config provisions NekoPaths + JSONL sink that writes bus events', async () => {
      const { registry, service } = minimalStageTrackingConfig();
      const writes: Array<{ path: string; data: string }> = [];
      const dirs: string[] = [];
      const fsOps = {
        async mkdir(path: string): Promise<void> {
          dirs.push(path);
        },
        async appendFile(path: string, data: string): Promise<void> {
          writes.push({ path, data });
        },
      };

      const session = new AgentSession(
        createConfig({
          stageTracking: {
            skillRegistry: registry as never,
            skillService: service as never,
            initialStage: 'apply',
          },
          workspace: { root: '/tmp/proj', fsOps },
        }),
      );

      const paths = session.getNekoPaths();
      expect(paths).not.toBeNull();
      expect(paths!.root).toBe('/tmp/proj/.neko');
      expect(paths!.log('events')).toBe('/tmp/proj/.neko/logs/events.jsonl');

      const bus = session.getEventBus()!;
      bus.emit({
        channel: 'execution.apply.committed',
        runId: 'run-1',
        kind: 'tool:GenerateImage',
        at: 42,
      });
      await session.flushWorkspaceSink();

      expect(dirs).toContain('/tmp/proj/.neko/logs');
      expect(writes).toHaveLength(1);
      expect(writes[0]!.path).toBe('/tmp/proj/.neko/logs/events.jsonl');
      const parsed = JSON.parse(writes[0]!.data.trim()) as {
        seq: number;
        event: { channel: string; kind: string };
      };
      expect(parsed.seq).toBe(1);
      expect(parsed.event.channel).toBe('execution.apply.committed');
      expect(parsed.event.kind).toBe('tool:GenerateImage');
    });

    it('flushWorkspaceSink forces pending runtime-state debounce writes to land immediately', async () => {
      vi.useFakeTimers();
      try {
        const { registry, service } = minimalStageTrackingConfig();
        const writes: Array<{ path: string; data: string }> = [];
        const fsOps = {
          async mkdir(): Promise<void> {},
          async writeFile(path: string, data: string, _encoding: 'utf-8'): Promise<void> {
            writes.push({ path, data });
          },
        };

        const session = new AgentSession(
          createConfig({
            stageTracking: {
              skillRegistry: registry as never,
              skillService: service as never,
              initialStage: 'draft',
            },
            workspace: { root: '/tmp/proj', fsOps },
          }),
        );

        session.startWorkflowRun('wf-debounce', 'run-1');
        await Promise.resolve();

        expect(
          writes.filter((entry) => entry.path === '/tmp/proj/.neko/state/idc-runtime.json'),
        ).toHaveLength(0);

        await session.flushWorkspaceSink();

        const runtimeWrites = writes.filter(
          (entry) => entry.path === '/tmp/proj/.neko/state/idc-runtime.json',
        );
        expect(runtimeWrites).toHaveLength(1);

        const snapshot = JSON.parse(runtimeWrites[0]!.data) as {
          run: {
            active?: { id: string; status: string };
          };
        };
        expect(snapshot.run.active).toEqual(
          expect.objectContaining({
            id: 'run-1',
            status: 'running',
          }),
        );

        session.dispose();
      } finally {
        vi.useRealTimers();
      }
    });

    it('writes draft / plan / task artifacts through ArtifactService and binds them to the active run', async () => {
      const { registry, service } = minimalStageTrackingConfig();
      const writes: Array<{ path: string; data: string }> = [];
      const fsOps = {
        async mkdir(): Promise<void> {},
        async appendFile(path: string, data: string): Promise<void> {
          writes.push({ path, data });
        },
        async writeFile(path: string, data: string, _encoding: 'utf-8'): Promise<void> {
          writes.push({ path, data });
        },
      };

      const session = new AgentSession(
        createConfig({
          stageTracking: {
            skillRegistry: registry as never,
            skillService: service as never,
            initialStage: 'plan',
          },
          workspace: { root: '/tmp/proj', fsOps },
        }),
      );
      session.startWorkflowRun('wf-artifacts', 'run-1');

      const draft: Draft = {
        id: 'draft-1',
        title: 'Trailer draft',
        status: 'pending_review',
        domain: 'cut',
        createdAt: 1,
        updatedAt: 2,
        intent: 'Tell the product story.',
        approach: 'Build to a single reveal.',
        artifact: 'A fast teaser cut.',
      };
      const plan: ExecutionPlan = {
        id: 'plan-1',
        draftId: 'draft-1',
        title: 'Trailer plan',
        status: 'ready',
        createdAt: 3,
        updatedAt: 4,
        steps: [],
      };
      const task: Task = {
        id: 'task-1',
        createdAt: 5,
        updatedAt: 6,
        items: [{ id: 'step-1', content: 'Export teaser', status: 'pending' }],
      };

      await session.writeDraftArtifact(draft);
      await session.writePlanArtifact(plan);
      await session.writeTaskArtifact(task);
      await session.flushWorkspaceSink();

      expect(
        writes.filter((entry) => entry.path === '/tmp/proj/.neko/drafts/draft-run-1.md'),
      ).toHaveLength(1);
      expect(
        writes.filter((entry) => entry.path === '/tmp/proj/.neko/plans/plan-run-1.md'),
      ).toHaveLength(1);
      expect(
        writes.filter((entry) => entry.path === '/tmp/proj/.neko/tasks/task-run-1.md'),
      ).toHaveLength(1);
      expect(session.getArtifactsForRun('run-1').map((record) => record.kind)).toEqual([
        'draft',
        'plan',
        'task',
      ]);
      expect(session.getActiveIdcRun()).toEqual(
        expect.objectContaining({
          id: 'run-1',
          draft,
          plan,
          task,
          artifactBindings: [
            {
              kind: 'draft',
              artifactId: 'draft-1',
              path: '/tmp/proj/.neko/drafts/draft-run-1.md',
              updatedAt: 2,
            },
            {
              kind: 'plan',
              artifactId: 'plan-1',
              path: '/tmp/proj/.neko/plans/plan-run-1.md',
              updatedAt: 4,
            },
            {
              kind: 'task',
              artifactId: 'task-1',
              path: '/tmp/proj/.neko/tasks/task-run-1.md',
              updatedAt: 6,
            },
          ],
        }),
      );

      const snapshot = parseLatestWrite<{
        run: {
          active?: {
            artifacts?: readonly { kind: string; artifactId: string; path: string }[];
          };
        };
      }>(writes, '/tmp/proj/.neko/state/idc-runtime.json');
      const artifactIndexSnapshot = parseLatestWrite<{
        entries: Array<{ kind: string; artifactId: string; runId: string }>;
      }>(writes, '/tmp/proj/.neko/cache/artifact-index.json');
      expect(snapshot.run.active?.artifacts).toEqual([
        {
          kind: 'draft',
          artifactId: 'draft-1',
          path: '/tmp/proj/.neko/drafts/draft-run-1.md',
          updatedAt: 2,
        },
        {
          kind: 'plan',
          artifactId: 'plan-1',
          path: '/tmp/proj/.neko/plans/plan-run-1.md',
          updatedAt: 4,
        },
        {
          kind: 'task',
          artifactId: 'task-1',
          path: '/tmp/proj/.neko/tasks/task-run-1.md',
          updatedAt: 6,
        },
      ]);
      expect(artifactIndexSnapshot.entries).toEqual([
        expect.objectContaining({ kind: 'draft', artifactId: 'draft-1', runId: 'run-1' }),
        expect.objectContaining({ kind: 'plan', artifactId: 'plan-1', runId: 'run-1' }),
        expect.objectContaining({ kind: 'task', artifactId: 'task-1', runId: 'run-1' }),
      ]);
    });

    it('restores task artifacts from ArtifactService and replays IDC task projection on startup', async () => {
      const restoredTask: Task = {
        id: 'task-restore',
        createdAt: 5,
        updatedAt: 6,
        items: [{ id: 'restore-step', content: 'Replay checklist', status: 'pending' }],
      };
      const taskRecord = {
        kind: 'task',
        runId: 'run-restore',
        artifactId: 'task-restore',
        path: '/tmp/proj/.neko/tasks/task-run-restore.md',
        updatedAt: 6,
        content: '# Tasks',
        value: restoredTask,
      };
      const projection = {
        syncTask: vi.fn(async () => ['idc:run-restore:restore-step']),
        clearRun: vi.fn(async () => undefined),
      };
      const artifactService = {
        restore: vi.fn(async () => [taskRecord]),
        listRunIds: vi.fn(() => ['run-restore']),
        listByRunId: vi.fn((runId: string) => (runId === 'run-restore' ? [taskRecord] : [])),
        getByRunId: vi.fn(() => null),
        write: vi.fn(),
        writeDraft: vi.fn(),
        writePlan: vi.fn(),
        writeTask: vi.fn(),
        ingestObservedArtifact: vi.fn(),
        flush: vi.fn(async () => undefined),
        dispose: vi.fn(async () => undefined),
      };
      const fsOps = {
        async mkdir(): Promise<void> {},
        async appendFile(): Promise<void> {},
        async writeFile(): Promise<void> {},
        async readFile(): Promise<string> {
          throw Object.assign(new Error('ENOENT: no such file or directory'), { code: 'ENOENT' });
        },
      };
      const session = new AgentSession(
        createConfig({
          workspace: { root: '/tmp/proj', fsOps },
          artifactService: artifactService as never,
          idcTaskProjection: projection as never,
        }),
      );

      await session.flushWorkspaceSink();

      expect(artifactService.restore).toHaveBeenCalledTimes(1);
      expect(session.getArtifactsForRun('run-restore')).toEqual([taskRecord]);
      expect(projection.syncTask).toHaveBeenCalledWith({
        runId: 'run-restore',
        task: restoredTask,
        artifact: {
          kind: 'task',
          artifactId: 'task-restore',
          path: '/tmp/proj/.neko/tasks/task-run-restore.md',
          updatedAt: 6,
        },
      });
      session.dispose();
    });

    it('restores stage/run runtime state and hydrates run artifacts on startup', async () => {
      const { registry, service } = minimalStageTrackingConfig();
      const writes: Array<{ path: string; data: string }> = [];
      const restoredDraft: Draft = {
        id: 'draft-active',
        title: 'Recovered draft',
        status: 'pending_review',
        domain: 'cut',
        createdAt: 10,
        updatedAt: 11,
        intent: 'Recover intent',
        approach: 'Recover approach',
        artifact: 'Recover artifact',
      };
      const restoredPlan: ExecutionPlan = {
        id: 'plan-done',
        draftId: 'draft-active',
        title: 'Recovered plan',
        status: 'ready',
        createdAt: 20,
        updatedAt: 21,
        steps: [],
      };
      const restoredTask: Task = {
        id: 'task-active',
        createdAt: 30,
        updatedAt: 31,
        items: [{ id: 'check-1', content: 'Resume apply', status: 'pending' }],
      };
      const draftRecord = {
        kind: 'draft',
        runId: 'run-active',
        artifactId: 'draft-active',
        path: '/tmp/proj/.neko/drafts/draft-run-active.md',
        updatedAt: 11,
        content: '# Draft',
        value: restoredDraft,
      };
      const planRecord = {
        kind: 'plan',
        runId: 'run-done',
        artifactId: 'plan-done',
        path: '/tmp/proj/.neko/plans/plan-run-done.md',
        updatedAt: 21,
        content: '# Plan',
        value: restoredPlan,
      };
      const taskRecord = {
        kind: 'task',
        runId: 'run-active',
        artifactId: 'task-active',
        path: '/tmp/proj/.neko/tasks/task-run-active.md',
        updatedAt: 31,
        content: '# Tasks',
        value: restoredTask,
      };
      const projection = {
        syncTask: vi.fn(async () => ['idc:run-active:check-1']),
        clearRun: vi.fn(async () => undefined),
      };
      const artifactService = {
        restore: vi.fn(async () => [draftRecord, planRecord, taskRecord]),
        listRunIds: vi.fn(() => ['run-active', 'run-done']),
        listByRunId: vi.fn((runId: string) => {
          if (runId === 'run-active') return [draftRecord, taskRecord];
          if (runId === 'run-done') return [planRecord];
          return [];
        }),
        getByRunId: vi.fn(() => null),
        write: vi.fn(),
        writeDraft: vi.fn(),
        writePlan: vi.fn(),
        writeTask: vi.fn(),
        ingestObservedArtifact: vi.fn(),
        flush: vi.fn(async () => undefined),
        dispose: vi.fn(async () => undefined),
      };
      const fsOps = {
        async mkdir(): Promise<void> {},
        async appendFile(path: string, data: string): Promise<void> {
          writes.push({ path, data });
        },
        async writeFile(path: string, data: string, _encoding: 'utf-8'): Promise<void> {
          writes.push({ path, data });
        },
        async readFile(path: string): Promise<string> {
          if (path !== '/tmp/proj/.neko/state/idc-runtime.json') {
            throw Object.assign(new Error('ENOENT: no such file or directory'), { code: 'ENOENT' });
          }

          return JSON.stringify({
            updatedAt: 50,
            stage: {
              current: 'plan',
              enteredAt: 40,
              transitions: [
                { from: null, to: 'draft', at: 10 },
                { from: 'draft', to: 'plan', at: 20 },
              ],
            },
            run: {
              active: {
                id: 'run-active',
                runKind: 'wf-active',
                workflowId: 'wf-active',
                status: 'running',
                createdAt: 1,
                startedAt: 2,
                roundCount: 1,
                rounds: [
                  {
                    round: 0,
                    activatedStages: ['draft', 'plan'],
                    skippedStages: [],
                    decidedAt: 3,
                  },
                ],
                artifacts: [
                  {
                    kind: 'draft',
                    artifactId: 'draft-active',
                    path: '/tmp/proj/.neko/drafts/draft-run-active.md',
                    updatedAt: 11,
                  },
                  {
                    kind: 'task',
                    artifactId: 'task-active',
                    path: '/tmp/proj/.neko/tasks/task-run-active.md',
                    updatedAt: 31,
                  },
                ],
              },
              lastCompleted: {
                id: 'run-done',
                runKind: 'wf-done',
                workflowId: 'wf-done',
                status: 'completed',
                createdAt: 4,
                startedAt: 5,
                endedAt: 6,
                roundCount: 1,
                rounds: [
                  {
                    round: 0,
                    activatedStages: ['apply'],
                    skippedStages: [],
                    decidedAt: 6,
                  },
                ],
                artifacts: [
                  {
                    kind: 'plan',
                    artifactId: 'plan-done',
                    path: '/tmp/proj/.neko/plans/plan-run-done.md',
                    updatedAt: 21,
                  },
                ],
              },
            },
            approval: {
              pending: [],
            },
          });
        },
      };

      const session = new AgentSession(
        createConfig({
          stageTracking: {
            skillRegistry: registry as never,
            skillService: service as never,
          },
          workspace: { root: '/tmp/proj', fsOps },
          artifactService: artifactService as never,
          idcTaskProjection: projection as never,
        }),
      );

      await session.flushWorkspaceSink();

      expect(artifactService.restore).toHaveBeenCalledTimes(1);
      expect(projection.syncTask).toHaveBeenCalledWith({
        runId: 'run-active',
        runStartedAt: 2,
        task: restoredTask,
        artifact: {
          kind: 'task',
          artifactId: 'task-active',
          path: '/tmp/proj/.neko/tasks/task-run-active.md',
          updatedAt: 31,
        },
      });
      expect(session.listArtifactRunIds()).toEqual(['run-active', 'run-done']);
      expect(session.getIdcRun('run-active')).toEqual(
        expect.objectContaining({
          id: 'run-active',
          runKind: 'wf-active',
          workflowId: 'wf-active',
        }),
      );
      expect(session.getIdcRun('run-done')).toEqual(
        expect.objectContaining({
          id: 'run-done',
          runKind: 'wf-done',
          workflowId: 'wf-done',
        }),
      );
      expect(session.listIdcRuns()).toEqual([
        expect.objectContaining({ id: 'run-active', status: 'running' }),
        expect.objectContaining({ id: 'run-done', status: 'completed' }),
      ]);
      expect(session.getActiveIdcRun()).toEqual(
        expect.objectContaining({
          id: 'run-active',
          runKind: 'wf-active',
          workflowId: 'wf-active',
          status: 'running',
          draft: restoredDraft,
          task: restoredTask,
          rounds: [
            expect.objectContaining({
              round: 0,
              activatedStages: ['draft', 'plan'],
            }),
          ],
          artifactBindings: [
            {
              kind: 'draft',
              artifactId: 'draft-active',
              path: '/tmp/proj/.neko/drafts/draft-run-active.md',
              updatedAt: 11,
            },
            {
              kind: 'task',
              artifactId: 'task-active',
              path: '/tmp/proj/.neko/tasks/task-run-active.md',
              updatedAt: 31,
            },
          ],
        }),
      );
      expect(getCompletedRuns(session)).toEqual([
        expect.objectContaining({
          id: 'run-done',
          runKind: 'wf-done',
          workflowId: 'wf-done',
          status: 'completed',
          plan: restoredPlan,
          rounds: [
            expect.objectContaining({
              round: 0,
              activatedStages: ['apply'],
            }),
          ],
          artifactBindings: [
            {
              kind: 'plan',
              artifactId: 'plan-done',
              path: '/tmp/proj/.neko/plans/plan-run-done.md',
              updatedAt: 21,
            },
          ],
        }),
      ]);

      const snapshot = parseLatestWrite<{
        stage: {
          current: string | null;
          transitions: Array<{ from: string | null; to: string; at: number }>;
        };
        run: {
          active?: {
            id: string;
            roundCount: number;
            rounds?: Array<{ round: number }>;
          };
          lastCompleted?: {
            id: string;
            status: string;
            rounds?: Array<{ round: number }>;
          };
        };
      }>(writes, '/tmp/proj/.neko/state/idc-runtime.json');

      expect(snapshot.stage).toEqual({
        current: 'plan',
        enteredAt: 40,
        transitions: [
          { from: null, to: 'draft', at: 10 },
          { from: 'draft', to: 'plan', at: 20 },
        ],
      });
      expect(snapshot.run.active).toEqual(
        expect.objectContaining({
          id: 'run-active',
          roundCount: 1,
          rounds: [
            { round: 0, activatedStages: ['draft', 'plan'], skippedStages: [], decidedAt: 3 },
          ],
        }),
      );
      expect(snapshot.run.lastCompleted).toEqual(
        expect.objectContaining({
          id: 'run-done',
          status: 'completed',
          rounds: [{ round: 0, activatedStages: ['apply'], skippedStages: [], decidedAt: 6 }],
        }),
      );
      session.dispose();
    });

    it('clears restored IDC task projection for completed runs during startup restore', async () => {
      const { registry, service } = minimalStageTrackingConfig();
      const completedTask: Task = {
        id: 'task-done',
        createdAt: 60,
        updatedAt: 61,
        items: [{ id: 'done-step', content: 'Completed checklist', status: 'completed' }],
      };
      const completedTaskRecord = {
        kind: 'task',
        runId: 'run-done',
        artifactId: 'task-done',
        path: '/tmp/proj/.neko/tasks/task-run-done.md',
        updatedAt: 61,
        content: '# Tasks',
        value: completedTask,
      };
      const projection = {
        syncTask: vi.fn(async () => ['idc:run-done:done-step']),
        clearRun: vi.fn(async () => undefined),
      };
      const artifactService = {
        restore: vi.fn(async () => [completedTaskRecord]),
        listRunIds: vi.fn(() => ['run-done']),
        listByRunId: vi.fn((runId: string) => (runId === 'run-done' ? [completedTaskRecord] : [])),
        getByRunId: vi.fn(() => null),
        write: vi.fn(),
        writeDraft: vi.fn(),
        writePlan: vi.fn(),
        writeTask: vi.fn(),
        ingestObservedArtifact: vi.fn(),
        flush: vi.fn(async () => undefined),
        dispose: vi.fn(async () => undefined),
      };
      const fsOps = {
        async mkdir(): Promise<void> {},
        async appendFile(): Promise<void> {},
        async writeFile(): Promise<void> {},
        async readFile(path: string): Promise<string> {
          if (path !== '/tmp/proj/.neko/state/idc-runtime.json') {
            throw Object.assign(new Error('ENOENT: no such file or directory'), { code: 'ENOENT' });
          }

          return JSON.stringify({
            stage: {
              current: 'apply',
              transitions: [],
            },
            run: {
              lastCompleted: {
                id: 'run-done',
                runKind: 'wf-done',
                workflowId: 'wf-done',
                status: 'completed',
                createdAt: 10,
                startedAt: 11,
                endedAt: 12,
                roundCount: 1,
                rounds: [
                  {
                    round: 0,
                    activatedStages: ['apply'],
                    skippedStages: [],
                    decidedAt: 12,
                  },
                ],
              },
            },
            approval: {
              pending: [],
            },
            feedback: {
              pendingGuidance: null,
            },
          });
        },
      };

      const session = new AgentSession(
        createConfig({
          stageTracking: {
            skillRegistry: registry as never,
            skillService: service as never,
          },
          workspace: { root: '/tmp/proj', fsOps },
          artifactService: artifactService as never,
          idcTaskProjection: projection as never,
        }),
      );

      await session.flushWorkspaceSink();

      expect(projection.syncTask).toHaveBeenCalledWith({
        runId: 'run-done',
        runStartedAt: 11,
        task: completedTask,
        artifact: {
          kind: 'task',
          artifactId: 'task-done',
          path: '/tmp/proj/.neko/tasks/task-run-done.md',
          updatedAt: 61,
        },
      });
      expect(projection.clearRun).toHaveBeenCalledWith('run-done', 11);
      expect(session.getActiveIdcRun()).toBeNull();
      expect(session.getIdcRun('run-done')).toEqual(
        expect.objectContaining({
          id: 'run-done',
          status: 'completed',
        }),
      );
      session.dispose();
    });

    it('hydrates previously written artifacts when startWorkflowRun reuses the same runId', async () => {
      const { registry, service } = minimalStageTrackingConfig();
      const fsOps = {
        async mkdir(_path: string): Promise<void> {},
        async appendFile(_path: string, _data: string): Promise<void> {},
        async writeFile(_path: string, _data: string, _encoding: 'utf-8'): Promise<void> {},
      };

      const session = new AgentSession(
        createConfig({
          stageTracking: {
            skillRegistry: registry as never,
            skillService: service as never,
          },
          workspace: { root: '/tmp/proj', fsOps },
        }),
      );

      const draft: Draft = {
        id: 'draft-reuse',
        title: 'Reuse me',
        status: 'pending_review',
        domain: 'cut',
        createdAt: 10,
        updatedAt: 11,
        intent: 'Intent',
        approach: 'Approach',
        artifact: 'Artifact',
      };

      await session.writeDraftArtifact(draft, { runId: 'run-reuse' });
      session.startWorkflowRun('wf-reuse', 'run-reuse');

      expect(session.getActiveIdcRun()).toEqual(
        expect.objectContaining({
          id: 'run-reuse',
          draft,
          artifactBindings: [
            {
              kind: 'draft',
              artifactId: 'draft-reuse',
              path: '/tmp/proj/.neko/drafts/draft-run-reuse.md',
              updatedAt: 11,
            },
          ],
        }),
      );
    });

    it('ingests artifact.written bus events into ArtifactService and the active run', async () => {
      const { registry, service } = minimalStageTrackingConfig();
      const files = new Map<string, string>();
      const writes: Array<{ path: string; data: string }> = [];
      const fsOps = {
        async mkdir(_path: string): Promise<void> {},
        async appendFile(_path: string, _data: string): Promise<void> {},
        async writeFile(path: string, data: string, _encoding: 'utf-8'): Promise<void> {
          files.set(path, data);
          writes.push({ path, data });
        },
        async readFile(path: string, _encoding: 'utf-8'): Promise<string> {
          if (path === '/tmp/proj/.neko/state/idc-runtime.json') {
            return JSON.stringify({
              schemaVersion: 1,
              updatedAt: 0,
              stage: { current: null, transitions: [] },
              run: {},
              approval: { pending: [] },
            });
          }
          const value = files.get(path);
          if (!value) {
            throw new Error(`Missing fixture file: ${path}`);
          }
          return value;
        },
      };

      const session = new AgentSession(
        createConfig({
          stageTracking: {
            skillRegistry: registry as never,
            skillService: service as never,
            initialStage: 'plan',
          },
          workspace: { root: '/tmp/proj', fsOps },
        }),
      );
      session.startWorkflowRun('wf-observed', 'run-observed');

      const observedPath = '/tmp/proj/.neko/plans/plan-run-observed.md';
      files.set(
        observedPath,
        [
          '---',
          'id: observed-plan',
          'kind: plan',
          'draftId: observed-draft',
          'title: Observed plan',
          'status: ready',
          'createdAt: 2026-04-22T10:00:00.000Z',
          'updatedAt: 2026-04-22T10:30:00.000Z',
          '---',
          '',
          '# Observed plan',
          '',
          '> Compiled from draft `observed-draft`.',
          '',
          '## Steps',
          '',
          '### 1. [pending] Write',
          '',
          'Persist the artifact.',
          '',
          '```yaml',
          'path: out.md',
          '```',
          '',
        ].join('\n'),
      );

      session.getEventBus()!.emit({
        channel: 'execution.artifact.written',
        runId: 'run-observed',
        kind: 'plan',
        path: observedPath,
        artifactId: 'observed-plan',
        at: 123,
      });
      await session.flushWorkspaceSink();

      expect(session.getArtifactsForRun('run-observed')).toEqual([
        expect.objectContaining({
          kind: 'plan',
          artifactId: 'observed-plan',
          path: observedPath,
        }),
      ]);
      expect(session.getActiveIdcRun()).toEqual(
        expect.objectContaining({
          id: 'run-observed',
          plan: {
            id: 'observed-plan',
            draftId: 'observed-draft',
            title: 'Observed plan',
            status: 'ready',
            createdAt: Date.parse('2026-04-22T10:00:00.000Z'),
            updatedAt: Date.parse('2026-04-22T10:30:00.000Z'),
            steps: [
              {
                id: 'observed-plan.step.1',
                tool: 'Write',
                rationale: 'Persist the artifact.',
                args: 'path: out.md',
              },
            ],
          },
          artifactBindings: [
            {
              kind: 'plan',
              artifactId: 'observed-plan',
              path: observedPath,
              updatedAt: Date.parse('2026-04-22T10:30:00.000Z'),
            },
          ],
        }),
      );
      expect(
        parseLatestWrite<{
          entries: Array<{ kind: string; artifactId: string; runId: string }>;
        }>(writes, '/tmp/proj/.neko/cache/artifact-index.json').entries,
      ).toEqual([
        expect.objectContaining({
          kind: 'plan',
          artifactId: 'observed-plan',
          runId: 'run-observed',
        }),
      ]);
    });

    it('skips lossy watcher re-ingest when the observed content matches an existing tracked artifact', async () => {
      const { registry, service } = minimalStageTrackingConfig();
      const files = new Map<string, string>();
      const fsOps = {
        async mkdir(_path: string): Promise<void> {},
        async appendFile(_path: string, _data: string): Promise<void> {},
        async writeFile(path: string, data: string, _encoding: 'utf-8'): Promise<void> {
          files.set(path, data);
        },
        async readFile(path: string, _encoding: 'utf-8'): Promise<string> {
          if (path === '/tmp/proj/.neko/state/idc-runtime.json') {
            return JSON.stringify({
              schemaVersion: 1,
              updatedAt: 0,
              stage: { current: null, transitions: [] },
              run: {},
              approval: { pending: [] },
            });
          }
          const value = files.get(path);
          if (!value) {
            throw new Error(`Missing fixture file: ${path}`);
          }
          return value;
        },
      };

      const session = new AgentSession(
        createConfig({
          stageTracking: {
            skillRegistry: registry as never,
            skillService: service as never,
            initialStage: 'plan',
          },
          workspace: { root: '/tmp/proj', fsOps },
        }),
      );
      session.startWorkflowRun('wf-task-echo', 'run-task-echo');

      const task: Task = {
        id: 'task-echo',
        createdAt: 1,
        updatedAt: 2,
        items: [{ id: 'custom-item-id', content: 'Export teaser', status: 'pending' }],
      };
      const record = await session.writeTaskArtifact(task);

      session.getEventBus()!.emit({
        channel: 'execution.artifact.written',
        runId: 'run-task-echo',
        kind: 'task',
        path: record.path,
        artifactId: 'task-echo',
        at: 999,
      });
      await session.flushWorkspaceSink();

      expect(session.getActiveIdcRun()).toEqual(
        expect.objectContaining({
          id: 'run-task-echo',
          task,
          artifactBindings: [
            {
              kind: 'task',
              artifactId: 'task-echo',
              path: record.path,
              updatedAt: 2,
            },
          ],
        }),
      );
    });

    it('projects Task artifacts into the shared task plane when an IDC task projection is configured', async () => {
      const { registry, service } = minimalStageTrackingConfig();
      const idcTaskProjection = {
        syncTask: vi.fn().mockResolvedValue(['idc:run-1:task-item-1']),
        clearRun: vi.fn().mockResolvedValue(undefined),
      };
      const session = new AgentSession(
        createConfig({
          stageTracking: {
            skillRegistry: registry as never,
            skillService: service as never,
            initialStage: 'plan',
          },
          workspace: {
            root: '/tmp/proj',
            fsOps: {
              async mkdir(): Promise<void> {},
              async appendFile(): Promise<void> {},
              async writeFile(): Promise<void> {},
            },
          },
          idcTaskProjection: idcTaskProjection as never,
        }),
      );
      session.startWorkflowRun('wf-task-projection', 'run-1');
      const activeRun = session.getActiveIdcRun();
      expect(activeRun).toEqual(
        expect.objectContaining({
          id: 'run-1',
          startedAt: expect.any(Number),
        }),
      );

      const task: Task = {
        id: 'task-1',
        createdAt: 5,
        updatedAt: 6,
        items: [{ id: 'task-item-1', content: 'Export teaser', status: 'pending' }],
      };

      await session.writeTaskArtifact(task);
      await session.flushWorkspaceSink();

      expect(idcTaskProjection.syncTask).toHaveBeenCalledWith({
        runId: 'run-1',
        runStartedAt: activeRun?.startedAt,
        task,
        artifact: {
          kind: 'task',
          artifactId: 'task-1',
          path: '/tmp/proj/.neko/tasks/task-run-1.md',
          updatedAt: 6,
        },
      });
    });

    it('clears shared task projection when an active run completes', async () => {
      const { registry, service } = minimalStageTrackingConfig();
      const idcTaskProjection = {
        syncTask: vi.fn().mockResolvedValue(['idc:run-complete:task-item-1']),
        clearRun: vi.fn().mockResolvedValue(undefined),
      };
      const session = new AgentSession(
        createConfig({
          stageTracking: {
            skillRegistry: registry as never,
            skillService: service as never,
            initialStage: 'plan',
          },
          idcTaskProjection: idcTaskProjection as never,
        }),
      );
      injectMockExecutor(session, []);
      session.startWorkflowRun('wf-task-cleanup', 'run-complete');
      const startedAt = session.getIdcRun('run-complete')?.startedAt;
      expect(startedAt).toEqual(expect.any(Number));

      await collectEvents(session.execute('finish workflow'));
      await session.flushWorkspaceSink();

      expect(idcTaskProjection.clearRun).toHaveBeenCalledWith('run-complete', startedAt);
      expect(session.getActiveIdcRun()).toBeNull();
    });

    it('clears shared task projection when dispose aborts an active run', async () => {
      const { registry, service } = minimalStageTrackingConfig();
      const idcTaskProjection = {
        syncTask: vi.fn().mockResolvedValue(['idc:run-dispose:task-item-1']),
        clearRun: vi.fn().mockResolvedValue(undefined),
      };
      const session = new AgentSession(
        createConfig({
          stageTracking: {
            skillRegistry: registry as never,
            skillService: service as never,
            initialStage: 'plan',
          },
          idcTaskProjection: idcTaskProjection as never,
        }),
      );
      session.startWorkflowRun('wf-task-dispose', 'run-dispose');
      const startedAt = session.getIdcRun('run-dispose')?.startedAt;
      expect(startedAt).toEqual(expect.any(Number));

      session.dispose();
      await Promise.resolve();

      expect(idcTaskProjection.clearRun).toHaveBeenCalledWith('run-dispose', startedAt);
    });

    it('ApprovalEngine decisions bridge to execution.approve.decided + land in audits.jsonl (C4)', async () => {
      const { registry, service } = minimalStageTrackingConfig();
      const writes: Array<{ path: string; data: string }> = [];
      const fsOps = {
        async mkdir(): Promise<void> {},
        async appendFile(path: string, data: string): Promise<void> {
          writes.push({ path, data });
        },
      };

      const session = new AgentSession(
        createConfig({
          stageTracking: {
            skillRegistry: registry as never,
            skillService: service as never,
            initialStage: 'apply',
          },
          workspace: { root: '/tmp/proj', fsOps },
        }),
      );
      session.startWorkflowRun('test-wf', 'run-1');

      const engine = session.getApprovalEngine()!;
      await engine.evaluate({
        channel: 'permission',
        paradigm: 'imperative',
        subject: {
          label: 'generate',
          kind: 'tool:GenerateImage',
          destructive: false,
          idempotent: true,
        },
        id: 'req-1',
        at: 0,
      });
      await session.flushWorkspaceSink();

      const auditRows = writes
        .filter((w) => w.path === '/tmp/proj/.neko/logs/audits.jsonl')
        .map((w) => JSON.parse(w.data.trim()) as { event: { channel: string; decision: string } });
      expect(auditRows).toHaveLength(1);
      expect(auditRows[0]!.event.channel).toBe('execution.approve.decided');
      expect(auditRows[0]!.event.decision).toBe('auto-approved');
    });

    it('auto-reject (destructive + non-idempotent) maps to decision="reject"', async () => {
      const { registry, service } = minimalStageTrackingConfig();
      const writes: Array<{ path: string; data: string }> = [];
      const fsOps = {
        async mkdir(): Promise<void> {},
        async appendFile(path: string, data: string): Promise<void> {
          writes.push({ path, data });
        },
      };
      const session = new AgentSession(
        createConfig({
          stageTracking: {
            skillRegistry: registry as never,
            skillService: service as never,
            initialStage: 'apply',
          },
          workspace: { root: '/tmp/proj', fsOps },
        }),
      );
      session.startWorkflowRun('test-wf', 'run-1');

      await session.getApprovalEngine()!.evaluate({
        channel: 'permission',
        paradigm: 'imperative',
        subject: {
          label: 'dangerous',
          kind: 'tool:DeleteAll',
          destructive: true,
          idempotent: false,
        },
        id: 'req-1',
        at: 0,
      });
      await session.flushWorkspaceSink();

      const auditRows = writes
        .filter((w) => w.path === '/tmp/proj/.neko/logs/audits.jsonl')
        .map((w) => JSON.parse(w.data.trim()) as { event: { decision: string } });
      expect(auditRows).toHaveLength(1);
      expect(auditRows[0]!.event.decision).toBe('reject');
    });

    it('execution.step.completed events land in steps.jsonl', async () => {
      const { registry, service } = minimalStageTrackingConfig();
      const writes: Array<{ path: string; data: string }> = [];
      const fsOps = {
        async mkdir(): Promise<void> {},
        async appendFile(path: string, data: string): Promise<void> {
          writes.push({ path, data });
        },
      };
      const session = new AgentSession(
        createConfig({
          stageTracking: {
            skillRegistry: registry as never,
            skillService: service as never,
            initialStage: 'apply',
          },
          workspace: { root: '/tmp/proj', fsOps },
        }),
      );
      session.startWorkflowRun('wf', 'run-1');

      const bus = session.getEventBus()!;
      bus.emit({
        channel: 'execution.step.completed',
        runId: 'run-1',
        round: 0,
        thinkOnly: false,
        at: 1000,
      });
      bus.emit({
        channel: 'execution.step.completed',
        runId: 'run-1',
        round: 1,
        thinkOnly: true,
        at: 2000,
      });
      await session.flushWorkspaceSink();

      const stepRows = writes
        .filter((w) => w.path === '/tmp/proj/.neko/logs/steps.jsonl')
        .map((w) => JSON.parse(w.data.trim()) as { event: { round: number; thinkOnly: boolean } });
      expect(stepRows).toHaveLength(2);
      expect(stepRows[0]!.event.round).toBe(0);
      expect(stepRows[0]!.event.thinkOnly).toBe(false);
      expect(stepRows[1]!.event.round).toBe(1);
      expect(stepRows[1]!.event.thinkOnly).toBe(true);

      // And the audits sink should NOT have captured these — filter
      // predicates keep the streams separate.
      const auditRows = writes.filter((w) => w.path === '/tmp/proj/.neko/logs/audits.jsonl');
      expect(auditRows).toHaveLength(0);
    });

    it('decisions before a run starts do NOT emit approve.decided (no runId)', async () => {
      const { registry, service } = minimalStageTrackingConfig();
      const writes: Array<{ path: string; data: string }> = [];
      const fsOps = {
        async mkdir(): Promise<void> {},
        async appendFile(path: string, data: string): Promise<void> {
          writes.push({ path, data });
        },
      };
      const session = new AgentSession(
        createConfig({
          stageTracking: {
            skillRegistry: registry as never,
            skillService: service as never,
            // No initialStage — no active run yet.
          },
          workspace: { root: '/tmp/proj', fsOps },
        }),
      );

      await session.getApprovalEngine()!.evaluate({
        channel: 'permission',
        paradigm: 'imperative',
        subject: { label: 'x', kind: 'tool:x', destructive: false, idempotent: true },
        id: 'req-1',
        at: 0,
      });
      await session.flushWorkspaceSink();

      const auditRows = writes.filter((w) => w.path === '/tmp/proj/.neko/logs/audits.jsonl');
      expect(auditRows).toHaveLength(0);
    });

    it('persists current stage transitions and last completed run to state/idc-runtime.json', async () => {
      const { registry, service } = minimalStageTrackingConfig();
      const writes: Array<{ path: string; data: string }> = [];
      const fsOps = {
        async mkdir(): Promise<void> {},
        async appendFile(path: string, data: string): Promise<void> {
          writes.push({ path, data });
        },
        async writeFile(path: string, data: string, _encoding: 'utf-8'): Promise<void> {
          writes.push({ path, data });
        },
      };
      const session = new AgentSession(
        createConfig({
          conversationId: 'conv-1',
          stageTracking: {
            skillRegistry: registry as never,
            skillService: service as never,
          },
          workspace: { root: '/tmp/proj', fsOps },
        }),
      );

      session.startWorkflowRun('wf-demo', 'run-1');
      session.enterStage('draft');
      session.enterStage('plan');
      (
        session as unknown as {
          _closeActiveRun(status: 'completed' | 'failed' | 'aborted', error?: unknown): void;
          _persistIdcRuntimeState(): void;
        }
      )._closeActiveRun('completed');
      (
        session as unknown as {
          _persistIdcRuntimeState(): void;
        }
      )._persistIdcRuntimeState();

      await session.flushWorkspaceSink();

      const snapshot = parseLatestWrite<{
        conversationId?: string;
        stage: {
          current: string | null;
          transitions: Array<{ from: string | null; to: string; at: number }>;
        };
        run: {
          active?: unknown;
          lastCompleted?: { id: string; runKind?: string; workflowId: string; status: string };
        };
        approval: { pending: unknown[] };
      }>(writes, '/tmp/proj/.neko/state/idc-runtime.json');

      expect(snapshot.conversationId).toBe('conv-1');
      expect(snapshot.stage.current).toBe('plan');
      expect(snapshot.stage.transitions).toEqual([
        expect.objectContaining({ from: null, to: 'draft' }),
        expect.objectContaining({ from: 'draft', to: 'plan' }),
      ]);
      expect(snapshot.run.active).toBeUndefined();
      expect(snapshot.run.lastCompleted).toEqual(
        expect.objectContaining({
          id: 'run-1',
          runKind: 'wf-demo',
          workflowId: 'wf-demo',
          status: 'completed',
        }),
      );
      expect(snapshot.approval.pending).toEqual([]);
      session.dispose();
    });

    it('persists pending tool approvals to state/idc-runtime.json and clears them after confirmation', async () => {
      const { registry, service } = minimalStageTrackingConfig();
      const writes: Array<{ path: string; data: string }> = [];
      const fsOps = {
        async mkdir(): Promise<void> {},
        async appendFile(path: string, data: string): Promise<void> {
          writes.push({ path, data });
        },
        async writeFile(path: string, data: string, _encoding: 'utf-8'): Promise<void> {
          writes.push({ path, data });
        },
      };
      const session = new AgentSession(
        createConfig({
          stageTracking: {
            skillRegistry: registry as never,
            skillService: service as never,
          },
          workspace: { root: '/tmp/proj', fsOps },
          onConfirmTool: vi.fn(async () => await new Promise<boolean>(() => {})),
        }),
      );
      (
        session as unknown as {
          _approvalEngine: unknown;
          _permissionHooks: unknown;
        }
      )._approvalEngine = null;
      (
        session as unknown as {
          _approvalEngine: unknown;
          _permissionHooks: unknown;
        }
      )._permissionHooks = null;

      (
        session as unknown as {
          _handleToolConfirmation(request: {
            toolCall: { id: string; name: string; arguments: Record<string, unknown> };
            action: string;
            description: string;
            details: Record<string, unknown>;
            confirmationToken: string;
          }): void;
        }
      )._handleToolConfirmation({
        toolCall: {
          id: 'call-1',
          name: 'Write',
          arguments: { path: 'src/demo.ts' },
        },
        action: 'Write file',
        description: 'Write src/demo.ts',
        details: { path: 'src/demo.ts' },
        confirmationToken: 'confirm-1',
      });

      await session.flushWorkspaceSink();

      const pendingSnapshot = parseLatestWrite<{
        approval: {
          pending: Array<{ confirmationToken: string; toolCallId: string; toolName: string }>;
        };
      }>(writes, '/tmp/proj/.neko/state/idc-runtime.json');
      expect(pendingSnapshot.approval.pending).toEqual([
        expect.objectContaining({
          confirmationToken: 'confirm-1',
          toolCallId: 'call-1',
          toolName: 'Write',
        }),
      ]);

      session.confirmTool('call-1', true);
      await session.flushWorkspaceSink();

      const clearedSnapshot = parseLatestWrite<{
        approval: {
          pending: unknown[];
        };
      }>(writes, '/tmp/proj/.neko/state/idc-runtime.json');
      expect(clearedSnapshot.approval.pending).toEqual([]);
      session.dispose();
    });

    it('restores, persists, and clears pending feedback guidance via state/idc-runtime.json', async () => {
      const { registry, service } = minimalStageTrackingConfig();
      const statePath = '/tmp/proj/.neko/state/idc-runtime.json';
      const restoredWrites: Array<{ path: string; data: string }> = [];
      const persistedState = JSON.stringify({
        stage: {
          current: 'apply',
          transitions: [],
        },
        run: {},
        approval: {
          pending: [],
        },
        feedback: {
          pendingGuidance: '- Repair the failing draft artifact before retrying.',
        },
      });
      const restoredFsOps = {
        async mkdir(): Promise<void> {},
        async appendFile(path: string, data: string): Promise<void> {
          restoredWrites.push({ path, data });
        },
        async writeFile(path: string, data: string, _encoding: 'utf-8'): Promise<void> {
          restoredWrites.push({ path, data });
        },
        async readFile(path: string): Promise<string> {
          if (path === statePath) {
            return persistedState;
          }
          throw Object.assign(new Error('ENOENT: no such file or directory'), { code: 'ENOENT' });
        },
      };
      const restoredSession = new AgentSession(
        createConfig({
          stageTracking: {
            skillRegistry: registry as never,
            skillService: service as never,
          },
          workspace: { root: '/tmp/proj', fsOps: restoredFsOps },
        }),
      );

      await restoredSession.flushWorkspaceSink();

      expect(
        (
          restoredSession as unknown as {
            _feedbackGuidanceModule: { getContent(): string | null };
          }
        )._feedbackGuidanceModule.getContent(),
      ).toBe('- Repair the failing draft artifact before retrying.');
      expect(restoredSession.getHistory()[0]!.content).toContain('Feedback Guidance');

      (
        restoredSession as unknown as {
          _persistIdcRuntimeState(): void;
        }
      )._persistIdcRuntimeState();
      await restoredSession.flushWorkspaceSink();

      const persistedSnapshot = parseLatestWrite<{
        feedback: {
          pendingGuidance: {
            content: string;
            sourceRunId?: string;
            sourceRunStartedAt?: number;
          } | null;
        };
      }>(restoredWrites, statePath);
      expect(persistedSnapshot.feedback.pendingGuidance).toEqual({
        content: '- Repair the failing draft artifact before retrying.',
      });

      restoredSession.clearHistory();
      await restoredSession.flushWorkspaceSink();

      const clearedSnapshot = parseLatestWrite<{
        feedback: {
          pendingGuidance: {
            content: string;
            sourceRunId?: string;
            sourceRunStartedAt?: number;
          } | null;
        };
      }>(restoredWrites, statePath);
      expect(clearedSnapshot.feedback.pendingGuidance).toBeNull();
      restoredSession.dispose();
    });

    it('drops stale persisted feedback guidance when the source run is no longer active after restore', async () => {
      const { registry, service } = minimalStageTrackingConfig();
      const statePath = '/tmp/proj/.neko/state/idc-runtime.json';
      const writes: Array<{ path: string; data: string }> = [];
      const fsOps = {
        async mkdir(): Promise<void> {},
        async appendFile(path: string, data: string): Promise<void> {
          writes.push({ path, data });
        },
        async writeFile(path: string, data: string, _encoding: 'utf-8'): Promise<void> {
          writes.push({ path, data });
        },
        async readFile(path: string): Promise<string> {
          if (path === statePath) {
            return JSON.stringify({
              stage: {
                current: 'apply',
                transitions: [],
              },
              run: {},
              approval: {
                pending: [],
              },
              feedback: {
                pendingGuidance: {
                  content: '- Repair the failing draft artifact before retrying.',
                  sourceRunId: 'run-stale',
                  sourceRunStartedAt: 11,
                },
              },
            });
          }
          throw Object.assign(new Error('ENOENT: no such file or directory'), { code: 'ENOENT' });
        },
      };

      const session = new AgentSession(
        createConfig({
          stageTracking: {
            skillRegistry: registry as never,
            skillService: service as never,
          },
          workspace: { root: '/tmp/proj', fsOps },
        }),
      );

      await session.flushWorkspaceSink();

      expect(
        (
          session as unknown as {
            _feedbackGuidanceModule: { getContent(): string | null };
          }
        )._feedbackGuidanceModule.getContent(),
      ).toBeNull();

      const persistedSnapshot = parseLatestWrite<{
        feedback: {
          pendingGuidance: {
            content: string;
            sourceRunId?: string;
            sourceRunStartedAt?: number;
          } | null;
        };
      }>(writes, statePath);
      expect(persistedSnapshot.feedback.pendingGuidance).toBeNull();
      session.dispose();
    });

    it('restores pending tool approvals from state/idc-runtime.json and treats them as stale clearable state', async () => {
      const { registry, service } = minimalStageTrackingConfig();
      const writes: Array<{ path: string; data: string }> = [];
      const fsOps = {
        async mkdir(): Promise<void> {},
        async appendFile(path: string, data: string): Promise<void> {
          writes.push({ path, data });
        },
        async writeFile(path: string, data: string, _encoding: 'utf-8'): Promise<void> {
          writes.push({ path, data });
        },
        async readFile(path: string): Promise<string> {
          if (path === '/tmp/proj/.neko/state/idc-runtime.json') {
            return JSON.stringify({
              updatedAt: 7,
              approval: {
                pending: [
                  {
                    channel: 'permission',
                    confirmationToken: 'confirm-restore',
                    toolCallId: 'call-restore',
                    toolName: 'Write',
                    action: 'Write file',
                    description: 'Write src/demo.ts',
                    details: {
                      path: 'src/demo.ts',
                      arguments: { path: 'src/demo.ts' },
                    },
                  },
                ],
              },
            });
          }
          throw Object.assign(new Error('ENOENT: no such file or directory'), { code: 'ENOENT' });
        },
      };

      const session = new AgentSession(
        createConfig({
          stageTracking: {
            skillRegistry: registry as never,
            skillService: service as never,
          },
          workspace: { root: '/tmp/proj', fsOps },
        }),
      );

      await session.flushWorkspaceSink();

      expect(session.getPendingConfirmations()).toEqual([
        expect.objectContaining({
          confirmationToken: 'confirm-restore',
          toolCall: expect.objectContaining({
            id: 'call-restore',
            name: 'Write',
            arguments: { path: 'src/demo.ts' },
          }),
          details: expect.objectContaining({
            path: 'src/demo.ts',
            restoredFromRuntimeState: true,
            restoredSnapshotUpdatedAt: 7,
          }),
        }),
      ]);

      session.confirmTool('call-restore', true);
      await session.flushWorkspaceSink();

      expect(session.getPendingConfirmations()).toEqual([]);

      const clearedSnapshot = parseLatestWrite<{
        approval: {
          pending: unknown[];
        };
      }>(writes, '/tmp/proj/.neko/state/idc-runtime.json');
      expect(clearedSnapshot.approval.pending).toEqual([]);
      session.dispose();
    });

    it('dispose clears restored pending approvals without requiring a live permission token', async () => {
      const { registry, service } = minimalStageTrackingConfig();
      const writes: Array<{ path: string; data: string }> = [];
      const fsOps = {
        async mkdir(): Promise<void> {},
        async appendFile(path: string, data: string): Promise<void> {
          writes.push({ path, data });
        },
        async writeFile(path: string, data: string, _encoding: 'utf-8'): Promise<void> {
          writes.push({ path, data });
        },
        async readFile(path: string): Promise<string> {
          if (path === '/tmp/proj/.neko/state/idc-runtime.json') {
            return JSON.stringify({
              approval: {
                pending: [
                  {
                    channel: 'permission',
                    confirmationToken: 'confirm-restore',
                    toolCallId: 'call-restore',
                    toolName: 'Write',
                    action: 'Write file',
                    description: 'Write src/demo.ts',
                    details: {
                      arguments: { path: 'src/demo.ts' },
                    },
                  },
                ],
              },
            });
          }
          throw Object.assign(new Error('ENOENT: no such file or directory'), { code: 'ENOENT' });
        },
      };

      const session = new AgentSession(
        createConfig({
          stageTracking: {
            skillRegistry: registry as never,
            skillService: service as never,
          },
          workspace: { root: '/tmp/proj', fsOps },
        }),
      );

      await session.flushWorkspaceSink();
      session.dispose();
      await new Promise((resolve) => setTimeout(resolve, 0));

      const clearedSnapshot = parseLatestWrite<{
        approval: {
          pending: unknown[];
        };
      }>(writes, '/tmp/proj/.neko/state/idc-runtime.json');
      expect(clearedSnapshot.approval.pending).toEqual([]);
    });

    it('ignores malformed runtime-state approval snapshots during restore', async () => {
      const { registry, service } = minimalStageTrackingConfig();
      const writes: Array<{ path: string; data: string }> = [];
      const fsOps = {
        async mkdir(): Promise<void> {},
        async appendFile(path: string, data: string): Promise<void> {
          writes.push({ path, data });
        },
        async writeFile(path: string, data: string, _encoding: 'utf-8'): Promise<void> {
          writes.push({ path, data });
        },
        async readFile(path: string): Promise<string> {
          if (path === '/tmp/proj/.neko/state/idc-runtime.json') {
            return '{';
          }
          throw Object.assign(new Error('ENOENT: no such file or directory'), { code: 'ENOENT' });
        },
      };

      const session = new AgentSession(
        createConfig({
          stageTracking: {
            skillRegistry: registry as never,
            skillService: service as never,
          },
          workspace: { root: '/tmp/proj', fsOps },
        }),
      );

      await session.flushWorkspaceSink();

      expect(session.getPendingConfirmations()).toEqual([]);
      session.dispose();
    });

    it('session with no workspace config exposes NekoPaths === null', () => {
      const { registry, service } = minimalStageTrackingConfig();
      const session = new AgentSession(
        createConfig({
          stageTracking: {
            skillRegistry: registry as never,
            skillService: service as never,
          },
        }),
      );
      expect(session.getNekoPaths()).toBeNull();
    });

    it('preferences.md auto-loads and forces escalation on alwaysApprove match (D4)', async () => {
      const { registry, service } = minimalStageTrackingConfig();
      const fsOps = {
        async mkdir(): Promise<void> {},
        async appendFile(): Promise<void> {},
        async readFile(path: string): Promise<string> {
          if (path === '/tmp/proj/.neko/preferences.md') {
            return `---\nkind: user-preferences\nscope: project\nversion: 1\n---\n\n## Always approve\n- tool:GenerateImage\n`;
          }
          const err = new Error('ENOENT') as NodeJS.ErrnoException;
          err.code = 'ENOENT';
          throw err;
        },
      };
      const session = new AgentSession(
        createConfig({
          stageTracking: {
            skillRegistry: registry as never,
            skillService: service as never,
            initialStage: 'apply',
          },
          workspace: { root: '/tmp/proj', fsOps },
        }),
      );
      session.startWorkflowRun('wf', 'run-1');

      await session.whenPreferencesReady();

      // Default execution pack would auto-accept idempotent + non-destructive.
      // Preferences alwaysApprove now forces escalate.
      const res = await session.getApprovalEngine()!.evaluate({
        channel: 'permission',
        paradigm: 'imperative',
        subject: {
          kind: 'tool:GenerateImage',
          label: 'Generate image',
          destructive: false,
          idempotent: true,
        },
        id: 'req-1',
        at: 0,
      });
      expect(res.resolution).toBe('escalate');
      expect(res.reason).toBe('preferences-always-approve');
    });

    it('preferences.md absent → whenPreferencesReady resolves, no pack registered', async () => {
      const { registry, service } = minimalStageTrackingConfig();
      const fsOps = {
        async mkdir(): Promise<void> {},
        async appendFile(): Promise<void> {},
        async readFile(): Promise<string> {
          const err = new Error('ENOENT') as NodeJS.ErrnoException;
          err.code = 'ENOENT';
          throw err;
        },
      };
      const session = new AgentSession(
        createConfig({
          stageTracking: {
            skillRegistry: registry as never,
            skillService: service as never,
          },
          workspace: { root: '/tmp/proj', fsOps },
        }),
      );
      await session.whenPreferencesReady();
      expect(session.getPreferencesWarnings()).toEqual([]);
    });

    it('workspace without readFile → preferences disabled, whenPreferencesReady resolves', async () => {
      const { registry, service } = minimalStageTrackingConfig();
      const fsOps = {
        async mkdir(): Promise<void> {},
        async appendFile(): Promise<void> {},
        // no readFile
      };
      const session = new AgentSession(
        createConfig({
          stageTracking: {
            skillRegistry: registry as never,
            skillService: service as never,
          },
          workspace: { root: '/tmp/proj', fsOps },
        }),
      );
      await session.whenPreferencesReady();
      expect(session.getPreferencesWarnings()).toEqual([]);
    });

    it('preferences cannot downgrade L0 critical gate (destructive + non-idempotent)', async () => {
      const { registry, service } = minimalStageTrackingConfig();
      const fsOps = {
        async mkdir(): Promise<void> {},
        async appendFile(): Promise<void> {},
        async readFile(path: string): Promise<string> {
          if (path === '/tmp/proj/.neko/preferences.md') {
            return `## Auto approve\n- tool:DeleteAll\n`;
          }
          const err = new Error('ENOENT') as NodeJS.ErrnoException;
          err.code = 'ENOENT';
          throw err;
        },
      };
      const session = new AgentSession(
        createConfig({
          stageTracking: {
            skillRegistry: registry as never,
            skillService: service as never,
            initialStage: 'apply',
          },
          workspace: { root: '/tmp/proj', fsOps },
        }),
      );
      session.startWorkflowRun('wf', 'run-1');
      await session.whenPreferencesReady();

      // User said "auto approve tool:DeleteAll" but the subject is
      // destructive + non-idempotent. Preferences refuses to bypass
      // the L0 gate; execution pack auto-rejects.
      const res = await session.getApprovalEngine()!.evaluate({
        channel: 'permission',
        paradigm: 'imperative',
        subject: {
          kind: 'tool:DeleteAll',
          label: 'Delete',
          destructive: true,
          idempotent: false,
        },
        id: 'req-1',
        at: 0,
      });
      expect(res.resolution).toBe('auto-reject');
    });

    it('apply-committed on the event bus feeds guardian noteApply (B4 end-to-end)', () => {
      const { registry, service } = minimalStageTrackingConfig();
      const session = new AgentSession(
        createConfig({
          stageTracking: {
            skillRegistry: registry as never,
            skillService: service as never,
            initialStage: 'apply',
          },
        }),
      );

      const bus = session.getEventBus();
      expect(bus).not.toBeNull();

      // Apply fires without a prior approval on the engine — guardian
      // should raise approval-skipped via the session wiring.
      bus!.emit({
        channel: 'execution.apply.committed',
        runId: 'run-1',
        kind: 'tool:GenerateImage',
        at: 0,
      });

      const skipped = session.getStageGuardianIssues().filter((i) => i.code === 'approval-skipped');
      expect(skipped).toHaveLength(1);
      expect(skipped[0]!.detail?.subject).toBe('tool:GenerateImage');
    });
  });
});
