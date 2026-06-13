## ADDED Requirements

### Requirement: Repo-wide debt scan is reproducible
The system SHALL provide a repeatable cleanup scan for `legacy`, `fallback`, `deprecated`, dead files, unused exports, and dependency drift. The scan MUST report scope, exclusions, occurrence counts, file hotspots, package hotspots, and semantic classes.

#### Scenario: Scan reports raw counts with scope
- **WHEN** the cleanup scan is run
- **THEN** it reports all-source and non-test-source counts for `legacy`, `fallback`, and `deprecated` with the exact glob exclusions used

#### Scenario: Scan reports package hotspots
- **WHEN** the cleanup scan finds matches
- **THEN** it groups hotspots by package and file so cleanup batches can be assigned to package owners

### Requirement: Remaining surfaces enter an executable cleanup ledger
The system SHALL track remaining non-Agent legacy, fallback, deprecated, and dead-code surfaces in a machine-readable ledger. Each active entry MUST include package, surface, semantic class, action, owner, canonical replacement, remove condition, and validation commands.

#### Scenario: Preserved surface lacks required metadata
- **WHEN** a legacy/deprecated/fallback surface is preserved after review
- **THEN** cleanup validation fails unless the ledger records why it remains and how it will be removed or protected

#### Scenario: Deleted surface remains guarded
- **WHEN** a compatibility surface is deleted
- **THEN** the ledger MAY keep a removed entry with a stale-surface scan that prevents reintroduction

### Requirement: Static-analysis dead code is resolved first
The system SHALL resolve confirmed static-analysis findings before deeper schema migrations. Confirmed unused files and exports MUST be deleted or converted into documented entrypoints; dependency drift MUST be fixed in the owning package manifest.

#### Scenario: Unused file has no entrypoint or import
- **WHEN** `pnpm check:unused` reports an unused file and manual review finds no manifest, command, script, or dynamic entrypoint reference
- **THEN** the file is deleted and the owning package tests or build are run

#### Scenario: Static-analysis report is a false positive
- **WHEN** an unused-file or dependency report is a false positive
- **THEN** the relevant entrypoint, dependency, or ignore is modeled narrowly rather than suppressing an entire package or directory

### Requirement: Old unpublished readers are migrated or removed
The system SHALL remove old unpublished format readers once canonical fixtures and producers exist. Runtime and domain code MUST NOT preserve old schema fields through scattered compatibility branches.

#### Scenario: Shared schema reader supports only old unpublished data
- **WHEN** a `neko-types` reader or normalizer only accepts an old prelaunch shape such as legacy storyboard sections, legacy asset manifest type, storage deprecated aliases, or legacy Canvas field mirrors
- **THEN** canonical fixtures are migrated and the old reader is removed

#### Scenario: Canvas old connection or container field remains
- **WHEN** Canvas code still reads legacy anchors, cells path, group `childIds`, or `LegacyNodeRenderer` as a compatibility path
- **THEN** the data is migrated to canonical port, child placement, composable content, or container metadata before the compatibility path is deleted

#### Scenario: Asset or Market legacy manifest migration remains
- **WHEN** Asset or Market code still migrates legacy package or asset type fields
- **THEN** manifests and tests are converted to canonical package and asset types before the legacy migration code is deleted

### Requirement: Runtime resilience remains separate from compatibility
The system SHALL preserve fallback behavior only when it handles current runtime failure or capability absence. Presentation defaults and empty-state labels MUST NOT be classified as runtime resilience.

#### Scenario: Fallback handles current runtime failure
- **WHEN** fallback behavior handles provider absence, model absence, GPU/media/network/file failure, timeout, cancellation, or unavailable optional capability
- **THEN** it is classified as runtime resilience and is protected by tests or documented smoke validation

#### Scenario: Fallback is only a display default
- **WHEN** a helper named `fallback` only provides UI copy, placeholder text, default dimensions, or empty-state rendering
- **THEN** it is renamed or classified as presentation default so it is not mistaken for old-format compatibility

### Requirement: Generated and proto surfaces are source-owned
The system SHALL NOT manually edit generated legacy or deprecated fields. Generated cleanup MUST update the source IDL/schema and verify generated output diffs.

#### Scenario: Generated file contains legacy fields
- **WHEN** a generated `*.engine.ts` or proto-derived file contains `legacy` or `deprecated` fields
- **THEN** the cleanup task identifies the source schema/IDL and runs generation validation before the generated output changes are accepted

### Requirement: Validation proves each cleanup batch
The system SHALL pair every deletion or migration batch with focused validation. Validation MUST include stale-surface `rg` scans, package tests or builds, and `pnpm check:unused` for static-analysis batches.

#### Scenario: Deprecated alias is removed
- **WHEN** a deprecated alias or re-export is removed
- **THEN** all repo callers are migrated and a stale import scan proves the old alias no longer appears in production source

#### Scenario: Package batch completes
- **WHEN** a package-specific cleanup batch completes
- **THEN** the touched package tests/builds pass or the remaining failures are documented as pre-existing unrelated baseline

### Requirement: Cleanup progress updates architecture records
The system SHALL update `adr-code-debt-cleanup-strategy.md` after each major batch with the current scan baseline, resolved surfaces, preserved exceptions, and remaining risks.

#### Scenario: Scan baseline changes
- **WHEN** a cleanup batch changes raw counts or static-analysis findings
- **THEN** the ADR records the new numbers, scan command, and interpretation of remaining surfaces
