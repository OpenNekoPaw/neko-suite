# Webview Business Logic Sink Analysis

> Analysis of which webview logic should sink down to agent/extension layer
>
> **进度**: Category A-C ✅ 完成（3/6），Category D-F ⏳ 待实施

## Current Layer Responsibilities

```
@neko/agent (AgentSession)     — ReAct loop, event streaming, tool confirmation, context compression
      ↓ AgentEvent stream
Extension Host                 — AgentStreamProcessor, ConversationManager, bridge
      ↓ postMessage
Webview (React)                — Handlers, hooks, state management, UI rendering
```

**Core Problem:** Webview contains ~25-30% business logic that belongs in agent or extension layer. This creates duplication, makes testing harder, and prevents TUI from sharing the same logic.

---

## Category A: Message Queue & Deduplication ✅ DONE

**Status:** Completed — Webview queue removed, Extension AgentRunner handles all queueing.

**What was done:**
- Deleted `webview/hooks/useMessageQueue.ts` (183 lines of redundant queue logic)
- Simplified `useChatActions.ts` — `handleSend()` always sends directly to Extension
- AgentRunner's `_pendingMessages` (already existed) handles queueing when agent is running
- Added lightweight 1s dedup guard in webview (prevents double-click only)
- Removed all `QueuedMessage` types, props, and UI from 6 files

---

## Category B: Plan Parsing & Step Status Tracking ✅ DONE

**Status:** Completed — Single `parsePlanMarkdown` in `@neko/agent`, Extension sends pre-parsed Plan.

**What was done:**
- Created shared `agent/src/plan/` module — `types.ts`, `plan-parser.ts`, `index.ts`
- `parsePlanMarkdown()` is now the single source of truth in `@neko/agent`
- Extension imports from `@neko/agent`, deleted local Plan/PlanStep interfaces and parsePlanMarkdown
- Extension `toolResult` message now includes `plan` field (pre-parsed Plan object)
- Webview deleted duplicate `parsePlanMarkdown` (~40 lines), uses `message.plan` directly

---

## Category C: Background Task Creation & Status Mapping ✅ DONE

**Status:** Completed — Extension sends `taskCreated`, Webview no longer creates tasks.

**What was done:**
- Extension `_subscribeToTaskProgress()` now sends `taskCreated` message immediately on `backgroundMode: true`
- Task type inference and status mapping moved from Webview to Extension
- Webview deleted ~40 lines of task creation logic from `handleToolResult`
- Webview's pre-existing `handleTaskCreated` handler (was registered but never triggered) now receives and renders tasks
- Data flow: Extension creates → `taskCreated` → Webview renders; Extension updates → `taskUpdated` → Webview merges

---

## Category D: Multi-Conversation State Caching

**Current location:** `webview/hooks/useConversationState.ts` + `handlers/message-updater.ts`

**Logic in webview:**
```typescript
// Per-conversation state Maps (webview-side caching)
const conversationMessagesRef = useRef<Map<string, Message[]>>(new Map());
const conversationStreamingRef = useRef<Map<string, StreamingState>>(new Map());
const conversationTokenCountRef = useRef<Map<string, number>>(new Map());

// Dual code path: current vs non-current conversation
function updateConversation(context, conversationId, updater) {
  if (isCurrentConversation) { /* update React state */ }
  else { /* update Map cache */ }
}
```

**Should sink to:** Extension `ConversationManager`

**Rationale:**
- Conversation persistence is **data management**, not UI concern
- Webview maintains hidden state for non-visible conversations — architectural smell
- Two code paths (current vs non-current) for every handler is a **design smell**
- Extension should own all conversation state; webview only displays active conversation
- On conversation switch: Extension sends full state → Webview replaces (no caching)

**Target design:**
```
Extension ConversationManager owns all conversation state
  ├─ Active conversation → full state pushed to webview
  ├─ Non-current conversations → stored in extension only
  └─ On switch: Extension sends complete snapshot → Webview replaces state

Webview: single conversation state only (no Maps, no dual paths)
```

