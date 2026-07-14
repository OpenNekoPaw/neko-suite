## Context

The Agent chat surface currently has the right raw identifiers but no single isolation contract:

- Webview tabs store `tabId -> conversationId`, but UI and operations often read global `activeConversationId`.
- Webview session state is split across visible React state, ref maps, host `activeConversation` snapshots, tab-state restoration, and handler-local caches.
- Extension Host keeps a single active conversation in `ConversationBridge`, while tab state sync can replay `sendActiveConversation()` after explicit `switchConversation`.
- Agent runtime, Skill lifecycle, queues, task observation, and logs increasingly operate by `conversationId`, but not every Webview/Extension event is required to carry or validate session identity.

The user-visible failure is session pollution: opening multiple tabs can show or act on another tab's transcript, Skill lifecycle, context, log sequence, queue, or async work. This is a local VSCode client problem, not a cloud tenancy problem. The design should make session ownership explicit without introducing remote-scale service abstractions.

## Goals / Non-Goals

**Goals:**

- Define identity layers: `tabId` for view binding, `conversationId` for session ownership, `turnId` for chat turns, and `runId` only for leased or long-lived work.
- Make each new conversation a complete independent session for prompts, tools, Skills, context, logs, async tasks, terminal/process handles, and UI state.
- Route every session-scoped UI action from the visible tab's `conversationId`.
- Prevent stale host responses, late stream events, and tab-state replays from overwriting another visible session.
- Partition logs and async work by conversation/run so sequence counters and cancellation are diagnosable.
- Add fail-visible diagnostics for missing, stale, ambiguous, or mismatched session identity.
- Preserve existing Skill lifecycle and runtime boundary ownership rather than moving those concerns into a generic session governance layer.

**Non-Goals:**

- Do not add cloud-style tenants, distributed locks, remote service governance, or multi-user collaboration semantics.
- Do not create one OS process per tab by default. Existing pools/processes may remain shared if their ownership is explicit and lease-scoped.
- Do not move Skill lifecycle state back into Agent runtime or Webview. This change routes Skill lifecycle projections by session; it does not redefine Skill lifecycle internals.
- Do not change Rust Engine, Protobuf, or durable project formats.
- Do not preserve stale recoverable Webview caches. They may be rebuilt from conversation history and runtime snapshots.

## Decisions

### Decision 1: Session identity is layered and explicit

Use this model across Webview, Extension, and Agent runtime:

```text
Tab(tabId)
  -> ConversationSession(conversationId)
      -> Turn(turnId)
          -> model calls, tool calls, active turn timeline
      -> Run(runId)
          -> leased workflows, artifacts, tasks, terminals, process/media work
```

- `tabId` identifies a Webview UI tab only.
- `conversationId` is the authority for session state and operations.
- `turnId` identifies a user/assistant turn inside a conversation.
- `runId` identifies work whose lifecycle can outlive one synchronous UI action, produce durable artifacts/tasks, require cancellation, or lease a terminal/process/media handle.
- Ordinary model-call and tool-call logs inside one chat turn use `turnId` plus request ids. They SHOULD NOT duplicate `runId` when the run would be exactly the same identity as the turn.
- A long-lived run may record the initiating `turnId` for correlation, but `runId` and `turnId` remain different concepts.

Rationale: Current code already uses these concepts separately, but `AgentSession` currently assigns the active run id from the newly created turn id. That makes logs noisy and hides whether an event belongs to a chat turn or a durable workflow. Naming the layering prevents a tab operation from falling back to the last global active conversation and prevents `runId` from becoming a generic alias for `turnId`.

Rejected alternative: make `tabId` the runtime owner. Tabs are disposable UI views; tying runtime to tabs would lose running work when a tab is closed or restored and would conflict with conversation history.

Rejected alternative: always emit both `runId` and `turnId`. That over-specifies ordinary LLM turns and creates confusing records such as `runId === turnId`. Logs should carry the smallest identity set that distinguishes ownership.

