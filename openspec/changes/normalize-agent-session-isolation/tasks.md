## 1. Characterization And Contracts

- [x] 1.1 Add focused Webview tests that reproduce stale cache pollution when `activeConversation` for a new or foreground session competes with cached messages from another session.
- [x] 1.2 Add focused Webview tests proving active tab B cannot send, clear history, clear Skill, approve plan steps, edit queues, or compress context against active conversation A during a switch.
- [x] 1.3 Add tests proving queued message arrays, activation progress, active Skill indicators, context chips, token counts, and work items are isolated per `conversationId`.
- [x] 1.4 Add Extension/router protocol tests proving session-scoped Webview messages fail validation when required `conversationId` is missing.
- [x] 1.5 Add Agent runtime tests proving two conversations can run concurrently without cross-updating stream events, pending queues, task events, Skill progress, or cancellation.
- [x] 1.6 Add log recorder tests proving model/tool logs use `{ conversationId, turnId, requestId }`, durable workflow/task/process logs use `{ conversationId, runId }`, and duplicate `runId === turnId` is not emitted for ordinary turn logs.
- [x] 1.7 Add storage characterization tests for shared JSON/index/log writers: stale host replay, whole-file replace races, per-conversation journal recovery, and session-lock conflict diagnostics.

## 2. Webview Stop-The-Bleed Fixes

- [x] 2.1 Update `activeConversation` handling so foreground application synchronizes messages, streaming state, queued messages, and active timeline into the session cache.
- [x] 2.2 Add an explicit host snapshot vs local cache freshness rule so stale non-empty cache cannot override authoritative persisted messages for the foreground session.
- [x] 2.3 Update tab activation/restoration so stale snapshots may refresh background sessions but cannot change visible tab state unless the conversation matches the active tab or pending foreground activation.
- [x] 2.4 Update queued message and streaming projections so switching sessions clears or restores `queuedMessages`, `queuedMessageCount`, `streamingMessageId`, `isThinking`, and active timeline together.
- [x] 2.5 Add fail-visible diagnostics or switching guards when `activeTabConversationId` and host active conversation do not match for mutation actions.

## 3. Canonical Webview Session State

- [x] 3.1 Introduce a Webview-local `ConversationSessionState` shape or presenter contract that groups messages, streaming, queue, prompt mode, Skill projection, activation progress, context, agent state, work items, and recoverable input state by `conversationId`.
- [x] 3.2 Migrate `ConversationController` derived state to project from `activeTabConversationId` through the session state map instead of scattered global active state and ref maps.
- [x] 3.3 Migrate `ChatWorkspace` operation props so send, slash/Skill invocation, plan actions, queue actions, task actions, clear history, compression, and settings updates resolve the visible session target.
- [x] 3.4 Keep Webview entry-page flow tabless until a new `conversationId` is returned, then bind pending send/menu/input/context requests to that new session before dispatch.
- [x] 3.5 Move context chips, ambient nodes, model/session UI state, active Skill setters, prompt mode, token/compressing flags, and resource snapshots behind the same visible-session projection.
- [x] 3.6 Remove or fail-close legacy Webview current-active fallback paths that can mutate a session without an explicit visible target.

## 4. Extension And Protocol Routing

- [x] 4.1 Tighten Webview-to-Extension parsers/builders for session-scoped mutations so they require non-empty `conversationId`.
- [x] 4.2 Tighten Extension-to-Webview builders for session updates so messages, streaming, queues, context, Skills, activation progress, tasks, agent state, errors, and logs carry `conversationId`.
- [x] 4.3 Update `ChatViewProvider` tab state sync so replayed `sendActiveConversation()` cannot override the Webview's active tab conversation.
- [x] 4.4 Update `ConversationBridge` and `ConversationMessageHandler` tests to distinguish active host sync from explicit session update routing.
- [x] 4.5 Add typed stale/mismatch diagnostics for unknown conversation, deleted conversation, missing session identity, and active-tab mismatch.

## 5. Runtime Work, Tasks, And Process Leases

- [x] 5.1 Audit Agent runner, task observation, message queue, Skill lifecycle progress, media task executor, and terminal/process event sources for missing `conversationId`, `turnId`, or `runId`.
- [x] 5.2 Split ordinary chat-turn identity from durable run identity in `AgentSession`: model/tool/timeline work uses `turnId`; artifact/task/workflow/process/media work uses `runId` only when a distinct lifecycle exists.
- [x] 5.3 Introduce or reuse a `{ conversationId, runId }` ownership/lease contract for terminal/process-backed work and long-running task observers.
- [x] 5.4 Route stream, tool, queue, task, Skill progress, and cancellation events by ownership identity instead of global active runner state.
- [x] 5.5 Reject or mark stale events whose run lease is completed, cancelled, disposed, or associated with another conversation.
- [x] 5.6 Add concurrency tests for two simultaneous Agent conversations and for cancellation of one conversation while another continues.

