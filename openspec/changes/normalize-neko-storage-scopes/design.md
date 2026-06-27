## Context

The repository already describes a four-level storage model in shared storage
contracts:

- `~/.neko/`: user-level global storage.
- `<workspace>/neko/`: Git-trackable project facts.
- `<workspace>/.neko/`: workspace-local, gitignored state.
- `<workspace>/.neko/.cache/`: rebuildable project cache.

Implementation has drifted around that model. Workspace `.neko/` now contains
cache, Agent artifacts, logs, Dashboard activity, personal-looking Skills,
deprecated hooks, recordings, temp imports, and runtime state. Some code also
uses VS Code `globalStorageUri` for extension-private cache and Market state,
while CLI paths use `~/.neko`. Without a scope contract, each package can invent
or preserve a different answer for the same question: "Is this project fact,
project-local runtime state, user-level data, extension-private state, or
durable asset media?"

This is a local VS Code client plus local Rust Engine product. The design must
avoid distributed storage abstractions and focus on explicit local ownership,
recoverable migration, and fail-visible diagnostics.

### Five-layer analysis

Responsibility:

- `@neko/shared` owns the storage-scope taxonomy, pure layout resolution,
  classifier DTOs, and portable path contracts.
- Extension Host adapters own filesystem writes, migration actions, cleanup,
  diagnostics, and VS Code `globalStorageUri` binding.
- Feature packages own domain meaning: Agent artifacts, Dashboard activity,
  Live preview recordings, Assets imports, Market install records, processors,
  and Skills.
- ResourceCache owns cache paths, manifest state, projection readiness, budget,
  and GC. Cache files are never durable project facts.
- Assets/Project services own promotion of retained media into user-selected
  project or media-library roots.

Dependency:

- Layer 0 shared contracts stay host-agnostic and must not import VS Code,
  React, DOM, Agent, Dashboard, Live, Market, or feature package internals.
- Extension Host uses shared contracts plus package adapters to touch disk.
- Webviews receive projections and diagnostics only; they do not scan `.neko`,
  `~/.neko`, cache manifests, or `globalStorageUri`.
- Feature extensions do not import each other to share storage behavior; they
  depend on shared contracts, registries, or host services.

Interface:

- Add a narrow `NekoStorageScope` and `NekoStorageClass` contract with values
  for `project-fact`, `project-local`, `project-cache`, `user-global`,
  `extension-private`, `media-library`, and `scratch`.
- Add a directory classification registry or table that maps known directories
  to owner, default location, tracking policy, cleanup policy, migration policy,
  and diagnostic code.
- Add host-facing operations for inspect, migrate, promote, cleanup, and
  initialize-ignore. These operations return typed diagnostics rather than
  silently moving or deleting user data.
- Keep existing domain DTOs for Skills, processors, Agent artifacts, cache
  resources, and asset library records; this change classifies where those DTOs
  live, not their internal business schemas.

Extension:

- New directories must declare scope, owner, tracking policy, cleanup policy,
  and migration behavior before being created.
- Personal/project variants, such as Skills, commands, prompts, processors, and
  AGENTS instructions, use the same classifier shape with source scope
  `personal` or `project`.
- Future package-specific directories can be added by extending the table or
  registering a package-owned classifier entry, without Webview or feature
  packages hard-coding new path branches.

Testing:

- Pure unit tests validate classification and layout resolution.
- Host adapter tests validate actual write locations, `.gitignore` behavior,
  diagnostics, migration/promotion, and cleanup.
- Path-level tests poison legacy workspace-local paths for personal data and
  assert new code hits `~/.neko`, `globalStorageUri`, `neko/`, media library,
  or `.neko/.cache` according to intent.
- Focused package tests cover Agent Skills/hooks/artifacts, Dashboard activity,
  Live recordings, Market install/cache, ResourceCache, Assets imports, and
  external processors.

Proportionality:

- A classifier table and small host service are enough for this local product.
  No database, daemon, sync service, tenancy abstraction, or remote storage
  protocol is required.
