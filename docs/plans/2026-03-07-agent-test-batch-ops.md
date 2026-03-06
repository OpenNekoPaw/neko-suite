# Handler Tests + BatchTimelineOps Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add vitest infrastructure to @neko-agent/extension (making 12 existing tests runnable), add messageHandler/conversationHandler tests, and add BatchTimelineOpsTool for batch timeline editing.

**Architecture:**
- Task 1-2: vitest config + vscode mock → unlock existing 12 tests, add ~40 new test cases for messageHandler and conversationHandler
- Task 3: `BatchTimelineOpsTool` in `project-tools.ts` → loops over `BatchOp[]`, calls existing `ProjectContext` methods, best-effort (collect errors, continue)
- Task 4: register `'BatchTimelineOps'` in `element-editing` ToolGroup and `registerProjectTools()`

**Tech Stack:** Vitest 2.x, TypeScript strict, VSCode Extension API mocks (vi.mock)

---

### Task 1: Add vitest infrastructure to @neko-agent/extension

**Files:**
- Modify: `packages/neko-agent/packages/extension/package.json`
- Create: `packages/neko-agent/packages/extension/vitest.config.ts`
- Create: `packages/neko-agent/packages/extension/src/__mocks__/vscode.ts`

**Step 1: Add vitest dep + scripts to package.json**

Open `packages/neko-agent/packages/extension/package.json`. It currently has no `scripts` or vitest dev dep. Add:

```json
{
  "name": "@neko-agent/extension",
  "private": true,
  "version": "0.0.1",
  "description": "NekoAgent extension source code",
  "type": "module",
  "exports": {
    ".": "./src/index.ts",
    "./*": "./src/*"
  },
  "scripts": {
    "test": "vitest",
    "test:run": "vitest --run"
  },
  "dependencies": {
    "@neko/agent": "workspace:*",
    "@neko/neko-client": "workspace:*",
    "@neko/platform": "workspace:*",
    "@neko/shared": "workspace:*"
  },
  "devDependencies": {
    "@types/vscode": "^1.85.0",
    "vitest": "^2.0.0"
  }
}
```

**Step 2: Create vitest.config.ts**

```typescript
// packages/neko-agent/packages/extension/vitest.config.ts
import { defineConfig } from 'vitest/config';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    mockReset: true,
    alias: {
      vscode: path.resolve(__dirname, 'src/__mocks__/vscode.ts'),
    },
  },
});
```

**Step 3: Create vscode mock**

`messageHandler.ts` and `conversationHandler.ts` import `vscode` directly. Create a minimal mock that satisfies them:

```typescript
// packages/neko-agent/packages/extension/src/__mocks__/vscode.ts
import { vi } from 'vitest';

export const Uri = {
  file: vi.fn((path: string) => ({ fsPath: path, toString: () => `file://${path}` })),
  joinPath: vi.fn((base: { fsPath: string }, ...parts: string[]) => ({
    fsPath: [base.fsPath, ...parts].join('/'),
    toString: () => `file://${[base.fsPath, ...parts].join('/')}`,
  })),
  parse: vi.fn((str: string) => ({ fsPath: str, toString: () => str })),
};

export const FileType = { File: 1, Directory: 2, SymbolicLink: 64, Unknown: 0 };

export const workspace = {
  workspaceFolders: [{ uri: { fsPath: '/mock/workspace' }, name: 'mock', index: 0 }],
  fs: {
    readFile: vi.fn().mockResolvedValue(Buffer.from('')),
    stat: vi.fn().mockResolvedValue({ type: 1, size: 0, ctime: 0, mtime: 0 }),
  },
  findFiles: vi.fn().mockResolvedValue([]),
  asRelativePath: vi.fn((uri: { fsPath: string }) => uri.fsPath),
};

export const RelativePattern = vi.fn();

export const Webview = {};

export enum LogLevel { Off = 0, Trace = 1, Debug = 2, Info = 3, Warning = 4, Error = 5 }
```

**Step 4: Run the 12 existing tests**

```bash
cd packages/neko-agent/packages/extension && npx vitest run
```

Expected: all 12 tests pass. If any fail due to import errors or missing mocks, fix them before proceeding. Common issues:
- `@neko/agent` not resolving → check workspace: links via `pnpm install` first
- Additional vscode APIs used in handlers → add them to the mock

**Step 5: Commit**

```bash
git add packages/neko-agent/packages/extension/package.json \
        packages/neko-agent/packages/extension/vitest.config.ts \
        packages/neko-agent/packages/extension/src/__mocks__/vscode.ts