## 6. Log Partitioning

- [x] 6.1 Update model-call JSONL recording and adjacent Agent logs so ordinary LLM turns include `conversationId`, `turnId`, and `llmRequestId`, but omit duplicate `runId` when it equals `turnId`.
- [x] 6.2 Update durable workflow, artifact/task, terminal/process, media, and background-task logs to include `conversationId` and real `runId`, plus initiating `turnId` when available.
- [x] 6.3 Add partition-local sequence handling or explicit partition fields so log analysis can distinguish per-session order from optional global order.
- [x] 6.4 Update Webview/Extension diagnostic logs for tab operations to include `tabId` when available and `conversationId` for session-scoped actions.
- [x] 6.5 Add tests proving a new tab does not inherit another conversation's log partition, active turn identity, or active run identity.
- [x] 6.6 Route active model-call and workspace JSONL logs to per-conversation physical files so `seq` is file-local and cannot visually couple new tabs.

## 7. Storage And Race Boundaries

- [x] 7.1 Audit conversation journal, conversations index, model-call JSONL recorder, NDJSON event sinks, artifact index, task storage, task recovery storage, generated-resource indexes, and VSCode `workspaceState` tab state for session partition identity and write ordering.
- [x] 7.2 Keep per-conversation journals as the transcript authority and ensure recovery/projectors never infer ownership from current active tab/conversation.
- [x] 7.3 Classify shared JSON files as authoritative guarded state or rebuildable cache; for rebuildable caches, add stale-write diagnostics or rebuild paths instead of silent success.
- [x] 7.4 Add owner/version/session-instance diagnostics for workspace-global whole-file writes that can be touched by multiple VSCode windows, processes, or terminals.
- [x] 7.5 Treat tab state replay as UI view restoration only; remove or gate any implicit `sendActiveConversation()`/runtime switch caused solely by replayed tab state unless the expected conversation activation matches.
- [x] 7.6 Add tests proving shared log `seq` is supplemental and cannot be used as the only session ownership signal.
- [x] 7.7 Add path/layout tests proving conversation log paths reject invalid path segments and produce stable per-conversation JSONL locations.

## 8. Legacy Cleanup And Documentation

- [x] 8.1 Poison or remove current-active fallback paths in tests for session-scoped Webview and runtime operations.
- [x] 8.2 Remove stale tests, fixtures, or helper builders that create session mutations without explicit conversation identity.
- [x] 8.3 Document the tab/session/turn/run/storage identity model in the relevant Agent Webview or runtime architecture notes.
- [x] 8.4 Record any temporary compatibility shim with owner, replacement path, validation command, and removal condition.

## 9. Validation

- [x] 9.1 Run focused Webview tests for `ConversationController`, conversation/tab handlers, `ChatWorkspace`, and session hooks.
  - Validation: `/opt/homebrew/bin/pnpm --dir packages/neko-agent/packages/webview exec vitest --run src/components/ConversationController.test.tsx src/components/ChatWorkspace.test.tsx src/components/hooks/__tests__/useVSCode.test.ts src/handlers/__tests__/character-role-context-isolation.test.ts --testNamePattern "conversation|tab|session|active|queue|Skill|context|conversationId|clear|send|switch|task"` -> 4 files / 54 tests passed.
- [x] 9.2 Run focused Extension tests for chat routing, `ChatViewProvider`, `ConversationBridge`, `ConversationMessageHandler`, task routing, and protocol parsing.
  - Validation: `/opt/homebrew/bin/pnpm --dir packages/neko-agent exec vitest --run packages/extension/src/chat/__tests__/webviewProtocol.test.ts packages/extension/src/chat/__tests__/chatProvider.test.ts packages/extension/src/chat/__tests__/conversationBridge.test.ts packages/extension/src/chat/__tests__/chatWebviewMessageRouter.test.ts packages/extension/src/chat/handlers/__tests__/conversationMessageHandler.test.ts --testNamePattern "conversationId|missing|tab state|active conversation|snapshot|switch|task actions|slash|Skill|clearActiveSkill|queue|diagnostic|replay"` -> 5 files / 51 tests passed.