- Migration is explicit and diagnostic-first because the repository is prelaunch
  but may contain valuable local data.

Fail-visible behavior:

- Unknown durable storage class, unregistered directory owner, invalid migration
  target, cache path persisted as fact, personal data requested under project
  `.neko`, and retained media requested as hidden runtime output all fail with
  typed diagnostics.
- Cleanup may delete only rebuildable cache/temp data or user-confirmed targets.
  It must not delete project facts, user config, Market install records,
  retained recordings, trust state, or promoted assets.

## Goals / Non-Goals

**Goals:**

- Make storage scope an explicit contract used by Agent, Assets, Dashboard,
  Live/Audio, Market, ResourceCache, and shared content access.
- Keep project facts in `neko/` and workspace-local runtime/cache data out of
  Git by default.
- Move or create project-independent personal content under `~/.neko/` instead
  of workspace `.neko/`.
- Keep extension-private and no-workspace resources under `globalStorageUri`
  rather than workspace paths or `~/.neko`.
- Preserve valuable user data by using diagnostics, migration, promote, or
  user-confirmed cleanup.
- Make workspace `.neko/` smaller, more explainable, and safer to ignore.

**Non-Goals:**

- No cloud sync, remote cache, project sharing service, or tenant-aware storage
  architecture.
- No redesign of Agent IDC artifact content, Skill injection semantics, Market
  trust, ResourceCache manifest format, or asset library entity schema.
- No automatic promotion of all workspace recordings/imports into project facts.
- No silent deletion of workspace `.neko/recordings`, `.neko/imports`,
  `.neko/memory.md`, Market state, user config, or project facts.
- No Webview direct filesystem or cache-manifest access.

## Decisions

### Decision 1: Canonical scope matrix

Use this matrix as the authoritative target:

| Data | Default location | Scope | Tracking | Owner |
| --- | --- | --- | --- | --- |
| Project facts and shared media-library variables | `neko/` | project-fact | Git-trackable | owning domain service |
| Machine-specific project overrides | `.neko/settings.local.json` | project-local | gitignored | Assets/path resolver |
| Agent IDC artifacts | `.neko/drafts`, `.neko/plans`, `.neko/tasks` | project-local | gitignored | Agent runtime |
| Agent runtime locks/snapshots | `.neko/state` | project-local | gitignored | Agent runtime |
| Project logs and Dashboard activity | `.neko/logs`, `.neko/dashboard-activity.json` | project-local | gitignored | Agent/Dashboard |
| Project resource cache | `.neko/.cache` | project-cache | gitignored | ResourceCache/Search |
| Personal config and AGENTS | `~/.neko/config.toml`, `~/.neko/AGENTS.md` | user-global | user-managed | Agent/shared config |
| Personal Skills/prompts/commands | `~/.neko/skills`, `~/.neko/prompts`, `~/.neko/commands` | user-global | user-managed | Agent skill runtime |
| Project-local Skills/prompts/commands | `.neko/skills`, `.neko/prompts`, `.neko/commands` | project-local | gitignored | Agent skill runtime |
| Team-shared Skills/prompts/commands | future `neko/agent/...` or accepted project fact path | project-fact | Git-trackable | Agent skill runtime |
| Personal processors | `~/.neko/processors` | user-global | user-managed | processor registry |
| Project processors | `.neko/processors` initially | project-local | gitignored | processor registry |
| Deprecated hook catalog | none | deprecated | n/a | settings hook loader |
| User-level Market install/cache | `~/.neko/market-*` or chosen CLI user root | user-global | user-managed | Market core/CLI |
| VS Code extension Market/cache state | `globalStorageUri/market-*` | extension-private | extension-owned | Market extension |
| No-workspace generated resources | `globalStorageUri/resources` | extension-private | extension-owned | ResourceCache |
| Project generated/cache resources | `.neko/.cache/resources` | project-cache | gitignored | ResourceCache |
| Retained recordings/assets | workspace path or media-library root plus `neko/assets/library.json` | media-library/project-fact | source dependent | Assets/Live/Audio |
| Preview-only recordings | `.neko/recordings` or extension-private recording cache | project-local/extension-private | gitignored | Live/Audio |
| Temp scratch | system temp or `.neko/.cache/tmp` / `globalStorageUri/tmp` if projectable | scratch/cache | untracked | owning host adapter |