### Decision 2: Webview owns one canonical `ConversationSessionState` map

Normalize Webview visible state around a single session store keyed by `conversationId`. Each entry includes at least:

- messages and streaming state;
- queued message snapshot and active timeline;
- prompt mode and session/input state;
- context chips, ambient nodes, token count, compression state;
- active Skill lifecycle projection and activation progress;
- Agent state and work items;
- recoverable UI draft state such as input, attachments, and selected references.

Visible React state becomes a projection of `activeTabConversationId` from this map. Host `activeConversation` snapshots update the matching session entry; they do not directly overwrite unrelated visible state.

Rationale: The current split between `messages`, `conversationMessagesRef`, `conversationStreamingRef`, and host snapshots creates stale-cache priority bugs. A canonical map keeps cache and visible projection in one path.

Rejected alternative: patch each existing ref map independently. That would reduce the immediate symptom but leave future context, Skill, queue, and task additions exposed to the same global-active bug.

### Decision 3: Host snapshots are authoritative only for their session and freshness class

`activeConversation` and related host snapshots SHALL be treated as session-scoped payloads:

- If a snapshot has `conversationId`, it updates that conversation entry.
- If a foreground activation is pending, only the expected `conversationId` may become visible.
- A stale snapshot for another conversation may refresh background cache but MUST NOT change `activeTabId`, visible messages, visible Skill state, visible queue state, or operation target.
- When host messages include persisted messages, the presenter must have an explicit conflict rule between persisted data and local in-flight state instead of blindly preferring non-empty local cache.

Rationale: Extension `_updateTabState()` and `switchConversation` can both cause active conversation snapshots. The Webview must make routing deterministic under replay.

Rejected alternative: rely on arrival order. Arrival order is exactly what fails during tab restore, new conversation activation, and concurrent async events.

### Decision 4: UI operations target the visible tab conversation

Chat send, direct Skill invocation, slash commands, plan actions, queue actions, context compression, clear history, task actions, model/session settings updates, and active Skill clear actions SHALL resolve their `conversationId` from the active tab binding.

Rules:

- If `activeTabConversationId` and `activeConversationId` differ during a transition, normal mutation actions are disabled or rejected with a switching diagnostic.
- No operation may silently fall back from missing `conversationId` to global active conversation.
- Entry-page actions without a conversation may create a new conversation, but the pending send/menu/input request must bind to the newly created `conversationId` before dispatch.

Rationale: The user operates the visible tab, not the Extension Host's last active conversation.

Rejected alternative: keep using `activeConversationId` and rely on switching locks. This fails when late host events briefly move active state or when tab state is restored without a matching host switch.

### Decision 5: Runtime work uses session-scoped leases, not per-tab processes

Agent turns, terminals, process handles, tool confirmations, pending queues, task observers, and media/background tasks are owned by explicit session identity.

- A chat turn is owned by `{ conversationId, turnId }`.
- A durable workflow, artifact/task generation, terminal/process handle, or media/background task is owned by `{ conversationId, runId }`, with optional `turnId` when the run was initiated by a chat turn.
- A shared process/terminal pool is allowed when each handle is leased to exactly one conversation/run at a time.
- Events emitted by a leased handle must carry the lease identity.
- Cancellation and confirmation must address the same identity that created the run.
- A late event from a disposed or transferred lease must be rejected or logged as stale, not applied to the current active conversation.

Rationale: The user's requirement is no conflicts across new processes/tabs/terminals. We can satisfy that with explicit ownership and leases without spawning unnecessary processes for every tab.

Rejected alternative: start a dedicated runtime process per tab. That overfits the symptom, increases resource use, and does not solve stale Webview/Extension routing by itself.

### Decision 6: Logs are partitioned by conversation and turn/run

Every Agent model-call, tool, Skill lifecycle, task, terminal/process, and Webview-routing log that describes session work SHALL include:

