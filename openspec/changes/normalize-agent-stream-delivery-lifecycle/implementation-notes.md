# Implementation Notes

## Baseline and reuse audit (2026-07-11)

### Failure fixture and counters

The non-sensitive regression fixture lives in
`packages/neko-agent/test-utils/src/fixtures/table-heavy-stream.ts` and fixes the
reported shape at 5,057 UTF-16 code units split into 4,000 deterministic provider
chunks. It contains generated Chinese planning tables only; no conversation or
model-call content is copied from the user's log.

The shared counter shape records provider chunks, Timeline message count/bytes,
compaction checks, Webview store commits/render revisions, persistence
start/completion/concurrency, and stale-write diagnostics. Runtime owners will
increment these counters through their own test adapters; production telemetry
must use aggregate counts and must not log generated content.

Legacy-path poison names are registered in
`packages/neko-agent/test-utils/src/poison-paths.ts` for:

- cumulative Timeline snapshots per provider delta;
- Timeline string-prefix merge inference;
- compaction checks per provider chunk;
- direct legacy Agent Webview Markdown parsing;
- concurrent writes to the same conversation storage scope.

### Canonical identity reuse

`normalize-agent-session-isolation` is the identity owner. This change reuses its
layers without defining aliases:

- `conversationId`: session ownership and routing authority;
- `turnId`: one user/assistant turn, including model/tool/timeline work;
- `requestId`: one external provider/model request where present;
- `runId`: only leased work that can outlive an ordinary turn;
- `tabId`: Webview view binding only and never a stream ownership identity.

The delivery protocol adds a connection epoch/id because a Webview endpoint may
reload while the conversation and turn remain active. That field identifies the
endpoint incarnation; it does not replace or duplicate `conversationId` or
`turnId`.

At this audit, `normalize-agent-session-isolation` is 54/55 tasks complete. Its
remaining acceptance work does not block use of the already implemented
conversation/turn/request identity contracts.

### Normalized Markdown prerequisite

`normalize-agent-tui-markdown-rendering` is 87/87 tasks complete and
`@neko/markdown` already exports the canonical `MarkdownStreamingSession`.

`migrate-agent-webview-to-normalized-markdown` is currently 0/31 tasks complete.
The Agent Webview still imports `react-markdown` and `remark-gfm` directly. This
change therefore must not add a second parser, a temporary incremental parser,
or another raw-source fallback. Core semantic, delivery, persistence, and
Timeline V2 work may proceed, but tasks 7.4, 7.5, 9.6, and final removal/acceptance
remain gated on that migration's canonical Webview document/React adapter.

### Existing capability audit

| Concern                 | Existing capability                                                                                                                              | Decision                                                                                                                                                                             |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Agent stream projection | `AgentEventStreamRuntimeProcessor` and `agent-stream-state`                                                                                      | Reuse the processor; add a turn-scoped channel below its projection boundary instead of a second stream runtime.                                                                     |
| Timeline projection     | `createAgentTurnTimelineProjection`                                                                                                              | Replace its ambiguous cumulative text payload with explicit V2 operations; do not add a parallel V1/V2 success path.                                                                 |
| Extension routing       | `AgentStreamProcessor`                                                                                                                           | Reuse its Extension lifetime and inject one endpoint-scoped delivery scheduler. The scheduler is package-local because it owns VS Code `postMessage` and Webview disposal semantics. |
| Webview handlers/store  | existing handler registry, conversation session store, active-turn presenter                                                                     | Reuse session isolation and batch one store transaction. Do not create a second store or event bus.                                                                                  |
| Scheduling utilities    | no existing scheduler combines keyed append coalescing, strict barrier flush, bounded bytes, endpoint epochs, and deterministic fake-clock tests | Add a focused Extension-local coordinator behind a small clock/postMessage port.                                                                                                     |
| Persistence             | `ConversationPersistenceRuntime` currently fire-and-forget; file storage has revision checks but no same-scope single writer                     | Replace its fake queue with one runtime-owned serialized coordinator. It remains package-local because it schedules Agent conversation records, not arbitrary repository IO.         |
| Logging/metrics         | shared `Logger` and Agent trace identities                                                                                                       | Reuse them for aggregate path counters and terminal summaries; do not add a metrics framework.                                                                                       |
| Disposal                | VS Code disposables plus existing processor/session `dispose` methods                                                                            | Compose scheduler/channel/persistence drain into existing ownership; do not introduce a repository-wide lifecycle container.                                                         |
| Markdown streaming      | `@neko/markdown` `MarkdownStreamingSession`                                                                                                      | Reuse exactly one session per message/item after the dependent Webview migration; no parser instance or AST is moved into Extension.                                                 |

