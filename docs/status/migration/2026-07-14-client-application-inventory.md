# Client Application Migration Inventory

Snapshot date: 2026-07-14
Scope: `packages/neko-desktop`, Agent TUI product entry, `packages/neko-suite`, active overlapping OpenSpec changes
Status: implementation baseline for `restructure-client-applications-and-retire-desktop-shell`
Disposition source: the active OpenSpec change; this document is not a long-term architecture source.

## Desktop Production Modules

| Current module | Classification | Current callers / lifecycle | State and user-data effect | Canonical replacement | Removal gate |
| --- | --- | --- | --- | --- | --- |
| `src/main/index.ts` | `home-owned` composition, then `retire` | Electron main startup; owns window, protocol and IPC registration | Resolves workspace, assembles runtime state | `apps/neko-home/src/main/index.ts` using migrated/shared modules | Home Electron startup, IPC, restart and storage gates pass |
| `src/preload/index.ts` | `home-owned` | Electron preload for the standalone renderer | Exposes typed bridge and legacy migration shim | Home preload with Home bridge only | Home bridge tests and functional IPC pass; legacy shim absent |
| `src/shared/contracts.ts` | split: `home-owned`, `shared-host`, `retire` | Main/preload/renderer and tests | DTOs only; includes Studio editor/workbench contracts | Application contracts in Home; genuinely multi-host identity/handoff in public platform owner | Producer/consumer tests cover every retained contract |
| `src/main/engine-connection.ts` | `shared-host` | Main snapshot, viewport and feature host probes | Reads Engine endpoint/config; no durable state | Public Electron/Engine host adapter consumed by Home | Engine available/unavailable tests pass in Home and shared owner |
| `src/main/desktop-electron-command-executor.ts` | split: `shared-host` and `home-owned` | Agent command execution in Electron main | Opens/saves through host-authorized paths | Minimal shared Electron command ports plus Home composition | Command tests prove stable identity and no active-project fallback |
| `src/main/desktop-agent-conversation-storage.ts` | `home-owned`, pending storage-scope reconciliation | Agent conversation runtime | Durable conversation data under current standalone storage policy | Home conversation storage using normalized storage scopes | Storage migration/reuse tests and active storage change land |
| `src/main/desktop-agent-projection-runtime.ts` | `home-owned` | Home/standalone Agent projection runtime | In-memory rebuildable projection | Home Agent projection composition | Home Agent functional projection passes |
| `src/main/desktop-agent-snapshot-runtime.ts` | `home-owned`, pending storage-scope reconciliation | Skill/catalog snapshot runtime | Reads project/user Skill sources | Home snapshot composition using canonical Skill owner | Skill identity/storage tests pass |
| `src/main/agent-webview-host.ts` | split: `home-owned` host adapter and Agent-owned contracts | Electron Agent runtime messages | Conversation/task/config operations; runtime state | Home Agent host adapter consuming Agent public contracts | Route coverage and real Home Agent functional acceptance pass |
| `src/main/feature-webview-host.ts` | `retire` unless a Home review surface proves a caller | Desktop full feature Webview message host | Project editor/runtime messages | Owning-package Home review adapter or VSCode professional editor | Inventory of real Home surfaces complete; unsupported paths diagnostic |
| `src/main/cut-media-host.ts` | `retire` for Home | Cut feature host helper | Project media/editor behavior | Cut owning package / VSCode; future Studio public adapter | No Home caller and Cut consumer tests pass |
| `src/main/project-file-io.ts` | `shared-host` contract adapter, not Home project-editor owner | Workspace file/editor and feature host | Reads/writes project files | Canonical project-file IO public adapter used only by authorized project owner | Stable project identity tests; Home has no implicit project writes |
| `src/main/workspace-scan.ts` | `retire` as Home canonical source | Desktop file tree/protocol | Reads workspace and builds editor-centric tree | Project Registry/resource providers; VSCode project explorer | Home project discovery uses provider contract; no Desktop fallback |
| `src/main/workspace-resource-provider.ts` | split: provider contract `shared-host`, scanner `retire` | Desktop Workbench resource projection | Rebuildable workspace tree projection | Canonical project/resource provider | Home resource functional acceptance and provider diagnostics pass |
| `src/main/desktop-resource-surfaces.ts` | `home-owned` projection, fixtures `retire` | Assets/generations/market/skills/search snapshot | Rebuildable provider projection | Home resource-management composition through owning domains | Home uses real/public providers; fixture fallback poisoned |
| `src/shared/desktop-fixtures.ts` | `retire` | Desktop snapshot/bootstrap tests and renderer | Static/rebuildable fixture only | Focused test fixtures owned by Home tests | Production callers absent and Home scenarios use authoritative providers |
| `src/shared/desktop-workbench-adapter.ts` | `retire` for product; shared contribution pieces already in Workbench Core | Desktop Studio shell bootstrap | Rebuildable Workbench snapshot | Home-specific navigation composition; Workbench Core remains shared | No Home Studio layout import; package contribution tests pass |
| `src/shared/feature-webview-adapters.ts` | `retire` from application ownership | Desktop feature adapter registry | Runtime mapping only | Owning package public descriptors consumed by professional hosts | VSCode/owning-package coverage passes; no Desktop switch remains |
| `src/shared/engine-viewport-session.ts` | `studio-experiment` then shared owner | Desktop viewport contract tests/main | No durable state; native output contract | `@neko/workbench-core` / Engine client/Proto as applicable | No Desktop renderer dependency; producer/consumer tests pass |
| `src/renderer/main.tsx` | `home-owned` entry, rewritten | Standalone renderer bootstrap | DOM root only | Home renderer entry | Home starts without Studio shell |
| `src/renderer/App.tsx` | split: Home concepts migrated; Studio shell `retire` | VSCode-like standalone workbench | UI state for editor tabs, selection, Agent/Inspector | New Home composition around projects/resources/tasks | Home functional acceptance passes without editor workbench |
| `src/renderer/desktop-bridge.ts` | `home-owned` | Renderer typed bridge lookup | No durable state | Home bridge | Missing/unknown bridge tests pass |
| `src/renderer/desktop-theme.ts` | `home-owned` or public UI reuse | Standalone renderer theme | Rebuildable DOM/theme projection | Home theme composition using shared tokens | Home theme tests pass |
| `src/renderer/i18n/index.ts` | `home-owned` | Standalone shell localization | Locale projection only | Home i18n composition | Home locale tests pass |
| `src/renderer/agent-host-runtime-adapter.ts` | `home-owned` | Agent Webview root in Electron | Scoped runtime messaging | Home Agent runtime adapter | Home route and isolation tests pass |
| `src/renderer/webview-root-types.tsx` | `retire` unless required by a classified Home review adapter | Desktop full feature Webview roots | UI type mapping only | Owning package public review/root contract | No unclassified Home consumer remains |
| `src/renderer/CodeEditor.tsx` | `retire` | Desktop editor panel | Unsaved local UI state and workspace writes | Neko for VSCode professional editor | Old editor entry fails; CodeMirror dependencies unused |
| `src/renderer/editor-tab-state.ts` | `retire` | Desktop Studio tabs | Ephemeral editor state | VSCode owns current professional editor state | Tests and production callers removed |
| `src/renderer/creative-editor-adapters.tsx` | `retire` | Desktop switch mounting full domain roots | Project editor UI/runtime | Owning domain Extensions; future Studio adapter only after new change | No Desktop/Home full-editor switch remains |
| `src/renderer/styles.css` | split: Home styles migrate, Studio styles `retire` | Standalone renderer | No durable state | Home-specific stylesheet and shared UI primitives | Unused/legacy checks pass |

