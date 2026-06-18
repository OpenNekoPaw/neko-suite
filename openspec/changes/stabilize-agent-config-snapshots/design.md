## Context

Agent provider/API configuration is currently loaded through several overlapping paths:

- `@neko/shared/config/config-reader` returns `UnifiedConfig | null`, where `null` can mean missing file, empty file, invalid JSON, or read failure.
- `ensureUserConfig()` writes default config whenever `readUserConfig()` returns `null`, so invalid or partially written files can be overwritten.
- `FileUserConfigManager` calls `ensureUserConfig()` in the constructor, watches `~/.neko/config.json`, maps watcher read failures to default empty user config, and can write scalar/provider changes back to the same file.
- `ConfigManager` subscribes to user config changes, invalidates merged caches, and exposes Webview settings update methods that persist to config scalars.
- `ConfigFileHandler` imports config files on init, watches user/workspace config files, and broadcasts `configChanged`.
- Agent Webview handles `configChanged` by immediately calling `getConfig()` and `getSettings()`.
- `ChatWorkspace` sends `updateSettings({ executionMode })`, which currently persists an ordinary UI choice into the config file.

These paths violate the desired lifecycle: config files are user-maintained, should not be read while a user/editor is mid-write, and should only be read for a new session/tab snapshot.

### Five-layer analysis

| Layer | Analysis |
| --- | --- |
| Responsibility | `@neko/shared` owns host-agnostic config file read results and diagnostics. Agent platform owns snapshot interpretation, merge, provider credential projection, and fail-closed config state. Extension owns VS Code file opening, session/tab lifecycle triggers, and Webview message projection. Webview owns display and local runtime settings only. |
| Dependency | Shared config reader may use Node in its existing config-reader subpath, but it must not import Agent, VSCode, React, or Webview code. Platform must not import Extension/Webview. Webview must not read files or import Node/VSCode. |
| Interface | Replace ambiguous `UnifiedConfig | null` reads in Agent paths with typed results such as `ok`, `missing`, `empty`, `invalidJson`, and `readError`. Cross-boundary Webview messages expose safe diagnostics, not raw stack traces. Settings updates separate runtime/session state from persisted config. |
| Extension | Future config editors can add an explicit write-capable command/path without re-enabling automatic writes. Future tab/session types can request a config snapshot through the same lifecycle hook. |
| Testing | Tests must prove path-level behavior: snapshot read occurs on session/tab open, watcher paths do not run, Agent write methods are not called from Webview settings, invalid config produces diagnostics, and poisoned legacy watch/write/fallback paths cannot make a request succeed. |

## Goals / Non-Goals

**Goals:**

- Read Agent config as an explicit snapshot on new session/tab open and reopened conversation tab.
- Make config load errors visible and machine-readable.
- Preserve user config files exactly when Agent encounters missing, empty, invalid, or unreadable config.
- Remove default Agent file watching and `configChanged` refresh behavior.
- Stop Agent Webview settings from writing config files.
- Keep provider/API-dependent execution fail-closed when the snapshot is invalid or unavailable.
- Add tests that assert the canonical snapshot path is used and old watch/write/fallback paths are not used.

**Non-Goals:**

- Change CLI/TUI explicit user commands that intentionally edit config.
- Add a complete config schema validator for every provider field beyond parse/read diagnostics required for this change.
- Persist runtime UI settings across VS Code restarts.
- Watch config files for "safe" changes with longer debounce.
- Auto-repair, rewrite, or normalize malformed user config.

## Decisions

1. **Use typed config read results instead of `null` for Agent paths.**
   - `missing` is distinct from `empty`, `invalidJson`, and `readError`.
   - Invalid states carry file path, safe message, and optional parser/read details for logs.
   - Alternative considered: keep `null` and add extra existence checks at call sites. Rejected because every caller would need to remember the distinction and old fallback behavior could return.

2. **Snapshot reads are lifecycle-triggered, not file-system-triggered.**
   - Config snapshots are refreshed on Webview mount/new session open, new chat tab open, and reopening a persisted conversation tab.
   - Active sessions do not re-read config because file updates may be mid-write and because an active conversation should be reproducible from its opened snapshot.
   - Alternative considered: debounce file watchers more aggressively. Rejected because debounce cannot reliably distinguish an editor's partial write from a complete user-authored config.

