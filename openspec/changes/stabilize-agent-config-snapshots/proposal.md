## Why

Neko Agent currently treats user config file read failures like missing config, watches config files in real time, and can write UI setting updates back to `~/.neko/config.toml`. This can read a partially written file, hide the error behind defaults, and then overwrite or clear a user-maintained config file.

This change is needed now because provider/API configuration is a trust and data-preservation boundary: configuration errors must be explicit, recoverable, and must not be masked by fallback or Agent-authored writes.

## What Changes

- **BREAKING** Stop real-time config file reload for Agent sessions. Agent reads a config snapshot only when a conversation session/tab is opened or reopened.
- **BREAKING** Stop Agent-owned writes to user config files from Webview settings, provider imports, default config creation, file watchers, or automatic refresh flows.
- Add explicit config load diagnostics for missing, empty, invalid TOML, and read-error states, with safe user-facing messages and full Extension-side logging.
- Replace `null`-as-error config reads with a typed result so invalid config cannot be confused with an absent file.
- Remove or fail-close watcher/fallback paths that currently broadcast `configChanged` and refresh settings/config in active Webviews.
- Keep "open config file" as a user action, but it must only open an existing file or a user-editable new document without silently overwriting existing content.
- Move Webview setting changes such as `executionMode` to runtime/session state unless a future explicit config editor change owns persistence.
- Add path-level tests proving new session/tab open reads the canonical snapshot path, while legacy watch/write/fallback paths are not hit.

### Non-Goals

- Build a full in-product JSON config editor.
- Persist Agent UI setting toggles to disk.
- Change provider SDK behavior, AI runtime prompting, or provider model definitions beyond config snapshot consumption.
- Remove CLI/TUI config write commands when they are explicit user-maintained tooling paths; this change is scoped to VS Code Agent runtime/Webview behavior.
- Introduce compatibility fallback from invalid config to old defaults for active Agent sessions.

### Compatibility

This is a deliberate prelaunch cleanup of an internal Agent configuration path. Existing `~/.neko/config.toml` files remain user-owned and must not be modified by the Agent. If a file is invalid, empty, or unreadable, the Agent reports a diagnostic and disables config-dependent execution until the user fixes the file and opens a new session/tab.

## Capabilities

### New Capabilities

- `agent-config-snapshot-lifecycle`: Defines Agent config snapshot loading, explicit config diagnostics, no real-time file watching, no Agent-authored config writes, and session/tab lifecycle triggers.

### Modified Capabilities

None.

## Impact

- Shared config foundation:
  - `packages/neko-types/src/config/config-reader.ts`
  - config reader exports and tests
- Agent platform config:
  - `packages/neko-agent/packages/platform/src/config/default-config.ts`
  - `packages/neko-agent/packages/platform/src/config/user-config.ts`
  - `packages/neko-agent/packages/platform/src/config/workspace-config.ts`
  - `packages/neko-agent/packages/platform/src/config/config-manager.ts`
  - assistant settings runtime and tests
- Agent Extension:
  - `packages/neko-agent/packages/extension/src/services/configBridge/*`
  - `packages/neko-agent/packages/extension/src/chat/handlers/settingsHandler.ts`
  - `packages/neko-agent/packages/extension/src/chat/chatProvider.ts`
  - chat/router settings and config routes
- Agent Webview:
  - `packages/neko-agent/packages/webview/src/handlers/config-handlers.ts`
  - `packages/neko-agent/packages/webview/src/components/ConversationController.tsx`
  - `packages/neko-agent/packages/webview/src/components/ChatWorkspace.tsx`
  - relevant presenters, state hooks, i18n strings, and tests
- Validation:
  - focused config reader tests,
  - platform config manager tests,
  - extension config bridge/settings tests,
  - webview message/tab lifecycle tests,
  - `pnpm check:agent-boundaries` or equivalent Agent boundary validation.
