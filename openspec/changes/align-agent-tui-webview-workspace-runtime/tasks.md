## 1. Contracts And Fixtures

- [x] 1.1 Add focused fixtures for user config, workspace config, standard user/workspace Skills, command artifacts, task records, and project resource-cache roots.
- [x] 1.2 Define the shared effective Agent workspace config snapshot contract, including workspace scalar policy, model/provider resolution diagnostics, MCP merge output, and session-only overrides.
- [x] 1.3 Define the host-neutral Agent workspace runtime assembly input used by Webview and TUI interactive sessions.
- [x] 1.4 Define task scope contracts for workspace-visible task records and host-private leases/recovery handles.
- [x] 1.5 Add poison-path test helpers for old readline interactive resume, TUI-local raw config reads, TUI-local Skill directory loading, and result-only command fallback.

## 2. Config Snapshot Alignment

- [x] 2.1 Implement the shared effective config snapshot resolver in the shared config/platform layer.
- [x] 2.2 Update Webview/Extension settings, status, model selection, and Agent runner paths to consume the shared effective snapshot.
- [x] 2.3 Update TUI startup, stores, model picker, LLM parameter controls, and headless runner config entrypoints to consume the shared effective snapshot where applicable.
- [x] 2.4 Add diagnostics for invalid workspace defaults, unsupported workspace provider/model definitions, and non-standard Skill source settings.
- [x] 2.5 Add tests proving TUI and Webview resolve the same provider, model, scalar parameters, media defaults, MCP servers, and diagnostics from the same workspace fixture.

## 3. Canonical Interactive Session Runtime

- [x] 3.1 Migrate TUI interactive startup to the canonical Agent runtime session assembly path.
- [x] 3.2 Migrate TUI resume and initial prompt dispatch to the Ink TUI session path.
- [x] 3.3 Replace new TUI conversation ids with canonical workspace-scoped conversation ids.
- [x] 3.4 Reject existing persisted `cli-*` conversation records instead of keeping a resume compatibility path.
- [x] 3.5 Remove, privatize, or convert old readline `runInteractive` public API usage into a fail-closed diagnostic shim.
- [x] 3.6 Keep `experiment` as a validation utility, keep `completion` as a utility command, and route scripted Agent behavior acceptance through `scripts/agent-eval` plus TUI debug automation rather than alternate session runners.

## 4. Skill And Command Catalog Alignment

- [x] 4.1 Replace TUI session Skill loading with the shared Skill file runtime for `~/.neko/skills`, `~/.neko/commands`, `.neko/skills`, and `.neko/commands`.
- [x] 4.2 Remove implicit TUI-only `.codex/skills` loading or replace it with an explicit diagnostic Skill source provider.
- [x] 4.3 Align TUI and Webview command artifact discovery through the shared command catalog.
- [x] 4.4 Register host-local command effects with explicit surface scope instead of embedding them as hidden fallback parsing branches.
- [x] 4.5 Add tests proving command artifacts and `$skill` activation use shared catalog resolution and Skill lifecycle runtime on both surfaces.

## 5. Task, Context, And Runtime State

- [x] 5.1 Implement the workspace-visible task record store or explicit host-private diagnostics according to the task scope contract.
- [x] 5.2 Update Extension task bootstrap to separate workspace-visible task facts from VS Code state-backed recovery/lease data.
- [x] 5.3 Update TUI task bootstrap to stop using an incompatible global task store as the canonical workspace task plane.
- [x] 5.4 Route TUI context settings, project memory, AGENTS overlays, authorized read roots, and capability prompt fragments through the shared runtime assembly path.
- [x] 5.5 Add tests for cross-surface task visibility, host-private lease diagnostics, context settings propagation, and stale state rejection.

## 6. Content Access And Resource Cache

- [x] 6.1 Add TUI project resource-cache startup GC/quota handling through the shared resource-cache policy.
- [x] 6.2 Ensure TUI and Webview document/image materialization use the same project cache root and manifest for workspace-scoped resources.
- [x] 6.3 Align document reader dependency loading diagnostics so missing optional modules fail visibly and consistently across hosts.
- [x] 6.4 Add tests proving TUI does not read Extension-private cache and neither surface exposes cache paths as durable success output.

## 7. Legacy Surface Cleanup

- [x] 7.1 Remove obsolete public exports, docs, and tests that present CLI readline interactive mode as the default Agent interaction model.
- [x] 7.2 Update package naming or public descriptions where needed so the terminal package is described as TUI plus headless tools, not the canonical CLI product.
- [x] 7.3 Keep legacy-debt scanner ledger rows only for retained migration or diagnostic shims; deleted compatibility paths require no active ledger row.

## 8. Validation And Documentation

- [x] 8.1 Run focused unit and integration tests for config snapshots, TUI session startup/resume, Webview Agent runner assembly, Skill catalog, command catalog, task scope, and resource cache.
- [x] 8.2 Run Agent architecture and boundary checks, including `pnpm check:agent-boundaries` and any focused dependency-boundary tests touched by the change.
- [x] 8.3 Run `pnpm check:legacy-debt` and `pnpm check:unused` after legacy path cleanup, or record the broader command that covers them.
- [x] 8.4 Run a focused `scripts/agent-eval` case through TUI debug automation for provider/model selection and live Agent event behavior, or record why it could not run and the residual risk.
- [x] 8.5 Run VS Code Extension Development Host Webview runtime smoke for changed Webview message/config/command/session paths.
- [x] 8.6 Update Chinese and English architecture or package docs when public entrypoints, config policy, Skill source policy, or task/cache scope behavior changes.

Validation notes on 2026-07-08:

- Focused Vitest suite passed: 29 files, 191 tests.
- `pnpm check:agent-boundaries`, `pnpm check:legacy-debt`, `pnpm check:unused`, and `pnpm smoke:webview:runtime` were attempted; the pnpm wrapper stopped before script execution because the local pnpm 11 deps-status install rejected ignored build scripts. Equivalent direct commands were run.
- `node scripts/check-neko-agent-boundaries.mjs` still fails on pre-existing expired compatibility exceptions, but reports no boundary findings and no LCD register findings for this change.
- `node scripts/check-legacy-debt-surfaces.mjs` and `./node_modules/.bin/knip` still fail on broader repository baseline items; this change removed its new production `legacy`/unlisted-dependency hits before completion.
- A credentialed TUI debug automation evaluation was not run in the original validation environment. Residual risk: live provider/model event behavior still needs a focused `scripts/agent-eval` run.
- VS Code Extension Development Host smoke passed through `vscode-extension-debugger`: debugger reachable on port 9222, `neko.neko-agent` webview target visible, snapshot rendered the Agent UI, and console capture only showed the documented VS Code `local-network-access` warning.
