## ADDED Requirements

### Requirement: Install runtime follows the 8-stage lifecycle

The market install runtime SHALL execute installs through discover, resolve, preflight, fetch, verify, stage, activate, and record phases. Failures after any side effect MUST enter rollback and MUST report progress using the lifecycle phase names.

#### Scenario: Successful archive install emits ordered phases

- **WHEN** an archive package is installed successfully
- **THEN** progress includes discover, resolve, preflight, fetch, verify, stage, activate, record, and done in order
- **THEN** the installed registry is written only after activation succeeds

#### Scenario: Failure triggers rollback

- **WHEN** staging succeeds but activation fails
- **THEN** the runtime enters rollback
- **THEN** it calls target rollback and effects inversion for completed side effects
- **THEN** it does not leave a completed installed record

### Requirement: Discover uses server final package detail

The install runtime SHALL obtain package detail from `IMarketClient.getPackage` during discover. It MUST install from the returned server-final manifest and MUST fail if the package is missing or malformed.

#### Scenario: Package cannot be discovered

- **WHEN** `getPackage` returns absent for a package id
- **THEN** install fails during discover
- **THEN** fetch, stage, activate, and record are not executed

#### Scenario: Manifest is malformed

- **WHEN** package detail contains a manifest missing required v4 fields
- **THEN** install fails before resolving dependencies
- **THEN** the failure includes enough diagnostics to identify the missing contract field

### Requirement: Resolve builds dependency and bundle graph

The install runtime SHALL resolve direct dependencies and bundle contents before preflight. It MUST detect local cycles, respect optional entries, and prepare an installation graph for orchestration packages.

#### Scenario: Bundle contents are recursively resolved

- **WHEN** installing a bundle with multiple contents
- **THEN** the runtime resolves each content package and version range before download
- **THEN** bundle orchestration does not stage a payload for the bundle itself

#### Scenario: Dependency cycle is detected

- **WHEN** dependencies or bundle contents form a cycle visible to the client
- **THEN** install fails during resolve
- **THEN** no package in the cycle is downloaded or recorded

### Requirement: Preflight enforces trust, quota, conflict, compatibility, and entitlement

The install runtime SHALL run preflight checks before downloading. Preflight MUST include compatibility, server-computed entitlement, trust level, declared conflicts, resource/quota checks, and installed status checks.

#### Scenario: Paid package is not owned

- **WHEN** the server entitlement check returns `allowed = false`
- **THEN** install fails during preflight
- **THEN** the runtime does not request a download URL

#### Scenario: Declared conflict is installed

- **WHEN** a manifest declares a conflict with a currently installed package
- **THEN** preflight blocks installation or returns an explicit conflict resolution requirement
- **THEN** fetch is not executed until the conflict is resolved

#### Scenario: Incompatible package update is blocked

- **WHEN** an installed package update target is incompatible with the current Neko Suite or engine version
- **THEN** preflight fails before uninstalling the existing version
- **THEN** the previous installed version remains usable

### Requirement: DistributionKind selects fetch and stage behavior

The install runtime SHALL dispatch fetch, verify, and stage behavior by `distributionKind`. Archive packages MUST download and verify payloads, orchestration packages MUST skip payload download, and registration packages MUST write registration state without an archive.

#### Scenario: Archive distribution downloads and extracts

- **WHEN** installing a package with `distributionKind = 'archive'`
- **THEN** the runtime obtains a download descriptor
- **THEN** it verifies integrity
- **THEN** it stages the payload into the target install path

#### Scenario: Orchestration distribution installs contents

- **WHEN** installing a package with `distributionKind = 'orchestration'`
- **THEN** fetch and archive verification are skipped for the orchestrating package
- **THEN** contents are installed or referenced according to bundle policy

#### Scenario: Registration distribution writes registration

- **WHEN** installing a package with `distributionKind = 'registration'`
- **THEN** the runtime does not require a package archive
- **THEN** stage writes the declared registration entry through the selected target

### Requirement: Integrity and signature checks are explicit

The install runtime SHALL verify archive integrity with SRI before staging and SHALL apply the configured manifest signature verification phase. P0 verification MUST require signature metadata presence for registry packages.

#### Scenario: SRI verification fails

- **WHEN** a downloaded archive does not match the expected integrity
- **THEN** install fails during verify
- **THEN** stage and activate are not executed

#### Scenario: Signature metadata is missing