- `conversationId`;
- `turnId` for chat-turn-scoped model/tool/timeline work;
- `runId` for durable workflow, artifact/task, terminal/process, media, or background work;
- optional `tabId` for UI diagnostics;
- `writerId` for the local JSONL writer instance;
- a sequence number local to the log partition.

Active session logs SHALL be physically routed to `.neko/logs/conversations/<conversationId>/`:

- model-call logs use `model-calls.jsonl`;
- workspace event logs use `events.jsonl`;
- approval audit logs use `audits.jsonl`;
- step logs use `steps.jsonl`.

Within a per-conversation physical file, `seq` is file-local diagnostic ordering for one writer instance and `writerId` distinguishes concurrent local writers. Session interpretation still uses the partition identity and `partitionSeq`. Workspace-level aggregate logs may exist only as supplemental diagnostics or migration artifacts; they MUST NOT be the ownership authority for active tab/session routing. If a legacy caller currently derives `runId` from `turnId`, log builders SHOULD omit duplicate `runId` until a real run identity exists.

Rationale: The observed "old seq in new tab" is ambiguous without partition identity. Per-session turn/run logging makes real pollution visible and makes harmless global counters less confusing.

Follow-up rationale: a single workspace-level JSONL file still makes new sessions appear coupled and allows tooling to accidentally treat global `seq` as a session cursor. Per-conversation files align the physical write boundary with the logical `conversationId` owner while preserving turn/run partitions inside the file.

Rejected alternative: reset one global recorder sequence on new tab creation. That would hide concurrency and still fail when two sessions run at once.

Rejected alternative: treat `runId` as a required field for every model-call log. A model call is already uniquely scoped by `{ conversationId, turnId, llmRequestId }`; forcing `runId` creates a false lifecycle boundary.

Rejected alternative: keep only one workspace-level JSONL file with partition fields. It is compact for tailing, but it does not satisfy the user's requirement that each new conversation session be independently diagnosable and it keeps `seq` visually coupled across tabs.

### Decision 7: Missing or mismatched identity fails visibly

Session-scoped messages and actions fail closed when identity is missing, ambiguous, or mismatched:

- Webview-to-Extension messages that mutate session state must parse with a non-empty `conversationId`.
- Extension-to-Webview events that mutate session state must carry `conversationId`.
- Runtime events that represent in-flight work must carry `turnId` or `runId` when available.
- Unknown conversation, closed session, stale lease, or active-tab mismatch returns a diagnostic or test failure instead of no-op success.

Rationale: Silent fallback to "current active" is the core pollution mechanism.

Rejected alternative: tolerate missing identity for compatibility. This is prelaunch internal behavior; preserving fallback would mask the new canonical path.

### Decision 8: Verification is path-level, not result-only

Tests must prove the canonical session path was hit:

- Webview handler tests should poison stale caches and assert host snapshots do not show another conversation.
- Operation tests should render active tab B while active conversation A exists and assert sends/Skills/plans target B or are rejected while switching.
- Runtime tests should run two conversations concurrently and assert queues, logs, task events, terminal/process output, and cancellation stay scoped.
- Legacy fallback tests should prove missing-identity routes fail visibly.

Rationale: Result-only tests can pass through stale cache, global active fallback, or legacy handler aliases.

### Decision 9: Session-owned storage is partitioned and race-aware

Session persistence and runtime caches must distinguish three storage classes:

- Authoritative per-conversation history: journal files keyed by `conversationId`.
- Rebuildable shared indexes/caches: conversation index, artifact index, generated-resource indexes, task projections.
- Diagnostic logs: append-only JSONL with partition identity and optional global ordering metadata.

Rules:

- Per-conversation journals remain the authority for transcript recovery; shared indexes must be rebuildable and must not be the only source of session ownership.
- Whole-file JSON snapshot stores must not silently merge unrelated sessions by reading current global active state. Updates must be keyed by `conversationId`, `runId`, or explicit resource id.
- Same-process writes should be serialized through an existing queue/debounce/pending promise. Cross-process or multi-window writes to the same workspace-global file require a visible ownership guard, version check, or stale-write diagnostic.
- The project-level session lock is only advisory today. It may surface conflicts, but it is not an OS-level mutex and cannot be treated as sufficient protection against simultaneous writers.
- Tab state stored in VSCode `workspaceState` is view persistence only. Replaying tab state must not become a second implicit authority that switches runtime sessions or overwrites Webview foreground state without an expected activation identity.
- JSONL appends may use global `seq` for file ordering, but analysis must use `{ conversationId, turnId/runId, requestId }` plus partition-local sequence where needed. Multiple writers to the same log file must be distinguishable by session instance or partition fields.

Rationale: The reported "new tab uses old seq" is only diagnosable if reads, writes, and logs expose their partition. Current replace-on-write JSON caches and instance-local log counters can look like session pollution even when the data is merely globally ordered; they can also hide real pollution when late writes or cross-process writers clobber newer state.

Rejected alternative: introduce distributed locking or one process per tab. This is a local VSCode product. The right boundary is explicit local ownership, rebuildable caches, fail-visible stale writes, and targeted lease checks.

### Current shared-boundary audit

The isolation risk is broader than visible tabs. The current Agent code has several local shared boundaries that must be treated as either partitioned authority, rebuildable cache, or diagnostic append stream:

| Boundary | Current independence | Race / pollution risk | Required treatment |
| --- | --- | --- | --- |
| Webview `conversationMessagesRef` / `conversationStreamingRef` plus visible React state | Partially keyed by `conversationId`, but foreground state and cache can diverge | Late `activeConversation`, tab replay, or stale cache can re-display another session's messages, queue, or streaming state | Collapse into a `ConversationSessionState` projection and update visible state plus cache through one session-scoped path |
| VSCode `workspaceState` tab state | Stores view restoration only, but tab sync can trigger host active conversation changes | Replayed tab state can behave like a second runtime authority if it calls `sendActiveConversation()` after another tab/session is foreground | Keep tab state view-only; gate any runtime switch by expected `conversationId` |
| Per-conversation journal JSONL | Partitioned by conversation file and session-local sequence | Two local writers targeting the same conversation file can interleave; recovery must not use current active tab as owner | Keep journal as transcript authority; include writer/session diagnostics for same-conversation concurrent writers |
| `conversations-index.json` | Shared whole-file metadata index with debounced in-memory writes | Multiple VSCode windows or terminals can overwrite newer metadata with stale memory state | Classify as rebuildable/guarded index; add version/owner diagnostics or rebuild from journals |
| Model-call JSONL recorder | Per-conversation physical file with writer-local `seq`; partition fields remain canonical | Multi-process appends to the same conversation file can still interleave | Treat `seq` as supplemental; require `{ conversationId, turnId, llmRequestId }` or `{ conversationId, runId }` plus partition-local sequence and `writerId` |
| `events.jsonl`, `audits.jsonl`, `steps.jsonl` | Per-conversation physical files under `.neko/logs/conversations/<conversationId>/` | Same conversation in two VSCode windows can still interleave appends | Attach conversation and turn/run identity to every session-scoped event; use `writerId`, partition fields, and file path together for diagnostics |
| Task storage and task recovery storage | Task ids are keyed, but file/globalState stores are shared arrays with whole-file replacement | Recovery from one session/process can clobber or resurrect another session's task without owner checks | Require task records to carry `conversationId` and `runId` when session-owned; add stale writer diagnostics for shared stores |
| Generated asset index | Rebuildable index using whole-file atomic rename | Two index instances can lose each other's additions; silent failures hide stale views | Treat as rebuildable cache; retain asset/resource ownership metadata and rebuild after conflict |
| Session lock | Project-level advisory file | It detects many conflicts but is not an OS mutex and can be stolen by interleaved acquire/write | Use it only as a visible conflict diagnostic; do not rely on it as the only write-safety mechanism |

This audit intentionally stays within local-product boundaries: no distributed locking, no tenant layer, and no process-per-tab requirement. The next implementation slices should add narrow owner/version diagnostics and rebuild paths at these boundaries instead of introducing a broad session governance service.