git commit -m "feat(neko-agent): add vitest infrastructure to extension package"
```

---

### Task 2: Add conversationHandler tests

**Files:**
- Create: `packages/neko-agent/packages/extension/src/chat/__tests__/conversationHandler.test.ts`

**Background:** `ConversationHandler` wraps `ConversationManager` with a VSCode storage adapter. Its constructor takes `vscode.ExtensionContext` (only uses `context.workspaceState`). Key public methods: `create()`, `switchTo(id)`, `getActive()`, `getActiveId()`, `list()`, `addMessage()`, `sendConversationList(webview)`, `sendActiveConversation(webview)`, `ensureActive()`, `clearCurrent()`.

**Step 1: Write the test file**

```typescript
// packages/neko-agent/packages/extension/src/chat/__tests__/conversationHandler.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConversationHandler } from '../conversationHandler';

function createMockContext() {
  const store = new Map<string, unknown>();
  return {
    workspaceState: {
      get: vi.fn(<T>(key: string, defaultValue?: T): T | undefined =>
        (store.get(key) as T) ?? defaultValue
      ),
      update: vi.fn(async (key: string, value: unknown) => { store.set(key, value); }),
    },
  };
}

function createMockWebview() {
  return {
    postMessage: vi.fn().mockResolvedValue(true),
    asWebviewUri: vi.fn((uri: { toString(): string }) => ({
      toString: () => `vscode-webview://${uri.toString()}`,
    })),
  };
}

describe('ConversationHandler', () => {
  let handler: ConversationHandler;
  let ctx: ReturnType<typeof createMockContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    ctx = createMockContext();
    handler = new ConversationHandler(ctx as any);
  });

  describe('create and ensureActive', () => {
    it('should create a conversation and return its ID', () => {
      const id = handler.create();
      expect(typeof id).toBe('string');
      expect(id.length).toBeGreaterThan(0);
    });

    it('ensureActive creates conversation when none exists', () => {
      const id = handler.ensureActive();
      expect(typeof id).toBe('string');
      expect(handler.getActiveId()).toBe(id);
    });

    it('ensureActive returns existing active conversation', () => {
      const id1 = handler.ensureActive();
      const id2 = handler.ensureActive();
      expect(id1).toBe(id2);
    });
  });

  describe('switchTo', () => {
    it('should switch to an existing conversation', () => {
      const id1 = handler.create();
      const id2 = handler.create();
      expect(handler.switchTo(id1)).toBe(true);
      expect(handler.getActiveId()).toBe(id1);
      expect(handler.switchTo(id2)).toBe(true);
      expect(handler.getActiveId()).toBe(id2);
    });

    it('should return false for unknown conversation ID', () => {
      const result = handler.switchTo('nonexistent-id');
      expect(result).toBe(false);
    });
  });

  describe('addMessage', () => {
    it('should add message to active conversation', () => {
      handler.ensureActive();
      handler.addMessage({ id: 'm1', role: 'user', content: 'hello', timestamp: Date.now() });
      const active = handler.getActive();
      expect(active?.messages).toHaveLength(1);
      expect(active?.messages[0]?.content).toBe('hello');
    });

    it('should not crash when no active conversation', () => {
      expect(() =>
        handler.addMessage({ id: 'm1', role: 'user', content: 'hello', timestamp: Date.now() })
      ).not.toThrow();
    });
  });

  describe('list', () => {
    it('should list all conversations', () => {
      handler.create();
      handler.create();
      expect(handler.list()).toHaveLength(2);
    });

    it('should return empty array when no conversations', () => {
      expect(handler.list()).toHaveLength(0);
    });
  });

  describe('clearCurrent', () => {
    it('should clear messages from active conversation', () => {
      handler.ensureActive();
      handler.addMessage({ id: 'm1', role: 'user', content: 'hello', timestamp: Date.now() });
      handler.clearCurrent();
      expect(handler.getActive()?.messages).toHaveLength(0);
    });
  });

  describe('sendConversationList', () => {
    it('should post conversationList with mapped summaries', () => {
      const webview = createMockWebview();
      handler.create();
      handler.sendConversationList(webview as any);

      expect(webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'conversationList',
          conversations: expect.arrayContaining([
            expect.objectContaining({ id: expect.any(String), messageCount: 0 }),
          ]),
        })
      );
    });
  });

  describe('sendActiveConversation', () => {
    it('should post activeConversation with null when no active', () => {
      const webview = createMockWebview();
      handler.sendActiveConversation(webview as any);
      expect(webview.postMessage).toHaveBeenCalledWith({
        type: 'activeConversation',
        conversation: null,
      });
    });

    it('should post activeConversation with conversation data when active', () => {
      const webview = createMockWebview();
      handler.ensureActive();
      handler.sendActiveConversation(webview as any);

      expect(webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'activeConversation',
          conversation: expect.objectContaining({ id: expect.any(String), messages: [] }),
        })
      );
    });
  });

  describe('cleanup on init', () => {
    it('should survive construction without stored conversations', () => {
      expect(() => new ConversationHandler(ctx as any)).not.toThrow();
    });
  });
});
```

**Step 2: Run the test**

```bash
cd packages/neko-agent/packages/extension && npx vitest run src/chat/__tests__/conversationHandler.test.ts
```

Expected: all tests pass. If `ConversationManager` itself fails (e.g., missing storage key), inspect the `conversationManager.ts` implementation and adjust mock storage as needed.

**Step 3: Commit**

```bash
git add packages/neko-agent/packages/extension/src/chat/__tests__/conversationHandler.test.ts
git commit -m "test(neko-agent): add conversationHandler unit tests"
```

---

### Task 3: Add messageHandler tests

**Files:**
- Create: `packages/neko-agent/packages/extension/src/chat/__tests__/messageHandler.test.ts`

**Background:** `MessageHandler` constructor takes 7 params: `_settings`, `_providers`, `_conversations`, `_agentManager`, `_editorRegistry`, `_getSystemPrompt`, `_platform`. Its `handleUserMessage()` orchestrates: parse @ refs (uses vscode.workspace) → process attachments → add user message → send `thinking` → execute with agent (if agentManager + platform present) or send fallback.

The `_executeWithAgent()` calls `_agentManager.createRunner()` and streams events. Testing this requires mocking the async generator the agent returns.

**Step 1: Write the test file**

```typescript
// packages/neko-agent/packages/extension/src/chat/__tests__/messageHandler.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MessageHandler } from '../messageHandler';

