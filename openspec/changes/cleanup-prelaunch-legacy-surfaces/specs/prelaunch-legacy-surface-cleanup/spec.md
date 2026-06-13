## ADDED Requirements

### Requirement: Prelaunch cleanup defaults old compatibility to removal
The system SHALL treat old unpublished formats, old message fields, deprecated re-export modules, migration shims, and prelaunch compatibility readers as removal candidates by default. A legacy or deprecated surface MUST remain only when it is required by current functionality and has an owner, canonical replacement, remove condition, and protecting tests.

#### Scenario: Old-format reader has no current consumer
- **WHEN** a legacy reader, old schema fallback, or deprecated field accessor is only used by stale tests or unpublished fixtures
- **THEN** the cleanup plan classifies it as `delete-now` or `migrate-now` rather than canonical compatibility

#### Scenario: Current bridge is still required
- **WHEN** a bridge such as a provider adapter is still used by current runtime execution
- **THEN** the cleanup plan classifies it as `current-bridge` and records owner, replacement, removal trigger, and tests before preserving it

### Requirement: Legacy fallback hits are semantically classified
The system SHALL classify `legacy`, `fallback`, and `deprecated` hits by behavior rather than by raw search count. The allowed semantic classes are `delete-now`, `migrate-now`, `current-bridge`, `runtime-resilience`, `boundary-canonicalizer`, `test-only`, `domain-status`, and `false-positive-word`.

#### Scenario: Raw search count is reported
- **WHEN** a cleanup scan reports the number of `legacy`, `fallback`, or `deprecated` matches
- **THEN** it also reports the scan scope and at least one semantic breakdown so the count is not treated as a deletion list

#### Scenario: Deprecated status is a domain value
- **WHEN** a match represents a current business state such as marketplace or entity status
- **THEN** it is classified as `domain-status` and is not removed by dead-code cleanup

### Requirement: Runtime code accepts canonical models
The system SHALL keep runtime and domain code on canonical models after input validation or boundary canonicalization. Runtime code MUST NOT add scattered compatibility branches for old unpublished fields or old unpublished formats.

#### Scenario: Multiple current input shapes are accepted
- **WHEN** current feature inputs can arrive from multiple host sources
- **THEN** a boundary canonicalizer converts them once into the canonical model before runtime/domain processing

#### Scenario: Old unpublished field is encountered
- **WHEN** a field exists only to support an old unpublished format
- **THEN** callers are migrated to the canonical field and the old field reader is removed instead of adding runtime fallback

### Requirement: Runtime resilience remains distinct from old compatibility
The system SHALL preserve fallback paths that handle real runtime failure modes such as provider unavailability, network errors, GPU/media/model capability absence, cancellation, and file availability. Such fallback paths MUST have tests or documented smoke validation that cover the failure mode.

#### Scenario: Provider bridge fallback is current functionality
- **WHEN** a media provider still routes through a bridge because no native or configured provider path is proven
- **THEN** the bridge remains with sunset metadata and resolver/task tests

#### Scenario: Old schema fallback is not runtime resilience
- **WHEN** a fallback exists only to read an old unpublished schema shape
- **THEN** it is migrated or deleted rather than classified as runtime resilience

### Requirement: Cleanup register is executable
The system SHALL keep machine-readable cleanup metadata for remaining compatibility, bridge, and fallback surfaces that are not deleted. Each active entry MUST include package, surface, semantic class, owner, replacement, remove condition, and validation tests.

#### Scenario: Active legacy surface lacks metadata
- **WHEN** a new active legacy/deprecated compatibility surface is introduced or preserved
- **THEN** cleanup validation fails unless the surface has complete metadata or is explicitly classified as runtime resilience/domain status

#### Scenario: Removed surface is retained as a guard
- **WHEN** a deleted shim or misplaced-domain-logic surface is historically important
- **THEN** the register MAY keep a removed entry so validation can prevent reintroducing it

### Requirement: Validation proves deletion safety
The system SHALL pair deletion or migration of legacy/deprecated/fallback surfaces with targeted validation. The validation MUST include import scans for deleted files, package tests/builds for touched packages, and boundary guards when Webview/Extension/Runtime ownership is involved.

#### Scenario: Re-export shim is deleted
- **WHEN** an unused re-export shim file is removed
- **THEN** the implementation records an import scan proving no internal callers remain and runs the relevant package tests or build

#### Scenario: Deprecated API is removed
- **WHEN** a deprecated API surface is deleted
- **THEN** all repo callers are migrated to the canonical API and TypeScript tests/builds prove no stale import path remains