Storage ownership invariant: `createFileConversationPersistenceRuntime()` creates one coordinator for its one file-storage authority. Product code owns one such runtime per workspace storage authority. Tests or future callers that intentionally construct multiple runtimes over the same storage object must inject the same `ConversationPersistenceCoordinator`; the runtime does not use an automatic `WeakMap` because hidden sharing would make dispose/ref-count ownership ambiguous.

### Package-local coordinator extraction threshold

The turn channel remains in Agent runtime because it owns Agent event semantics.
The delivery scheduler remains in the Extension because it owns VS Code endpoint
and IPC lifecycle. The persistence coordinator remains in Agent session storage
because it owns conversation snapshot supersession and terminal durability.
Extracting any of these into a neutral shared package is only justified if a
second package needs the same contract with the same runtime lifecycle; similarity
of generic queue mechanics alone is not sufficient.

## Webview active-turn recovery ownership

The Webview persists only a minimal active-turn recovery descriptor in the host runtime state:
connection epoch, conversation/turn/message identity, and last applied delivery revision. It does not
serialize Timeline items, validation maps, Markdown documents, or authoritative source. On Webview
initialization it requests the Extension-owned snapshot explicitly. Accepted batches update the
descriptor; terminal or unavailable turns remove it.

A snapshot request with the retained connection epoch is also the explicit endpoint-rebinding
boundary. `AgentStreamProcessor` keeps a mutable endpoint reference inside the turn-scoped delivery
channel. A recreated `vscode.Webview` may replace that endpoint only after the full turn identity and
connection epoch validate; a stale epoch remains fail-visible as `identity-mismatch`. This avoids
recreating the accumulator/channel while preventing the old endpoint from receiving later delivery.

## 2026-07-11 Webview normalized-session gate

- Timeline text/thinking now binds to message/item-scoped `MarkdownStreamingSession` identities. Frame batches coalesce append operations, replacement creates a new source generation/session, snapshots enter only after Timeline recovery acceptance, and completion finalizes the existing session.
- Fixed an important duplicate-parse defect in `useCanonicalMarkdownSnapshot`: Timeline-backed renders previously still constructed and parsed a local snapshot eagerly before selecting the Timeline snapshot. The renderer now parses locally only for finalized historical content; active streaming without a Timeline-owned session fails visibly.
- Added coverage for split GFM tables across revisions, append-plus-completion before a frame, stale revision/generation rejection, concurrent conversation cleanup/remount, exact final source, one handler batch/one message-store projection, and one Markdown revision per affected item in the batch.
- Removed the unused legacy React/remark parser stack from the Webview manifest and lockfile, with a repository architecture poison guard. The guard test itself passes; the full architecture guard file currently has unrelated dirty-tree failures for undocumented runtime-root files and existing Canvas authoring terms.
- Historical and non-Timeline completion now preserve the complete fenced Markdown source. Agent runtime semantic projection walks normalized Markdown `codeBlock` nodes and emits provenance-linked composite metadata without rewriting text; Webview completion no longer extracts fences, derived blocks are excluded from standalone display, and the normalized Markdown renderer consumes the enriched semantic projection at the matching source range. Entity-memory contribution metadata remains available without double rendering or a final-only regex source split.
- The deterministic Extension replay harness drives the actual `webview.postMessage` endpoint and records only message types, byte counts, commit/render counts, persistence concurrency, and stale diagnostics. The 5,057-character/4,000-chunk table fixture passes with exact source, fewer than 16 delivered batches, fewer than 8 commits/renders, serialized persistence, and zero poison-path hits.