// Mock @neko/agent module (createInputProcessor, etc.)
vi.mock('@neko/agent', () => ({
  createInputProcessor: vi.fn(() => ({
    process: vi.fn(async (msg: string) => ({ message: msg, fileContents: [] })),
  })),
}));

function createMockWebview() {
  return { postMessage: vi.fn().mockResolvedValue(true) };
}

function createMockSettings() {
  return { getProviderId: vi.fn().mockReturnValue('anthropic'), getModelId: vi.fn().mockReturnValue('claude-3-5-sonnet') };
}

function createMockProviders() {
  return { getProvider: vi.fn().mockReturnValue({ id: 'anthropic', models: [] }) };
}

function createMockConversations() {
  const msgs: unknown[] = [];
  return {
    ensureActive: vi.fn().mockReturnValue('conv-1'),
    addMessageToConversation: vi.fn((_, msg) => msgs.push(msg)),
    addMessage: vi.fn(),
    getActiveId: vi.fn().mockReturnValue('conv-1'),
    getActive: vi.fn().mockReturnValue({ id: 'conv-1', messages: msgs }),
  };
}

async function* emptyStream() {}

function createMockAgentManager() {
  return {
    createRunner: vi.fn().mockReturnValue({
      run: vi.fn().mockReturnValue(emptyStream()),
      abort: vi.fn(),
    }),
    getContextTokenCount: vi.fn().mockReturnValue(0),
  };
}

function createMockPlatform() {
  return {
    tools: { get: vi.fn() },
    service: { chat: vi.fn(), chatStream: vi.fn() },
  };
}