3. **Agent does not write user config files.**
   - VS Code Agent runtime must not call `writeUserConfig`, `writeWorkspaceConfig`, `ensureUserConfig` as an automatic write, provider import write paths, or scalar update write paths.
   - "Open Config File" remains allowed but must not overwrite an existing file. If the file is missing, the command may open an unsaved/template document or create only after an explicit user-owned editor action in a future change.
   - Alternative considered: atomic writes. Rejected for this change because the stated requirement is no Agent-authored config writes, not safer Agent writes.

4. **Runtime settings are separated from file-backed config.**
   - Webview changes like execution mode update local/runtime state and may influence the current session, but must not persist to `~/.neko/config.json`.
   - Existing `settingsUpdated` acknowledgements can remain only for runtime update success/failure; the implementation must not call config file write methods.
   - Alternative considered: keep writing only "safe" scalar settings. Rejected because it still violates the user-maintained config boundary and risks writes during config edits.

5. **Config errors are fail-closed and user-visible.**
   - Empty, invalid, or unreadable config must produce a safe diagnostic in Webview and a full Extension/platform log entry.
   - Provider/API-dependent send paths must reject with a clear "configuration unavailable" style error instead of silently falling back to defaults.
   - Alternative considered: use last-known-good config when a new snapshot fails. Rejected for new session/tab reads because it hides the real state of the user-maintained file. If last-known-good is needed later, it must be an explicit user-visible recovery mode.

6. **Retained legacy entry points become diagnostic-only or are removed.**
   - `configChanged` should no longer be broadcast by config file watchers and Webview should not refresh config/settings in response to it by default.
   - Any retained watcher functions in shared config utilities must not be wired into Agent runtime.
   - Alternative considered: keep watchers for external model install refresh. Rejected for Agent config because it reintroduces real-time reads and hidden writes; external installers must use explicit refresh/session-open semantics.

## Risks / Trade-offs

- [Risk] Users expect config changes to affect already-open chats immediately. -> Mitigation: show copy explaining changes take effect when opening a new session/tab; keep "open config file" action discoverable.
- [Risk] Some tests or flows depend on auto-created defaults. -> Mitigation: update tests to provide explicit config fixtures or assert missing-config diagnostics.
- [Risk] Market/model install flows previously relied on `configChanged` broadcast. -> Mitigation: route them through an explicit user action or session-open refresh; record any remaining dependency during implementation.
- [Risk] Runtime-only settings surprise users after restart. -> Mitigation: treat this as intentional for Agent UI controls; future persistence requires an explicit config editor proposal.
- [Risk] Removing default writes exposes missing provider config sooner. -> Mitigation: missing config is a normal diagnostic with open-file affordance, not a crash.

## Migration Plan

1. Add typed config read result APIs in `@neko/shared/config/config-reader` and focused tests.
2. Update Agent platform config loading to consume typed results, remove constructor-time default writes/watchers, and expose snapshot diagnostics.
3. Remove Extension config file watch/import-on-init behavior from Agent config bridge and stop broadcasting `configChanged` for file changes.
4. Convert settings updates from config-file writes to runtime/session updates or explicit rejection where runtime storage does not exist yet.
5. Add Webview handling for config diagnostics and remove `configChanged` auto-refresh behavior.
6. Wire snapshot refresh to Webview mount and tab/session open/reopen lifecycle paths.
7. Delete obsolete Agent automatic write/fallback code paths or poison them in tests so they cannot mask new-path failures.
8. Run focused unit/contract tests and Agent boundary checks.

## Rollback Strategy

Rollback can restore previous Agent config behavior in one change, but it risks user config mutation. If rollback is required, prefer restoring read-on-open snapshots first and keep no-write behavior intact unless the user explicitly accepts the previous mutation risk.

## Open Questions

- Should "Open Config File" create a missing `~/.neko/config.json`, or open a template/untitled document without writing? The safer default for this change is no automatic write.
- Should runtime execution mode be stored per conversation, per tab, or global in-memory Extension state? The implementation should choose the smallest state that preserves current UI behavior without disk writes.
- Do CLI/TUI config write paths need the same typed diagnostic API immediately, or can they keep explicit write behavior while adopting diagnostics incrementally?