### Runtime ownership audit

The 5.1 implementation audit checked the current runtime event sources before splitting turn/run identity:

| Boundary | Current identity | Gap / risk | Next treatment |
| --- | --- | --- | --- |
| `AgentSessionRunner` and pending message queue | Queue items include `conversationId`; runner emits activation progress with `conversationId` | Runner busy state is per session instance, but queued message actions still only prove conversation ownership, not turn/run lease ownership | Keep queue operations conversation-scoped; add run/turn lease checks only for events that can outlive the turn |
| `AgentSession.execute()` | Creates `turnId`; sets `_activeTurnRunId = turnId`; forwards `conversationId`, `turnId`, and duplicate `runId` into trace metadata | Ordinary chat turns still make `runId` an alias of `turnId`, which causes the reported run/turn overloading in logs and durable work | 5.2 splits chat-turn trace from durable run trace; ordinary LLM/tool logs omit duplicate `runId` |
| Agent stream/background task projection | `TaskCreated`, `TaskUpdated`, queue, timeline, and progress messages carry `conversationId`; background task observers ignore progress from another conversation | Background task projections do not yet carry a distinct run lease; terminal completion can only be matched by task id plus conversation | 5.3/5.4 add `{ conversationId, runId }` ownership for long-running task observers |
| Media turn runtime and media task executor | Media task Webview messages carry `conversationId`; media tool metadata preserves `conversationId` and result delivery policy | Media tool metadata receives `runId`/`turnId` in trace but currently persists only `conversationId`; terminal media task observation loses real run ownership | 5.3/6.2 propagate real `runId` into media task metadata and terminal observations |
| Task manager terminal callbacks | Terminal subscribers receive the terminal `Task`; tasks carry lifecycle owner conversation in current fixtures | Terminal callback contract does not require `runId`; replayed terminal tasks can only be grouped by task id/conversation metadata | Add lease metadata or typed stale diagnostic before terminal output/continuation can resume Agent work |
| Skill lifecycle progress | Activation progress callback carries `conversationId`; lifecycle lifetimes already model turn/run-like scopes (`turnId`, `runId`) | Projection route is session-safe, but lifetime expiration depends on future correct turn/run split | Keep Skill routing by `conversationId`; after 5.2, expire turn-scoped and run-scoped lifetimes using distinct ids |

## Five-Layer Analysis

### Responsibility

- Webview owns visible tab projection and recoverable UI session state.
- Extension owns VSCode Webview lifecycle, tab state persistence, conversation history bridge, and host message routing.
- Agent runtime owns conversation/turn/run execution, Skill lifecycle consumption, queue/task/process ownership, and turn/run-scoped logs.
- Skill lifecycle remains in its existing skill-owned runtime and is projected into sessions by `conversationId`.
- Persistence code owns write ordering and recovery semantics for its storage class; it must not infer session ownership from current active UI state.

### Dependency

- Layer 0 contracts and protocol validators live in `@neko-agent/types` or existing shared packages.
- Extension adapters do not import React or Webview implementation.
- Webview does not import VSCode, Node, Extension implementations, or Agent runtime internals.
- Agent runtime stays host-neutral and does not import Extension/Webview code.

### Interface

- Prefer tightening existing message DTOs and validators over adding a new transport layer.
- Add small session identity helper types only where they are consumed by multiple packages.
- Keep tab state DTOs view-focused; do not store runtime handles, blob URLs, Engine tokens, or process objects in tab state.
- Add structured stale/mismatch diagnostics for tests and safe user-facing errors.
- Add explicit storage partition metadata where a file or cache can contain entries from multiple conversations/runs.

### Extension

- New session-bound features must add state under `ConversationSessionState` or Agent runtime's `{ conversationId, turnId/runId }` ownership, not new global active refs.
- If a shared process/task runner is introduced, it must expose explicit lease ownership before events can be routed.
- Future Webview actions should accept a visible-session target instead of reading global active state.
- Future persistence work must state whether the target file is authoritative, rebuildable cache, or diagnostic log, and what happens under concurrent local writers.