function buildHandler(overrides: {
  agentManager?: ReturnType<typeof createMockAgentManager> | undefined;
  platform?: ReturnType<typeof createMockPlatform> | undefined;
} = {}) {
  return new MessageHandler(
    createMockSettings() as any,
    createMockProviders() as any,
    createMockConversations() as any,
    overrides.agentManager !== undefined ? overrides.agentManager as any : createMockAgentManager() as any,
    undefined, // editorRegistry
    () => 'system prompt',
    overrides.platform !== undefined ? overrides.platform as any : createMockPlatform() as any,
  );
}

describe('MessageHandler', () => {
  let webview: ReturnType<typeof createMockWebview>;

  beforeEach(() => {
    vi.clearAllMocks();
    webview = createMockWebview();
  });

  describe('handleUserMessage — basic flow', () => {
    it('should post thinking indicator before executing', async () => {
      const handler = buildHandler();
      await handler.handleUserMessage(webview as any, 'hello');
      expect(webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'thinking' })
      );
    });

    it('should use provided conversationId if given', async () => {
      const conversations = createMockConversations();
      const handler = new MessageHandler(
        createMockSettings() as any,
        createMockProviders() as any,
        conversations as any,
        createMockAgentManager() as any,
        undefined,
        () => 'system',
        createMockPlatform() as any,
      );
      await handler.handleUserMessage(webview as any, 'hello', undefined, undefined, undefined, undefined, 'custom-conv-id');
      expect(conversations.ensureActive).not.toHaveBeenCalled();
      expect(conversations.addMessageToConversation).toHaveBeenCalledWith(
        'custom-conv-id',
        expect.objectContaining({ role: 'user', content: 'hello' })
      );
    });

    it('should send fallback response when no agentManager', async () => {
      const handler = buildHandler({ agentManager: undefined, platform: undefined });
      await handler.handleUserMessage(webview as any, 'hello');
      // fallback → postMessage called with something after thinking
      expect(webview.postMessage).toHaveBeenCalledTimes(2); // thinking + fallback
    });
  });

  describe('getAgentStateSnapshot', () => {
    it('should return empty array initially', () => {
      const handler = buildHandler();
      expect(handler.getAgentStateSnapshot()).toEqual([]);
    });
  });

  describe('clearAgentState', () => {
    it('should not crash when clearing nonexistent conversation', () => {
      const handler = buildHandler();
      expect(() => handler.clearAgentState('nonexistent')).not.toThrow();
    });
  });

  describe('no attachments path', () => {
    it('should not include attachment text when no attachments provided', async () => {
      const conversations = createMockConversations();
      const handler = new MessageHandler(
        createMockSettings() as any,
        createMockProviders() as any,
        conversations as any,
        createMockAgentManager() as any,
        undefined,
        () => 'system',
        createMockPlatform() as any,
      );
      await handler.handleUserMessage(webview as any, 'plain message');
      const userMsg = (conversations.addMessageToConversation.mock.calls[0] as unknown[])[1] as Record<string, unknown>;
      expect(userMsg['content']).toBe('plain message');
    });
  });
});
```

**Step 2: Run the test**

```bash
cd packages/neko-agent/packages/extension && npx vitest run src/chat/__tests__/messageHandler.test.ts
```

Expected: all tests pass. If `_executeWithAgent` has additional deps (e.g., `PermissionSystem`), mock them via `vi.mock('@neko/agent', ...)`.

**Step 3: Run all extension tests together**

```bash
cd packages/neko-agent/packages/extension && npx vitest run
```

Expected: ~50+ tests, all pass.

**Step 4: Commit**

```bash
git add packages/neko-agent/packages/extension/src/chat/__tests__/messageHandler.test.ts
git commit -m "test(neko-agent): add messageHandler unit tests"
```

---

### Task 4: Add BatchTimelineOpsTool to platform

**Files:**
- Modify: `packages/neko-agent/packages/platform/src/tools/project-tools.ts`

**Background:** `project-tools.ts` defines `ProjectContext` interface and individual tool classes (`AddElementTool`, `UpdateElementTool`, `DeleteElementTool`, etc.). The `registerProjectTools()` function at the bottom registers all tools. `ProjectContext` already has `addElement()`, `updateElement()`, `deleteElement()` which are sufficient for the core batch operations.

**Step 1: Write failing test first**

Add this test file to understand the expected behavior:

```typescript
// packages/neko-agent/packages/platform/src/tools/__tests__/batch-timeline.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BatchTimelineOpsTool } from '../project-tools';

