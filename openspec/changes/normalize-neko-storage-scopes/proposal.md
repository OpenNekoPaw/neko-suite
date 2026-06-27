## Why

Neko workspace roots are accumulating unrelated `.neko/` directories: project cache,
Agent runtime state, personal Skills, logs, dashboard history, recordings, temp
imports, and deprecated hook catalogs are all visible as one workspace-local
bucket. This blurs the existing storage architecture, makes large generated data
easy to commit by accident, and prevents clear decisions about what is project
fact, project-local state, user-level preference, extension-private cache, or
durable asset data.

This needs to be normalized before more Agent, Dashboard, Live, Market, Assets,
and external-processor flows depend on path conventions that are hard to migrate.

## What Changes

- Introduce a storage scope governance capability for Neko local data:
  - project facts under `neko/`;
  - project-local state under workspace `.neko/`;
  - project cache under workspace `.neko/.cache/`;
  - user-authored cross-project data under `~/.neko/`;
  - extension-private caches and no-workspace runtime resources under VS Code
    `globalStorageUri`;
  - durable user media/assets under workspace paths or media-library roots, then
    recorded through project facts.
- Add a canonical classification table for existing and planned directories,
  including `.neko/.cache`, `.neko/logs`, `.neko/state`, `.neko/drafts`,
  `.neko/plans`, `.neko/tasks`, `.neko/memory.md`, `.neko/skills`,
  `.neko/commands`, `.neko/prompts`, `.neko/hooks`, `.neko/processors`,
  `.neko/recordings`, `.neko/temp`, `.neko/imports`, `.neko/dashboard-activity.json`,
  `~/.neko/config.toml`, `~/.neko/skills`, `~/.neko/processors`, Market install
  records, and extension-private resource caches.
- Define promotion and migration behavior:
  - personal project-independent content moves or is created under `~/.neko`;
  - team-shared project facts move to `neko/` or an owning domain project file;
  - user-retained media such as recordings must be promoted to an asset/media
    library instead of being treated as hidden workspace runtime data;
  - cache and temp data can be rebuilt or cleared with diagnostics;
  - deprecated hook catalogs are rejected or migrated to settings-based hooks.
- Add shared storage layout and classification contracts so packages choose a
  scope by intent rather than hard-coding `.neko/<name>` paths.
- Add `.gitignore` and managed-directory guardrails so workspace `.neko/` runtime
  and cache directories are not accidentally tracked, while `neko/` project facts
  remain trackable.
- Add diagnostics and cleanup actions for oversized, deprecated, or misplaced
  workspace-local directories.
- **BREAKING** for prelaunch internal paths: new code must not create personal
  Skills, personal commands, personal processors, extension-private Market state,
  no-workspace resources, or durable retained media directly under workspace
  `.neko/` by default. Legacy workspace-local locations may be read only by
  explicit migration, rejection, or diagnostic paths.

Non-goals:

- Do not create a remote, multi-tenant, or distributed storage abstraction.
- Do not move confirmed project facts into user-level storage.
- Do not make `~/.neko` a replacement cache bucket for workspace `.neko/.cache`.
- Do not silently delete valuable local recordings, imported assets, trust state,
  Market install records, user configuration, or confirmed project facts.
- Do not redesign Agent IDC, ContentAccess, ResourceCache, Market trust, or asset
  library semantics beyond the storage-scope decisions needed here.

## Capabilities

### New Capabilities

- `neko-storage-scope-governance`: Defines canonical storage scopes, directory
  ownership, migration/promotion behavior, fail-visible diagnostics, and
  validation for project facts, project-local state, user-level data,
  extension-private state, caches, generated resources, recordings, skills,
  commands, processors, hooks, logs, temp files, imports, and Dashboard activity.

### Modified Capabilities

- None. Existing active specs cover Agent content access, project-file IO, TOML
  config, and external processors, but there is no accepted storage-scope
  capability that governs the cross-package directory placement rules.

## Impact

- Shared contracts and layout:
  - `packages/neko-types/src/types/storage.ts`
  - `packages/neko-types/src/config/*`
  - shared path/layout helpers under `@neko/shared`
- Agent:
  - project/user Skill, command, prompt, AGENTS, memory, artifact, log, and IDC
    state paths
  - settings hook loading and removal of deprecated `.neko/hooks` catalog use
  - external processor project vs personal discovery
- Assets, Preview, ContentAccess, and ResourceCache:
  - `neko/settings.json`, `.neko/settings.local.json`, project resource cache,
    imports, media metadata, thumbnails, generated resources, and promotion flows
- Live and Audio:
  - workspace `.neko/recordings` preview output vs retained recording asset
    promotion to a media library or user-selected asset root
- Dashboard:
  - `.neko/dashboard-activity.json` workspace-local activity projection and any
    cleanup/placement diagnostics
- Market:
  - user-level vs extension-private Market cache/install records and CLI/VS Code
    parity decisions
- Workspace hygiene:
  - `.gitignore`, Agent managed directory rules, cleanup commands, diagnostics,
    docs, and validation scripts
- Documentation:
  - architecture storage/cache/path docs and Chinese documentation where storage
    behavior is user-facing
