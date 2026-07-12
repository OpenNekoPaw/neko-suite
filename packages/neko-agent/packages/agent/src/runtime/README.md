# Agent Runtime Boundary

`runtime/` is the host-neutral Agent runtime boundary. It is not a generic
bucket for prompt governance, Skill lifecycle, permission policy, presenters,
projectors, stores, or concrete domain adapters.

## Allowed Runtime Categories

- `session/`: session bootstrap and multi-conversation runtime ownership.
  Examples: runtime manager, pool, runtime session controller, session factory,
  host bindings, and `AgentRuntimeConfig` projection into `AgentSessionConfig`.
- `runner/`: one configured session execution port. Runner code exposes
  execute/cancel, confirmation, pending-message queue, history load, active
  Skill projection, and runtime events. It does not own per-turn provider
  selection.
- `turn/`: one user-message turn. Turn code selects provider/model, assembles
  prompt/context/attachments, configures the runner, processes streams, and
  persists assistant output.
- `capability/`: Agent-side consumption of `AgentCapabilityProvider`
  contributions. Shared provider contracts stay in `@neko/shared`; concrete
  providers stay in the contributing domain packages.
- `stream/`: Agent event stream projection, stream state, and background task
  observation.
- `projection/`: conversation-owned authoritative turn projection state and
  immutable versioned patches. It has no Webview, Extension, React, Markdown, or
  transport delivery ownership.

The runtime root should contain only package-level exports, shared runtime
types, and small host-neutral collaborators that do not yet justify a narrower
owner. New runtime subdirectories require this document and the architecture
boundary guard to be updated.

## Existing Owner Directories

Prefer existing owner directories before adding runtime files:

| Concern                                                                     | Owner                      |
| --------------------------------------------------------------------------- | -------------------------- |
| Agent session execution object, journal/history projection, session facades | `session/`                 |
| Context window, token budgets, compression, summarization                   | `context/`                 |
| Project facts, memory file, recall, scratch/shared memory                   | `memory/`                  |
| Draft/plan/task artifact persistence and validation                         | `artifact/`                |
| Workspace paths, preferences, markdown artifact codecs                      | `workspace/`               |
| Prompt modules, prompt files, AGENTS.md overlays, PromptLayer ordering      | `prompt/`                  |
| Skill lifecycle, Skill injection, ToolSet projection, stage persona binding | `skill/`                   |
| Permission decisions, approval strategies, tool traits                      | `permission/`, `approval/` |
| Plan/task view and result projection                                        | `plan/`, `task/`           |
| Commands and slash-command host projection                                  | `commands/`                |
| Message attachments, file mentions, resource projection for message display | `input/`                   |

## Concept Boundaries

- **Runner**: executes one already configured `AgentSession` through a stable
  port. It owns execution state, confirmation flow, cancellation, pending
  message queue, and runner events.
- **Turn**: handles one user message. It owns provider/model selection,
  prompt/context/attachment assembly, runner configuration, stream processing,
  and assistant-message persistence.
- **ReAct**: the executor's think -> act -> observe loop. It belongs in
  `executor/`; runtime code may configure it but must not own its semantics.
- **Session**: one configured conversation execution object and live
  collaborators such as executor, prompt facade, event bus, journal, validation
  bridge, artifact facade, Skill projection, and stage tracking.
- **Context**: transient model-input working set: token budget, context layers,
  compression, summarization, and auto compact.
- **Memory**: durable or cross-session facts: project memory files, recall, and
  shared scratch memory. Memory may feed context or prompt modules, but it is
  not the context window.
- **Capability**: in Agent runtime means consuming `AgentCapabilityProvider`
  contributions into Agent registries. Other monorepo capability concepts
  remain with their own packages.

## Runtime Planes Are Bootstrap Projection

`AgentRuntimeConfig` planes (`creationGuidance`, `artifactStore`,
`capabilityRuntime`, `validationLoop`) are session bootstrap projection helpers.
They thread stable ports into `AgentSessionConfig`; they do not own governance.

Ownership remains specific:

- prompt composition stays in `prompt/` or the session prompt facade;
- Skill lifecycle stays in `skill/`;
- permission and approval stay in `permission/` and `approval/`;
- tool policy stays with the enforcing owner (`tools/`, `skill/`,
  `permission/`);
- activation progress is a host-visible event/projection concern, not a
  PromptLayer or generic runtime control layer.

## Current Audit

