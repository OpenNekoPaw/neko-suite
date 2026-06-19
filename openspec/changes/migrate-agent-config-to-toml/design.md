## Context

Neko Agent currently treats `~/.neko/config.json` and workspace `.neko/config.json` as the shared user/workspace configuration files. The shared Layer 0 reader in `@neko/shared` parses JSON directly into `UnifiedConfig`, while Agent Platform converts that object into provider/model maps, Webview-safe projections, MCP server state, scalar settings, and conversation precondition diagnostics.

That architecture is sound after parsing, but the authoring format is not friendly enough for the next phase of Agent provider configuration. Users need to hand edit local, custom gateway, future direct, and model capability records. JSON makes this error-prone because a single missing brace, bracket, comma, or quote invalidates the whole file and offers no comments. TOML reduces the most common hand-editing mistakes, supports comments, and keeps repeated provider/model records readable through `[[providers]]` and `[[models]]`.

This is a prelaunch breaking migration. The canonical runtime contract remains `UnifiedConfig`; the canonical user-authored syntax changes to TOML.

Five-layer analysis:

- Responsibility: `@neko/shared` owns config file names, parse/write helpers, TOML authoring DTOs, and conversion to `UnifiedConfig`. Agent Platform owns provider/model validation and source resolution after it receives `UnifiedConfig`. Extension Host owns commands that open, create, or migrate config files. Webview owns projection display only.
- Dependency: TOML parsing stays in Layer 0 shared config code and must not import VS Code, React, DOM, or Agent feature internals. Extension and CLI use shared config APIs. Webview receives JSON-compatible diagnostics and projections, not TOML ASTs.
- Interface: Add an explicit `NekoTomlConfig`/authored config shape and adapter to `UnifiedConfig`. Keep `ProviderConfig`, `ModelConfig`, account gateway DTOs, and Webview messages unchanged except for path/diagnostic wording.
- Extension: Future provider fields such as `reasoning_effort`, `service_tier`, domain model capabilities, and direct provider profiles can be added to the TOML authoring contract and mapped into existing typed runtime options without changing resolver callers.
- Testing: Unit tests cover TOML parse/write, adapter mapping, invalid TOML diagnostics, legacy JSON rejection, explicit migration output, duplicate provider/model IDs, selected provider/model validation, and path-level proof that runtime defaults read TOML rather than legacy JSON. Extension/Webview tests cover open/create/migration commands and projected diagnostics.

## Goals / Non-Goals

**Goals:**

- Make `config.toml` the canonical user and workspace Agent configuration file.
- Keep runtime and cross-package configuration data as typed objects derived from `UnifiedConfig`.
- Remove default JSON success fallback so the new TOML path is path-level testable.
- Provide an explicit migration command/tool that converts legacy JSON to TOML without silently mutating user data during normal startup.
- Surface clear diagnostics for TOML syntax errors, unsupported config versions, legacy JSON-only state, conflicting JSON/TOML files, and semantic validation errors.
- Keep OAuth account gateway configuration runtime-only and secret-safe.
- Update docs, examples, tests, and user-visible path labels to TOML.

**Non-Goals:**

- Persist runtime account catalog snapshots, Webview messages, generated caches, `nk*` project files, or engine contracts as TOML.
- Keep long-lived JSON/TOML dual-read or dual-write compatibility.
- Change provider source priority, NewAPI MVP provider semantics, local Ollama semantics, or fail-visible conversation selection.
- Build a full visual settings editor in this change.
- Migrate secrets from VS Code SecretStorage or OAuth state into TOML.

## Decisions

1. Use TOML only as the authoring syntax.

   The reader will parse TOML into a small authored DTO, then map it to `UnifiedConfig`. Platform and Agent runtime continue consuming `UnifiedConfig`/maps.

   ```text
   config.toml
     -> NekoTomlConfig
     -> UnifiedConfig
     -> ConfigManager / provider resolver / Webview JSON projections
   ```

   Alternative considered: replace `UnifiedConfig` with TOML-shaped objects everywhere. Rejected because it couples all runtime code to a hand-authored syntax and would force broad, low-value churn through provider resolution, Webview messages, and tests.

2. Make `config.toml` canonical and treat JSON as legacy diagnostic input.

   New read paths should look for TOML. If only `config.json` exists, the read result is not `ok`; it is a legacy diagnostic telling the user to run the explicit migration command. If both files exist, the read result is a conflict diagnostic. Runtime conversation setup must not silently load JSON.

   Alternative considered: read TOML first, then JSON fallback. Rejected because fallback hides broken TOML implementations, makes validation ambiguous, and violates the prelaunch cleanup rule against default legacy paths returning success after a canonical replacement exists.

3. Provide explicit JSON migration, not implicit startup migration.

   The VS Code command `NekoAgent: Migrate Agent Config to TOML` and CLI command `nekoagent config migrate` read legacy JSON, convert it to TOML, and write the new file only after explicit user intent. The old JSON is renamed to `config.json.bak` after successful TOML write so normal startup does not see a JSON/TOML conflict.

   Alternative considered: automatically rewrite JSON to TOML on extension activation. Rejected because user config can contain plaintext API keys, comments are impossible to reconstruct, and silent rewrites of local settings are riskier than a clear, reversible user action.

