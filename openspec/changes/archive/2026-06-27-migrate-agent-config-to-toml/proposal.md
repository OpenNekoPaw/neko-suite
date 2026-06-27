## Why

Neko Agent's current user configuration is stored as `~/.neko/config.json`, which is reliable for machine-generated data but fragile for hand editing because provider/model configuration quickly becomes deeply nested and users can break the whole file with one missing brace, bracket, comma, or quote. The Agent configuration path is now becoming a first-class product surface for local, gateway, and future direct providers, so the hand-authored format should move to a configuration-friendly syntax before more docs, tests, and settings flows depend on JSON.

## What Changes

- **BREAKING**: Replace `~/.neko/config.json` and workspace `.neko/config.json` as the canonical Agent user/workspace configuration files with `~/.neko/config.toml` and `.neko/config.toml`.
- **BREAKING**: Stop treating `config.json` as any Agent configuration input. If TOML is missing, Agent reports the canonical TOML file as missing and ignores adjacent JSON files.
- Add a TOML authoring contract for Agent configuration that maps to the existing internal `UnifiedConfig`, `ProviderConfig`, `ModelConfig`, MCP, auth, and scalar settings contracts.
- Keep runtime, Webview messages, account gateway catalog snapshots, generated caches, and internal DTOs as typed objects/JSON-compatible data. TOML is only the user-authored configuration syntax.
- Add fail-visible parse and validation diagnostics for TOML syntax errors, unsupported schema versions, duplicate IDs, invalid provider/model references, and selected unavailable models.
- Update config open/create/write paths, documentation, tests, and Webview diagnostics to point users to TOML.

Non-goals for this change:

- No migration of OAuth account gateway secrets into user configuration.
- No change to provider source priority, account gateway catalog behavior, or NewAPI/local provider runtime semantics beyond replacing the file format used by explicit user configuration.
- No TOML persistence for Webview state, account catalog cache, generated media/artifact cache, project files, or `nk*` durable project formats.
- No JSON migration command, dual-read, dual-write, conflict detection, or compatibility path for Agent config.

## Capabilities

### New Capabilities

- `agent-toml-config-authoring`: Defines the canonical TOML user/workspace configuration format for Neko Agent, its mapping to internal runtime config objects, breaking JSON migration behavior, and fail-visible diagnostics.

### Modified Capabilities

- None.

## Impact

- Shared configuration constants, reader/writer, and tests in `packages/neko-types/src/config/`.
- Agent Platform config manager, user/workspace config adapters, diagnostics, default config creation, and import/export paths in `packages/neko-agent/packages/platform/src/config/`.
- Agent Extension config bridge commands that open/create configuration files.
- CLI/TUI configuration read/write paths that now share `~/.neko/config.toml`.
- Webview settings/onboarding/config projections and localized diagnostics that mention the config file path or invalid JSON.
- Existing OpenSpec/docs references that still describe the old `~/.neko/config.json` Agent explicit config.
- New dependency audit for a TOML parser/serializer in the shared Layer 0 config package.
- Focused validation for TOML parse/write, JSON-ignored path-level behavior, provider/model resolution, Webview projection diagnostics, and documentation updates.