## 2026-07-11 Coordinated completion barrier

- `AgentEventStreamRuntimeProcessor` now carries an explicit terminal status (`completed`, `cancelled`, or `failed`) from semantic stream state into Timeline completion. `AbortError` is the exact cancellation boundary; other error events remain failed. Final partial source is retained and finalized instead of being discarded.
- `AgentStreamProcessor` returns a typed lifecycle result that separates terminal Timeline/final-block delivery from active-turn snapshot availability. Endpoint failure or disposal no longer converts a completed model stream into a thrown model failure. Direct final-block delivery uses the currently rebound endpoint, and late projection/persistence callbacks are rejected after the turn is removed or the processor is disposed.
- `AgentTurnBridge` aggregates all stream results for queued turns and returns distinct model, terminal Webview delivery, resynchronization, and terminal durability outcomes. Terminal persistence is awaited only after stream completion has finalized and delivered its terminal boundary. Webview delivery and durability diagnostics are projected independently and diagnostic delivery failure is itself non-throwing.
- Added mixed-outcome tests for all-success delivery, completed model with unavailable Webview, persistence failure, cancellation with retained partial content, and callbacks arriving after processor disposal.
- Focused verification passed: Agent stream state/runtime/message tests, Timeline scheduler, Extension stream processor, turn handler, and Webview protocol tests (206 tests), plus the expanded processor/handler suites (88 tests). Extension typecheck has only pre-existing dirty-tree failures around `understandingModels` and consistency-check tool exports.

## Lifecycle and leak verification (2026-07-11)

Task 9.7 is covered at each lifecycle owner rather than through a second global
lifecycle abstraction:

- `AgentTimelineDeliveryChannel` now exposes current pending operation/byte,
  timer, accepting, and disposed state in its non-sensitive metrics. Disposal
  tests prove buffered text is drained, the timer is cancelled, current pending
  work reaches zero, and late enqueue is rejected.
- `AgentStreamProcessor` tests prove conversation clear removes the selected
  Timeline channel and makes resynchronization explicitly unavailable; Extension
  disposal removes all remaining channels. Existing cancellation/disposal tests
  also prove late stream callbacks cannot deliver through an inactive channel and
  background task subscriptions are released.
- the Webview render scheduler cancels its animation-frame callback, clears all
  pending deliveries, and rejects enqueue after disposal.
- the canonical Markdown registry reports active subscriptions as well as active
  sessions. Conversation switching disposes only the selected conversation's
  session; Webview disposal clears every session and subscription; a later
  remount creates a fresh session without retaining the old listener.
- the storage-scoped persistence coordinator test holds a terminal write open
  during disposal, proves disposal waits for that admitted write, rejects late
  partials, and finishes with zero pending depth/active mutations and exactly one
  active writer high-water mark.

Focused verification:

```bash
pnpm --dir packages/neko-agent exec vitest run \
  packages/extension/src/chat/message/__tests__/agentStreamProcessor.test.ts \
  packages/extension/src/chat/message/__tests__/agentTimelineDeliveryScheduler.test.ts \
  packages/agent/src/session/__tests__/conversation-persistence-coordinator.test.ts
pnpm --dir packages/neko-agent/packages/webview exec vitest run \
  src/handlers/__tests__/timeline-render-commit-scheduler.test.ts \
  src/markdown/agent-markdown-session-registry.test.ts
```

