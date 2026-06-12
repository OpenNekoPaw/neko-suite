## 1. Contract And Migration

- [x] 1.1 Add `EntityAssetBinding.availability` and `orphanedAt` to shared contracts with validation guards and exhaustive enum handling.
- [x] 1.2 Add `CreativeEntityCandidate.identityBasis` to shared contracts with validation guards.
- [x] 1.3 Apply backward-compatible defaults when reading old bindings and candidates.
- [x] 1.4 Update persistence serializers to write explicit `availability` and `identityBasis` for new or modified records.

## 2. Entity Runtime Lifecycle

- [x] 2.1 Add service methods to mark bindings orphaned, restore orphaned bindings, archive bindings, and emit affected refs.
- [x] 2.2 Implement project-local `FileSystemWatcher` wiring for resolved `project://` bound assets.
- [x] 2.3 Resolve watcher events through `AssetRefResolver` and project path resolution rather than raw absolute path authority.
- [x] 2.4 Batch or coalesce orphan/restore change events for bulk file operations.
- [x] 2.5 Add placeholder integration points for future Asset Federation availability refresh events.

## 3. Candidate Matching Rules

- [x] 3.1 Update `resolveByName`, open-candidate matching, and Agent contribution matching to exclude `identityBasis !== 'user-named'`.
- [x] 3.2 Update Entity Facade matching commands and Dashboard search-as-match flows to apply the same exclusion.
- [x] 3.3 Add explicit naming flow for anonymous candidates that checks duplicates before switching to `user-named`.
- [x] 3.4 Preserve id, provenance, visual occurrence, and asset reverse lookup resolution for non-user-named candidates.

## 4. UI Projections

- [x] 4.1 Update Dashboard entity detail and filters to display `availability` separately from binding `status`.
- [x] 4.2 Add Dashboard orphaned binding management actions for rebind, locate/open source where available, archive, and cleanup suggested orphaned bindings.
- [x] 4.3 Update Canvas shot character rows to show placeholders or broken-reference markers for orphaned default representations.
- [x] 4.4 Update Hover Card, Quick Panel, and Inspector projections to preserve textual entity context while marking orphaned thumbnails unavailable.
  - Note: no concrete Canvas Entity Quick Panel component exists yet; the shared binding availability projection now backs Inspector and Entity Facade QuickPick, and is ready for the future Quick Panel to consume.
- [x] 4.5 Add UI labels for `identityBasis !== 'user-named'` candidates as unnamed or pending-name states.

## 5. Tests And Validation

- [x] 5.1 Add migration/default tests for old bindings and candidates.
- [x] 5.2 Add entity runtime tests for orphan marking, restoration, status preservation, and event metadata.
- [x] 5.3 Add matching tests proving non-user-named candidates are excluded from all name-based paths.
- [x] 5.4 Add projection tests for Dashboard, Canvas, Hover Card, Quick Panel, and Inspector orphaned states.
- [x] 5.5 Run focused package tests plus `pnpm check` for affected TypeScript packages.
  - Note: focused package tests and compiles passed; `pnpm check` was executed and remains blocked by existing repo-wide Knip findings unrelated to this change.
