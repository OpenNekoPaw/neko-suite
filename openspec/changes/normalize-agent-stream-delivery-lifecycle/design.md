## Context

The reported Agent run produced a valid 5,057-character animation-planning answer and ended with `creation.run.ended: completed`, but the Neko Agent Webview reloaded to an empty/new-conversation state. The same interval contained approximately 4,000 stream-loop compaction checks and hundreds of conversation-sync warnings caused by overlapping writes to `~/.neko/conversations-index.json`.

The current path conflates four different update domains:

```text
provider transport chunk
  -> AgentStep/content_delta
  -> AgentSession loop iteration and compaction check
  -> cumulative AgentTurnTimelineItem snapshot
  -> Extension resource projection + webview.postMessage
  -> Webview Timeline merge + messages projection
  -> full Markdown preprocessing/parse + React reconciliation
  -> periodic fire-and-forget conversation save
```

A provider chunk is latency-oriented transport data, not a semantic Agent step, durable history commit, UI frame, or persistence transaction. The current cumulative text payload makes normal streaming quadratic: every delta rebuilds and transports all prior text. The Webview then treats every transport message as a state/render transaction. Separately, `ConversationPersistenceRuntime.queueConversationSync()` starts independent writes even though all of them mutate one guarded index authority.

Related active changes already define adjacent ownership:

- `normalize-agent-session-isolation` owns conversation/turn/run identity and stale-session routing.
- `normalize-agent-tui-markdown-rendering` owns `@neko/markdown` normalized document and `MarkdownStreamingSession` semantics.
- `migrate-agent-webview-to-normalized-markdown` owns the exhaustive Webview React adapter and removal of `react-markdown`/`remark-gfm`.

This change composes those contracts. It does not create a second session identity, parser, renderer, or storage authority.

### Five-layer analysis

| Layer          | Decision                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Responsibility | `@neko/agent` owns semantic stream classification, authoritative turn accumulation, history commits, and compaction triggers. `@neko-agent/types` owns Timeline DTOs and validation. Extension owns Webview endpoint lifecycle, batching, ordering, IPC, and active-turn snapshot serving. Webview owns one-batch state commits, normalized Markdown session binding, frame scheduling, and React presentation. Conversation persistence runtime owns serialized file scheduling and durability diagnostics. |
| Dependency     | Agent core remains host-neutral and does not import VS Code/React. Extension depends on Agent/types and provides a delivery port. Webview imports only browser-safe contracts and normalized Markdown/UI code. No Webview imports Node/VS Code, and no Extension imports React. No cross-feature package dependency is introduced.                                                                                                                                                                           |
| Interface      | Transport operations are explicit and revisioned; no string-prefix heuristics. Ports expose enqueue/flush/snapshot/cancel/dispose rather than concrete Webview or file implementations. Terminal delivery and persistence are awaitable. Unknown schema, identity, revision, lifecycle, or normalized node fails visibly.                                                                                                                                                                                    |
| Extension      | Text/thinking/progress coalescing is strategy-based only where event semantics differ; tool/error/terminal boundaries reuse the same ordered channel. A future host can consume Agent deltas without importing the VS Code scheduler. The persistence coordinator supports save/delete/terminal operations without becoming a repository-wide queue framework.                                                                                                                                               |
| Testing        | Pure classifier/projector/scheduler tests use fake clocks and poison legacy paths. Contract tests cover DTO validation and ordering. Persistence tests assert max concurrency one and latest-wins behavior. Extension Development Host replay through real `webview.postMessage` proves lifecycle, exact output, bounded counts, and no reload. Focused Agent evaluation verifies unchanged visible behavior and tool ordering.                                                                              |

### Current reusable foundations

The design reuses rather than replaces:

- existing `AgentEventStreamRuntimeProcessor` and turn Timeline identity;
- existing `AgentStreamProcessor` Extension orchestration point;
- existing Timeline handler registry and conversation-scoped Webview state;
- existing `MarkdownStreamingSession` and the active normalized-Markdown Webview migration;
- existing file revision guards and conversation record projection;
- existing Logger/trace infrastructure and VS Code Webview lifecycle.

The reusable instances already present are not the root problem. The missing pieces are explicit semantic contracts and lifecycle-scoped coordinators.

## Goals / Non-Goals

**Goals:**