Result: 79 tests passed. Webview and `agent-types` typechecks pass; the Extension
package typecheck remains blocked only by the pre-existing `understandingModels`
and consistency-check tool export errors recorded separately from this change.

## Canonical-path documentation and cleanup (2026-07-11)

`packages/neko-agent/ARCHITECTURE.md` now records the complete local-client
lifecycle: provider fragment versus semantic event, turn accumulator, Timeline
V2 delivery and resync, frame-coalesced Webview commits, canonical normalized
Markdown sessions, source-authoritative historical composite projection,
storage-scoped serialized persistence, completion barriers, disposal, and the
exact instance reuse boundaries.

The obsolete regex extraction path that removed composite fences at finalization
was deleted from `@neko-agent/types`, including its public extraction DTO/export
and source-removal tests. Typed fence candidate extraction remains only for
entity-memory automation, while visual/historical projection consumes normalized
`codeBlock` nodes and preserves the authoritative Markdown source. Searches show
no Agent Webview production dependency/import of `react-markdown` or
`remark-gfm`, no `replaceContent` compatibility field, and no remaining
`extractCompositeContentBlocks` caller/export. The canonical poison/performance,
Timeline contract, composite contract, and Webview Markdown tests pass.

One broad Agent architecture-boundary test command also reported unrelated dirty
tree violations for four pre-existing runtime-root files and two Canvas authoring
references in `agent-entry-intent-runtime.ts`; the 62 relevant tests in that run
passed, and those unrelated files were not changed by this work.

## Focused package verification (2026-07-11)

- Agent/types/session/Extension/performance: 10 files, 109 tests passed.
- Webview handlers/presenters/Markdown integration: 6 files, 107 tests passed.
- `@neko-agent/types` TypeScript check passed.
- Agent Webview production build passed.
- Extension esbuild bundle passed.
- Build warnings are limited to the existing Browserslist age notice and large
  Webview chunks; neither changes the canonical stream path result.

## Repository quality command results (2026-07-11)

All commands required by task 9.3 were executed:

- `pnpm check:openspec`: passed, 75 items / 0 failures.
- `pnpm check` and `pnpm check:unused`: failed on existing repository-wide
  knip debt (unused files/dependencies/exports, two remaining unrelated
  `@neko/skills` test dependencies, duplicate exports, and configuration hints).
  The new performance test initially exposed one direct unlisted
  `@neko-agent/types` import; it was corrected to use source-relative test
  contracts, and the rerun no longer reports this change.
- `pnpm check:agent-boundaries`: failed because existing compatibility
  exceptions expired on 2026-07-04/2026-07-10; no new boundary finding was
  attributed to this change.
- `pnpm check:legacy-debt`: failed on the existing repository ledger (77
  blocking migrate-now/needs-review occurrences). Canonical stream poison tests
  remain green and no removed Timeline/Markdown path reappeared.
- `pnpm ci:local`: reached the repository formatting gate and failed because 338
  pre-existing dirty-tree files are not Prettier-clean. This task did not format
  or rewrite unrelated user changes.

Full command logs are retained under `/tmp/neko-quality-20260711/` for this local
run.

## Focused Agent evaluation (2026-07-11)

The real TUI evaluation initially exposed a canonical-path gap: the Agent runtime
emitted `agentTurnTimelineUpdate` messages with Timeline V2 `operations`, while
the TUI hook still filtered for `agentTurnTimeline` and the terminal projector
still read the removed `events` field. The TUI now consumes the runtime update
directly, applies explicit `append` / `replace` / `snapshot` / `upsert` /
`complete` operations with item-revision and source-generation checks, and never
uses an `events` alias or string-prefix inference.

Focused key-free verification:

```bash
pnpm test:agent:eval
pnpm exec vitest run \
  packages/neko-agent/packages/cli-tui/src/core/timeline-projector.test.ts \
  packages/neko-agent/packages/cli-tui/src/core/debug-automation \
  scripts/agent-eval/scenario-runtime.test.mjs \
  scripts/agent-eval/protocol-smoke.test.mjs
```

