## Why

Agent chat tabs currently share too much mutable "active conversation" state across Webview, Extension, runtime events, logs, tasks, and UI actions. This causes real session pollution: a newly opened tab can display or operate on another tab's messages, Skill state, context, queue, or async work when tab switching and Agent events race.

This change is needed now because Agent Skills, task observation, message queues, Webview tab restoration, and runtime boundary work have all become conversation-scoped, but the tab/session isolation contract is still implicit and fragmented.

## What Changes

- Introduce an explicit Agent session isolation contract:
  - `tabId` is a view binding only;
  - `conversationId` owns session state;
  - `turnId` identifies a chat turn;
  - `runId` identifies leased or long-lived work only when that lifecycle is distinct from the turn.
- Make every newly created conversation session complete and independent across prompt mode, Skill lifecycle projection, tools, context, messages, streaming state, queue, Agent state, logs, work items, async tasks, and terminal/process handles.
- Require Webview-visible operations to resolve their target from the active tab's `conversationId`, not from a global active conversation fallback.
- Require all Webview-to-Extension, Extension-to-Webview, Agent runtime, task, terminal/process, and log events that mutate or display session state to carry explicit session identity.
- Make stale, missing, mismatched, or ambiguous session identity fail visibly instead of applying events to the current active session.
- Normalize Webview state ownership so authoritative conversation/session state is not split between host snapshots, global UI state, and stale per-conversation caches without conflict rules.
- Add logging partition rules so model/tool logs are meaningful inside `{ conversationId, turnId, requestId }`, durable workflow/process/task logs are meaningful inside `{ conversationId, runId }`, and global sequence counters remain diagnostic only.
- Route active JSONL logs into per-conversation physical files under `.neko/logs/conversations/<conversationId>/` so opening a new tab does not share the previous session's log file or file-local `seq`.
- Add storage race requirements for per-conversation journals, shared JSON caches/indexes, VSCode tab state, and multi-window/process writers.
- Track the concrete local shared boundaries that still need hardening: Webview session refs, VSCode tab state, conversation index, task/recovery stores, generated-asset indexes, JSONL logs, and the advisory session lock.
- Add concurrency requirements for multiple tabs, multiple terminal/process runs, and repeated new conversation creation.
- **BREAKING** for unreleased internal Webview/Agent runtime behavior: remove or fail-close default routing that silently falls back to the current active conversation when a session-scoped request lacks an explicit `conversationId`.

## Capabilities

### New Capabilities

- `agent-session-isolation`: Defines Agent tab/session/turn/run identity, per-session state ownership, explicit message routing, concurrent task/process/log/storage isolation, and fail-visible behavior for stale or ambiguous session events.

### Modified Capabilities

- None. Existing Webview bridge, Skill lifecycle, config snapshot, task observation, and runtime boundary capabilities remain owners of their domain behavior; this change adds the cross-cutting session isolation contract they must route through.

## Impact

- Affected packages:
  - `packages/neko-agent/packages/agent-types`: shared Webview/Agent protocol identity requirements and diagnostics if new DTO fields or validators are needed.
  - `packages/neko-agent/packages/webview`: `ConversationController`, `ChatWorkspace`, message handlers, tab handlers, presenters, input/session hooks, active Skill/progress/context/queue projections.
  - `packages/neko-agent/packages/extension`: chat message router, `ChatViewProvider` tab state sync, `ConversationBridge`, `ConversationMessageHandler`, task/skill/context/settings routes, log recorders, process/terminal bridges.
  - `packages/neko-agent/packages/agent`: Agent runtime manager, session runner, turn runtime, stream state, task observation, Skill lifecycle projection integration, log/turn/run identity, workspace storage/index/log writers.
  - `packages/neko-agent/packages/platform` or adjacent services if media/background task executors attach process or terminal handles to Agent conversations.
- No Rust engine or Protobuf changes are expected.
- No durable user project file migration is expected.
- Existing conversation histories should remain readable; volatile Webview session caches may be discarded or rebuilt because they are recoverable UI/runtime state.
- Validation must cover Webview handler races, active tab operation targeting, stale host response handling, concurrent Agent runs, log partitioning, storage write races, terminal/process ownership, and VS Code Webview runtime behavior.