function createMockContext() {
  return {
    getTimelineInfo: vi.fn().mockResolvedValue({ duration: 60, fps: 30, width: 1920, height: 1080, trackCount: 2 }),
    getTracks: vi.fn().mockResolvedValue([]),
    getElements: vi.fn().mockResolvedValue([]),
    addElement: vi.fn().mockResolvedValue('new-el-id'),
    updateElement: vi.fn().mockResolvedValue(undefined),
    deleteElement: vi.fn().mockResolvedValue(undefined),
    getMediaInfo: vi.fn().mockResolvedValue(null),
    batchOps: vi.fn(),
  };
}

describe('BatchTimelineOpsTool', () => {
  let tool: BatchTimelineOpsTool;
  let context: ReturnType<typeof createMockContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    context = createMockContext();
    tool = new BatchTimelineOpsTool(context as any);
  });

  it('should execute all ops and return summary', async () => {
    const result = await tool.execute({
      operations: [
        { type: 'AddElement', trackId: 't1', elementType: 'video', startTime: 0, duration: 5, src: '/a.mp4' },
        { type: 'UpdateElement', id: 'el-1', updates: { startTime: 2 } },
        { type: 'DeleteElement', id: 'el-2' },
      ],
    });

    expect(result.success).toBe(true);
    const data = result.data as { succeeded: number; failed: number; results: unknown[] };
    expect(data.succeeded).toBe(3);
    expect(data.failed).toBe(0);
    expect(data.results).toHaveLength(3);
  });

  it('should continue after a failed op and report error', async () => {
    context.updateElement.mockRejectedValueOnce(new Error('Element not found'));

    const result = await tool.execute({
      operations: [
        { type: 'UpdateElement', id: 'missing-el', updates: { startTime: 1 } },
        { type: 'DeleteElement', id: 'el-3' },
      ],
    });

    expect(result.success).toBe(true);
    const data = result.data as { succeeded: number; failed: number };
    expect(data.succeeded).toBe(1);
    expect(data.failed).toBe(1);
  });

  it('should return error when operations is missing', async () => {
    const result = await tool.execute({});
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/operations/i);
  });

  it('should return error for unknown operation type', async () => {
    const result = await tool.execute({
      operations: [{ type: 'UnknownOp', id: 'el-1' }],
    });
    expect(result.success).toBe(true);
    const data = result.data as { failed: number; results: Array<{ error: string }> };
    expect(data.failed).toBe(1);
    expect(data.results[0]?.error).toMatch(/Unknown/i);
  });

  it('should handle empty operations array', async () => {
    const result = await tool.execute({ operations: [] });
    expect(result.success).toBe(true);
    const data = result.data as { succeeded: number; failed: number };
    expect(data.succeeded).toBe(0);
    expect(data.failed).toBe(0);
  });
});
```

Check the test location — `packages/neko-agent/packages/platform` should have its own vitest config. Confirm:

```bash
cat packages/neko-agent/packages/platform/package.json | grep -A5 '"scripts"'
```

**Step 2: Run test to verify it fails**

```bash
cd packages/neko-agent/packages/platform && npx vitest run src/tools/__tests__/batch-timeline.test.ts
```

Expected: FAIL — `BatchTimelineOpsTool is not exported from project-tools`.

**Step 3: Implement BatchTimelineOpsTool**

Open `packages/neko-agent/packages/platform/src/tools/project-tools.ts`. Find the section after `DeleteElementTool` (~line 280) and before `GetMediaInfoTool`. Insert:

```typescript
// ── BatchOp types ──────────────────────────────────────────────────────────

type BatchOp =
  | { type: 'AddElement'; trackId: string; elementType: string; startTime: number; duration: number; src?: string; properties?: Record<string, unknown> }
  | { type: 'UpdateElement'; id: string; updates: Record<string, unknown> }
  | { type: 'DeleteElement'; id: string }
  | { type: 'TrimElement'; id: string; trimStart?: number; trimEnd?: number }
  | { type: 'SetAudioProperties'; id: string; volume?: number; muted?: boolean }
  | { type: 'SetColorCorrection'; id: string; brightness?: number; contrast?: number; saturation?: number };

interface BatchOpResult {
  index: number;
  type: string;
  success: boolean;
  data?: unknown;
  error?: string;
}