**Impact:** Largest refactor — touches every handler that uses `updateConversation()`.

---

## Category E: Slash Command Action Routing

**Current location:** `webview/handlers/command-handlers.ts:15-177`

**Logic in webview:**
```typescript
switch (message.action) {
  case 'exit': closeCurrentTab(context); break;
  case 'togglePlanMode': context.setSettings(prev => ({
    ...prev, promptMode: message.data.planMode ? 'plan' : 'default'
  })); break;
  case 'showStatus': /* format status → add as message */ break;
  case 'resumeConversation': /* format list → add as message */ break;
  // ... more action handlers
}
```

**Should sink to:** Extension command handler bridge

**Rationale:**
- Command **execution** already happens in agent (`CommandExecutor`)
- Result **action routing** (state mutations) should happen in extension
- Webview should only receive **final display updates**, not interpret action semantics
- Currently: webview does routing → state update → message display (too much)

**Target design:**
```
Extension receives command result
  → Extension performs action (mode switch, conversation switch, etc.)
  → Extension sends state updates to webview
  → Webview only displays received updates
```

---

## Category F: Conversation Session Isolation

**Current location:** `webview/hooks/useConversationSession.ts`

**Logic in webview:**
- Per-conversation input value caching (draft preservation)
- Per-conversation file attachment caching
- Save/restore on conversation switch

**Assessment:** **Borderline** — input drafts are UI state, but attachment management has file system implications.

**Recommendation:** Keep input draft caching in webview (pure UI state). Move file attachment state to extension (since files are on disk, not in webview sandbox).

---

## Summary: Sink Priority Matrix

| Logic | Current | Target | Priority | Status |
|-------|---------|--------|----------|--------|
| Message queue + dedup | ~~Webview~~ | Agent | **P0** | ✅ Done |
| Plan parsing | ~~Both (dup!)~~ | Agent | **P0** | ✅ Done |
| Background task creation | ~~Webview~~ | Extension | **P1** | ✅ Done |
| Multi-conv state cache | Webview | Extension | **P1** | ⬜ Pending |
| Command action routing | Webview | Extension | **P2** | ⬜ Pending |
| File attachment state | Webview | Extension | **P2** | ⬜ Pending |

---

## What Correctly Lives in Webview

| Logic | Rationale |
|-------|-----------|
| Streaming text accumulation | UI rendering concern (text_delta → display) |
| ContentBlock construction | Display model (thinking → tool_call → text ordering) |
| isStreaming / isThinking flags | UI state for cursor/animation |
| Input history & keyboard shortcuts | Local UI interaction |
| Tab management (open/close/switch) | VSCode UI concern |
| Scroll position & focus state | Pure presentation |
| Theme & styling | Rendering only |

---

## Architecture After Sink

```
@neko/agent (AgentSession)
  ├─ ReAct loop + event streaming
  ├─ Message queue + dedup          ✅ DONE (AgentRunner._pendingMessages)
  ├─ Plan parsing → structured Plan ✅ DONE (agent/src/plan/)
  ├─ Tool confirmation flow
  └─ Context compression

Extension Host
  ├─ ConversationManager (full state) ← TODO (from webview caching)
  ├─ BackgroundTaskManager            ✅ DONE (sends taskCreated)
  ├─ Command action routing           ← TODO (from webview)
  └─ Bridge: Agent ↔ Webview/TUI

Webview (Pure UI)
  ├─ Render received state (still has multi-conv caching)
  ├─ Streaming text accumulation
  ├─ Input editing & shortcuts
  └─ Tab & scroll management

TUI (Pure UI)
  ├─ Render received state
  ├─ Streaming text accumulation
  ├─ Input editing & shortcuts
  └─ Terminal-specific (color, resize)
```

**Key benefit:** Agent layer becomes the single source of business logic. Both Webview and TUI become thin UI shells consuming the same `AgentEvent` stream, with shared logic in agent/extension.
