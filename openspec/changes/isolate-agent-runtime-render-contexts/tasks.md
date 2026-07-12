## 1. Isolation Contracts and Red Tests

- [x] 1.1 Add Layer-0 conversation/run/child-run scope contracts and validators with owner-mismatch diagnostics.
- [x] 1.2 Add conversation-config and immutable turn-config snapshot contracts without VS Code, React, or provider implementation dependencies.
- [x] 1.3 Add projection attachment, snapshot, acknowledgement, patch, detach, and protocol diagnostic contracts.
- [ ] 1.4 Add red producer/consumer tests proving global config locks, bare child IDs, shared Tab input state, visibility-coupled Timeline delivery, and revision-gap recovery violate the target path.
- [x] 1.5 Add architecture guards that prevent Webview/TUI/Extension types from entering Layer-0 isolation contracts.

## 2. Conversation Runtime and Configuration

- [x] 2.1 Introduce the conversation runtime context around the existing Agent runtime/session pool with explicit ready/dispose lifecycle.
- [x] 2.2 Add per-conversation configuration storage initialized from validated global defaults and restored with the conversation.
- [x] 2.3 Capture an immutable turn configuration snapshot at turn start and route model/child execution through it.
- [x] 2.4 Change Webview/Extension configuration messages and handlers to require `conversationId` and update only that conversation.
- [x] 2.5 Remove global running-Agent and active-Task configuration locks and poison their old call path in regression tests.
- [x] 2.6 Verify concurrent A/B runs and future-turn configuration changes do not mutate active turn snapshots.
- [x] 2.7 Project global defaults independently for the tabless composer and prevent conversation settings snapshots from mutating global entry state.

## 3. Scoped SubAgent and Task Runtime

- [x] 3.1 Add a conversation-owned run registry and scoped cancellation tree for Agent, SubAgent, and Task runs.
- [x] 3.2 Migrate SubAgent manager/runtime APIs, mutable indexes, events, result lookup, cancellation, and cleanup to complete child-run scope keys.
- [x] 3.3 Migrate coordinator TaskPool and parent/child bookkeeping so equal local IDs can coexist in different conversations and parent runs.
- [x] 3.4 Migrate TaskManager control, terminal observation, persistence, recovery, retry, and cancellation paths to complete run scope keys.
- [x] 3.5 Add fail-closed migration diagnostics for valuable persisted Task/SubAgent records with ambiguous ownership.
- [x] 3.6 Delete or make inaccessible bare-ID session control paths and add path assertions proving they are not used.
- [x] 3.7 Verify cancelling or disposing conversation A leaves B's Agent/SubAgents/Tasks unchanged.

## 4. Independent Webview Tab Render Runtimes

- [x] 4.1 Introduce `TabRenderRuntime`, its independent store, lifecycle, and registry keyed by `tabId` with immutable conversation binding.
- [x] 4.2 Move input, attachments, references, model/config selection, generation parameters, prompt state, composition, focus, scroll, menus, queued edits, and diagnostics into the Tab-owned store.
- [x] 4.3 Refactor `ConversationController` into a Tab host that renders keyed `ConversationTabRuntimeView` subtrees and changes visibility only.
- [x] 4.4 Add bounded retention for inactive clean historical component trees while retaining independent stores and projection replicas.
- [x] 4.5 Remove conversation save/restore effects, foreground shared component rebinding, and active-conversation UI fallbacks.
- [x] 4.6 Add concurrent/rapid-switch regression tests for input, attachment, configuration, Markdown, Timeline/projection, focus, and scroll isolation.
- [x] 4.7 Require every ordinary Tab activation to hydrate its conversation settings snapshot before send, and project model refs from the validated model catalog.

## 5. Independent TUI Application and Session Runtimes

- [ ] 5.1 Introduce one mutable application runtime per TUI root and remove mutable module-singleton ownership.
- [ ] 5.2 Introduce independent TUI conversation/session render controllers for roots that host multiple conversations.
- [ ] 5.3 Route TUI configuration, cancellation, projection, and presentation through explicit application/conversation scope.
- [ ] 5.4 Add tests proving two TUI roots and multiple hosted conversations dispose and update independently.

## 6. Authoritative Projection and Attachment Delivery

- [x] 6.1 Introduce the conversation-owned immutable turn projection store and migrate ordered assistant/thinking/tool/task/media/completion accumulation into it.
- [x] 6.2 Preserve bounded append/progress coalescing and telemetry without per-provider-chunk full snapshots or repeated Markdown parsing.
- [x] 6.3 Implement Extension attachment server state and one serialized snapshot/ACK/patch queue per Tab attachment.
- [x] 6.4 Implement Webview Tab attachment client and projection replica with endpoint/attachment/conversation/version/sequence validation.
- [x] 6.5 Reattach every retained Tab from an authoritative snapshot after endpoint replacement and reject old epoch frames/ACKs.
- [x] 6.6 Make live frame gaps and patch base mismatches fatal typed attachment diagnostics; recovery creates a new attachment rather than resuming the old one.
- [x] 6.7 Migrate Markdown sessions and work-item/message rendering to consume each Tab runtime's projection replica.
- [x] 6.8 Add deterministic tests for snapshot-before-patch, projection changes during ACK, rapid visibility switching, endpoint restart, stale ACK, frame gap, and exact final content.

## 7. Legacy Removal, Documentation, and Validation

- [x] 7.1 Remove legacy Timeline delivery revision/snapshot-request recovery messages, handlers, scheduler state, foreground flush/discard hooks, and persisted connection-epoch recovery descriptors.
- [ ] 7.2 Remove obsolete global settings projections, shared input/session caches, bare child-run adapters, compatibility branches, tests, exports, and dependencies.
- [ ] 7.3 Update Agent domain/runtime/Webview/TUI architecture documentation and mark prior session/stream isolation claims as superseded where necessary.
- [ ] 7.4 Run focused contract, Agent runtime, SubAgent, Task, Extension, Webview, Markdown, and TUI tests after each implementation batch.
- [ ] 7.5 Run affected package typecheck/build plus `pnpm build`, `pnpm test`, and `pnpm check` for the cross-package contract migration.
- [ ] 7.6 Run `pnpm check:legacy-debt`, `pnpm check:unused`, and `git diff --check`; resolve new debt without modifying unrelated workspace changes.
- [ ] 7.7 Plan and run focused script-driven Agent evaluation for session/run/config/projection behavior and record evidence.
- [ ] 7.8 Run Extension Development Host Webview acceptance with `pnpm smoke:webview:runtime` or `vscode-extension-debugger`, including concurrent background Tabs, switching, reload, and continued input/config isolation.
- [ ] 7.9 Record executed commands, path assertions, runtime evidence, remaining risks, and any blocked validation in the OpenSpec verification artifact/report.
