## Context

Neko Agent currently treats `~/.neko/config.json` and workspace `.neko/config.json` as the shared user/workspace configuration files. The shared Layer 0 reader in `@neko/shared` parses JSON directly into `UnifiedConfig`, while Agent Platform converts that object into provider/model maps, Webview-safe projections, MCP server state, scalar settings, and conversation precondition diagnostics.

That architecture is sound after parsing, but the authoring format is not friendly enough for the next phase of Agent provider configuration. Users need to hand edit local providers, custom endpoints, direct providers, and model capability records. JSON makes this error-prone because a single missing brace, bracket, comma, or quote invalidates the whole file and offers no comments. TOML reduces the most common hand-editing mistakes, supports comments, and keeps repeated provider/model records readable through `[[providers]]` and `[[models]]`.

This is a prelaunch breaking migration. The canonical runtime contract remains `UnifiedConfig`; the canonical user-authored syntax changes to TOML.

Five-layer analysis:

- Responsibility: `@neko/shared` owns config file names, parse/write helpers, TOML authoring DTOs, and conversion to `UnifiedConfig`. Agent Platform owns provider/model validation and source resolution after it receives `UnifiedConfig`. Extension Host owns commands that open or create config files. Webview owns projection display only.
- Dependency: TOML parsing stays in Layer 0 shared config code and must not import VS Code, React, DOM, or Agent feature internals. Extension and CLI use shared config APIs. Webview receives JSON-compatible diagnostics and projections, not TOML ASTs.
- Interface: Add an explicit `NekoTomlConfig`/authored config shape and adapter to `UnifiedConfig`. Keep `ProviderConfig`, `ModelConfig`, account gateway DTOs, and Webview messages unchanged except for path/diagnostic wording.
- Extension: Future provider fields such as `reasoning_effort`, `service_tier`, domain model capabilities, and direct provider profiles can be added to the TOML authoring contract and mapped into existing typed runtime options without changing resolver callers.
- Testing: Unit tests cover TOML parse/write, adapter mapping, invalid TOML diagnostics, duplicate provider/model IDs, selected provider/model validation, and path-level proof that runtime defaults ignore adjacent legacy JSON files. Extension/Webview tests cover open/create commands and projected diagnostics.

## Goals / Non-Goals

**Goals:**

- Make `config.toml` the canonical user and workspace Agent configuration file.
- Keep runtime and cross-package configuration data as typed objects derived from `UnifiedConfig`.
- Remove default JSON success fallback so the new TOML path is path-level testable.
- Remove JSON migration/compatibility paths so `config.toml` is the only Agent config input.
- Surface clear diagnostics for TOML syntax errors, unsupported config versions, and semantic validation errors.
- Keep OAuth account gateway configuration runtime-only and secret-safe.
- Update docs, examples, tests, and user-visible path labels to TOML.

**Non-Goals:**

- Persist runtime account catalog snapshots, Webview messages, generated caches, `nk*` project files, or engine contracts as TOML.
- Keep JSON/TOML dual-read, dual-write, conflict detection, or migration compatibility.
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

2. Make `config.toml` canonical and ignore JSON entirely.

   New read paths look only for TOML. If only `config.json` exists, the canonical result is the same as no TOML file: missing config. If both files exist, TOML is read and JSON is ignored. Runtime conversation setup must not silently load JSON, invoke migration, or surface JSON-specific diagnostics.

   Alternative considered: read TOML first, then JSON fallback. Rejected because fallback hides broken TOML implementations, makes validation ambiguous, and violates the prelaunch cleanup rule against default legacy paths returning success after a canonical replacement exists.

3. Do not provide JSON migration.

   Agent no longer exposes a VS Code, CLI, TUI, shared helper, or Webview path that reads `config.json`. Users who still have old local JSON must manually create `config.toml`. This keeps runtime behavior path-level testable and avoids shipping a second config parser as a compatibility surface.

   Alternative considered: explicit conversion command. Rejected for this prelaunch cleanup because it preserves a JSON parser/helper API, command surface, diagnostics, and tests that can be accidentally reused as compatibility fallback.

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

   Commands and UI actions that open Agent configuration should create/open `config.toml`, not JSON. New default config templates should be TOML, while runtime default objects can remain JSON-compatible constants for tests and internal creation.

   Alternative considered: keep "Open config" pointing at JSON until migration completes. Rejected because it prolongs the old path and creates two user-facing sources of truth.

## Risks / Trade-offs

- [Risk] Existing local `config.json` users are blocked after upgrade. -> Mitigation: document `config.toml` as the only supported format; old JSON remains user-owned and untouched.
- [Risk] Both JSON and TOML exist with different data. -> Mitigation: TOML is canonical and JSON is ignored; tests prove adjacent JSON cannot change the TOML read result.
- [Risk] TOML serializer loses formatting/comments on programmatic edits. -> Mitigation: MVP writer may generate clean TOML for Neko-managed sections; docs should state that programmatic settings writes can rewrite those sections. Preserve manual comments only if the selected library supports safe edit operations.
- [Risk] New dependency increases shared package surface. -> Mitigation: dependency audit, focused parser tests, and keep it in Layer 0 config only.
- [Risk] TOML supports fewer nested dynamic object patterns than JSON. -> Mitigation: use repeated tables for providers/models/MCP servers and explicit keyed subtables only where they are readable.
- [Risk] Legacy JSON fallback accidentally remains reachable. -> Mitigation: delete shared JSON migration helpers and command surfaces; add poisoned-path tests that prove adjacent JSON is ignored.
- [Risk] Webview or docs continue saying "invalid JSON". -> Mitigation: update i18n, tests, and docs references to TOML-only diagnostics.

## Migration Plan

1. Add `config.toml` constants and shared TOML parse/write/adapter contracts in `@neko/shared`.
2. Replace default user/workspace config path helpers to point at `config.toml`.
3. Remove legacy JSON path helpers, detection result codes, migration helpers, command surfaces, and diagnostics.
4. Update Agent Platform user/workspace config managers to consume TOML-derived `UnifiedConfig`.
5. Update config open/create commands to generate TOML templates.
6. Update Webview/i18n diagnostics and model/config projections that mention config file names or invalid JSON.
7. Update OpenSpec/docs/README examples and default config snippets.
8. Delete JSON migration/diagnostic paths and poison tests so adjacent JSON cannot affect canonical TOML reads.
9. Run focused config tests, Agent Platform config tests, Webview projection tests, and relevant check/build commands.

Rollback is intentionally not a runtime fallback. If implementation must be reverted during development, revert the change. Shipped runtime should not silently switch back to JSON because that would reintroduce two sources of truth.

## Resolved Questions

- TOML dependency: `smol-toml`.
- Legacy JSON preservation: Neko no longer reads, renames, migrates, or diagnoses `config.json`.
- Programmatic settings writes: MVP rewrites Neko-managed TOML from the typed runtime object; manual comment preservation is deferred until a section-preserving editor is justified.
- Workspace `.neko/config.toml`: parsed through the same TOML reader, but Platform only consumes workspace MCP fields in this change; AI providers/models remain user-level config.