All `*.test.ts(x)` files follow the classification of their production subject. Tests move with retained owners, are replaced by path-level application tests, or are deleted with retired behavior. `vite.config.ts`, `vitest.config.ts`, TypeScript configs, Tailwind/PostCSS config, `index.html`, and `scripts/*` are `home-owned` only where required by Home; Desktop-named build/start/smoke configuration is retired after canonical Home commands pass.

## Desktop Commands, Dependencies, Fixtures, And Scenarios

| Surface | Classification and policy |
| --- | --- |
| Root `build:desktop`, `start:desktop`, `test:desktop`, `test:desktop:functional`, `smoke:desktop:build` | `retire` after corresponding Home build/start/test/functional/smoke commands pass; no forwarding aliases |
| Package build/main/preload/renderer/start/smoke/test scripts | Migrate required Electron tasks to Home; retire Desktop package scripts with package removal |
| Runtime dependencies `react`, `react-dom`, `@neko/shared`, `@neko/ui`, `@neko/platform`, `@neko/host`, `@neko/neko-client`, `@neko-agent/types`, `@neko-agent/webview`, `@neko/workbench-core`, `clsx` | Re-evaluate from actual Home imports; retain only direct Home dependencies |
| Creative Webview dependencies for Canvas, Audio, Model, Sketch, Preview and generic Webview | `retire` from Home unless an explicit lightweight review adapter is added by its owner |
| CodeMirror packages | `retire` with Desktop CodeEditor |
| Electron/esbuild/Vite/React/TypeScript/Tailwind test/build dependencies | `home-owned` where still used by Home tooling |
| `src/shared/desktop-fixtures.ts` and renderer snapshots | `retire` from production; focused Home test fixtures must not become successful provider fallback |
| `desktop.workbench-open-file.p0` and `desktop.edit-save-restart.p0` | `retire`: VSCode owns professional file editing; no Home replacement behavior |
| `desktop.engine-unavailable.p0` | migrate to Home Engine Core unavailable diagnostic scenario |
| `desktop.engine-ready-host-private.p2` | split: Home Engine Core ready/host-private diagnostic plus shared Engine host contract test |
| `scripts/webview-functional/desktop-host.mjs` | `shared-host`: generalize to an Electron application host without a `packages/neko-desktop` assumption |