| Category               | Canonical files                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Session runtime        | `session/agent-runtime-manager.ts`, `session/agent-runtime-pool.ts`, `session/agent-runtime-session-controller.ts`, `session/agent-session-factory.ts`, `session/runtime-host-bindings.ts`, `session/session-config-projection.ts`                                                                                                                                                                                                   |
| Runner                 | `runner/agent-runner-port.ts`, `runner/agent-session-runner.ts`                                                                                                                                                                                                                                                                                                                                                                      |
| Turn                   | `turn/agent-turn-runtime.ts`, `turn/agent-turn-assembly.ts`, `turn/message-runtime.ts`, `turn/agent-turn-context.ts`, `turn/multimodal-context-packet.ts`, `turn/media-turn-runtime.ts`, `turn/timeline-context-runtime.ts`, `turn/canvas-ambient-context-runtime.ts`, `turn/context-control-runtime.ts`, `turn/workspace-input-processor-runtime.ts`                                                                                |
| Capability consumption | `capability/capability-registry-runtime.ts`, `capability/capability-runtime-bindings.ts`, `capability/capability-runtime-refresh.ts`, `capability/capability-runtime-registries.ts`, `capability/agent-capability-injection-runtime.ts`, `capability/agent-capability-lifecycle-runtime.ts`, `capability/agent-content-access-runtime.ts`, `capability/external-processor-runtime.ts`, `capability/agent-prompt-schema-generator.ts` |
| Stream                 | `stream/agent-event-stream-runtime.ts`, `stream/agent-stream-background-task.ts`, `stream/agent-stream-state.ts`, `stream/agent-stream-task-observer.ts`                                                                                                                                                                                                                                                                             |
| Projection             | `projection/conversation-projection-store.ts`, `projection/agent-turn-projection.ts`                                                                                                                                                                                                                                                                                                                                                 |
| Existing owner moves   | `artifact/artifact-service.ts`, `artifact/node-artifact-store.ts`, `input/attachment-projection.ts`, `input/message-resource-projector.ts`, `session/context-host-message.ts`, `session/conversation-host-message.ts`                                                                                                                                                                                                                |

`runtime/index.ts` intentionally preserves the package public export surface.
Internal imports should prefer canonical owner paths. Any future transitional
re-export must name its owner and removal condition in the OpenSpec task or
implementation note that introduced it.

## Session Isolation Identity Model

Agent chat isolation uses layered local identities:

| Identity         | Owner                  | Scope                                                                                                                                              |
| ---------------- | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tabId`          | Webview / Extension UI | View binding only. It restores which conversation a tab shows, but it does not own runtime state.                                                  |
| `conversationId` | Agent session          | Complete session owner for transcript, prompt mode, Skill projection, context, queues, tasks, logs, and UI actions.                                |
| `turnId`         | Agent turn runtime     | One chat turn. Model calls, ordinary tool calls, and turn timeline logs use `{ conversationId, turnId, requestId }`.                               |
| `runId`          | Durable work lease     | Long-lived workflows, artifacts, media/background tasks, terminal/process handles, and cancellable task observers use `{ conversationId, runId }`. |

`runId` is not a generic alias for `turnId`. Ordinary LLM/tool logs omit
`runId` when it would duplicate the turn identity. Durable work may include the
initiating `turnId` for correlation, but partitioning and cancellation use the
real `runId`.

## Logs And Storage Boundaries

- Active model-call JSONL is physically scoped to
  `.neko/logs/conversations/<conversationId>/model-calls.jsonl`. Its `seq` is
  writer-local diagnostic order and `writerId` distinguishes concurrent local
  writers; `partition` and `partitionSeq` remain scoped to
  `{ conversationId, turnId, requestId }`.
- Active workspace NDJSON event sinks are physically scoped to
  `.neko/logs/conversations/<conversationId>/{events,audits,steps}.jsonl`.
  Their `seq` is writer-local diagnostic order and `writerId` distinguishes
  concurrent local writers; `partition` and `partitionSeq` remain scoped to
  `{ conversationId, runId }` when a run exists, or `{ conversationId, turnId }`
  for turn-only events.
- Per-conversation journals are the transcript authority. Recovery and
  projection must request the target `conversationId` explicitly and must not
  infer ownership from the current active tab or active conversation.
- Shared JSON indexes/caches are local whole-file writers. Authoritative guarded
  files such as `conversations-index.json`, file task storage, and file task
  recovery storage use owner/revision metadata and reject stale writes. Rebuildable
  caches such as the generated asset index merge existing on-disk entries before
  flushing.
- VS Code `workspaceState`/`globalState` tab and task state remains host-owned
  local state. It records writer/revision diagnostics where compare-and-swap is
  unavailable, but it must not be treated as a runtime session authority.