- **WHEN** a public registry manifest lacks `distribution.signature`
- **THEN** P0 signature verification fails
- **THEN** the package is not installed

### Requirement: Effects are activated and inverted consistently

The install runtime SHALL activate declared `EffectsManifest` registrations after staging and SHALL invert those effects before removing files during uninstall or rollback. Unknown effect fields MUST be ignored, but known effects MUST be processed deterministically.

#### Scenario: Runtime registrations are activated

- **WHEN** a manifest declares provider, tool, runtime, shader effect, or command registrations
- **THEN** activation dispatches those known registrations to the appropriate registry or target adapter
- **THEN** the installed record is written only after known required registrations succeed

#### Scenario: Uninstall reverses effects before deleting files

- **WHEN** uninstalling an installed package with declared effects
- **THEN** the runtime unregisters known effects before deleting the install path
- **THEN** the installed registry entry is removed after cleanup

### Requirement: InstallTarget hooks are part of lifecycle

The install runtime SHALL support `validateManifest`, `onPreInstall`, `onPostInstall`, `onPreUninstall`, and `onRollback` hooks. Hooks MUST run at documented lifecycle points and hook failures MUST produce typed install errors.

#### Scenario: Target validates manifest before staging

- **WHEN** an install target provides `validateManifest`
- **THEN** the runtime invokes it before staging
- **THEN** validation failure blocks installation without writing installed registry state

#### Scenario: Target rollback receives partial state

- **WHEN** a target provides `onRollback`
- **THEN** rollback passes the manifest and partial install state
- **THEN** the target can clean type-specific side effects created before failure

### Requirement: Bundle reference counts protect shared contents

The install runtime SHALL maintain persistent reference counts for bundle-installed contents. Uninstalling a bundle MUST decrement content references and MUST NOT remove content still referenced by another bundle or direct installation.

#### Scenario: Shared content remains installed

- **WHEN** two bundles reference the same content package
- **THEN** uninstalling one bundle decrements the reference count
- **THEN** the shared content remains installed while another reference exists

#### Scenario: Last bundle reference removes content

- **WHEN** a content package is installed only through a bundle
- **THEN** uninstalling the final referencing bundle can uninstall that content
- **THEN** the reference table is updated transactionally

### Requirement: Large asset mini lifecycle updates installed state

The install runtime SHALL support large asset subflows for sparse item downloads, proxy upgrades, variant downloads, and delta updates. Subflows MUST reuse preflight, fetch, verify, stage, activate, and record-update behavior while skipping package discover and dependency resolve.

#### Scenario: Sparse subitem install updates existing record

- **WHEN** the user downloads an additional sparse item for an already installed package
- **THEN** the runtime skips package discover and dependency resolve
- **THEN** it updates the existing installed record with the selected item state

#### Scenario: Proxy upgrade rollback keeps proxy

- **WHEN** a proxy-to-full upgrade fails
- **THEN** rollback removes the failed full payload
- **THEN** the existing proxy state remains installed and usable

#### Scenario: Variant install records selected variant

- **WHEN** a user installs a model variant
- **THEN** the installed record stores the selected variant id and size metadata
- **THEN** future update checks use that variant state when choosing delta or full updates

### Requirement: Installed status reflects expiration and compatibility

The install runtime SHALL maintain installed package status values for `active`, `expiring-soon`, `expired`, `incompatible`, and `deprecated`. Expired and incompatible packages MUST be blocked from activation, while deprecated packages remain usable with warnings.

#### Scenario: Expired entitlement disables package

- **WHEN** entitlement data shows `expiresAt` is in the past
- **THEN** the installed package status becomes `expired`
- **THEN** activation for consuming extensions is blocked

#### Scenario: Deprecated package remains usable

- **WHEN** a manifest includes deprecation metadata
- **THEN** installed package status becomes `deprecated`
- **THEN** consuming extensions may still load the package

### Requirement: Cache management is separate from installed packages

The install runtime SHALL separate download/cache eviction from installed package removal. Cache cleanup MUST NOT remove installed payloads, and package uninstall MUST be able to evict cache entries independently.

#### Scenario: Cache prune does not uninstall package

- **WHEN** market-cache exceeds its configured budget
- **THEN** LRU pruning removes cache entries
- **THEN** installed package records and install paths remain intact

#### Scenario: Uninstall can evict package cache

- **WHEN** uninstalling a package
- **THEN** the runtime may evict cached downloads for that package
- **THEN** entitlement records remain server-owned and are not deleted by cache eviction
