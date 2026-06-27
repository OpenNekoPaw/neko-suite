## 1. Shared Config Contract

- [x] 1.1 Audit available TOML parser/serializer options and choose one shared Layer 0 dependency for `@neko/shared`.
- [x] 1.2 Replace Agent config filename constants and path helpers with `config.toml` and remove legacy JSON path helpers from runtime code.
- [x] 1.3 Add TOML-authored config types that use user-facing snake_case keys and repeated provider/model/MCP tables.
- [x] 1.4 Add adapter functions that convert TOML-authored config to and from `UnifiedConfig`.
- [x] 1.5 Add read result statuses and diagnostics for TOML parse errors and unsupported versions.
- [x] 1.6 Add focused shared tests for TOML parse/write, adapter mapping, default config generation, invalid TOML diagnostics, unsupported version diagnostics, and adjacent JSON ignored behavior.

## 2. Agent Platform Integration

- [x] 2.1 Update `FileUserConfigManager` and workspace config loading to consume TOML-derived `UnifiedConfig`.
- [x] 2.2 Update scalar, provider, model, and MCP write paths so programmatic edits persist `config.toml`.
- [x] 2.3 Update config diagnostics and assistant settings projections to report TOML paths and TOML parse errors.
- [x] 2.4 Preserve explicit-config provider source priority and account gateway behavior using the converted `UnifiedConfig`.
- [x] 2.5 Add poisoned legacy JSON fallback tests proving adjacent JSON cannot become a successful explicit config source.
- [x] 2.6 Add tests for selected invalid provider/model blocking conversation while unselected invalid provider/model remains scoped to diagnostics.

## 3. Legacy JSON Compatibility Removal

- [x] 3.1 Remove JSON-to-TOML migration service and shared migration exports.
- [x] 3.2 Remove Extension command and CLI/TUI entry points for migrating legacy `config.json`.
- [x] 3.3 Remove legacy JSON preservation, backup, conflict, and diagnostic behavior from Agent config.
- [x] 3.4 Add or keep poisoned tests proving legacy JSON is ignored rather than migrated or loaded.

## 4. Extension And Webview Surface

- [x] 4.1 Update config bridge/open-config actions to open or create `config.toml`.
- [x] 4.2 Update Webview settings/onboarding/header diagnostics that mention config file names or invalid JSON.
- [x] 4.3 Update English and Chinese i18n strings for TOML parse errors and remove legacy JSON migration prompts.
- [x] 4.4 Add Webview presenter/component tests for TOML config diagnostics.

## 5. Documentation And Spec References

- [x] 5.1 Update Agent README/docs/OpenSpec references from `~/.neko/config.json` to `~/.neko/config.toml` where they describe canonical user configuration.
- [x] 5.2 Add TOML examples for local Ollama, custom NewAPI gateway, model capabilities, defaults, and MCP settings.
- [x] 5.3 Add a breaking-change note explaining that JSON is no longer a runtime input or migration source.
- [x] 5.4 Keep JSON references only where they describe runtime DTOs, Webview messages, caches, `nk*` project files, historical context, or poison tests.

## 6. Validation

- [x] 6.1 Run shared config tests for `packages/neko-types`.
- [x] 6.2 Run focused Agent Platform config and provider-source resolver tests.
- [x] 6.3 Run focused Extension config bridge and Webview projection tests.
- [x] 6.4 Run `pnpm check` or the smallest equivalent type/lint validation needed for touched packages.
- [x] 6.5 Run OpenSpec status for `migrate-agent-config-to-toml` and record remaining residual risks.
