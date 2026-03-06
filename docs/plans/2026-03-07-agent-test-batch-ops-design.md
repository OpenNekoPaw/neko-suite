# Design: Handler Tests + BatchTimelineOps + Test Coverage

> Date: 2026-03-07
> Status: Approved

## Overview

Three coordinated tasks targeting M2 milestone readiness and regression safety:

1. **Phase 4 — Handler unit test infrastructure**: Make existing 12 handler/processor tests runnable by adding vitest config to `@neko-agent/extension`, then add tests for the two untested coordinator modules.
2. **BatchTimelineOps tool**: Enable LLM to submit multiple timeline operations in one tool call (best-effort execution, error summary returned).
3. **Tech debt — test coverage**: Supplement messageHandler + conversationHandler tests within the same vitest setup.

---

## Task 1: Phase 4 — Handler Unit Test Infrastructure

### Problem

12 test files (10 handlers + 2 processors) are fully written under:
```
packages/neko-agent/packages/extension/src/chat/handlers/__tests__/
packages/neko-agent/packages/extension/src/chat/message/__tests__/
```

But `@neko-agent/extension/package.json` has **no `test` script, no vitest dependency, no vitest.config.ts**. These tests cannot be run at all.

### Solution

**Step 1: Add vitest infrastructure to extension package**

`packages/neko-agent/packages/extension/package.json`:
- Add `"vitest": "^2.0.0"` to devDependencies
- Add `"test": "vitest"` and `"test:run": "vitest --run"` scripts

`packages/neko-agent/packages/extension/vitest.config.ts`:
```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    mockReset: true,
  },
});
```

VSCode module mock: handlers use injected mocks (no direct `import * as vscode`), so no global vscode mock needed — confirmed by inspecting all 12 existing test files.

**Step 2: Verify all 12 existing tests pass**

Run: `cd packages/neko-agent/packages/extension && npx vitest run`

Expected: all pass. Fix any import path or mock issues surfaced.

### Acceptance Criteria

- `npx vitest run` in `@neko-agent/extension` exits 0
- All 12 existing test files execute (no skip, no import error)

---

## Task 2: BatchTimelineOps Tool

### Architecture

Follows existing tool execution path — no new layers introduced:

```
LLM calls BatchTimelineOps({ operations: [...] })
  │
  ▼ extensionTools.ts — BatchTimelineOps tool definition
  │  calls api.timeline.batchOps(operations)
  │
  ▼ NekoCutAPI.timeline.batchOps()   [shared type]
  │
  ▼ TimelineToolExecutor.applyBatch(operations[])   [new method]
  │
  ├─ for each op: this.applyTool(op.type, op.params)  [reuse existing]
  │    success → push to results
  │    failure → push error, continue
  │
  └─ return BatchResult { succeeded, failed, results[] }
```

### Operation Types Supported

```typescript
type BatchOp =
  | { type: 'AddElement';         trackId: string; startTime: number; duration: number; elementType: string; src?: string }
  | { type: 'UpdateElement';      id: string; updates: Record<string, unknown> }
  | { type: 'DeleteElement';      id: string }
  | { type: 'TrimElement';        id: string; trimStart?: number; trimEnd?: number }
  | { type: 'SplitElement';       id: string; splitTime: number }
  | { type: 'SetAudioProperties'; id: string; volume?: number; muted?: boolean }
  | { type: 'SetColorCorrection'; id: string; brightness?: number; contrast?: number; saturation?: number }
  | { type: 'AddEffect';          id: string; effectType: string; params?: Record<string, unknown> }
  | { type: 'SetPlaybackSpeed';   id: string; speed: number; reverse?: boolean };
```

### Return Format

```typescript
interface BatchResult {
  succeeded: number;
  failed: number;
  results: Array<{
    index: number;
    type: string;
    success: boolean;
    data?: unknown;     // e.g. { elementId } for AddElement
    error?: string;
  }>;
}
```

### Undo Behavior

Each successful operation produces one undo record (same as individual `applyTool` calls). No transaction wrapper — consistent with Option B (best-effort).

### Files to Modify

| File | Change |
|------|--------|
| `packages/neko-types/src/types/nekoCutAPI.ts` | Add `batchOps(ops: BatchOp[]): Promise<BatchResult>` to `NekoCutAPI.timeline` |
| `packages/neko-cut/.../TimelineToolExecutor.ts` | Add `applyBatch(ops: BatchOp[]): Promise<BatchResult>` |
| `packages/neko-cut/.../videoEditorProvider.ts` | Wire `batchOps` in the exported NekoCutAPI object |
| `packages/neko-agent/.../extensionTools.ts` | Add `BatchTimelineOps` tool definition |
| `packages/neko-agent/.../tool-skills.ts` | Add `'BatchTimelineOps'` to `element-editing` group tools[] |

### Acceptance Criteria

- LLM can invoke `BatchTimelineOps` with 5 mixed operations in one call
- Failed operations return error strings; succeeded ones return data
- `TimelineToolExecutor.test.ts` has batch operation test cases

---

## Task 3: Tech Debt — messageHandler + conversationHandler Tests

### Scope

Two coordinator modules currently without tests:

**messageHandler.ts** (~466 lines) — key test scenarios:
1. `handleUserMessage` with no attachments → delegates to AgentRunner
2. `handleUserMessage` with attachments → calls AttachmentProcessor first, then AgentRunner
3. Agent stream emits `content_delta` → webview receives `streamText`
4. Agent stream emits `tool_call` → webview receives `toolCall` + `toolResult`
5. Task cancel signal (`cancelTask` message) → AbortController.abort() called

**conversationHandler.ts** — key test scenarios:
1. `newConversation()` → generates ID, activates it, posts `conversationCreated`
2. `switchConversation(existingId)` → posts `conversationSwitched`
3. `switchConversation(unknownId)` → graceful fallback (no crash)
4. `listConversations()` → returns correct summary array

### Mock Strategy

Consistent with existing 12 handler tests:
- `AgentRunner` / `AgentManager` → `vi.fn()` or `vi.spyOn()`
- Webview → `{ postMessage: vi.fn() }`
- Stream → async generator mock yielding controlled events
- No real LLM calls

### Target: ~40 new test cases

### Acceptance Criteria

- `npx vitest run` covers messageHandler and conversationHandler
- No `it.skip` or `it.todo` in new files
- All new tests green

---

## Implementation Order

1. vitest config for extension package (unblocks everything)
2. Verify 12 existing tests pass
3. Add messageHandler + conversationHandler tests
4. Add `applyBatch()` to TimelineToolExecutor + tests
5. Wire NekoCutAPI type + videoEditorProvider
6. Register BatchTimelineOps tool in extensionTools + tool-skills

---

## Out of Scope

- neko-cut / neko-tools / neko-assets test coverage (deferred)
- Atomic transaction / rollback for batch ops (Option A/C rejected)
- Batch versions of track-management or export-render tools