interface BatchResult {
  succeeded: number;
  failed: number;
  results: BatchOpResult[];
}

/**
 * Execute multiple timeline operations in one call (best-effort: collect errors, continue)
 */
export class BatchTimelineOpsTool extends BuiltinTool {
  readonly name = 'BatchTimelineOps';
  readonly description =
    'Execute multiple timeline operations in one call. Best-effort: failed ops are reported but do not block subsequent ops.';
  readonly category: ToolCategory = 'timeline';
  readonly requiresConfirmation = true;
  readonly parameters = {
    type: 'object',
    properties: {
      operations: {
        type: 'array',
        description: 'Array of timeline operations to execute in order',
        items: {
          type: 'object',
          properties: {
            type: {
              type: 'string',
              enum: ['AddElement', 'UpdateElement', 'DeleteElement', 'TrimElement', 'SetAudioProperties', 'SetColorCorrection'],
              description: 'Operation type',
            },
            // AddElement fields
            trackId: { type: 'string', description: 'Track ID (AddElement)' },
            elementType: { type: 'string', description: 'Element type: video|audio|image|text (AddElement)' },
            startTime: { type: 'number', description: 'Start time in seconds (AddElement)' },
            duration: { type: 'number', description: 'Duration in seconds (AddElement)' },
            src: { type: 'string', description: 'Source file path (AddElement)' },
            // UpdateElement / others
            id: { type: 'string', description: 'Element ID (UpdateElement/DeleteElement/Trim/etc.)' },
            updates: { type: 'object', description: 'Properties to update (UpdateElement)' },
            trimStart: { type: 'number', description: 'New trim start offset in seconds' },
            trimEnd: { type: 'number', description: 'New trim end offset in seconds' },
            volume: { type: 'number', description: 'Volume 0-1 (SetAudioProperties)' },
            muted: { type: 'boolean', description: 'Muted flag (SetAudioProperties)' },
            brightness: { type: 'number' },
            contrast: { type: 'number' },
            saturation: { type: 'number' },
          },
          required: ['type'],
        },
      },
    },
    required: ['operations'],
  };

  private context: ProjectContext;

  constructor(context: ProjectContext) {
    super();
    this.context = context;
  }

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    if (!Array.isArray(args['operations'])) {
      return this.error('operations must be an array of BatchOp objects');
    }

    const ops = args['operations'] as BatchOp[];
    const results: BatchOpResult[] = [];