Generated `.turbo`, `coverage`, and `dist` content is rebuildable and not migrated as user data. The checked-in `packages/neko-suite/neko-suite-0.0.1.vsix` is a generated release artifact and must not become the canonical source for `apps/neko-vscode`.

## Durable And Rebuildable State

| State | Current evidence / owner | Migration policy |
| --- | --- | --- |
| Agent conversations | Desktop conversation file storage under current workspace/storage policy | Preserve through the normalized storage-scope owner; unknown schema/owner fails closed |
| Agent config and settings | Platform `FileUserConfigManager` plus workspace config | Reuse canonical platform storage identity; renderer receives no secrets |
| Skill catalog/snapshots | Agent/Skill runtime reads user/project sources | Reuse full Host identity/fingerprint; snapshots are rebuildable |
| Project files | Workspace/project-file IO adapter | No implicit Home writes; professional project owner remains authoritative |
| Project registry | Not yet a canonical Desktop durable registry | Home must introduce/reuse a stable registry before claiming migration |
| Credentials/secrets | No Desktop renderer ownership; host/platform secret owners | Preserve owner and secure storage identity; never project to renderer |
| Trust state and installed packages | Owning Auth/Market/Plugin services, not Desktop renderer | Reuse canonical owner; missing migration is a blocker |
| Generated artifacts | Owning generation/asset/project services | Preserve stable refs/provenance; do not migrate cache paths as identity |
| Workbench/resource/Agent projections | In-memory or reconstructable snapshots | Rebuild; rebuilding failure must surface a diagnostic |
| Cache, thumbnails and build output | Rebuildable | Rebuild or explicitly clear only after confirming no durable identity points into cache |

## TUI Product Entry Inventory

| Surface | Current state | Stable identity / migration requirement |
| --- | --- | --- |
| Product source | `@neko/cli` in `packages/neko-agent/packages/cli-tui` | Complete terminal host composition moves to `apps/neko-tui`; host-neutral Agent/runtime owners remain packages |
| Executable | `dist/cli.js`, bin `neko-agent`, source `src/cli.tsx` | Preserve user-facing command until canonical app entry replaces it, then remove old successful entry rather than forward |
| Root command | `pnpm nekoagent` previously filtered `@neko/cli` | Use canonical `@neko/app-tui` filter/command and remove the old package |
| Debug automation | TUI JSON-line debug server and `.vscode/launch.json`/evaluation command references | Evaluation must drive the new executable and prove no old path participation |
| Runtime state | Workspace root, conversation IDs/storage, user config, Skill identity, task/artifact state | Preserve canonical owners and storage scopes; source path movement cannot change identity |
| Agent Evaluation | `scripts/agent-eval` invokes the real TUI entry through configured debug command | Update only the canonical executable command; runner/session assembly remains external and unchanged |

## VSCode Product Entry Inventory

| Surface | Current state | Stable identity / migration requirement |
| --- | --- | --- |
| Product root | `packages/neko-suite` | Move pure product root to `apps/neko-vscode` |
| Marketplace identity | publisher `neko`, extension name `neko-suite`, version `0.0.1` | Preserve `neko.neko-suite`, extension storage identity and upgrade path |
| Runtime/domain code | None; current package is a pure Extension Pack | Keep all domain Extensions and Custom Editors in owning packages |
| Product content | `package.json`, `.vscodeignore`, README, LICENSE | Move product source; regenerate VSIX rather than copy checked-in archive |
| Release | Root release workflow packages `packages/neko-*`; package has `vsce package --no-dependencies` | Point explicit product packaging to `apps/neko-vscode`; preserve domain extension packaging |
| Extension list | Fifteen `neko.*` extension IDs | Preserve IDs and validate packaged activation/installation matrix |

## Active Change Ordering

| Change | Overlap and ordering decision |
| --- | --- |
| `normalize-neko-storage-scopes` | Must define canonical conversation/config/storage identity before Desktop-derived durable state is moved or deleted. Home can scaffold first; destructive storage cleanup waits. |
| `establish-vscode-webview-functional-testing` | Electron runner/scenario ownership must be generalized in coordination with its active tasks. Existing Desktop scenarios are mapped before deletion. |
| `normalize-cross-host-adapter-composition` | Completed canonical adapter rules are inputs. Home consumes public Agent/feature adapters; it does not restore global VSCode shims. |
| `normalize-feature-webview-host-adapters` | Completed package-owned descriptors remain authoritative. Retiring Desktop composition must not move descriptors into Home. |
| `introduce-neko-desktop-mvp-client` and `align-desktop-to-workbench-core` | Historical Desktop direction is superseded for product-shell purposes. Shared Workbench and viewport contracts remain inputs; shell behavior is retired only through this change. |
| `introduce-neko-workbench-plugin-host` | Workbench Core/Plugin Host remains shared. No application may absorb its registry or manifest ownership. |

## Action Flow

Implementation and acceptance are tracked only in the active OpenSpec change. Stable application ownership is promoted to `docs/architecture/application-composition.md`; this dated inventory remains as migration evidence and is not maintained as an architecture truth source.
