## 1. Characterize Current Lifecycle Boundaries

- [x] 1.1 Add a source-of-truth inventory test or focused architecture fixture covering visible React state, refs, per-conversation maps, Timeline scheduler ownership, Markdown registry ownership, viewport state, and Extension activation messages.
- [x] 1.2 Add failing characterization tests for normal UI Tab, character-role Tab, Extension `tabState`, and Extension `activeConversation` activation proving their current commit/publication order.
- [x] 1.3 Add a failing background-stream scenario: conversation A streams, conversation B is foreground, A continues in the background, and returning to A must present its latest Timeline without foreground leakage.
- [x] 1.4 Add StrictMode/unmount/remount characterization proving renderer-resource disposal cannot invalidate a retained canonical conversation snapshot.
- [ ] 1.5 Add characterization tests for input/queue availability, status/time freshness, and scroll/focus isolation across conversation switching.
- [x] 1.6 Characterize whether closing a UI Tab permanently disposes the conversation or retains it in the background, and record the product-semantic decision in the design notes before implementing cleanup.

## 2. Define Canonical Render Lifecycle Contracts

- [x] 2.1 Define readonly `ConversationRenderSnapshot`, streaming sub-snapshot, viewport intent, revision, retention, visibility, and Timeline synchronization types in the Webview owning package.
- [x] 2.2 Define discriminated `ConversationRenderMutation` inputs for host snapshots, Timeline commits, queue/status updates, completion, activation, and disposal without introducing a generic application action system.
- [x] 2.3 Define `ConversationVisibleStatePort`, Markdown Timeline resource owner, activation commit/publication, and diagnostic contracts.
- [x] 2.4 Add contract tests for monotonic revisions, single foreground ownership, unavailable Timeline release, single-use publication, identity mismatch, and mutation after disposal.

## 3. Implement the Conversation Render Coordinator

- [x] 3.1 Implement a pure `ConversationRenderCoordinator` with per-conversation immutable snapshots and focused read/ingest/prepare-activation/dispose operations.
- [ ] 3.2 Move writes to `conversationMessagesRef` and `conversationStreamingRef` behind the coordinator while retaining transitional read adapters only where required.
- [ ] 3.3 Integrate the existing Timeline frame scheduler so coalesced foreground and background commits advance only the owning conversation revision.
- [x] 3.4 Integrate Markdown `commitTimelineSnapshot()` through the narrow resource owner and preserve commit-visible-state-before-publish ordering.
- [x] 3.5 Add diagnostics for stale revisions, wrong identities, unavailable ownership, missing Markdown owner, background foreground-write attempts, and illegal publication order.
- [x] 3.6 Add coordinator unit tests proving conversation isolation, deterministic reconciliation, no-op matching snapshots, scoped resource cleanup, and fail-visible invalid states.

## 4. Migrate Foreground Activation Paths

- [x] 4.1 Add a visible-state adapter that commits the existing React setters and refs from one canonical render snapshot.
- [x] 4.2 Migrate normal UI Conversation Tab activation to `prepareActivation()` and remove its direct cache/ref/setter sequence.
- [x] 4.3 Migrate character-role UI Tab activation to the same transaction and prove role metadata does not change conversation render ownership.
- [x] 4.4 Migrate Extension `tabState` handling to the same transaction.
- [x] 4.5 Migrate Extension `activeConversation` handling to the same transaction, including pending-frame flush and unavailable-Timeline release.
- [x] 4.6 Add poisoned-path tests proving all four activation sources hit the coordinator and no retired direct activation helper can return success.

## 5. Isolate Background Projection, Input, Status, and Viewport

- [x] 5.1 Route non-current conversation Timeline/message/queue/status mutations through coordinator ingestion without touching visible React state or foreground refs.
- [x] 5.2 Make Tab badge/status projection subscribe to the owning conversation revision without forcing hidden conversation DOM rendering.
- [x] 5.3 Make composer enablement and queued-message submission derive from the active conversation snapshot rather than a global running-task flag.
- [x] 5.4 Make thinking/running status and elapsed-time baseline switch immediately with the active snapshot; keep periodic elapsed display ticking UI-local.
- [x] 5.5 Add per-conversation `follow-tail`/`detached` viewport intent and stable message/item anchor capture using existing MessageList virtualization primitives where available.
- [x] 5.6 Prevent background mutations from invoking scroll or focus effects, and restore the selected conversation's viewport intent on activation.
- [x] 5.7 Add React tests covering editable input during allowed queued execution, frozen-status regression, foreground scroll stability, detached anchor restoration, and follow-tail ownership.

## 6. Converge Cleanup and Remove Bypass Paths

- [x] 6.1 Implement and test separate conversation disposal, active-turn resource release, component detach, Webview realm teardown, and hide/reveal handling.
- [x] 6.2 Ensure disposing one conversation clears only its scheduled frames, Markdown sessions/subscriptions, render snapshot, and viewport intent.
- [x] 6.3 Make React StrictMode cleanup/remount reconstruct derived resources from canonical snapshots without treating effect cleanup as permanent conversation deletion.
- [ ] 6.4 Remove writable direct access to migrated per-conversation maps and delete redundant activation/projector helpers inside the scoped replacement boundary.
- [x] 6.5 Add static/source tests or poisoned adapters proving production code cannot perform a successful foreground activation or background visible-state write outside the coordinator.
- [ ] 6.6 Run `pnpm check:legacy-debt` and `pnpm check:unused`, fixing only debt introduced or exposed inside this change and recording unrelated worktree blockers.

## 7. Validation and Documentation

- [ ] 7.1 Run focused coordinator, Markdown registry, handler, ConversationController, MessageList, queue/input, status, and viewport Vitest suites.
- [ ] 7.2 Run `pnpm --filter @neko-agent/webview exec tsc --noEmit --pretty false`, the full Webview test suite, Webview production build, and `pnpm --dir packages/neko-agent run compile:webview`.
- [ ] 7.3 Run repository dependency/boundary checks relevant to Webview and Extension separation, and confirm Webview does not import `vscode` or Node APIs.
- [ ] 7.4 Run `pnpm smoke:webview:runtime` and a `vscode-extension-debugger` Extension Development Host scenario: A streams, switch to B, A updates in background, use B input, switch back to A, hide/reveal Webview, and verify Markdown/status/time/scroll/focus.
- [ ] 7.5 Capture runtime console/diagnostic evidence proving no missing normalized Markdown session, unavailable snapshot activation, cross-conversation foreground write, or repeated activation publication.
- [ ] 7.6 Update `packages/neko-agent/ARCHITECTURE.md` or package-private architecture documentation with render ownership, activation transaction ordering, background isolation, and cleanup scopes.
- [ ] 7.7 Record final validation commands, performance observations for background Markdown coalescing, remaining risks, and removed bypass paths in `implementation-notes.md` before archive.