    for (let i = 0; i < ops.length; i++) {
      const op = ops[i] as BatchOp;
      try {
        const data = await this._executeOp(op);
        results.push({ index: i, type: op.type, success: true, data });
      } catch (err) {
        results.push({
          index: i,
          type: op.type,
          success: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    const succeeded = results.filter(r => r.success).length;
    const failed = results.length - succeeded;

    const batchResult: BatchResult = { succeeded, failed, results };
    return this.success(batchResult);
  }

  private async _executeOp(op: BatchOp): Promise<unknown> {
    switch (op.type) {
      case 'AddElement': {
        const elementId = await this.context.addElement(op.trackId, {
          type: op.elementType as ElementInput['type'],
          startTime: op.startTime,
          duration: op.duration,
          properties: op.src ? { src: op.src, ...op.properties } : op.properties,
        });
        return { elementId };
      }
      case 'UpdateElement':
        await this.context.updateElement(op.id, op.updates);
        return undefined;
      case 'DeleteElement':
        await this.context.deleteElement(op.id);
        return undefined;
      case 'TrimElement':
        // TrimElement: delegate as updateElement with trim fields
        await this.context.updateElement(op.id, {
          ...(op.trimStart !== undefined && { trimStart: op.trimStart }),
          ...(op.trimEnd !== undefined && { trimEnd: op.trimEnd }),
        });
        return undefined;
      case 'SetAudioProperties':
        await this.context.updateElement(op.id, {
          ...(op.volume !== undefined && { volume: op.volume }),
          ...(op.muted !== undefined && { muted: op.muted }),
        });
        return undefined;
      case 'SetColorCorrection':
        await this.context.updateElement(op.id, {
          ...(op.brightness !== undefined && { brightness: op.brightness }),
          ...(op.contrast !== undefined && { contrast: op.contrast }),
          ...(op.saturation !== undefined && { saturation: op.saturation }),
        });
        return undefined;
      default: {
        const exhaustiveCheck: never = op;
        throw new Error(`Unknown operation type: ${(exhaustiveCheck as BatchOp).type}`);
      }
    }
  }
}
```

**Step 4: Register BatchTimelineOpsTool**

In the same file, find `registerProjectTools()` (~line 380) and add the new tool:

```typescript
export function registerProjectTools(
  registry: { register(tool: Tool): void },
  context: ProjectContext
): void {
  registry.register(new GetTimelineInfoTool(context));
  registry.register(new GetTracksTool(context));
  registry.register(new GetElementsTool(context));
  registry.register(new AddElementTool(context));
  registry.register(new UpdateElementTool(context));
  registry.register(new DeleteElementTool(context));
  registry.register(new GetMediaInfoTool(context));
  registry.register(new BatchTimelineOpsTool(context));  // ← add this line
}
```

**Step 5: Run test to verify it passes**

```bash
cd packages/neko-agent/packages/platform && npx vitest run src/tools/__tests__/batch-timeline.test.ts
```

Expected: all 5 tests pass.

**Step 6: Commit**

```bash
git add packages/neko-agent/packages/platform/src/tools/project-tools.ts \
        packages/neko-agent/packages/platform/src/tools/__tests__/batch-timeline.test.ts
git commit -m "feat(neko-agent): add BatchTimelineOpsTool for batch timeline editing"
```

---

### Task 5: Register BatchTimelineOps in element-editing ToolGroup

**Files:**
- Modify: `packages/neko-agent/packages/agent/src/skill/builtins/tool-skills.ts`

**Background:** `tool-skills.ts` defines ToolGroups that tell the LLM which tools are available based on keyword matching. `element-editing` group is active when user mentions video/audio/clip editing keywords. Adding `'BatchTimelineOps'` to this group makes the tool visible to the LLM when doing edit operations.

**Step 1: Open tool-skills.ts and find elementEditingToolSkill**

The `elementEditingToolSkill` object around line 139 currently has:
```typescript
tools: ['AddElement', 'UpdateElement', 'DeleteElement', 'TrimElement', 'SplitElement'],
```

**Step 2: Add BatchTimelineOps**

Change the `tools` array to:
```typescript
tools: [
  'AddElement',
  'UpdateElement',
  'DeleteElement',
  'TrimElement',
  'SplitElement',
  'BatchTimelineOps',
],
```

**Step 3: Run the existing skill tests to confirm no regression**

```bash
cd packages/neko-agent/packages/agent && npx vitest run
```

Expected: all tests pass (no test touches `builtinToolGroups` contents directly, so this should be green).

**Step 4: Commit**

```bash
git add packages/neko-agent/packages/agent/src/skill/builtins/tool-skills.ts
git commit -m "feat(neko-agent): register BatchTimelineOps in element-editing ToolGroup"
```

---

### Task 6: Full test suite verification

**Step 1: Run all neko-agent tests**

```bash
# agent package
cd packages/neko-agent/packages/agent && npx vitest run

# platform package
cd packages/neko-agent/packages/platform && npx vitest run

# extension package
cd packages/neko-agent/packages/extension && npx vitest run
```

Expected: all pass. No skips.

**Step 2: Typecheck**

```bash
cd packages/neko-agent/packages/extension && npx tsc --noEmit
cd packages/neko-agent/packages/platform && npx tsc --noEmit
```

Fix any type errors before the final commit.

**Step 3: Final commit**

```bash
git commit -m "chore(neko-agent): verify all test suites pass after Phase 4 + BatchTimelineOps"
```

---

## Summary

| Task | Files Changed | Tests Added |
|------|--------------|-------------|
| 1. vitest infra | package.json, vitest.config.ts, __mocks__/vscode.ts | 0 new (12 existing unlocked) |
| 2. conversationHandler tests | conversationHandler.test.ts | ~15 |
| 3. messageHandler tests | messageHandler.test.ts | ~10 |
| 4. BatchTimelineOpsTool | project-tools.ts, batch-timeline.test.ts | 5 |
| 5. ToolGroup registration | tool-skills.ts | 0 |
| **Total** | 6 files | **~30 new + 12 unlocked = ~42** |