- Preserve low first-token latency while making downstream work proportional to visible/durable semantic changes.
- Make text/thinking transport semantics explicit, linear, ordered, revisioned, testable, and recoverable after Webview recreation.
- Reuse one mutable accumulator/channel per turn, one delivery scheduler per Webview endpoint owner, one normalized Markdown session per message item, and one writer coordinator per storage authority.
- Move context compaction from provider-chunk frequency to history/model-call boundaries.
- Ensure Webview state/render commits occur at bounded batch/frame frequency and completion never loses the final delta.
- Serialize conversation persistence, coalesce partial snapshots, and make terminal durability awaitable.
- Provide path-level metrics and deterministic replay evidence for the reported workload.
- Remove old cumulative/heuristic/concurrent paths rather than preserving a silent compatibility fallback.

**Non-Goals:**

- Buffer the whole answer before displaying it or reduce provider stream read responsiveness.
- Implement an incremental CommonMark parser in this change. `MarkdownStreamingSession` may reparse its current source; batching controls invocation frequency.
- Create a global singleton for mutable turn state, a generic monorepo event bus, a distributed queue, or worker process.
- Add user settings for batching/persistence thresholds in the first implementation. Internal constants and policies remain code-owned and benchmarked.
- Move Markdown parsing/rendering into the Extension or persistence into the Webview.
- Redesign tool execution, media task delivery, model-provider streaming, or durable conversation file formats beyond the scheduling metadata required by existing stores.

## Decisions

### 1. Classify existing executor stream items instead of treating every yield as a semantic step

`AgentStep.type === 'content_delta'` is classified as a transport fragment. `think`, `act`, `observe`, and `respond` remain semantic records. An internal exhaustive classifier returns one of:

```ts
type AgentExecutorStreamClassification =
  | { readonly kind: 'fragment'; readonly fragment: AgentStreamFragment }
  | { readonly kind: 'semantic'; readonly step: AgentStep };
```

`AgentSession` still yields display events promptly, but journal projection, working-memory projection, and compaction execute only when `createPersistedStepEvents()` produces a meaningful persisted event/history mutation or when an explicit pre-model budget boundary is reached.

The executor iterator can retain its current public shape during the first implementation slice, avoiding a broad shared-package rename. The classifier and tests make the semantic distinction contractual. A later cleanup may rename the public union only if all hosts benefit.

**Why:** the immediate bug is not that the provider yields often; it is that the session gives all yields semantic-step side effects.

**Rejected alternatives:**

- Debounce `context_compaction.check` logging only. This hides repeated token estimation and leaves the semantic bug.
- Compact on a timer. Context decisions belong to history/model-call boundaries, not wall-clock time.
- Remove streaming deltas from `AgentSession`. This would regress first-token latency and TUI/Webview behavior.

### 2. Keep one authoritative turn accumulator in Agent core and emit explicit operations

The current Timeline projector stores cumulative text and sends that same cumulative object. It is replaced by a turn-scoped accumulator that separates authoritative state from outbound operations:

```ts
interface AgentTurnTextAccumulator {
  readonly itemId: string;
  readonly sequence: number;
  source: string;
  itemRevision: number;
  status: 'streaming' | 'complete';
}

type AgentTurnTextOperation =
  | { readonly operation: 'append'; readonly content: string }
  | { readonly operation: 'replace'; readonly content: string }
  | { readonly operation: 'snapshot'; readonly content: string }
  | { readonly operation: 'complete'; readonly content?: string };
```

The accumulator appends each provider delta once. Normal outbound operations carry only the new source. `snapshot` is reserved for initialization/recovery, and `replace` is reserved for a real canonical replacement such as output-validation retry. Completion is explicit and may carry a final suffix if required to close a batching race.

Thinking uses the same operation algebra but remains a distinct item kind. Tool/task/media items retain typed replacement/update semantics and stable identity.

**Why:** this makes normal text payload O(n), removes `startsWith` inference, and preserves an authoritative snapshot for recovery/persistence.

**Rejected alternatives:**

- Continue sending cumulative source but throttle it. This reduces message count but retains ambiguous semantics and avoidable copies.
- Let Webview compute diffs between snapshots. Diffing is the producer's responsibility because the producer already receives the delta.
- Store only deltas with no accumulator. Completion, persistence, validation replacement, and Webview resync need authoritative current source.

### 3. Version the Timeline envelope and fail closed on the old shape

The Timeline message remains the local Agent Extension/Webview contract but receives a breaking schema version and explicit revisions:

```ts
interface AgentTurnTimelineBatchMessageV2 {
  readonly type: 'agentTurnTimeline';
  readonly schemaVersion: 2;
  readonly connectionEpoch: string;
  readonly conversationId: string;
  readonly turnId: string;
  readonly messageId: string;
  readonly deliveryRevision: number;
  readonly events: readonly AgentTurnTimelineOperation[];
}
```

Every mutable event carries `itemId`, stable item sequence, and monotonic `itemRevision`. Validation enforces:

- identity matches the envelope;
- live delta delivery revision is positive and contiguous; a gap means an IPC batch may be missing and requires snapshot recovery;
- item revision is positive and strictly monotonic per item, but may skip values because the Extension can coalesce multiple mutations into one delivered operation;
- operation fields match the operation kind;
- append/replace/snapshot/complete transitions are legal;
- completed items cannot receive later append/update operations;
- parent anchors exist and tool ordering remains valid.

The V1 cumulative/heuristic shape is removed from the canonical path. Unknown schema versions and legacy messages produce diagnostics; they do not route through a compatibility branch.

**Why:** VS Code `postMessage` is ordered for a live endpoint but Webview recreation, stale callbacks, duplicate handlers, and code defects still require observable revision contracts.

### 4. Split Agent accumulation from Extension delivery scheduling

Two lifecycle objects are used rather than one cross-layer god object:

1. `AgentTurnStreamAccumulator` in Agent core
   - owns authoritative text/thinking/item state;
   - produces ordered Timeline operations;
   - exposes an immutable active-turn snapshot;
   - has no timer, VS Code, React, or file dependency.

2. `AgentTurnWebviewChannel` in Extension
   - is keyed by `{connectionEpoch, conversationId, turnId, messageId}`;
   - owns pending append/progress operations and delivery revision;
   - uses an injected `AgentWebviewDeliveryPort`;
   - flushes, snapshots, cancels, and disposes.

`AgentStreamProcessor` composes them. One channel is reused within a turn. For explicit Webview reload recovery, the processor retains at most the latest active or terminal authoritative channel per conversation; starting the next turn for that conversation disposes the retained predecessor before registering the new channel. Conversation clear and Extension disposal also release it. Mutable channel state is never shared across turns, and historical delta logs are never retained.

**Why:** Agent core owns content semantics; Extension owns host delivery and endpoint lifecycle. A single class spanning both would couple the host-neutral runtime to VS Code.

### 5. Coalesce by semantic policy and preserve hard ordering boundaries

The Extension scheduler applies package-owned internal policy, initially with constants rather than user configuration:

- append-compatible assistant text/thinking: concatenate by item within a short bounded window;
- latest-value progress: keep only the latest update per task/tool item within the window;
- replacement, snapshot, tool call/result, confirmation, error, cancellation, completion: hard boundary;
- hard boundary processing first flushes all earlier pending operations, then posts the boundary in order;
- pending append bytes above a soft budget trigger early flush instead of dropping content;
- one turn has at most one scheduled flush timer and one in-flight post chain;
- all posts for one endpoint are serialized through the scheduler.

Initial implementation constants are selected by benchmark and fake-clock tests. The design target is approximately one text delivery every 32–50 ms under sustained streaming, with immediate boundary flush. These values are not durable protocol and are not exposed as settings.

The normal no-resync path MUST satisfy a linear payload invariant such as:

```text
sum(delivered text operation bytes)
  <= produced text bytes + bounded terminal/envelope overhead
```

An explicit recovery snapshot is excluded from the normal-path ratio and counted separately.

**Why:** users cannot perceive token updates faster than display frames, while IPC/resource projection/React work has real cost.

**Rejected alternatives:**

- Debounce with no maximum latency. It can starve display under continuous streaming.
- Drop text when overloaded. Assistant source is user-visible data and must remain exact.
- Batch every event type uniformly. Tool/error/completion ordering is semantically observable.
- A generic Rx/event-bus dependency. A small local scheduler is sufficient for a local VS Code product.

### 6. Treat `postMessage` completion as enqueue acknowledgement, not render acknowledgement

`AgentWebviewDeliveryPort.postMessage()` reports whether the current endpoint accepted the message; it does not imply React rendered it. The scheduler bounds its own pending work and serializes posts but does not pretend to implement renderer backpressure.

The Webview adds the second boundary:

- one host Timeline batch produces one logical timeline/conversation transaction;
- batches received before the next animation frame may be merged into one render commit if their revisions are contiguous;
- replacement, completion, error, conversation switch, or disposal flushes/cancels pending frame work;
- no more than one streaming document revision per item is presented in one animation frame;
- stale endpoint epochs and revisions are rejected before state mutation.

**Why:** Extension coalescing reduces IPC; Webview frame coalescing protects React from host bursts and lifecycle races. The two responsibilities are related but not interchangeable.

### 7. Bind exact source identity to one normalized Markdown streaming session

This change does not build another parser. The Webview migration owns a registry keyed by stable message/content item identity:

```text
{conversationId, turnId/messageId, itemId, sourceGeneration}
  -> one MarkdownStreamingSession
```

Behavior:

- `append` calls `session.append(coalescedDelta)`;
- `snapshot` creates or resets only through an explicit resync path with a new source generation/session identity;
- `replace` closes the old source generation and creates the replacement generation explicitly;
- `complete` calls `finalize()` on the existing session;
- historical source creates one session and immediately finalizes it;
- item removal, conversation eviction, Webview disposal, and replacement clean up the registry entry;
- asynchronous resource/highlight results remain revision-associated and stale results are discarded with diagnostics.

Conversation projection and the external Markdown session registry form one ordered Webview commit boundary. The handler first validates and projects the complete delivery batch, then mutates the accepted Markdown sessions without notifying subscribers, commits the conversation refs/React state, and finally publishes each affected Markdown session once. This ordering prevents both transient directions of divergence: new conversation source with an old Markdown snapshot, and new Markdown notifications while conversation props still expose old source. Contract violations remain fail-visible; the renderer source-identity assertion is not disabled or caught.

`MarkdownStreamingSession` currently reparses its current source on append. That is accepted for this change because Extension batching plus Webview frame coalescing bounds parse frequency. Incremental parsing is deferred unless runtime evidence shows the bounded path still misses acceptance budgets.

**Why:** parser instance reuse alone does not help if it is invoked per token. Stable session identity plus bounded invocations preserves semantic continuity without premature parser complexity.

### 8. Support explicit active-turn resynchronization after Webview recreation

The Extension retains the authoritative active-turn accumulator while a run is active. Webview initialization includes a `connectionEpoch`; the Webview sends an explicit active-turn snapshot request after it restores conversation/tab identity. The Extension responds with:

- a V2 snapshot batch containing current item snapshots and current delivery revision; or
- a typed `turn-snapshot-unavailable` diagnostic if the turn expired or identities do not match.

On a revision gap, the Webview suspends dependent append application and requests a snapshot. It does not guess missing content. Later append batches are accepted only after snapshot revision alignment.

The active-turn snapshot is runtime state, not a new durable project format. Completed turns continue to restore from canonical conversation messages.

**Why:** Webview frames can legitimately be recreated. A robust local host boundary needs explicit recovery, especially while long provider runs continue in the Extension Host.

**Rejected alternatives:**

- Assume `postMessage` is never lost. Webview disposal/recreation invalidates that assumption.
- Re-send all historical deltas. A current authoritative snapshot is bounded and deterministic.
- Silently start a new conversation. This is the user-visible failure being fixed.

### 9. Serialize conversation persistence with a storage-scoped latest-wins coordinator

`ConversationPersistenceRuntime` gains or composes a `ConversationPersistenceCoordinator` with:

```ts
interface ConversationPersistenceCoordinator {
  enqueuePartial(record: ConversationRecord): PersistenceRevision;
  enqueueTerminal(record: ConversationRecord): Promise<PersistenceResult>;
  enqueueDelete(conversationId: string): Promise<PersistenceResult>;
  flush(): Promise<void>;
  dispose(): Promise<void>;
}
```

Internal state:

- one active operation for the shared storage authority;
- `Map<conversationId, PendingRecord>` for latest pending partials;
- ordered terminal/delete operations with awaiters;
- a monotonically increasing in-process persistence revision/watermark;
- explicit accepting/draining/disposed lifecycle.

Algorithm:

1. Project an immutable record at enqueue time.
2. If a partial for the same conversation is pending but not active, replace it and increment `supersededPartialCount`.
3. If no drain is active, start one.
4. Drain exactly one storage mutation at a time.
5. A terminal record supersedes pending partial state for that conversation and resolves only after `save` plus required `flush` succeeds/fails.
6. A delete removes pending saves for that conversation and executes in the same serialized authority.
7. `flush()` captures a watermark and waits until all required operations up to that watermark finish.
8. `dispose()` stops ordinary partial admission, drains required terminal/delete work, calls storage disposal, and reports failure.