### Testing

- Unit tests: presenters, handlers, operation hooks, runtime lease/log/session helpers.
- Integration-style Vitest: Webview `ConversationController` and `ChatWorkspace` multi-tab races.
- Extension tests: chat router, tab state sync, conversation bridge snapshots.
- Agent runtime tests: concurrent runs, task observation, queue isolation, log partitioning.
- Storage tests: stale shared-index writes, partition-local log sequence, duplicate `runId === turnId` suppression, and multi-writer diagnostics for workspace-global files.
- Real VS Code Webview functional scenarios: tab switching, new conversation creation, Skill indicator isolation, queue/task controls, cancellation, durable projections, and runtime error gates.

### Proportionality

The design uses existing local identifiers and typed message contracts. It avoids distributed locks, tenants, remote sessions, new daemons, or a process-per-tab model because this is a local VSCode client with local runtime work.

### Fail-Visible Behavior

Missing `conversationId`, mismatched active tab/session, unknown session, stale run lease, or legacy active-conversation fallback should throw in tests, return typed diagnostics, or surface a safe Webview error. They should not update the active session, return success, or silently no-op.

Storage conflicts should also be fail-visible at the owning boundary: unknown conversation writes, stale run writes, active-tab mismatch, session-lock conflict, or index/version mismatch should return diagnostics or be rebuilt from authoritative data instead of being silently treated as success.

## Risks / Trade-offs

- [Risk] Refactoring Webview state in one large step could destabilize active chat UI. -> Mitigation: first add failing isolation tests and stop-the-bleed fixes, then consolidate state behind a small session store.
- [Risk] Some existing tests may rely on active-conversation fallback. -> Mitigation: classify them as legacy behavior and update them to pass explicit identities.
- [Risk] More explicit identity fields make protocols noisier. -> Mitigation: provide small builders/helpers while keeping transport and ownership simple.
- [Risk] Shared terminal/process pools may still leak output if lease boundaries are partial. -> Mitigation: require lease identity on every emitted event and add stale-lease rejection tests.
- [Risk] Per-conversation log files can break tools expecting one workspace-global JSONL. -> Mitigation: keep canonical filenames stable under the conversation directory and keep partition fields in every row; any aggregate reader must be explicit and diagnostic-only.
- [Risk] Whole-file JSON stores can lose updates under multiple VSCode windows or processes. -> Mitigation: classify authoritative vs rebuildable state, add version/owner diagnostics where needed, and keep journals/artifacts as sources of truth.
- [Risk] Removing duplicate `runId` from turn logs can break ad hoc log filters. -> Mitigation: document `{ conversationId, turnId, llmRequestId }` as the canonical model-call key and keep `runId` only for real workflows.

## Migration Plan

1. Add characterization tests that reproduce the reported pollution:
   - stale conversation cache overrides a new/foreground host snapshot;
   - active tab B with active conversation A cannot send or clear Skill on A;
   - queued messages and activation progress do not persist across tabs;
   - logs and async events carry session identity.
2. Stop the current Webview leaks:
   - synchronize foreground `activeConversation` projection into the session cache;
   - update queued message arrays alongside queued counts;
   - stop blindly preferring stale cache over host snapshot without a freshness rule;
   - reject or disable mutation operations during active tab/session mismatch.
3. Introduce the canonical Webview session state map and route visible state through `activeTabConversationId`.
4. Tighten Webview-to-Extension and Extension-to-Webview validators/builders so session mutations require explicit identity.
5. Split turn identity from run identity:
   - model/tool/timeline logs use `{ conversationId, turnId, requestId }`;
   - durable workflows, artifacts, task projections, terminals/processes, and media/background tasks use `{ conversationId, runId }`;
   - duplicate `runId === turnId` is removed from ordinary turn logs.