Result: the harness suite passed 33 tests and the combined TUI/runner suite passed
61 tests. This verifies the evaluation infrastructure and canonical TUI
projection contracts; it is not presented as real Agent behavior acceptance.

Real Agent cases were then run against `/Users/feng/Git/neko-test` through the
generic TUI debug automation protocol using provider `nekoapi-chat` and model
`gpt-5.5`:

- `stream-tool-text-order-and-final-answer`: passed. Runtime errors were empty;
  `GetContext` succeeded; Timeline facts proved assistant text → tool → assistant
  text ordering; all three fixed final-answer markers were present; canonical
  normalized-Markdown path events showed stable per-item sessions, monotonic
  projected revisions, and finalization.
- `active-stream-cancellation`: passed. `message.cancel` was accepted while the
  turn was active, the system returned to `fullyIdle`, runtime errors were empty,
  and the terminal assistant projection was finalized after cancellation.

Reports are retained at:

- `/tmp/neko-agent-eval-20260711/stream-tool-text-order-fixed.json`
- `/tmp/neko-agent-eval-20260711/stream-cancellation-fixed.json`

The local source launch required `/tmp/neko-eval-preload.ts` only to work around
an unrelated dirty-tree `TUI_COMMANDS` import/export mismatch and to load Markdown
text under Bun; it did not modify repository files or alter Agent session,
Timeline, Markdown, cancellation, or assertion behavior.

## Extension Development Host runtime acceptance (2026-07-11)

The deterministic 4,000-chunk, table-heavy fixture was replayed through the real
Extension `webview.postMessage` boundary in an Extension Development Host. The
acceptance used the `vscode-extension-debugger` CDP path rather than a standalone
browser. The accepted runtime identity was:

- conversation: `izbh0142-01KX7YK8SM5H9AYAZGSPZ8M4H4`;
- turn: `turn-stream-lifecycle-acceptance-mrfzyy6u`;
- message: `stream-lifecycle-acceptance-mrfzyy6u`;
- connection epoch: `webview-mrfzyy6w-1`.

The VS Code page target was `D29C0A3E1B73A73711A8E96023A398D0`. The Neko
Agent iframe target remained `27A6DA404C3F043AA5CA576D5BAB9784` before and
after `Developer: Reload Webviews`, proving same-process target continuity. The
active tab remained `New Chat / 执行中`; mount-time `getTabState()` plus explicit
Timeline snapshot recovery immediately restored the same partial table with 34
rows. Continuing the replay completed the same tab as `New Chat / 完成` with one
85-row table and the final production notes; the active conversation did not
reset.

The exact authoritative source assertions passed:

- JavaScript string length: 5,057;
- UTF-8 bytes: 9,485;
- SHA-256: `c536c75a9b78579a84eec2630713c614b60164de41b8fd59bc32896cf7bfdfde`.

The Webview observed exactly four Timeline V2 deliveries. Delivery revisions were
`[1, 2, 3, 4]`, item revisions were `[1, 2000, 4000, 4001]`, append payload
lengths were `[1, 1999, 3057]`, and the fourth operation was the single terminal
completion. There were zero typed diagnostics, zero captured JavaScript errors,
no global error projection, no `events` alias hit, and no `replaceContent` hit.

The Extension completion report recorded 4,000 provider chunks, 4 delivered
batches, 4 delivered operations, 21,918 delivered bytes, one-operation pending
high-water mark, 5,763 pending-byte high-water mark, four flushes, 50 ms maximum
flush latency, zero failed deliveries, zero pending operations/bytes at the
terminal barrier, and zero persistence writes for this development-only replay.
The terminal result was `completed` / `delivered` with active-turn
resynchronization `available`. The owning Neko Agent output contained no
`StaleJsonFileWriteError` or stale-write diagnostic for the run.

