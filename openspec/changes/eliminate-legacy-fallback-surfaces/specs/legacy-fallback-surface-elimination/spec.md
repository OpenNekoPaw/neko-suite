## ADDED Requirements

### Requirement: Debt scanner classes are actionable
The repository SHALL classify every production `legacy`, `fallback`, and `deprecated` match into an actionable semantic class and SHALL fail quality checks for unresolved debt classes.

#### Scenario: Production unresolved debt remains
- **WHEN** `pnpm check:legacy-debt` scans production TypeScript and TSX sources
- **THEN** production matches classified as `delete-now`, `migrate-now`, or `needs-review` MUST fail the check

#### Scenario: Production retained bridge remains
- **WHEN** a production match is classified as `current-bridge`
- **THEN** a ledger entry MUST identify owner, replacement or reason, removal condition, and validation commands

#### Scenario: Production resilience remains
- **WHEN** a production match is classified as `runtime-resilience`, `boundary-canonicalizer`, `presentation-default`, or `domain-status`
- **THEN** the scanner or ledger MUST document why it is not a compatibility path that can mask development errors

### Requirement: Removable compatibility paths are deleted or migrated
The repository SHALL remove or migrate all production legacy/fallback/deprecated surfaces that have a canonical implementation and do not protect a real local-client boundary.

#### Scenario: Canonical contract exists
- **WHEN** a production caller can use a canonical typed API, provider, DTO, schema, capability provider, or shared helper
- **THEN** the old compatibility path MUST be removed or changed to a fail-closed diagnostic instead of returning successful legacy output

#### Scenario: Old input shape appears after migration
- **WHEN** a migrated production boundary receives a removed legacy shape
- **THEN** it MUST reject with a typed diagnostic or explicit migration error instead of silently dual-reading the old shape

### Requirement: Agent centralized compatibility tools move to owning providers
Agent bootstrap SHALL NOT centrally register domain tools that belong to document, media, or search owners.

#### Scenario: Document read tools are registered
- **WHEN** Agent capability discovery includes document read or document-image read tools
- **THEN** those tools MUST be provided by the document-owning platform capability provider rather than a centralized Agent compatibility bridge

#### Scenario: Image read tools are registered
- **WHEN** Agent capability discovery includes image read tools
- **THEN** those tools MUST be provided by the media/image-owning capability provider rather than a centralized Agent compatibility bridge

#### Scenario: Semantic coverage tools are registered
- **WHEN** Agent capability discovery includes semantic coverage query tools
- **THEN** those tools MUST be provided by the search-owning capability provider rather than a centralized Agent compatibility bridge

### Requirement: AI SDK legacy media bridge has a sunset path
AI SDK media generation SHALL NOT use `createLegacyBridgeProvider()` as an unbounded default success path.

#### Scenario: Provider has native or generic AI SDK support
- **WHEN** a provider type has native or generic AI SDK support
- **THEN** `resolveProvider()` MUST return a native/generic provider and tests MUST prove the legacy bridge is not invoked

#### Scenario: Provider has no native support
- **WHEN** a provider type has no native/generic implementation and no explicitly allowed migration bridge
- **THEN** media task execution MUST return a fail-closed diagnostic instead of silently falling through to a legacy bridge success path

#### Scenario: Migration bridge is temporarily retained
- **WHEN** a provider still requires the legacy bridge during migration
- **THEN** the provider MUST have an active ledger row with task families, migration conditions, removal trigger, and poison-bridge tests for new native paths

### Requirement: Asset entity command fallback is retired
Asset entity lookup across Canvas, Story, Tools, and related extension packages SHALL use a typed API or owning facade instead of the old `neko.assets.getAllEntities` command fallback.

#### Scenario: Typed Assets API is available
- **WHEN** a caller needs asset entities
- **THEN** it MUST call `NekoAssetsAPI.getAllEntities()` or an owning shared facade that delegates to the typed API

#### Scenario: Typed Assets API is unavailable
- **WHEN** a caller cannot obtain the typed Assets API
- **THEN** it MUST fail visibly with an unavailable diagnostic/error instead of calling `neko.assets.getAllEntities`

#### Scenario: All callers are migrated
- **WHEN** repository search shows no production caller needs the old command
- **THEN** `neko.assets.getAllEntities` command registration MUST be deleted

### Requirement: Benign fallback vocabulary is renamed or whitelisted
Production code SHALL avoid using `fallback` vocabulary for defaults, hints, placeholders, or display names unless it is a framework term or ledger-classified exception.

#### Scenario: Default message or value uses fallback naming
- **WHEN** a production identifier named `fallbackMessage`, `fallbackName`, `fileNameFallback`, or similar represents a default or hint
- **THEN** it MUST be renamed to `default*`, `*Hint`, `emptyState*`, or another non-debt term

#### Scenario: React fallback slot remains
- **WHEN** React `Suspense` or ErrorBoundary uses a `fallback` prop
- **THEN** it MAY keep the React term but MUST be classified as presentation/default UI rather than compatibility debt

### Requirement: Validation proves paths, not only outcomes
Legacy/fallback cleanup tests SHALL assert canonical path usage and retained bridge isolation.

#### Scenario: New canonical path succeeds
- **WHEN** a test verifies migrated behavior
- **THEN** it MUST assert the canonical handler/provider/facade was invoked or the legacy path was poisoned and not hit

#### Scenario: Retained bridge is tested
- **WHEN** a test intentionally exercises a retained migration bridge
- **THEN** it MUST be labeled as migration, diagnostic, or rejection coverage and MUST NOT serve as the default new-path acceptance test
