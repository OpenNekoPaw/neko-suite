## Why

Long structured Agent answers can currently crash and reload the VS Code Webview even though the Agent run completes successfully. Provider token chunks are treated as semantic execution steps, cumulative Markdown snapshots are posted for every text delta, the Webview commits and reparses every snapshot, and partial conversation snapshots start overlapping file writes; the result is quadratic payload growth, avoidable compaction work, renderer pressure, and stale-revision persistence failures.

This change is needed before further Agent Markdown and autonomous-creation expansion because streaming frequency must stop leaking across Agent, Extension, Webview, rendering, and persistence boundaries. The canonical path must preserve low first-token latency while giving each downstream layer an explicit lifecycle, ordering rule, update budget, and fail-visible completion contract.

## What Changes

- Separate provider transport chunks from semantic Agent steps. Text/thinking chunks SHALL update a turn accumulator without triggering working-memory projection or context-compaction checks until a real history/round boundary occurs.
- **BREAKING**: replace ambiguous Timeline text payload semantics and `startsWith` inference with explicit `append`, `replace`, `snapshot`, and completion operations, using stable conversation/turn/message/item identity and monotonic revisions.
- Introduce a turn-scoped stream channel that owns text/thinking accumulation, ordered pending deltas, flush boundaries, cancellation, completion, and disposal; it is reused within one turn and never shared as mutable state across turns.
- Introduce an Extension-owned Webview delivery scheduler that coalesces high-frequency append/progress updates, immediately flushes order-sensitive tool/error/replacement/completion events, enforces bounded pending work, and never lets provider chunk frequency directly become `postMessage` frequency.
- Make Webview Timeline ingestion commit at delivery-batch frequency and drive one message-scoped normalized Markdown streaming session/revision instead of rebuilding a second parser state for every provider chunk. This change depends on `migrate-agent-webview-to-normalized-markdown` for the canonical Markdown document/React adapter and does not introduce another Markdown parser.
- Replace fire-and-forget conversation sync with a storage-scoped serialized writer. Partial snapshots use latest-wins coalescing, terminal snapshots are awaitable, `flush`/`dispose` drain pending work, and true external stale-writer conflicts remain fail-visible.
- Add path-level telemetry and deterministic budgets for provider chunks, delivered batches, cumulative payload bytes, render revisions, compaction checks, pending persistence writes, dropped/superseded snapshots, flush latency, and terminal completion.
- Remove the old cumulative-per-delta Timeline path, per-chunk compaction path, heuristic text merge, and overlapping persistence-write behavior without a legacy fallback.

Non-goals:

- Do not reduce provider streaming responsiveness or buffer an entire answer before showing it.
- Do not create a repository-wide event bus, distributed queue, worker service, or user-configurable tuning surface.
- Do not make Markdown parsing or React rendering an Extension responsibility.
- Do not make turn-scoped mutable accumulators global singletons.
- Do not duplicate the normalized Markdown parser/session work owned by `normalize-agent-tui-markdown-rendering` and `migrate-agent-webview-to-normalized-markdown`.

Success criteria:

- Replaying the reported 5,057-character, table-heavy answer through approximately 4,000 provider chunks keeps the Webview alive, preserves exact final content/order, and does not reset the active conversation.
- Text transport and persistence work scale linearly with produced content rather than cumulative snapshot size.
- A text-only provider stream does not perform context-compaction checks per chunk.
- Normal single-turn streaming produces no internal `StaleJsonFileWriteError` for `conversations-index.json`.
- Completion, cancellation, Webview disposal, conversation switching, tool boundaries, and Extension shutdown leave no unflushed required event, timer, subscription, or file write.

## Capabilities

### New Capabilities

- `agent-stream-semantic-boundary`: Defines the distinction between provider chunks, turn accumulator updates, semantic Agent steps, history commits, compaction checks, and terminal lifecycle boundaries.
- `agent-webview-stream-delivery`: Defines explicit Timeline delta operations, turn-scoped channel ownership, ordered/coalesced Extension delivery, Webview revision commits, Markdown streaming-session integration, backpressure, cancellation, and runtime acceptance.
- `agent-conversation-persistence-scheduling`: Defines storage-scoped serialized conversation persistence, latest-wins partial snapshots, awaitable terminal writes, stale-writer diagnostics, and flush/dispose behavior.

### Modified Capabilities

None. Session isolation and normalized Markdown migrations remain separate active changes; this change composes with their identity and document/session contracts rather than redefining them.

## Impact

- `packages/neko-agent/packages/agent-types`: breaking Timeline text/thinking update contracts, revision/operation validation, and protocol fixtures.
- `packages/neko-agent/packages/agent`: executor/session semantic-step classification, compaction trigger placement, stream accumulator/channel, Timeline projection, persistence runtime, file storage coordination, tests, and telemetry.
- `packages/neko-agent/packages/extension`: `AgentStreamProcessor`, Webview delivery scheduling, conversation bridge terminal flush, disposal/cancellation, diagnostics, and runtime replay support.
- `packages/neko-agent/packages/webview`: Timeline handlers/store projection, render scheduling, message-scoped normalized Markdown session binding, stale-revision rejection, cleanup, and tests.
- Active change dependencies: coordinate implementation order with `normalize-agent-session-isolation`, `normalize-agent-tui-markdown-rendering`, and `migrate-agent-webview-to-normalized-markdown`; no dual parser or fallback path may be introduced.
- Documentation: update `packages/neko-agent/ARCHITECTURE.md` and any affected Agent protocol/Markdown lifecycle documentation after implementation stabilizes.
- Compatibility: this is an intentional prelaunch internal Webview protocol break. Durable conversation Markdown source remains readable; volatile active-turn streaming state may be discarded and reconstructed. No user project data may be silently lost.
- Risk level: L3 because the change crosses Agent execution semantics, shared DTOs, Extension/Webview messaging, Markdown streaming identity, persistence concurrency, and VS Code runtime lifecycle.