The final source-mismatch defect was a cross-store React scheduling race, not a
parser defect. Mutating the Markdown registry before `setMessages` removed the
old-Markdown/new-conversation direction, but `useSyncExternalStore` could still
publish while React props exposed the previous one-character source. The
canonical Timeline handler now stages normalized Markdown session mutations,
uses a narrowly scoped `flushSync` to synchronously commit conversation refs and
React props, and only then publishes each affected external-store session once.
The renderer's fail-visible source identity check remains enabled. Focused tests
assert staged visibility, no pre-publication notification, one-shot publication,
duplicate-publication failure, non-contiguous item revision `1 -> 2000`, and
matching Markdown/conversation source at both commit and publication phases.
The real Development Host replay is the scheduling-level regression evidence: it
previously failed at Timeline revision 2 with 2,000 versus 1 source characters,
and now completes without a mismatch or Webview restart.

Durable non-sensitive counters and assertions are recorded in
`runtime-acceptance-report.json`. Raw local evidence is retained under
`/tmp/neko-stream-lifecycle-runtime-20260711/final-flushsync/`, including pre/post
reload DOM captures, observer captures, target inventory, screenshots, the
Extension output log, and the generated runtime summary.

Post-fix focused verification:

```bash
pnpm --dir packages/neko-agent/packages/webview exec vitest run \
  src/markdown/agent-markdown-session-registry.test.ts \
  src/components/ChatView/MessageContent/MarkdownRenderer.test.tsx \
  src/handlers/__tests__/timeline-render-commit-scheduler.test.ts \
  src/handlers/__tests__/work-item-handlers.test.ts \
  src/presenters/__tests__/active-turn-timeline-presenter.test.ts \
  --config vitest.config.ts
# 5 files / 109 tests passed

pnpm --dir packages/neko-agent exec vitest run \
  packages/agent-types/src/__tests__/agent-turn-timeline.test.ts \
  packages/cli-tui/src/core/timeline-projector.test.ts \
  packages/extension/src/debug/streamLifecycleAcceptance.test.ts \
  packages/agent/src/runtime/__tests__/agent-event-stream-runtime.test.ts \
  packages/agent/src/runtime/stream/__tests__/agent-turn-timeline-accumulator.test.ts \
  packages/extension/src/chat/message/__tests__/agentStreamProcessor.test.ts
# 6 files / 93 tests passed

pnpm --dir packages/neko-agent run compile:webview
pnpm --dir packages/neko-agent run compile:extension
git diff --check
```

Both builds and `git diff --check` passed. Build output retained only the existing
Browserslist age and large-chunk advisory warnings.

## Neko quality review (2026-07-11)

### Findings

- **Blocking finding resolved:** `AgentStreamProcessor.activeTimelineChannels` retained every
  completed turn until conversation clear or Extension disposal. A long-lived conversation could
  therefore accumulate one authoritative accumulator/channel per historical turn. The processor now
  releases the retained channel for a conversation before registering its next turn, so each
  conversation owns at most one latest active/terminal recovery channel. The old turn's snapshot and
  metrics become unavailable, while conversation clear and Extension disposal still release the
  latest channel. The cleanup compares `snapshotIdentity().conversationId`; it does not infer
  ownership from a composite-key prefix.
- **No remaining blocking finding:** the reviewed canonical path keeps Timeline V2 explicit
  operations, strict delivery/item revisions, hard completion ordering, one-shot Markdown
  publication, source mismatch poison, endpoint epoch checks, serialized storage mutations and
  explicit disposal. No V1 Timeline success path, `events` alias, `replaceContent` compatibility,
  Timeline prefix-merge inference, direct `react-markdown` renderer or raw-source fallback was
  found in the affected production path.

### Architecture fit and coupling

