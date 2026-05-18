## Context

Dashboard currently provides project overview, runtime context, quick actions,
and task monitoring through a WebviewPanel. It already follows a useful boundary:
the Dashboard extension owns UI and aggregation, while domain packages expose
programmatic commands or shared DTO sources. It does not import Agent, Assets,
Story, or Engine implementations directly.

Unified creative entity infrastructure exists below the product surface:

- `@neko/shared` defines creative entity, binding, requirement, visual draft, and
  representation contracts.
- `neko-story` owns script-backed candidates, character registry projection,
  occurrence/graph services, and `CreativeEntityManagementService`.
- `neko-assets` owns asset library entries, file metadata, thumbnails,
  representation package details, and asset mutation workflows.
- `ProjectCacheSearchService` exposes search results, but search is not a
  management surface.

The missing layer is a persistent project-level management view where the user
can inspect entity identity, candidates, missing materials, bindings, drafts, and
asset sync suggestions without jumping through individual QuickPick commands.

### Five-Layer Analysis

**Responsibilities**

- Dashboard: present the project entity ledger, filter/sort/detail state, and
  delegate actions.
- Story: provide authoritative entity/candidate/detail/action source for current
  project facts.
- Assets: provide asset selection, metadata update, thumbnail/representation
  information, and asset mutation commands.
- Shared contracts: define source DTOs, refs, actions, events, freshness, and
  type guards.
- Search: expose lookup and navigation, not entity mutation ownership.

**Dependencies**

- `@neko/shared` remains Layer 0 and cannot import VSCode, React, Story, Assets,
  or Dashboard.
- Dashboard extension can depend on VSCode and shared contracts, but not on
  Story or Assets source modules.
- Dashboard Webview can depend on React and projected DTO types, but cannot use
  VSCode API or filesystem directly.
- Story and Assets expose programmatic commands or source adapters.

**Interfaces**

- `DashboardCreativeEntitySource` is the source boundary.
- Dashboard discovers sources via known commands, starting with
  `neko.story.getDashboardCreativeEntitySource`.
- Webview sends entity action ids and entity refs to Dashboard host; host
  validates and delegates to the source.
- Source events are partitioned by project/source/entity refs so Dashboard can
  refresh without polling.

**Extension**

- Additional domain packages can contribute sources later, but Dashboard P0 only
  needs Story as the authoritative unified entity source.
- Assets can later expose richer asset picker/sync APIs without changing the
  Dashboard Webview contract.
- Entity kinds remain open to `character`, `scene`, `location`, `object`, and
  future kinds supported by shared contracts.

**Tests**

- Shared DTO guard tests cover invalid paths, invalid refs, action values, and
  freshness values.
- Dashboard extension tests cover source discovery, missing source degradation,
  snapshot merge, action delegation, and unsafe ref rejection.
- Story adapter tests cover Chinese names, script candidates without portraits,
  confirmed entities, bindings, missing requirements, and visual drafts.
- Webview tests cover table filtering, sorting, badges, detail projection, and
  action message generation.

## Goals / Non-Goals

**Goals:**

- Add a Dashboard Work Mode section for unified creative entity management.
- Provide a shared source contract for entity snapshots, details, events, and
  actions.
- Reuse existing Story entity management services rather than adding a second
  entity model.
- Preserve `neko-assets` as the owner of asset resources while allowing entity
  views to delegate asset operations.
- Make entity-to-asset metadata synchronization explicit and auditable through
  sync suggestions.
- Keep Webview state free of absolute local file paths and cache schema details.

**Non-Goals:**

- Do not move unified entity facts into `neko-assets`.
- Do not build a full graph editor or visual relationship canvas in P0.
- Do not implement automatic asset filename/title/tag rewrites on entity edits.
- Do not replace the existing Story QuickPick commands; Dashboard actions may
  reuse them during migration.
- Do not expose provider configuration, prompt editing, or heavy media probing
  from the Dashboard entity surface.

## Decisions

### D1: Dashboard Owns The Management Surface, Story Owns The Source

Dashboard will render the Creative Entities page because it is the project-level
workbench. Story will own the first source because the current authoritative
entity/candidate/detail services live there.

