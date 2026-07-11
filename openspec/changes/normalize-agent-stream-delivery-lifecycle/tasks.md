## 1. Baseline, Dependency, and Reuse Audit

- [x] 1.1 Record the current 5,057-character/approximately-4,000-chunk failure shape as a non-sensitive deterministic table-heavy fixture and add baseline counters for provider chunks, Timeline messages/bytes, compaction checks, Webview commits/renders, persistence concurrency, and stale-write diagnostics.
- [x] 1.2 Audit `normalize-agent-session-isolation` for reusable conversation/turn/request/connection identity contracts and update this change to reference the canonical fields rather than adding duplicates.
- [x] 1.3 Audit `normalize-agent-tui-markdown-rendering` and `migrate-agent-webview-to-normalized-markdown` implementation state; record the exact normalized session/adapter prerequisites and do not introduce a temporary parser or dual rendering path.
- [x] 1.4 Audit existing Agent stream processors, Timeline projectors/validators, Webview handler/store hooks, scheduler utilities, persistence queues, Logger metrics, and disposal patterns; record why each new package-local coordinator cannot be replaced by an existing shared capability.
- [x] 1.5 Add path-poison test scaffolding for cumulative-per-delta Timeline payloads, string-prefix merge inference, per-chunk compaction, direct legacy Markdown parsing, and concurrent same-storage writes.

## 2. Semantic Stream and Compaction Boundary

- [x] 2.1 Define an exhaustive internal classifier for provider transport fragments versus semantic Agent steps without loosening `AgentStep` typing or adding `any`/unsafe assertions.
- [x] 2.2 Refactor `AgentSession` so display fragments are yielded promptly but journal projection, working-memory projection, and history mutation run only for meaningful persisted semantic events.
- [x] 2.3 Move automatic compaction checks behind working-memory mutation and explicit pre-model budget boundaries; remove the current per-`content_delta` check path.
- [x] 2.4 Add focused executor/session tests for text-only streaming, thinking, replacement retry, tool call/result rounds, usage accumulation, cancellation, and concurrent sessions; assert exact semantic-step/history/compaction counts.
- [x] 2.5 Add per-turn semantic-path metrics and terminal summaries without logging full generated content.

## 3. Timeline V2 Contract

- [x] 3.1 Define contract-first V2 Timeline batch, item operation, item revision, delivery revision, completion, snapshot request/response, connection identity, and typed diagnostic DTOs in `@neko-agent/types`.
- [x] 3.2 Add validators for explicit `append`/`replace`/`snapshot`/`complete` semantics, identity alignment, legal lifecycle transitions, item/delivery monotonicity, parent anchors, and completed-item rejection.
- [x] 3.3 Add protocol fixtures and contract tests for valid text/thinking/tool/task/media sequences, duplicate/stale revisions, revision gaps, replacement generations, unknown schema versions, and invalid legacy shapes.
- [x] 3.4 Update package exports and all V2 compile-time consumers, then poison/remove V1 cumulative payload and `replaceContent`/`startsWith` heuristic entry points with no runtime compatibility fallback.

## 4. Agent Turn Accumulator and Linear Projection

- [ ] 4.1 Implement the host-neutral turn-scoped accumulator for assistant text, thinking, stable item identity, source generation, item revision, tool/task/media state, terminal state, cancellation, and immutable snapshot projection.
- [ ] 4.2 Refactor `AgentEventStreamRuntimeProcessor` Timeline projection to emit V2 delta operations while retaining authoritative accumulated source only inside the turn accumulator.
- [ ] 4.3 Implement explicit replacement and completion behavior, including tool-boundary text closure and rejection of late events after completion/disposal.
- [ ] 4.4 Add fake-stream tests proving exact final source/order, isolated concurrent turns, stable revisions, correct snapshots, and no O(n²) outbound text payload for the regression fixture.
- [ ] 4.5 Add a normal-path byte invariant test and poison the old cumulative projector so final-result-only assertions cannot pass through the legacy path.