1. **Does it fit the existing architecture?** Yes. Agent core owns semantic accumulation,
   Extension owns VS Code delivery/endpoint lifecycle, Webview owns frame/React/DOM commits, and the
   Agent session storage boundary owns durability. Protobuf/shared-package dependency directions are
   unchanged.
2. **How is coupling reduced?** The implementation composes small injected ports rather than a
   cross-layer stream manager: delivery channel depends on a `postMessage` port and timer, persistence
   depends on a storage port, and Webview Markdown publication is separated from the conversation
   commit. Instance reuse is explicit rather than global: one channel per turn, one latest recovery
   channel per conversation, one Markdown session per message/item/source generation, one frame
   scheduler per Webview runtime, and one persistence coordinator per storage authority.
3. **Is it extensible and testable?** Yes. Contract DTOs and validators precede concrete adapters;
   scheduler clocks, delivery endpoints and storage mutations are independently injectable; revision,
   cancellation, disposal, recovery and mixed terminal outcomes are covered without a VS Code or file
   dependency in the unit layers.

Five-layer review:

- **Responsibility:** accumulator, delivery, resynchronization, render commit, Markdown parsing and
  persistence each have one owning lifecycle.
- **Dependencies:** Agent remains host-neutral; Extension does not import React; Webview does not
  import `vscode`; no feature package imports another feature package's internals.
- **Interfaces:** Timeline V2, typed lifecycle results, snapshot request/response, delivery port,
  storage port and staged Markdown publication are small and fail-visible.
- **Extension:** semantic coalescing policy and host presentation remain package-owned; shared
  extraction is deferred until a second package needs the same contract and runtime lifecycle.
- **Testing:** contract, scheduler, persistence, presenter, Markdown session, reload recovery,
  poison/performance and real Extension Development Host paths are covered.

### Reuse audits

- Reused `AgentEventStreamRuntimeProcessor`, the existing Timeline presenter/store handler registry,
  `@neko/markdown` `MarkdownStreamingSession`, existing Agent message/content-block/CodeBlock/Mermaid/
  resource/creative-table components, shared Logger/trace identities, the conversation bridge and
  existing VS Code disposal ownership. No second store, parser, design system, event bus, path/cache
  manager or repository-wide lifecycle container was added.
- The delivery scheduler remains Extension-local because it owns `webview.postMessage`, endpoint
  generations and VS Code disposal. The frame scheduler/Markdown registry remain Webview-local
  because they own animation-frame, React external-store and DOM visibility ordering. The persistence
  coordinator remains Agent-session-local because it owns conversation-record supersession and
  terminal durability. These runtime contracts are not interchangeable with adjacent package
  schedulers.
- No new React visual primitive was introduced for this fix; existing normalized Markdown and message
  components were adapted. The narrow `flushSync` is restricted to the Timeline conversation-props /
  external-store atomic visibility boundary and is not a general rendering strategy.

### Verification

Passed after the latest-turn retention fix and documentation alignment:

```bash
pnpm --dir packages/neko-agent/packages/webview exec vitest run \
  src/markdown/agent-markdown-session-registry.test.ts \
  src/components/ChatView/MessageContent/MarkdownRenderer.test.tsx \
  src/handlers/__tests__/timeline-render-commit-scheduler.test.ts \
  src/handlers/__tests__/timeline-recovery-state.test.ts \
  src/handlers/__tests__/work-item-handlers.test.ts \
  src/presenters/__tests__/active-turn-timeline-presenter.test.ts \
  --config vitest.config.ts
# 6 files / 112 tests passed

pnpm --dir packages/neko-agent exec vitest run \
  packages/agent-types/src/__tests__/agent-turn-timeline.test.ts \
  packages/cli-tui/src/core/timeline-projector.test.ts \
  packages/extension/src/debug/streamLifecycleAcceptance.test.ts \
  packages/agent/src/runtime/__tests__/agent-event-stream-runtime.test.ts \
  packages/agent/src/runtime/stream/__tests__/agent-turn-timeline-accumulator.test.ts \
  packages/agent/src/session/__tests__/conversation-persistence-coordinator.test.ts \
  packages/agent/src/session/__tests__/conversation-persistence-runtime.test.ts \
  packages/extension/src/chat/message/__tests__/agentTimelineDeliveryScheduler.test.ts \
  packages/extension/src/chat/message/__tests__/agentTurnTimelineSnapshotRouter.test.ts \
  packages/extension/src/chat/message/__tests__/agentStreamProcessor.test.ts
# 10 files / 127 tests passed

pnpm --dir packages/neko-agent run compile:webview
pnpm --dir packages/neko-agent run compile:extension
git diff --check
```