Rationale: One table makes the codebase answer placement by data lifecycle and
sharing scope, not by package habit.

Rejected alternative: Keep all Neko-created files under workspace `.neko`. This
keeps discovery simple but mixes personal data, caches, project-local state, and
retained assets, and it has already produced large accidental workspace trees.

### Decision 2: Add shared classification contracts before package migrations

Add shared contracts for storage class, owner, cleanup policy, migration policy,
tracking policy, and diagnostic codes. Package code should request a location by
intent such as `personal-skill`, `project-cache-resource`, `preview-recording`,
or `retained-recording`, then receive a resolved path or diagnostic from the
host/shared layout.

Rationale: This lowers coupling because packages no longer need to know every
other package's path convention or duplicate `.neko` decisions.

Rejected alternative: Patch each package's hard-coded path in place. That would
fix visible symptoms but preserve the architectural drift.

### Decision 3: Treat `~/.neko` and `globalStorageUri` as different user areas

`~/.neko` is for user-authored or user-managed cross-project data: config,
AGENTS, personal Skills, personal commands, personal prompts, personal
processors, and CLI-visible user install state. `globalStorageUri` is for
extension-private implementation state, VS Code extension cache, no-workspace
runtime resources, and data that users should not edit by hand.

Rationale: Both are user-machine scoped, but they have different lifecycle and
visibility. Mixing them makes CLI/VS Code parity and cleanup unsafe.

Rejected alternative: Put all user-machine data under `~/.neko`. This makes
manual inspection easy but turns internal extension caches and no-workspace
runtime resources into user-managed files.

### Decision 4: Project `.neko/skills` remains project-local; team-shared Skills need a project-fact path

Current code supports personal `~/.neko/skills` and workspace `.neko/skills`.
The normalized boundary keeps `.neko/skills` as current-project private and
gitignored. If the product needs team-shared project Skills, commands, or
prompts, introduce an explicit project-fact location such as `neko/agent/skills`
or an accepted package manifest path in a follow-up or this implementation if
scope allows.

Rationale: Gitignored `.neko/skills` cannot be both private local state and
team-shared project fact. Keeping the current path project-local avoids
surprising commits while leaving a clear future extension point.

Rejected alternative: Make `.neko/skills` Git-trackable. This would conflict
with the broader workspace `.neko` runtime/cache ignore rule and invite
accidental tracking of logs, state, and cache.

### Decision 5: Retained recordings are promoted assets, preview recordings are runtime state

Live and Audio should classify recording outputs by intent:

- preview/non-authoritative recording: workspace `.neko/recordings` or
  extension-private recording cache with retention/cleanup diagnostics;
- retained recording: user-selected workspace/media-library target, then record
  source identity/provenance through `neko/assets/library.json` or the owning
  project format.

Rationale: A hidden workspace directory is acceptable for local preview outputs
but wrong for user-valued media assets.

Rejected alternative: Move all recordings to `~/.neko/recordings`. That would
make project recordings harder to package, relink, and cite from project facts.

### Decision 6: Deprecated `.neko/hooks` is diagnostic-only

The old markdown hook catalog should not be a canonical directory. Hook behavior
uses settings-based configuration:

- personal hooks from user settings under `~/.neko`;
- project-local hooks from `.neko/settings.local.json`;
- team-shared hook declarations only from an explicit project-fact settings
  contract when one is accepted.

Rationale: The code-debt ledger already identifies `.neko/hooks/*.md` as a
removed catalog. Reintroducing it would create a second hook configuration
source.

Rejected alternative: Auto-load legacy `.neko/hooks`. That would be a hidden
fallback path and contradict fail-visible prelaunch cleanup.

### Decision 7: Workspace hygiene is initialized and checked explicitly