- [x] 9.3 Run focused Agent runtime tests for session manager, runner, turn runtime, stream state, queue, Skill lifecycle projection, task observation, and log recorders.
  - Validation: `/opt/homebrew/bin/pnpm --dir packages/neko-agent exec vitest --run packages/agent/src/runtime/__tests__/agent-runtime-manager.test.ts packages/agent/src/runtime/__tests__/agent-runtime-pool.test.ts packages/agent/src/runtime/__tests__/agent-stream-task-observer.test.ts packages/agent/src/runtime/__tests__/agent-event-stream-runtime.test.ts packages/agent/src/runtime/__tests__/context-control-runtime.test.ts packages/agent/src/runtime/__tests__/message-runtime.test.ts packages/extension/src/services/__tests__/modelCallJsonlRecorder.test.ts packages/agent/src/__tests__/execution-traceability.integration.test.ts --testNamePattern "concurrent|conversation|cancel|background task|stale|lease|partition|seq|runId|turnId|model call|missing|explicit conversationId|trace"` -> 8 files / 29 tests passed.
- [x] 9.4 Run focused storage/log tests for per-conversation journals, shared JSON cache rebuild/diagnostics, task/recovery storage, model-call JSONL, and NDJSON event sinks.
  - Validation: `/opt/homebrew/bin/pnpm --dir packages/neko-agent exec vitest --run packages/agent/src/workspace/__tests__/ndjson-event-sink.test.ts packages/agent/src/session/__tests__/conversation-index-store.test.ts packages/agent/src/session/__tests__/file-conversation-storage.test.ts packages/agent/src/session/__tests__/journal-storage.test.ts packages/agent/src/task/__tests__/task-storage.test.ts packages/agent/src/task/__tests__/task-recovery-storage.test.ts packages/platform/src/media/__tests__/generated-asset-index.test.ts packages/extension/src/services/__tests__/modelCallJsonlRecorder.test.ts` -> 8 files / 77 tests passed.
- [x] 9.5 Run `pnpm --dir packages/neko-agent test -- --run` or the smallest equivalent affected package test command and record residual risk if full package tests are too large.
  - Validation: `/opt/homebrew/bin/pnpm --dir packages/neko-agent test -- --run` ran the package suite; 386 files / 4146 tests passed, 8 files / 17 tests failed.
  - Residual risk: failures are outside the focused session-isolation coverage and currently include `capabilityBootstrap.test.ts` VSCode mock `env`, prompt golden snapshot drift, `execution-runtime-summary-trace.test.ts` missing `deps.getRunContext`, `skill-lifecycle-characterization.test.ts` expected Skill content, `agent-turn-runtime.test.ts` queue/config assertions, `agentMessageTurnHandler.test.ts` queue assertion, `embodyCharacterController.test.ts` responder shape assertions, and two known `agent-session.test.ts` failures around lazy ToolSet activation and stage tracking.
- [x] 9.6 Run `pnpm check` or the affected TypeScript/architecture boundary check commands.
  - Validation: `/opt/homebrew/bin/pnpm check` ran and failed in `check:unused` before dependency checks due existing knip findings: unused dependencies, unlisted dependencies, unused exports, duplicate export, and configuration hints.
  - Additional affected checks: `/opt/homebrew/bin/pnpm check:webview-boundaries` passed; `/opt/homebrew/bin/pnpm check:strict-tsconfig` passed; `/opt/homebrew/bin/pnpm check:deps` passed with no dependency violations.
  - Residual risk: `/opt/homebrew/bin/pnpm check:agent-boundaries` failed only on expired compatibility exceptions dated 2026-07-04; it reported no direct dependency boundary findings.
- [x] 9.7 Run a real Extension Development Host functional scenario with `vscode-extension-debugger` evidence for the affected multi-tab activation/render path; keep Skill, queue, task, cancellation, and log behavior in their owning focused scenarios.
  - Environment preflight (2026-07-12): `/opt/homebrew/bin/pnpm smoke:webview:targets` passed with 2 VS Code page targets and 2 Webview targets, including `neko.neko-agent`; target discovery alone is not functional acceptance.
  - Runtime path evidence: created an empty second chat Tab in the Extension Development Host, switched A→B→A through the actual Webview DOM, verified the foreground transcript returned to A, the input remained enabled, no session lifecycle error/status appeared, and the only console warning was VS Code's benign `local-network-access` warning. The empty test Tab was closed afterward.
  - Scope note: this rerun directly covers correlated multi-Tab activation/render lifecycle. Skill/queue/task/cancellation/log behaviors retain the focused protocol/runtime evidence recorded in 9.1–9.5.
- [x] 9.8 Run `pnpm check:legacy-debt` or equivalent quality/debt checks if legacy fallback paths are removed or renamed.
  - Validation: `/opt/homebrew/bin/pnpm check:legacy-debt` ran and failed with 2 blocking `needs-review` fallback occurrences in `packages/neko-agent/packages/agent/src/skill/skill-system-prompt.ts`.