4. Add a TOML-friendly authored schema instead of mirroring camelCase JSON exactly.

   TOML should use readable keys such as `default_provider`, `default_model`, `connection_kind`, `protocol_profile`, `api_key_env`, and repeated tables:

   ```toml
   version = 1
   default_provider = "ollama-local"
   default_model = "ollama-local:llama3.2"

   [defaults]
   max_tokens = 8192
   temperature = 0.7

   [[providers]]
   id = "ollama-local"
   name = "Ollama Local"
   type = "ollama"
   connection_kind = "local"
   protocol_profile = "ollama"
   base_url = "http://localhost:11434/api"
   requires_api_key = false

   [[models]]
   id = "ollama-local:llama3.2"
   provider_id = "ollama-local"
   name = "llama3.2"
   type = "llm"
   capabilities = ["chat", "streaming", "code"]
   ```

   The adapter owns key mapping to existing camelCase internal fields. Unknown top-level sections or unknown fields should be diagnosed rather than silently ignored unless explicitly marked extension/pass-through fields.

   Alternative considered: require TOML to use camelCase keys identical to JSON. Rejected because it optimizes implementation convenience over user readability and misses the purpose of the format migration.

5. Keep config parse diagnostics separate from semantic validation diagnostics.

   TOML syntax errors make the whole file unavailable and should include file path and parser location when available. Semantic errors occur after parse and can be scoped to a section, provider, model, or selected default. Unselected invalid providers/models may be projected as unavailable diagnostics, but selected invalid chat provider/model still blocks conversation.

   Alternative considered: best-effort partially load invalid TOML sections. Rejected because TOML parser recovery is unreliable and partial config success would make provider selection hard to reason about.

6. Choose a shared TOML dependency through `@neko/shared`.

   Implementation uses `smol-toml` in the shared config layer. It works in Node/Extension tests, avoids DOM/VS Code dependencies, supports parse/stringify for repeated tables, and was already present transitively in the lockfile before promotion to a direct `@neko/shared` dependency.

   Alternative considered: hand-roll TOML parsing for this config subset. Rejected because syntax corner cases, escaping, arrays, and diagnostics would create unnecessary maintenance risk.

7. Preserve secrets boundary.

   TOML may include user-owned API keys only where the current JSON config already allows plaintext credentials, but examples should prefer environment variables or provider credential imports. OAuth account gateway tokens and internal routing credentials remain outside TOML, outside Webview state, and outside prompts/logs.

   Alternative considered: move all provider credentials into TOML for simplicity. Rejected because it worsens local plaintext secret exposure and conflicts with the OAuth/account gateway boundary.

8. Update file-opening and creation commands to TOML.

   Commands and UI actions that open Agent configuration should create/open `config.toml`, not JSON. If legacy JSON exists and TOML is absent, they may offer migration guidance or invoke the explicit migration command. New default config templates should be TOML, while runtime default objects can remain JSON-compatible constants for tests and internal creation.

   Alternative considered: keep "Open config" pointing at JSON until migration completes. Rejected because it prolongs the old path and creates two user-facing sources of truth.

## Risks / Trade-offs

- [Risk] Existing local `config.json` users are blocked after upgrade. -> Mitigation: provide a visible legacy diagnostic and explicit migration command/tool that preserves the old file until the user confirms the new TOML.
- [Risk] Both JSON and TOML exist with different data. -> Mitigation: fail with conflict diagnostic and require the user to remove or migrate the legacy file; do not merge silently.
- [Risk] TOML serializer loses formatting/comments on programmatic edits. -> Mitigation: MVP writer may generate clean TOML for Neko-managed sections; docs should state that programmatic settings writes can rewrite those sections. Preserve manual comments only if the selected library supports safe edit operations.
- [Risk] New dependency increases shared package surface. -> Mitigation: dependency audit, focused parser tests, and keep it in Layer 0 config only.
- [Risk] TOML supports fewer nested dynamic object patterns than JSON. -> Mitigation: use repeated tables for providers/models/MCP servers and explicit keyed subtables only where they are readable.
- [Risk] Legacy JSON fallback accidentally remains reachable. -> Mitigation: add poisoned-path tests that prove default runtime read returns a legacy diagnostic rather than success when only JSON exists.
- [Risk] Webview or docs continue saying "invalid JSON". -> Mitigation: update i18n, tests, and docs references to TOML/legacy JSON diagnostics.
- [Risk] User has plaintext keys in legacy JSON. -> Mitigation: migration preserves user intent but examples recommend env vars; generated TOML should not expose OAuth-derived credentials.

## Migration Plan

1. Add `config.toml` constants and shared TOML parse/write/adapter contracts in `@neko/shared`.
2. Replace default user/workspace config path helpers to point at `config.toml`.
3. Add legacy JSON detection result codes for `legacyJsonOnly` and `conflictingConfigFiles`.
4. Update Agent Platform user/workspace config managers to consume TOML-derived `UnifiedConfig`.
5. Add explicit JSON-to-TOML migration command/tool in Extension/CLI paths.
6. Update config open/create commands to generate TOML templates.
7. Update Webview/i18n diagnostics and model/config projections that mention config file names or invalid JSON.
8. Update OpenSpec/docs/README examples and default config snippets.
9. Delete or poison legacy JSON fallback paths so only migration/diagnostic tests can read JSON.
10. Run focused config tests, Agent Platform config tests, Webview projection tests, and relevant check/build commands.

Rollback is intentionally not a runtime fallback. If implementation must be reverted during development, revert the change or run the explicit migration in reverse for local test data. Shipped runtime should not silently switch back to JSON because that would reintroduce two sources of truth.

## Resolved Questions

- TOML dependency: `smol-toml`.
- Legacy JSON preservation: rename to `config.json.bak` only after a successful TOML write.
- Programmatic settings writes: MVP rewrites Neko-managed TOML from the typed runtime object; manual comment preservation is deferred until a section-preserving editor is justified.
- Workspace `.neko/config.toml`: parsed through the same TOML reader, but Platform only consumes workspace MCP fields in this change; AI providers/models remain user-level config.