The existing JSON revision guard remains authoritative for external/multi-window conflicts. Same-coordinator stale conflicts are test failures. External stale conflicts return typed diagnostics and are not converted to success by unconditional retry.

**Why:** the current method is named `queueConversationSync` but does not queue. Reusing the runtime/storage instance without serializing operations cannot prevent stale revisions.

**Rejected alternatives:**

- Catch and ignore `StaleJsonFileWriteError`. This can lose user data and masks real multi-writer conflicts.
- Retry every stale error. A stale record may overwrite newer external state.
- Persist every provider chunk. Partial durability does not need token granularity.
- Add a database solely for this path. The local JSON/journal storage remains adequate once writes are coordinated.

### 10. Separate partial snapshot cadence from delivery cadence

UI delivery and persistence have different goals:

- Webview delivery targets visual responsiveness and is measured in tens of milliseconds.
- Partial persistence protects recoverability and is measured in hundreds of milliseconds to seconds.
- Semantic tool/completion boundaries force persistence regardless of the partial timer.

The first implementation retains a code-owned partial snapshot interval but increases it from the current aggressive 250 ms only if benchmark/recovery tests support the change. More importantly, every interval submits to latest-wins serialized persistence rather than starting an independent write.

Terminal content is never left to a timer; it is enqueued and awaited explicitly.

### 11. Make completion a coordinated barrier

Normal turn completion follows this order:

```text
provider done
  -> finalize Agent accumulator
  -> flush pending Extension text/thinking operations
  -> deliver Timeline completion/final blocks
  -> finalize Webview Markdown session when received
  -> enqueue authoritative terminal conversation record
  -> await persistence attempt/flush
  -> return typed stream result with delivery and durability status
```

Tool boundaries use the same ordering barrier without terminal persistence. Cancellation flushes user-visible content according to the cancellation contract, emits cancellation, commits any preserved final partial content, and disposes resources. Webview unavailability can produce `modelCompleted: true` with typed `deliveryStatus`/`persistenceStatus`; it cannot be represented as unconditional end-to-end success.

**Why:** model completion, UI delivery, and durable save are distinct facts. The caller needs all three to diagnose and communicate partial failure accurately.

### 12. Add bounded path telemetry and acceptance invariants

Per-turn summary metrics include:

- provider chunk count and bytes;
- semantic step/history commit count;
- compaction check count;
- Timeline operation and batch count;
- append/snapshot bytes;
- Webview store/render revision count;
- active/pending delivery high-water mark and flush latency;
- partial persistence enqueued/superseded/written count;
- max persistence concurrency;
- terminal delivery and persistence result;
- resync, stale revision, lifecycle, and external writer diagnostics.

No generated body is logged by default. IDs, counts, lengths, revisions, durations, and diagnostic codes are sufficient.

The reported workload becomes a checked-in synthetic fixture derived from shape and length, not copied private conversation content. Runtime acceptance may use the user's local fixture during diagnosis, but repository tests use non-sensitive deterministic table-heavy Markdown.

Path-level tests poison:

- cumulative-per-delta projector output;
- V1/heuristic Timeline merge;
- per-chunk compaction hook;
- direct legacy Webview Markdown parser;
- concurrent same-storage writes.

**Why:** final output equality alone can pass while the legacy/O(n²) path still participates.

## Risks / Trade-offs