Projects that use Neko should have a generated or documented ignore rule for
workspace `.neko/`, while `neko/` remains trackable. Cleanup commands must
report misplaced files by class:

- cache/temp data: safe to clean if rebuildable;
- project-local runtime data: clean only when stale or user-confirmed;
- personal data in workspace: offer migration to `~/.neko`;
- durable media in workspace `.neko`: offer promote/create asset;
- project facts in `.neko`: diagnostic with suggested target under `neko/`.

Rationale: The immediate user risk is accidental tracking of hundreds of
megabytes of hidden runtime data.

Rejected alternative: Rely on users to add `.neko/` to `.gitignore` manually.
This is too easy to miss and leaves different workspaces with different safety
behavior.

## Risks / Trade-offs

- Existing workspaces may contain valuable files under `.neko/recordings`,
  `.neko/imports`, `.neko/skills`, or `.neko/memory.md` -> migration must inspect
  and report before moving or deleting; retained media requires explicit promote.
- CLI and VS Code extension may disagree on Market or Skill roots -> shared
  layout contracts and focused parity tests must define which roots each surface
  owns.
- `.neko/skills` classification may surprise users who expected project sharing
  -> diagnostics should explain personal, project-local, and future team-shared
  options.
- Adding a classifier can become over-abstracted -> keep the contract as a small
  enum/table plus host operations; do not add a storage service daemon or remote
  abstraction.
- Cleanup can delete useful debug evidence -> default cleanup skips logs,
  recordings, promoted, pinned, session-active, non-rebuildable, and
  outside-root files unless the user confirms.
- Moving user config automatically is risky -> user config is read from canonical
  paths and legacy/misplaced config gets a diagnostic, not silent migration.

## Migration Plan

1. Add shared storage-scope contracts, directory classification table, diagnostic
   codes, and tests in `@neko/shared`.
2. Update layout helpers so canonical global user paths use `~/.neko`, project
   facts use `neko/`, project-local paths use `.neko/`, project cache uses
   `.neko/.cache`, and extension-private paths use `globalStorageUri`.
3. Add a host inspection/cleanup/migration service that can scan a workspace
   `.neko` and return classified entries with suggested actions.
4. Add or update workspace ignore initialization/documentation so `.neko/` is
   ignored and `neko/` remains visible to Git.
5. Migrate package writes in focused order:
   - Agent content roots: Skills/prompts/commands/AGENTS, IDC artifacts, logs,
     state, memory diagnostics, settings hooks, and `.neko/hooks` rejection.
   - Processor registry: personal vs project source-scope roots.
   - Market: CLI user roots vs VS Code extension-private roots.
   - Dashboard: workspace-local activity projection.
   - Live/Audio: preview vs retained recording output.
   - Assets/ResourceCache: imports/cache/temp/promotion diagnostics.
6. Add diagnostics for legacy workspace-local personal directories and large
   cache/recording/temp directories before enabling cleanup actions.
7. Update docs and examples in Chinese and English where they describe Neko
   storage, cache, config, Skills, processors, recordings, and project facts.

Rollback strategy:

- Because this is prelaunch internal path cleanup, rollback should disable new
  migration/cleanup actions first, not re-enable silent legacy fallback.
- Canonical reads can temporarily report diagnostics for old paths while writes
  stay on new paths.
- Cleanup is opt-in or limited to rebuildable cache/temp data, so rollback must
  not require restoring deleted valuable data.

## Open Questions

- Should team-shared Skills/prompts/commands be included in this change as
  `neko/agent/*`, or should this change only reserve the project-fact category
  and leave the concrete path to a follow-up?
- Should project processors remain `.neko/processors` as local untrusted
  project configuration, or should a separate team-shared processor declaration
  move to `neko/` later with explicit trust review?
- Should `.neko/memory.md` stay project-local Agent memory only, or should
  confirmed memory facts gain a domain-owned project-fact destination in this
  change?
- Should preview recordings default to workspace `.neko/recordings` when a
  workspace exists, or extension-private storage until the user explicitly saves?
