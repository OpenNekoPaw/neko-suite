## Why

Agent conversations are only partially partitioned inside shared Extension/Webview containers. Global mutable model settings, bare child-run identifiers, a single foreground React workspace, save/restore input caches, and Timeline delivery recovery allow one Tab or run to affect another and repeatedly surface revision-gap failures. The architecture must make conversation execution, child-run ownership, and Tab rendering explicit before more fallback logic is added.

## What Changes

- Introduce a conversation-owned Agent runtime context that owns mutable config, session state, active turns, child runs, cancellation, recovery metadata, and authoritative render projection while reusing only immutable catalogs and host resource services.
- Introduce explicit run-scope identities for Agent turns, SubAgents, and Tasks; cancellation, lookup, events, persistence, and recovery must validate the full conversation/run owner instead of relying on globally unique bare IDs.
- Split global defaults, per-conversation configuration, and immutable per-turn configuration snapshots so a running conversation cannot lock or overwrite configuration in another Tab.
- Replace the single foreground Webview workspace and input save/restore effects with one independent Tab render runtime/store and keyed React subtree per open Tab. Tab activation changes visibility only and does not rebind execution, Timeline, Markdown, input, focus, or configuration state.
- Require each TUI application root to own an independent application runtime; if one TUI root hosts multiple conversations, each conversation receives an independent session/render controller.
- Replace the current Webview-authoritative Timeline delivery-revision recovery protocol with a conversation-owned authoritative turn projection and attachment-scoped snapshot/ack/patch delivery. Visibility changes do not attach, detach, flush, discard, or reset projection delivery.
- Restrict snapshot recovery to explicit attach/reconnect boundaries. Gaps during an established attachment fail visibly as protocol defects rather than entering an open-ended fallback loop.
- Remove superseded global configuration locks, active-conversation fallbacks, shared input/session caches, foreground Timeline flush/discard behavior, bare child-run control paths, and obsolete revision recovery state.
- **BREAKING**: unreleased internal Agent/Webview messages and runtime control APIs will require explicit conversation, run, attachment, and projection identities; legacy handlers and fallback routes will be removed rather than dual-read or dual-write.

## Capabilities

### New Capabilities

- `agent-runtime-scope-isolation`: Conversation runtime ownership and fully scoped Agent/SubAgent/Task lifecycle, cancellation, persistence, recovery, and event routing.
- `agent-tab-render-runtime`: Independent Webview Tab and TUI application/session render state, component lifetime, input/config state, visibility switching, and restoration.
- `agent-render-projection-attachment`: Conversation-owned authoritative turn projections and attachment-scoped snapshot/ack/patch delivery without foreground-Tab coupling.

### Modified Capabilities

- `agent-config-snapshot-lifecycle`: Separate global config defaults from conversation configuration and immutable turn snapshots; remove cross-conversation runtime configuration locking.

## Impact

- Affected packages: `packages/neko-agent/packages/agent-types`, `agent`, `platform`, `extension`, `webview`, and `cli-tui`; shared task lifecycle contracts in `packages/neko-types` may require scoped identity updates.
- Existing persisted conversation history and valuable background task records remain readable; rebuildable Webview recovery caches and unreleased Timeline transport state may be discarded and rebuilt from authoritative conversation projection.
- No Rust Engine or Protobuf changes are expected.
- Implementation requires contract and regression tests across producer/consumer packages, focused Agent evaluations, Extension Development Host Webview smoke, and legacy/unused-code checks.
- Non-goals: one OS process or VS Code Webview instance per Tab, duplicated provider/tool catalogs per conversation, or removal of global resource concurrency limits. Shared infrastructure remains allowed when it owns no conversation-mutable state.