Alternatives considered:

- Put the surface in `neko-assets`: rejected because entity identity exists even
  before assets and should not require material representation.
- Put the surface in `neko-story` only: rejected because missing materials,
  generated results, and cross-package project state need a broader project
  workbench.

### D2: Pull Snapshot Plus Event Refresh

Dashboard will request a snapshot on open/refresh and subscribe to entity events
from valid sources. Entity updates can trigger section-level refreshes while
task monitoring remains event-driven independently.

Alternatives considered:

- Polling source commands continuously: rejected because Dashboard runtime specs
  already avoid stable-state polling.
- Webview directly querying sources: rejected because Webview cannot call VSCode
  APIs and should not own source discovery.

### D3: Source DTOs Carry Stable Refs, Not Filesystem Paths

Entity rows, details, occurrences, bindings, drafts, and sync suggestions use
workspace-relative refs, `${VAR}/path`, `project://`, `market://`, `shared://`,
or opaque source ids. Absolute paths and `.neko/.cache` schema paths are not
projected to Webview state.

Alternatives considered:

- Send local absolute file paths to Webview and trust it not to persist them:
  rejected due to existing Webview and path resolver constraints.

### D4: Asset Sync Is Suggested, Then Explicitly Applied

Entity edits can recompute suggestions such as "asset label differs from entity
name" or "generated image can be registered as portrait", but assets are not
mutated automatically. Applying a suggestion delegates to the owning source or
Assets command and records an auditable action result.

Alternatives considered:

- Auto-update asset metadata when entity aliases or canonical name changes:
  rejected because a single asset can serve multiple entities, external/market
  assets may be read-only, and silent metadata churn pollutes Git diffs.

### D5: Initial Implementation Uses Existing Commands Where Practical

Dashboard action requests can initially route to existing Story commands for
binding, visual draft review, missing material queue, and representation package
detail. New typed source actions should be added where QuickPick-only commands
cannot return deterministic action results.

Alternatives considered:

- Rebuild all entity mutation flows as Dashboard-specific actions in P0:
  rejected as too large and duplicative.

## Risks / Trade-offs

- **Risk: Dashboard becomes a domain owner.** → Mitigation: enforce source-owned
  adapters and architecture tests that prevent Dashboard importing Story/Assets
  implementation modules.
- **Risk: QuickPick-based reused actions feel disconnected from Dashboard.** →
  Mitigation: P0 can reuse commands for speed, while tasks include typed action
  seams for later inline interactions.
- **Risk: entity candidates and confirmed entities duplicate in the table.** →
  Mitigation: source adapter must provide stable `entityRef` and candidate
  status; Dashboard displays grouped state and de-duplicates by source/ref.
- **Risk: sync suggestions accidentally mutate assets.** → Mitigation: sync
  suggestions are read-only DTOs until an explicit `apply-sync-suggestion`
  action is requested and validated by host/source code.
- **Risk: multi-root workspace ambiguity.** → Mitigation: every snapshot and
  action carries project/workspace identity; Dashboard never assumes first
  workspace for mutation actions.

## Migration Plan

1. Add shared Dashboard creative-entity DTOs and guards.
2. Add a Story source adapter backed by existing management services.
3. Add Dashboard source discovery and include entity snapshot in `DashboardData`.
4. Add the Webview page, filtering, detail panel, and action message handling.
5. Add explicit sync suggestion DTOs and source-side apply/ignore action paths.
6. Keep existing Story QuickPick commands available as fallback actions.
7. Add docs and tests, then later replace QuickPick fallbacks with richer inline
   Dashboard actions.

Rollback is straightforward because the feature is additive: disable source
discovery/UI tab and keep existing Story commands unchanged.

## Open Questions

- Should Dashboard be able to edit canonical names and aliases inline in P0, or
  should P0 only navigate to source commands?
- Should Assets expose a typed asset picker source before Dashboard implements
  inline binding, or can P0 reuse existing `neko.story.setCreativeEntityDefaultBinding`?
- Should stale entity snapshots be visibly badged in the table, or only surfaced
  in the source status strip?