## 5. Extension Webview Delivery Scheduler

- [x] 5.1 Define small injectable delivery port, clock/timer policy, endpoint generation, turn-channel, flush result, snapshot source, and lifecycle interfaces in the Extension-owned stream-delivery module.
- [x] 5.2 Implement one serialized channel per active turn with append concatenation, latest-value progress coalescing, one scheduled timer, bounded pending bytes, early flush, delivery revisions, and explicit cleanup.
- [x] 5.3 Implement the hard-boundary flush matrix for replacement, tool call/result, confirmation, error, cancellation, completion, conversation switch, and Webview disposal.
- [x] 5.4 Integrate the scheduler into `AgentStreamProcessor` and Chat/Webview lifecycle so resource projection and `webview.postMessage` run once per batch and stale endpoint generations cannot receive messages.
- [x] 5.5 Implement active-turn snapshot serving and typed unavailable/mismatch responses for Webview initialization and revision-gap recovery.
- [x] 5.6 Add fake-clock scheduler tests for burst coalescing, maximum latency, first-delta policy, byte-budget early flush, hard ordering, endpoint replacement, post failure, cancellation, completion, snapshot, and disposal.
- [x] 5.7 Add delivery telemetry for chunk/operation/batch counts, bytes, pending high-water marks, flush latency, resync, lifecycle diagnostics, and terminal delivery status.

## 6. Serialized Conversation Persistence

- [ ] 6.1 Define persistence coordinator contracts for immutable partial records, terminal records, deletes, revisions/watermarks, typed results, flush, disposal, and diagnostics.
- [ ] 6.2 Implement a storage-scoped single-drain coordinator with at most one active storage mutation and latest-wins pending partials by conversation.
- [ ] 6.3 Implement terminal save and delete ordering, awaiters, flush-watermark behavior, admission rules during draining/disposal, and resource cleanup.
- [ ] 6.4 Integrate the coordinator with `ConversationPersistenceRuntime` and `ConversationBridge`; replace fire-and-forget `queueConversationSync` overlap while preserving existing record projection and file revision guards.
- [ ] 6.5 Make stream completion/cancellation enqueue and await the required authoritative terminal conversation snapshot; surface typed durability failure without discarding visible generated content.
- [ ] 6.6 Add deterministic concurrency tests asserting maximum active writes equals one, partial B is superseded by C while A writes, different conversations retain their latest pending state, deletes are ordered, and flush/dispose drain required work.
- [ ] 6.7 Add external stale-writer tests proving revision conflicts remain fail-visible and are not converted to success by unconditional retry.
- [ ] 6.8 Add persistence telemetry for enqueued/superseded/written partials, terminal/delete outcomes, depth, latency, max concurrency, external conflicts, failures, and disposal.

## 7. Webview Batch, Revision, and Recovery Path

- [ ] 7.1 Refactor Timeline handlers/presenters so one valid V2 host batch is validated and applied through one logical conversation/timeline state transaction.
- [ ] 7.2 Implement connection epoch, delivery/item revision tracking, duplicate/stale rejection, gap suspension, snapshot request, snapshot alignment, and typed unavailable diagnostics.
- [ ] 7.3 Add a frame-coalesced render commit scheduler that combines contiguous deliveries for the same item and flushes/cancels correctly on replacement, completion, error, conversation switch, unmount, and Webview disposal.
- [ ] 7.4 Bind Timeline assistant items to the canonical message/item-scoped `MarkdownStreamingSession`: append coalesced source, explicitly replace source generation, apply snapshots only through resync, and finalize the same session.
- [ ] 7.5 Ensure historical finalized Markdown enters the same normalized session/adapter path and remove remaining direct `react-markdown`, raw-source, final-only, or heuristic success paths according to the dependent Markdown migration.
- [ ] 7.6 Add Webview handler/store/session tests for batched append, tables across revisions, tool ordering, replacement, completion-before-frame, stale/gap handling, active-turn reload recovery, concurrent conversations, cleanup, and exact final source.
- [ ] 7.7 Add path assertions proving one batch produces one store transaction and at most one streaming render revision per item per animation frame.

