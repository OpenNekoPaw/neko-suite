## ADDED Requirements

### Requirement: Code debt cleanup uses auditable categories
The system SHALL classify dead-code, legacy-code, fallback-code, and misplaced-domain-logic findings into auditable categories before deletion or migration. The categories MUST distinguish confirmed dead code, static-analysis false positives, canonical compatibility, migration adapters, stray legacy surfaces, misplaced domain logic, and runtime fallback/resilience.

#### Scenario: Static finding is not deleted without category
- **WHEN** `knip` or a text scan reports an unused, deprecated, legacy, or fallback finding
- **THEN** the cleanup record assigns one of the approved categories before any production file is deleted or migrated

#### Scenario: Misplaced domain logic is not treated as dead code
- **WHEN** a Webview or Extension file contains active domain logic that affects durable Agent, entity, search, or evidence behavior
- **THEN** the cleanup record classifies it as misplaced domain logic and tracks a target runtime or domain owner instead of marking it for deletion

### Requirement: LCD register entries contain lifecycle metadata
The system SHALL track legacy/deprecated/cleanup debt in LCD register entries with stable id, package, file or surface, kind, replacement path, owner, removal condition or sunset milestone, and protecting tests.

#### Scenario: New migration adapter has removal metadata
- **WHEN** a new compatibility shim, migration adapter, or legacy bridge is retained
- **THEN** its LCD entry names the replacement path, owner, remove-after condition, and tests that prove the legacy path is still required

#### Scenario: Entry without owner is rejected by review
- **WHEN** a cleanup proposal keeps a legacy surface without owner or removal condition
- **THEN** code review or validation reports the LCD entry as incomplete

### Requirement: Static-analysis baselines preserve verified runtime entries
The system SHALL keep static-analysis configuration aligned with verified runtime entries, dynamic imports, package public exports, VSCode contributions, and Vite multi-entry Webviews. False-positive suppressions MUST be precise and documented with the reason and owner.

#### Scenario: Dynamic parser dependency is preserved
- **WHEN** a dependency is loaded through runtime `import()` by document reader or document access services
- **THEN** the cleanup baseline records it as a dynamic-import false positive rather than deleting the dependency

#### Scenario: Vite multi-entry Webview is preserved
- **WHEN** a Webview runtime file is used as an HTML/Vite entry but is not reachable from the default package import graph
- **THEN** the static-analysis configuration lists that entry or a precise ignore instead of treating the file as dead code

### Requirement: Fallback findings are reviewed by behavior
The system SHALL review fallback code by runtime behavior before removal. Model fallback, provider degradation, media routing fallback, data migration fallback, preview fallback, and retry behavior MUST NOT be deleted solely because the identifier or comment contains `fallback`.

#### Scenario: Runtime fallback is retained
- **WHEN** a fallback path handles unavailable providers, stale caches, malformed legacy data, or optional preview/media support
- **THEN** cleanup treats it as resilience behavior unless tests and ADRs prove the fallback is obsolete

#### Scenario: Obsolete fallback has test-backed removal
- **WHEN** a fallback path is classified as obsolete
- **THEN** the removal includes tests or fixtures proving the canonical path now covers the legacy input or failure mode

### Requirement: AI SDK legacy bridge sunset is provider-scoped
The system SHALL sunset AI SDK legacy bridge wrappers per provider and task family. A provider-specific bridge MUST remain until resolver, adapter, task execution, and tests prove the provider no longer enters `createLegacyBridgeProvider()` for its supported image, video, or speech tasks.

#### Scenario: fal.ai bridge remains while resolver is legacy
- **WHEN** `resolveProvider('fal')` still routes fal.ai media tasks through a legacy adapter bridge
- **THEN** cleanup keeps the fal.ai bridge wrapper and LCD-009 records the native-provider migration conditions

#### Scenario: Provider bridge can be removed after native path proves parity
- **WHEN** a provider resolver no longer enters the legacy bridge and tests cover auth, async status, cancellation, failure normalization, provider options, and result normalization
- **THEN** the provider-specific legacy bridge path can be deleted or narrowed to unsupported task families

### Requirement: Cleanup validation is scoped to changed debt
The system SHALL run validation that matches the cleanup category and changed packages. Dependency cleanup MUST run unused/dependency checks, boundary migration MUST run Agent boundary checks, Webview cleanup MUST build or test the affected Webview, and runtime/domain migrations MUST include focused unit tests.

#### Scenario: ProjectSearch shim deletion is validated
- **WHEN** Agent projectSearch compatibility shim files are deleted
- **THEN** validation includes import scans proving no shim path remains plus targeted Agent Extension/search tests

#### Scenario: Boundary migration is validated without full repository rewrite
- **WHEN** domain logic moves from Extension or Webview to runtime/domain packages
- **THEN** validation includes runtime contract tests and adapter tests for the affected files without requiring unrelated package cleanup