The real Extension Development Host acceptance remains the runtime evidence described above. The
latest-turn cleanup changes post-terminal retention only and is covered by an Extension-layer
canonical-path test; it does not alter the already accepted first-turn delivery/render/reload path.
Repository-wide gate failures recorded earlier remain unrelated dirty-tree debt (`pnpm check`,
`check:unused`, expired boundary exceptions, legacy-debt ledger and repository formatting). No
unrelated user files were rewritten to make those broad gates green.

### Residual risk

- A completed turn remains available as the latest authoritative recovery snapshot until the same
  conversation starts another turn, the conversation is cleared, or the Extension is disposed. This
  is intentionally bounded per conversation and avoids a timer/reload race, but idle memory remains
  proportional to the number and size of retained conversations. Add time-based expiry only if
  measured long-idle memory pressure justifies that extra lifecycle state.
- `postMessage` acknowledgement still means endpoint enqueue, not DOM paint; correctness therefore
  continues to depend on explicit snapshot recovery rather than pretending to have renderer
  backpressure.
- Existing Browserslist age and large Webview/Extension bundle advisories remain. They are not caused
  by the stream lifecycle change, but bundle splitting is a separate performance opportunity.
- The broader `migrate-agent-webview-to-normalized-markdown` OpenSpec still owns exhaustive runtime
  acceptance for all historical/thinking/resource/Mermaid/composite/Canvas/focus/copy surfaces.
  This change proves the table-heavy streaming/reload/source-identity gate and must not be archived as
  a substitute for completing that dependent change's remaining acceptance matrix.

## Final OpenSpec validation (2026-07-11)

- `openspec status --change normalize-agent-stream-delivery-lifecycle --json` reported all proposal,
  design, specs and tasks artifacts present.
- `openspec validate normalize-agent-stream-delivery-lifecycle` passed.
- Proposal/design/spec requirements map to the implemented and tested boundaries recorded above:
  semantic fragment classification and reduced compaction, Timeline V2 explicit operations and
  validators, turn accumulator, bounded serialized Extension delivery, explicit snapshot recovery,
  frame-coalesced Webview commits, staged normalized-Markdown publication, serialized latest-wins
  persistence, typed completion outcomes, disposal, performance counters and real VS Code runtime
  acceptance.
- `openspec instructions apply --change migrate-agent-webview-to-normalized-markdown --json` was read
  using its returned context files. The Agent Webview production path has no direct
  `react-markdown`/`remark-gfm` dependency/import, source mismatch poison remains enabled, and the
  table-heavy streaming/reload gate passes in Extension Development Host. The dependent change's
  broader 31-task acceptance matrix is still unchecked and remains the owner of exhaustive
  historical/thinking/resource/Mermaid/composite/Canvas/focus/copy acceptance.
- `openspec validate migrate-agent-webview-to-normalized-markdown` also passes at the artifact/schema
  level, but this does not mean its unchecked implementation/runtime tasks are complete.
- This stream-lifecycle change is therefore validated but deliberately **not archived**. Archival must
  wait for explicit completion of the dependent normalized-Markdown runtime gate, as required by task
  10.4; no compatibility fallback is being retained while waiting.