## 8. Coordinated Completion and Failure Projection

- [ ] 8.1 Define the typed stream result that distinguishes model completion, terminal Webview delivery, active-turn resynchronization availability, and terminal conversation durability.
- [ ] 8.2 Implement the normal completion barrier: finalize accumulator, flush delivery, emit completion/final blocks, enqueue/await terminal persistence, then return the typed result.
- [ ] 8.3 Implement cancellation and Extension/Webview disposal barriers that preserve contractually retained user-visible content, stop late callbacks, release timers/subscriptions, and return lifecycle diagnostics.
- [ ] 8.4 Update the owning turn bridge/UI diagnostic projection so delivery or durability failure is visible without falsely reporting the model run itself as failed or the conversation as durably saved.
- [ ] 8.5 Add integration tests for each mixed outcome: all successful, model complete/Webview unavailable, model complete/persistence failed, cancellation with final partial content, and late callback after disposal.

## 9. Performance, Runtime, and Agent Evaluation

- [ ] 9.1 Add a deterministic performance regression test replaying the table-heavy fixture through approximately 4,000 chunks and assert exact final source, linear text bytes, bounded batch/render counts, bounded compaction checks, max persistence concurrency one, and no internal stale-write warning.
- [ ] 9.2 Run focused Agent/package tests and builds for `agent-types`, Agent session/runtime, Extension stream processor/persistence, Webview handlers/presenters, and normalized Markdown session integration.
- [ ] 9.3 Run `pnpm check`, `pnpm check:agent-boundaries`, `pnpm check:legacy-debt`, `pnpm check:unused`, `pnpm check:openspec`, and applicable broader `pnpm ci:local` gates; record any unrelated dirty-tree failures separately.
- [ ] 9.4 Use `.codex/skills/neko-agent-evaluation/SKILL.md` to add/run a focused script-driven evaluation for visible streaming continuity, tool/text ordering, completion, cancellation, and unchanged final answer behavior; do not describe `pnpm test:agent:eval` alone as real Agent acceptance.
- [ ] 9.5 Add an Extension-side replay harness that drives the real `webview.postMessage` boundary and exports non-sensitive path counters for runtime acceptance.
- [ ] 9.6 Use Extension Development Host plus `vscode-extension-debugger` to replay the regression fixture and verify iframe/target continuity, active conversation retention, exact table content, completion, reload resync, bounded counters, no same-process stale writes, and zero poisoned legacy-path hits.
- [ ] 9.7 Test Webview close/reopen, conversation switching, Extension deactivation, and cancellation while text or persistence work is pending; assert no leaked timers, subscriptions, channels, Markdown sessions, or writes.

## 10. Documentation, Quality Review, and Completion

- [ ] 10.1 Update `packages/neko-agent/ARCHITECTURE.md` and affected protocol/session/Markdown documentation with the final semantic stream, Timeline V2, delivery, resync, rendering, persistence, and lifecycle invariants.
- [ ] 10.2 Remove obsolete V1 DTOs, cumulative projector branches, prefix heuristics, fire-and-forget persistence paths, dead tests, comments, exports, and dependencies after canonical-path poison tests pass.
- [ ] 10.3 Run the `neko-quality-review` Skill, resolve all blocking findings, and document architecture fit, coupling reduction, reuse audits, validation commands, runtime evidence, and residual risks.
- [ ] 10.4 Re-run OpenSpec status/validation, confirm all proposal/spec/design requirements map to implementation and tests, and archive only after the dependent normalized-Markdown runtime gate and this change's Extension Development Host acceptance are complete.