6. Add ownership for async task, terminal/process, queue, and log events, using `turnId` or `runId` according to lifecycle.
7. Audit storage writes:
   - confirm per-conversation journals remain authoritative;
   - classify shared JSON files as rebuildable caches or guarded state;
   - add stale-write diagnostics or owner/version checks where same-workspace multi-process writes can clobber state.
8. Remove or fail-close legacy current-active fallback paths inside the scoped boundary.
9. Run focused package tests, `pnpm check` or affected check commands, and focused real VS Code Webview functional scenarios.

Rollback is local and non-destructive: revert Webview/Extension/runtime routing changes and keep conversation histories intact. Recoverable Webview session caches may be rebuilt from persisted conversation history and runtime snapshots.

## Open Questions

- Should the first implementation slice introduce a named `ConversationSessionState` type in `@neko-agent/types`, or keep it Webview-local until Extension/runtime consumers need it?
- Resolved: active JSONL logs are physically separated per conversation; run/turn identity remains row-level partition metadata inside the conversation file.
- Which terminal/process abstractions currently need leases first: Agent shell tool runs, media task executors, or future user-visible terminal panels?
- Should stale host snapshots update background cache when local in-flight state exists, or should they be ignored until the run completes?
- Should workspace-global JSON snapshot stores add optimistic version checks, rely on advisory session-lock diagnostics, or be rebuilt from authoritative per-conversation journals/artifacts after conflicts?

## 2026-07-12 Webview Tab Activation Convergence

### Problem

The Webview data plane is partitioned by `conversationId`, but ordinary Tab activation is still split across two control messages (`switchConversation` and `updateTabState`) and Host projections are not correlated to the activation that requested them. A late `activeConversation` or `tabState` response can therefore compete with a newer foreground selection. Normalized Markdown correctly fails visible when that control-plane race exposes a streaming message before its Timeline-owned Markdown session is active.

### Decision

- Keep one foreground React projection and per-conversation canonical render resources. Do not mount one React/virtual-list/Markdown tree per Tab.
- Treat an ordinary Tab switch as one activation transaction carrying `activationId`, the complete next `TabState`, and `expectedTabStateRevision`.
- The Extension owns the accepted monotonic Tab revision. It must reject stale activation or persistence writes and return the current authoritative `tabState` plus a diagnostic.
- `activeConversation` produced by an activation must echo `{ activationId, tabStateRevision }`; the Webview may cache stale responses but may only project the response whose activation identity matches the pending foreground activation.
- Uncorrelated `activeConversation` remains valid only for explicit initial/reload queries and new-conversation creation, where the existing new-session identity rule applies.
- Foreground swaps flush only the previous foreground conversation's Timeline partition. Background conversations remain independently scheduled.
- A target with no retained render snapshot projects an explicit `loading` availability state until the correlated Host snapshot arrives; it must not masquerade as an empty conversation.
- Session diagnostics are owned by `conversationId`; only provider/config/auth failures without conversation identity use the global diagnostic owner.

### Canonical Activation Order

```text
Webview allocate activationId + optimistic expected revision
→ Webview persist previous foreground viewport/input/render state
→ Webview flush previous conversation Timeline partition
→ Webview locally project retained target snapshot or loading state
→ Webview send one activation transaction with next TabState
→ Extension compare-and-apply Tab revision + switch active conversation
→ Extension asynchronously project resources
→ Extension send correlated activeConversation
→ Webview cache stale responses; only matching activation commits foreground
→ Webview prepares Markdown sessions before visible React publication
```

### Rejected Alternatives

- Permanently mount one React tree per Tab: rejected because it multiplies virtual lists, Markdown subscriptions, focus/scroll ownership, and cleanup paths while not fixing Host message ordering.
- Restore raw/locally parsed Markdown fallback for streaming: rejected because it hides Timeline/Markdown ownership violations and recreates dual rendering paths.
- Add more conversation-id inference guards without protocol correlation: rejected because A→B→C ordering cannot be proven from identity alone when multiple responses target open Tabs.
