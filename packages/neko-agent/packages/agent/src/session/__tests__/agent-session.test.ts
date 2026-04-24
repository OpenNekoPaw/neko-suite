/**
 * AgentSession Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgentSession, PLAN_MODE_SYSTEM_REMINDER } from '../agent-session';
import type { AgentSessionConfig, AgentEvent } from '../types';
import type {
  IService,
  IToolRegistry,
  AgentStep,
  ChatMessage,
  IProjectMemoryManager,
} from '@neko/shared';
import type { IJournalWriter } from '../types';

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

// =============================================================================
// Mocks
// =============================================================================

/** Mock steps yielded by AgentExecutor.executeStream */
function createMockExecutorModule(steps: AgentStep[]) {
  return {
    executeStream: vi.fn(async function* () {
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
            { success: true, data: 'file content', callId: 'call_1', name: 'read_file' },
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
      const callArgs = mockExec.executeStream.mock.calls[0];
      expect(callArgs![1]!.skipUserMessage).toBe(true);
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

      const callArgs = mockExec.executeStream.mock.calls[0];
      const inputArg = callArgs![0] as string;
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
      mockExec.executeStream.mockImplementationOnce(async function* (
        _input: string,
        options?: { messages?: ChatMessage[] },
      ) {
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
      mockExec.executeStream.mockImplementationOnce(async function* (
        _input: string,
        options?: { messages?: ChatMessage[] },
      ) {
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