- [x] 9.9 Run focused tests for per-conversation physical JSONL routing and record residual risk.
  - Validation: `/opt/homebrew/bin/pnpm --dir packages/neko-agent exec vitest --run packages/agent/src/workspace/__tests__/neko-paths.test.ts packages/agent/src/workspace/__tests__/ndjson-event-sink.test.ts packages/extension/src/services/__tests__/modelCallJsonlRecorder.test.ts packages/agent/src/session/__tests__/agent-session.test.ts --testNamePattern "NekoPaths|NdjsonEventSink|model call|JSONL|log partition|new conversation sessions|workspace config provisions|approval decisions|execution.step.completed|workspace durable"` -> 4 files / 29 tests passed.
  - Validation: `/opt/homebrew/bin/pnpm --dir packages/neko-agent exec tsc -p packages/extension/tsconfig.json --noEmit` -> passed.
  - Validation: `/opt/homebrew/bin/pnpm check:strict-tsconfig` -> passed.
  - Validation: `/opt/homebrew/bin/pnpm --dir packages/neko-agent exec eslint packages/agent/src/workspace/neko-paths.ts packages/agent/src/workspace/ndjson-event-sink.ts packages/agent/src/session/agent-session.ts packages/agent/src/workspace/__tests__/neko-paths.test.ts packages/agent/src/workspace/__tests__/ndjson-event-sink.test.ts packages/agent/src/session/__tests__/agent-session.test.ts packages/extension/src/services/modelCallJsonlRecorder.ts packages/extension/src/services/__tests__/modelCallJsonlRecorder.test.ts packages/extension/src/bootstrap/serviceBootstrap.ts` -> passed with existing `agent-session.ts` warnings only.
  - Residual risk: `/opt/homebrew/bin/pnpm --dir packages/neko-agent exec tsc -p packages/agent/tsconfig.json --noEmit` still fails on broad existing test type drift outside this log-routing slice; extension tsc covers the new `@neko/agent/workspace` import path.

## 10. Correlated Webview Tab Activation Follow-up

- [x] 10.1 Add protocol, Webview handler, hook, and Extension tests for activation correlation, stale Tab revision rejection, and A→B→C response ordering.
- [x] 10.2 Extend the Webview protocol with an atomic ordinary-conversation activation request and correlated `activeConversation`/revision responses.
- [x] 10.3 Replace the ordinary `switchConversation` + effect-driven `updateTabState` dual path with the canonical activation transaction; make non-activation Tab persistence revision checked.
- [x] 10.4 Reject stale `tabState` responses in the Webview and stale activation/persistence requests in the Extension with fail-visible diagnostics and authoritative reconciliation.
- [x] 10.5 Narrow foreground activation Timeline flushing from `flushAll()` to the previous foreground conversation partition.
- [x] 10.6 Add explicit foreground history availability (`loading`/`ready`/`unavailable`) so uncached history is not rendered as an empty transcript.
- [x] 10.7 Route conversation-owned session diagnostics by `conversationId` while retaining a distinct truly-global diagnostic owner.
- [x] 10.8 Remove or poison the replaced ordinary switch/persistence path and add execution-path assertions proving it is not used.
- [x] 10.9 Run focused producer/consumer tests, Webview and Extension typechecks, boundary checks, legacy-debt checks, and a real VS Code Webview functional scenario when a debug endpoint is available.
  - Validation (2026-07-12): Agent types/runtime focused suite -> 4 files / 53 tests passed; Webview activation/render suite -> 6 files / 125 tests passed; Extension activation/router suite -> 2 files / 15 relevant tests passed (49 unrelated tests skipped by name filter); full `chatProvider.test.ts` -> 23 tests passed.
  - Typechecks: Webview `tsc --noEmit` passed. Extension `tsc --noEmit` was executed and remains blocked only by parallel, out-of-scope changes in `perception-pipeline.ts`, `agentMessageTurnHandler.ts`, `skillContextRoutes.ts`, and `consistencyCheckTools.ts`; no correlated activation file was reported.
  - Quality gates: `pnpm check:webview-boundaries`, `pnpm check:strict-tsconfig`, focused ESLint, and `git diff --check` passed. `pnpm check:legacy-debt` was executed and remains blocked by repository-wide pre-existing/parallel debt outside this activation slice.
  - Runtime: `pnpm smoke:webview:targets` passed as preflight, then an actual Extension Development Host A→B→A Tab interaction completed without the normalized Markdown/session snapshot/revision errors targeted by this change.