- **[Risk] Coalescing changes the visual cadence of streaming** → Keep first append immediate or within the short maximum window, force semantic boundary flushes, and validate perceived latency in Extension Development Host.
- **[Risk] Incorrect operation merge can reorder text and tools** → Use one serialized per-turn channel, a documented flush matrix, monotonic revisions, and boundary-focused contract tests.
- **[Risk] Webview and Extension revisions diverge after reload** → Bind messages to connection epoch, suspend on gaps, and use explicit authoritative snapshot resync.
- **[Risk] Snapshot/replacement semantics accidentally reuse a finalized Markdown session** → Include source generation in the session key and fail on append/finalize after replacement/finalization.
- **[Risk] Existing normalized Markdown migration is incomplete** → Treat its stable session/adapter and legacy-parser removal gates as prerequisites for final Webview acceptance; do not add a temporary second parser.
- **[Risk] Batching still reparses a growing document frequently** → Measure render revisions and CPU in the reported fixture; only consider incremental parser work if bounded batching fails the runtime budget.
- **[Risk] Terminal persistence increases completion latency** → Coalesce partials, serialize writes, measure terminal flush latency, and report durability separately; do not trade away user-data correctness for a false instant success.
- **[Risk] Multi-window external writes still conflict** → Keep file revision guards and surface external conflict diagnostics. Cross-process merge policy remains owned by session/storage isolation work.
- **[Risk] Active-turn snapshots retain memory after completion** → Bound retention structurally to one latest active/terminal authoritative channel per conversation. Starting the next turn, clearing the conversation, or disposing the Extension releases the predecessor; tests assert old-turn snapshot unavailability. Do not retain historical delta logs in memory.
- **[Risk] Two schedulers appear over-designed** → Extension batching owns IPC; Webview frame coalescing owns React. Each is small, local, and protects a real sandbox/lifecycle boundary.
- **[Risk] Existing dirty working tree complicates implementation** → Implement in scoped commits or an isolated worktree and avoid resetting unrelated changes.

## Migration Plan

1. Add focused regression fixtures and metrics around the current path, including a test proving cumulative Timeline payload growth and a persistence max-concurrency test. These are expected to fail until the canonical path is replaced.
2. Introduce the semantic stream classifier and move history projection/compaction behind persisted-history mutation boundaries without changing visible transport yet. Validate Agent executor/session behavior and tool ordering.
3. Add V2 Timeline DTOs, validators, explicit operations, revisions, and snapshot request/response contracts in `@neko-agent/types`. Poison V1/heuristic use in tests.
4. Replace the Agent Timeline cumulative projector with the authoritative accumulator plus operation projection. Keep final source equality tests and prove normal outbound text bytes are linear.
5. Add the Extension delivery port, scheduler, per-turn channels, connection epoch, ordered flush matrix, lifecycle cleanup, telemetry, and active-turn snapshot serving. Cut `AgentStreamProcessor` to the V2 path only.
6. Add serialized conversation persistence with latest-wins partials and awaitable terminal writes. Integrate ConversationBridge, delete, flush, and disposal; remove fire-and-forget overlap.
7. Integrate Webview batch transactions, revision validation, active-turn resync, and frame coalescing with the normalized Markdown session registry from `migrate-agent-webview-to-normalized-markdown`. Remove prefix heuristics and any legacy raw parser success path.
8. Coordinate completion/cancellation barriers and expose typed delivery/durability results to the owning turn bridge/UI diagnostics.
9. Run focused unit/contract/integration tests, Agent boundary checks, persistence race tests, deterministic performance tests, and the script-driven Agent evaluation required for event projection/routing changes.
10. Run the real Extension Development Host replay through `webview.postMessage`, observe iframe/target continuity, exact final table content, active conversation retention, bounded counts, no same-process stale writes, and legacy-path poison.
11. Update Agent architecture documentation only after the canonical path and runtime gates pass. Remove obsolete DTOs, handlers, tests, dependencies, comments, and compatibility branches.

Because this is prelaunch internal protocol work, deployment is an atomic producer/consumer cutover. There is no V1/V2 runtime negotiation or default fallback. Rollback reverts the entire change before release; durable Markdown source remains compatible and can be reloaded by the prior build. Volatile active-turn state may be rebuilt after rollback.

## Open Questions

- What exact internal delivery window and soft pending-byte budget meet the Extension Development Host latency/CPU target on supported machines? The implementation should start with benchmarked constants in the 32–50 ms range, not a user setting.
- Should the first visible text delta bypass the normal coalescing timer to minimize time-to-first-token, or is the bounded delivery window already imperceptible? Decide from runtime measurement.
- Should completed-turn recovery also receive a time-based expiry while no newer turn starts? The current local-product boundary is deterministic and structurally bounded: retain only the latest active/terminal authoritative channel per conversation, then release it on the next turn, conversation clear, or Extension disposal. Add a timer only if measured long-idle memory pressure justifies the extra lifecycle race.
- Does the active `normalize-agent-session-isolation` change already define a connection epoch/request identity contract that this change should reuse verbatim? Resolve before adding fields to `@neko-agent/types`.
- Should terminal persistence failure alter the existing `creation.run.ended` status enum or remain a separate typed durability diagnostic? Preserve the distinction between model completion and durable save, but align with the owning run-result contract before implementation.
