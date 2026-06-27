## 1. Shared Storage Contracts

- [ ] 1.1 Add `NekoStorageScope`, `NekoStorageClass`, owner, tracking policy, cleanup policy, migration policy, and diagnostic code contracts in `@neko/shared`.
- [ ] 1.2 Add the canonical storage classification table for `neko/`, workspace `.neko/`, workspace `.neko/.cache/`, `~/.neko/`, `globalStorageUri`, media-library roots, and scratch roots.
- [ ] 1.3 Update shared storage layout helpers so user-global, project-fact, project-local, project-cache, and extension-private roots are resolved through one contract-first API.
- [ ] 1.4 Add unit tests for known directory classification, unknown managed directory diagnostics, tracking policy, cleanup policy, and migration policy.

## 2. Host Inspection And Workspace Hygiene

- [ ] 2.1 Implement a Host-side storage inspection service that scans workspace `.neko/` and reports classified entries, misplaced data, deprecated directories, large caches, recordings, temp files, and suggested actions.
- [ ] 2.2 Add workspace hygiene support that ensures or diagnoses `.neko/` ignore rules while preserving `neko/` as trackable project facts.
- [ ] 2.3 Update Agent workspace ignore/managed-directory rules to align with the storage classification table.
- [ ] 2.4 Add tests for `.gitignore` behavior, managed directory hiding, and diagnostics when `neko/` is accidentally ignored or `.neko/` is unignored.

## 3. Agent User, Project, And Runtime Paths

- [ ] 3.1 Route personal Skills, commands, prompts, and AGENTS instructions to `~/.neko` by default while keeping workspace `.neko/skills`, `.neko/commands`, and `.neko/prompts` as explicit project-local targets.
- [ ] 3.2 Add diagnostics for project-independent personal content found under workspace `.neko` and suggested migration targets under `~/.neko`.
- [ ] 3.3 Keep Agent IDC artifacts, logs, and runtime snapshots under workspace `.neko/drafts`, `.neko/plans`, `.neko/tasks`, `.neko/logs`, and `.neko/state` through the shared classifier.
- [ ] 3.4 Reject or diagnose deprecated `.neko/hooks` catalogs and ensure settings-based hooks remain the only default hook loading path.
- [ ] 3.5 Add focused Agent tests for personal/project content roots, IDC artifact roots, hook diagnostics, workspace ignore visibility, and legacy path poisoning.

## 4. Processor And Market Scope Boundaries

- [ ] 4.1 Update processor registry paths so personal processors use user-global scope and project processors use explicit project-local source scope.
- [ ] 4.2 Add diagnostics for processors placed in the wrong scope and tests for project vs personal processor discovery.
- [ ] 4.3 Normalize Market CLI user-level cache/install roots and VS Code extension-private Market roots without mixing user-authored config and extension-owned cache.
- [ ] 4.4 Add Market tests for user-global vs extension-private install/cache placement and uninstall safety.

## 5. Resource Cache, Imports, Temp, And Promotion

- [ ] 5.1 Ensure ResourceCache roots, generated resources, thumbnails, media metadata, search indexes, and document page images are classified as project cache or extension-private cache by workspace availability.
- [ ] 5.2 Add cleanup behavior that removes only rebuildable cache/scratch data and skips pinned, session-active, promoted, non-rebuildable, debug-retained, and outside-root entries.
- [ ] 5.3 Classify `.neko/temp`, `.neko/tmp`, and `.neko/imports` as scratch, staging, or promotion-required data and add diagnostics for unclassified long-lived imports.
- [ ] 5.4 Add tests proving cache deletion does not corrupt `neko/` facts, project files, entity facts, asset library facts, or media-library settings.

## 6. Recordings And Durable Media

- [ ] 6.1 Update Live and Audio recording outputs to classify preview recordings separately from retained recordings.
- [ ] 6.2 Add explicit save/promote flows for retained recordings so durable media lands in a workspace/media-library/user-selected root and records stable provenance through project facts.
- [ ] 6.3 Add cleanup diagnostics for `.neko/recordings` that skip deletion unless a stale preview policy or user confirmation applies.
- [ ] 6.4 Add focused Live/Audio tests for preview recording paths, retained recording promotion, and hidden `.neko/recordings` not being treated as durable success output.

## 7. Project Facts And Documentation

- [ ] 7.1 Audit project fact writes and update any misplaced shared facts to `neko/` or an owning domain project file.
- [ ] 7.2 Add diagnostics for project facts discovered under workspace `.neko` with suggested `neko/` targets.
- [ ] 7.3 Update architecture/cache/path/storage documentation and Chinese docs to explain user-global vs workspace-local vs project-fact vs extension-private storage.
- [ ] 7.4 Update user-facing help or command text for personal/project Skills, processors, recordings, and cleanup actions.

## 8. Validation And Quality Gates

- [ ] 8.1 Run focused shared tests for storage classification and layout resolution.
- [ ] 8.2 Run focused Agent, Market, Assets/ResourceCache, Dashboard, Live/Audio, and processor registry tests touched by the implementation.
- [ ] 8.3 Run `pnpm check` and `pnpm check:agent-boundaries` or document why a narrower command is sufficient.
- [ ] 8.4 Run `pnpm check:legacy-debt` and `pnpm check:unused` after legacy path cleanup, or document equivalent coverage.
- [ ] 8.5 Run VS Code runtime smoke or focused Extension Host validation for cleanup/migration UI or command paths if implementation exposes user-triggered actions.
- [ ] 8.6 Record residual risks for unresolved open questions, intentionally retained compatibility diagnostics, and any cleanup/migration path not enabled by default.
