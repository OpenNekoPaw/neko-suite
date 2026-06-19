## 1. Shared Config Contract

- [x] 1.1 Audit available TOML parser/serializer options and choose one shared Layer 0 dependency for `@neko/shared`.
- [x] 1.2 Replace Agent config filename constants and path helpers with `config.toml` while preserving explicit legacy JSON path helpers for migration/diagnostic code only.
- [x] 1.3 Add TOML-authored config types that use user-facing snake_case keys and repeated provider/model/MCP tables.
- [x] 1.4 Add adapter functions that convert TOML-authored config to and from `UnifiedConfig`.
- [x] 1.5 Add read result statuses and diagnostics for TOML parse errors, unsupported versions, legacy JSON-only state, and conflicting JSON/TOML files.
- [x] 1.6 Add focused shared tests for TOML parse/write, adapter mapping, default config generation, invalid TOML diagnostics, unsupported version diagnostics, and JSON conflict diagnostics.

## 2. Agent Platform Integration

- [x] 2.1 Update `FileUserConfigManager` and workspace config loading to consume TOML-derived `UnifiedConfig`.
- [x] 2.2 Update scalar, provider, model, and MCP write paths so programmatic edits persist `config.toml`.
- [x] 2.3 Update config diagnostics and assistant settings projections to report TOML paths and TOML parse errors.
- [x] 2.4 Preserve explicit-config provider source priority and account gateway behavior using the converted `UnifiedConfig`.
- [x] 2.5 Add poisoned legacy JSON fallback tests proving JSON-only config does not return a successful explicit config source.
- [x] 2.6 Add tests for selected invalid provider/model blocking conversation while unselected invalid provider/model remains scoped to diagnostics.

## 3. Migration Command And Tooling

- [x] 3.1 Add an explicit JSON-to-TOML migration service that reads legacy JSON, converts it, and writes TOML without normal startup invoking it.
- [x] 3.2 Add Extension command and CLI/TUI entry point for migrating legacy `config.json`.
- [x] 3.3 Decide and implement legacy JSON preservation behavior (`config.json.bak` rename or leave-in-place diagnostic) consistently across Extension and CLI.
- [x] 3.4 Add migration tests for successful conversion, invalid JSON failure, existing TOML conflict, and absence of OAuth/account gateway secrets in generated TOML.

## 4. Extension And Webview Surface

- [x] 4.1 Update config bridge/open-config actions to open or create `config.toml`.
- [x] 4.2 Update Webview settings/onboarding/header diagnostics that mention config file names or invalid JSON.
- [x] 4.3 Update English and Chinese i18n strings for TOML parse errors, legacy JSON migration prompts, and conflict diagnostics.
- [x] 4.4 Add Webview presenter/component tests for TOML config diagnostics and legacy JSON migration state.

## 5. Documentation And Spec References

- [x] 5.1 Update Agent README/docs/OpenSpec references from `~/.neko/config.json` to `~/.neko/config.toml` where they describe canonical user configuration.
- [x] 5.2 Add TOML examples for local Ollama, custom NewAPI gateway, model capabilities, defaults, and MCP settings.
- [x] 5.3 Add a migration note explaining the breaking change, explicit conversion command, and why JSON is no longer a default fallback.
- [x] 5.4 Keep JSON references only where they describe runtime DTOs, Webview messages, caches, `nk*` project files, or legacy migration.

## 6. Validation

- [x] 6.1 Run shared config tests for `packages/neko-types`.
- [x] 6.2 Run focused Agent Platform config and provider-source resolver tests.
- [x] 6.3 Run focused Extension config bridge and Webview projection tests.
- [x] 6.4 Run `pnpm check` or the smallest equivalent type/lint validation needed for touched packages.
- [x] 6.5 Run OpenSpec status for `migrate-agent-config-to-toml` and record remaining residual risks.
