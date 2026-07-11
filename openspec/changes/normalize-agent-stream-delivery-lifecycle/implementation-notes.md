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

| Concern | Existing capability | Decision |
| --- | --- | --- |
| Agent stream projection | `AgentEventStreamRuntimeProcessor` and `agent-stream-state` | Reuse the processor; add a turn-scoped channel below its projection boundary instead of a second stream runtime. |
| Timeline projection | `createAgentTurnTimelineProjection` | Replace its ambiguous cumulative text payload with explicit V2 operations; do not add a parallel V1/V2 success path. |
| Extension routing | `AgentStreamProcessor` | Reuse its Extension lifetime and inject one endpoint-scoped delivery scheduler. The scheduler is package-local because it owns VS Code `postMessage` and Webview disposal semantics. |
| Webview handlers/store | existing handler registry, conversation session store, active-turn presenter | Reuse session isolation and batch one store transaction. Do not create a second store or event bus. |
| Scheduling utilities | no existing scheduler combines keyed append coalescing, strict barrier flush, bounded bytes, endpoint epochs, and deterministic fake-clock tests | Add a focused Extension-local coordinator behind a small clock/postMessage port. |
| Persistence | `ConversationPersistenceRuntime` currently fire-and-forget; file storage has revision checks but no same-scope single writer | Replace its fake queue with one runtime-owned serialized coordinator. It remains package-local because it schedules Agent conversation records, not arbitrary repository IO. |
| Logging/metrics | shared `Logger` and Agent trace identities | Reuse them for aggregate path counters and terminal summaries; do not add a metrics framework. |
| Disposal | VS Code disposables plus existing processor/session `dispose` methods | Compose scheduler/channel/persistence drain into existing ownership; do not introduce a repository-wide lifecycle container. |
| Markdown streaming | `@neko/markdown` `MarkdownStreamingSession` | Reuse exactly one session per message/item after the dependent Webview migration; no parser instance or AST is moved into Extension. |

### Package-local coordinator extraction threshold

The turn channel remains in Agent runtime because it owns Agent event semantics.
The delivery scheduler remains in the Extension because it owns VS Code endpoint
and IPC lifecycle. The persistence coordinator remains in Agent session storage
because it owns conversation snapshot supersession and terminal durability.
Extracting any of these into a neutral shared package is only justified if a
second package needs the same contract with the same runtime lifecycle; similarity
of generic queue mechanics alone is not sufficient.
