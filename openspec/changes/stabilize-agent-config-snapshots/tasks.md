## 1. Contracts and Diagnostics

- [x] 1.1 Add typed config read result contracts in `@neko/shared/config/config-reader` for `ok`, `missing`, `empty`, `invalidJson`, and `readError`.
- [x] 1.2 Keep existing read APIs only as compatibility helpers where still needed, and add Agent-facing APIs that cannot collapse errors into `null`.
- [x] 1.3 Add safe diagnostic projection helpers for Extension/Webview messages, preserving file path and failure category while excluding stacks/secrets from Webview state.
- [x] 1.4 Add focused shared config-reader tests for missing, empty, invalid JSON, read error, and successful JSON reads.

## 2. Platform Snapshot Loading

- [x] 2.1 Remove automatic `ensureUserConfig()` writes from Agent platform construction and snapshot load paths.
- [x] 2.2 Remove `FileUserConfigManager` user config file watching from the VS Code Agent platform path, or split it behind an explicit non-Agent owner so Agent runtime does not subscribe.
- [x] 2.3 Update `ConfigManager` to load explicit config snapshots, preserve snapshot diagnostics, and fail closed for invalid/empty/read-error config states.
- [x] 2.4 Remove default fallback behavior that turns invalid/empty config into empty providers/models for Agent snapshots.
- [x] 2.5 Convert provider credential config-file import for Agent runtime into in-memory snapshot projection, or disable it if it requires writing config files.
- [x] 2.6 Add platform tests proving invalid config reports diagnostics, missing config does not write defaults, and poisoned write/fallback paths are not invoked.

## 3. Extension Lifecycle and Bridge

- [x] 3.1 Remove config file watchers and `configChanged` broadcasts from `ConfigFileHandler`/`ConfigBridge` for Agent config files.
- [x] 3.2 Remove `platform.config.onUserConfigChange` broadcasting from Agent `ConfigBridge`.
- [x] 3.3 Keep `openUserConfigFile` as a user action that does not rewrite existing config and does not silently create defaults for missing config.
- [x] 3.4 Add an explicit Extension-side snapshot refresh entry point used by Webview mount, new chat tab open, and reopened tab restore.
- [x] 3.5 Update `SettingsHandler` so `updateSettings` writes only runtime/session state or returns an explicit non-persistent acknowledgement, never config-file writes.
- [x] 3.6 Add extension tests proving watcher callbacks are not registered, config changes do not broadcast refreshes, and settings updates do not call config write methods.

## 4. Webview Runtime State and Error UI

- [x] 4.1 Remove Webview `configChanged` auto-refresh handling or convert it to a deprecated no-op with tests proving it does not call `getConfig`/`getSettings`.
- [x] 4.2 Add Webview state and presenter handling for config diagnostics from Extension messages.
- [x] 4.3 Display safe actionable config errors for empty, invalid JSON, and read-error states; keep missing config as onboarding/configuration guidance.
- [x] 4.4 Update `ChatWorkspace` execution mode changes to local/runtime state without sending config-file-backed `updateSettings` writes.
- [x] 4.5 Trigger config/settings snapshot requests on Webview mount, new chat tab open, and reopened/restored conversation tab activation.
- [x] 4.6 Add Webview tests for config diagnostics, no `configChanged` refresh, runtime-only settings changes, and tab lifecycle snapshot requests.

## 5. Send Path Fail-Closed Behavior

- [x] 5.1 Ensure provider/model selection and Agent send flows reject config-error snapshots with a clear diagnostic instead of default provider fallback.
- [x] 5.2 Ensure active sessions do not adopt external config file changes until the next configured lifecycle event.
- [x] 5.3 Add focused Agent send/runner tests for invalid config, missing config, and stale snapshot isolation between open sessions.
- [x] 5.4 Add focused tests proving syntactically valid but incomplete config reports missing provider/model/API key diagnostics before model lookup, without leaking shared default model names.

## 6. Cleanup and Guardrails

- [x] 6.1 Delete obsolete Agent automatic config write/fallback branches after all production callers move to snapshot diagnostics.
- [x] 6.2 Delete or isolate Agent-specific watcher imports from `@neko/shared/config/config-reader` consumers so they cannot be reintroduced by default.
- [x] 6.3 Search for `ensureUserConfig`, `watchUserConfig`, `writeUserConfig`, `writeWorkspaceConfig`, `setAssistantSettingsFromWebview`, and `configChanged` in Agent runtime paths and classify every remaining usage.
- [x] 6.4 Add or update a guardrail/test that fails when VS Code Agent runtime reintroduces real-time config watch or Webview settings config-file writes.
- [x] 6.5 Update package docs or architecture notes if public Agent config behavior changes are documented outside OpenSpec.

## 7. Validation

- [x] 7.1 Run shared config-reader tests.
- [x] 7.2 Run Agent platform config tests.
- [x] 7.3 Run Agent extension config bridge/settings tests.
- [x] 7.4 Run Agent Webview handler/presenter/tab lifecycle tests.
- [x] 7.5 Run Agent send/runner focused tests for fail-closed config diagnostics.
- [x] 7.6 Run `pnpm check:agent-boundaries` or the nearest existing Agent boundary check.
- [x] 7.7 Run `pnpm check:legacy-debt` and `pnpm check:unused`, or record why a broader quality command covers these checks.
- [x] 7.8 Run `openspec validate stabilize-agent-config-snapshots` and record any residual risk before implementation is considered complete.
