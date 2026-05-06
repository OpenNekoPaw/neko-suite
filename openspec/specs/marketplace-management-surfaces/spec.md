# marketplace-management-surfaces Specification

## Purpose
TBD - created by archiving change align-neko-market-registry-contracts. Update Purpose after archive.
## Requirements
### Requirement: Marketplace webview has four top-level tabs

The marketplace webview SHALL expose Browse, Installed, Owned, and Updates as the top-level management surfaces. Category groupings MUST be filters within those surfaces, not replacement tabs.

#### Scenario: Browse tab displays discovery controls

- **WHEN** the marketplace opens
- **THEN** Browse is available as a top-level tab
- **THEN** Browse contains search, segmented sort, category chips, type filters, and kind filters where applicable

#### Scenario: Owned tab is separate from Installed tab

- **WHEN** a user owns a package that is not installed
- **THEN** it appears in Owned
- **THEN** it does not appear in Installed until installation is recorded

### Requirement: Browse filters follow category type kind hierarchy

Browse filtering SHALL follow the hierarchy AssetCategory → AssetType → metadata kind. Selecting a broader category MUST narrow available type filters, and selecting a type with supported subtypes MUST expose corresponding kind filters.

#### Scenario: Media category narrows types

- **WHEN** the user selects category `media`
- **THEN** Browse shows or queries `media`, `starter`, and `identity` as applicable types
- **THEN** selecting `media` exposes mediaKind filters

#### Scenario: Preset type exposes preset kind

- **WHEN** the user selects type `preset`
- **THEN** Browse exposes presetKind choices such as lut, transition, effect, export, color, memory, theme, keybinding, and convention when supported by ontology
- **THEN** the generated query remains compatible with the Registry API v1 filter format

### Requirement: Segmented sort maps to registry queries

The Browse segmented control SHALL map recommended and latest segments to P0 registry sorting. P1/P2 segments MUST be hidden or degraded when the server capability probe does not advertise support.

#### Scenario: Recommended segment uses featured sort

- **WHEN** the user selects recommended
- **THEN** Browse requests packages with `sort=featured`
- **THEN** the UI renders the returned packages without additional local ranking as the primary order

#### Scenario: Trending unavailable disables segment

- **WHEN** the server does not advertise trending support
- **THEN** the trending segment is hidden or disabled
- **THEN** the client does not issue a trending query

### Requirement: Installed tab manages local package state

Installed SHALL show recorded local packages grouped by derived category. Each row MUST support detail navigation and MUST expose enable, disable, uninstall, dependency information, and status badges when applicable.

#### Scenario: Disable preserves files

- **WHEN** the user disables an installed package
- **THEN** the installed files remain on disk
- **THEN** runtime registrations are deactivated or hidden from consumers
- **THEN** the package remains visible in Installed

#### Scenario: Uninstall removes local projection

- **WHEN** the user uninstalls a package
- **THEN** the install runtime removes files and installed record according to lifecycle rules
- **THEN** Installed no longer lists the package after the uninstall event

### Requirement: Owned tab reflects server entitlements

Owned SHALL be populated from server entitlement data. It MUST distinguish owned-installed, owned-not-installed, expiring, expired, and renewal states without embedding payment workflow logic.

#### Scenario: Owned package can be installed

- **WHEN** an entitlement exists for a package that is not installed
- **THEN** Owned displays an install action
- **THEN** invoking the action starts the install lifecycle with entitlement check

#### Scenario: Expired entitlement offers renewal link

- **WHEN** an entitlement is expired
- **THEN** Owned displays renewal status and a renew action
- **THEN** the renew action obtains a server checkout URL and opens it externally

### Requirement: Updates tab compares installed and registry versions

Updates SHALL list available updates by comparing InstalledRegistry records with registry version responses. It MUST preserve changelog and compatibility data and MUST NOT uninstall the current version until update preflight succeeds.

#### Scenario: Update is available

- **WHEN** the registry exposes a higher compatible version for an installed package
- **THEN** Updates lists package id, current version, target version, and changelog when present
- **THEN** the user can start an update from that row

#### Scenario: Target update is incompatible

- **WHEN** the latest version is incompatible with the current client or engine
- **THEN** Updates marks the update as blocked or suggests an upgrade path
- **THEN** invoking update does not uninstall the current version

### Requirement: Purchase flow uses external checkout only

Marketplace UI SHALL implement purchase, renewal, invoice, and support actions as external deep-links returned or owned by the registry server. The webview MUST NOT collect payment credentials, render payment provider forms, or implement refund/support workflows.

#### Scenario: Paid package not owned

- **WHEN** the detail page shows a paid package without entitlement
- **THEN** the primary action is buy or trial where provided by the server
- **THEN** clicking it opens an external checkout URL

#### Scenario: Payment does not complete immediately

- **WHEN** the user returns from checkout but entitlement has not arrived within the polling window
- **THEN** the UI shows a pending or refreshable state
- **THEN** it offers server-owned order lookup or support links rather than local dispute handling

### Requirement: AssetLibrary displays usable media and identity only

AssetLibrary SHALL show locally usable `media` and `identity` assets, regardless of whether they originated from import, AI generation, market, or stock cache. AssetLibrary MUST NOT show owned-not-installed marketplace packages.

#### Scenario: Market media install appears in library

- **WHEN** a market media package reaches a usable installed state
- **THEN** AssetLibrary can show it in the local tab with a market source badge
- **THEN** management actions deep-link to the market detail instead of duplicating Installed controls

#### Scenario: Owned not installed does not appear in library

- **WHEN** a user owns a media package but has not installed any usable bytes
- **THEN** AssetLibrary does not display the item
- **THEN** Owned remains the place to install it

### Requirement: Domain consume surfaces are single-source projections

Each AssetType SHALL have one primary browse or consume surface outside market where applicable, and those surfaces MUST subscribe to market events or domain registries rather than querying registry ownership directly.

#### Scenario: Skill appears in agent skill list after install

- **WHEN** a skill package is installed and activated
- **THEN** neko-agent can show it in the skill list
- **THEN** the skill list does not show paid owned-not-installed packages as ghost entries

#### Scenario: LUT appears in LUT panel after install

- **WHEN** a preset package with presetKind `lut` is installed
- **THEN** the consuming LUT panel can show it from its local projection
- **THEN** uninstall or disable events remove or hide the projection

### Requirement: Installed status badges follow market status rules

Marketplace and consumer surfaces SHALL render package statuses consistently: active has no blocking badge, expiring-soon warns, expired blocks use, incompatible blocks use, and deprecated warns without blocking.

#### Scenario: Expired media is hidden from AssetLibrary

- **WHEN** a media package status becomes expired
- **THEN** AssetLibrary no longer shows it as usable
- **THEN** timeline or project references can show an authorization-expired warning and renewal action

#### Scenario: Deprecated package shows migration hint

- **WHEN** a package status is deprecated with a replacement id
- **THEN** Installed and relevant consumer surfaces show a migration hint
- **THEN** the package remains selectable unless another blocking status applies

### Requirement: Large asset UI presents cost and state explicitly

Marketplace UI SHALL present large asset installation choices and costs before long downloads. Variant picker, sparse selector, proxy upgrade, and download progress MUST show sizes, selected items or variants, resumability state, failure retry, and cancellation where applicable.

#### Scenario: Variant picker shows recommended model variant

- **WHEN** installing a model package with variant mode
- **THEN** the UI shows available variants with size and VRAM requirements
- **THEN** the recommended compatible variant is selected by default

#### Scenario: Sparse selector updates selected size

- **WHEN** installing a sparse package
- **THEN** the UI lists selectable sparse items
- **THEN** selected count and total selected size update as the user changes selection

#### Scenario: Proxy upgrade can be cancelled

- **WHEN** a consumer requests full quality for a proxy-installed item
- **THEN** the UI shows upgrade progress from proxy to full
- **THEN** cancelling the upgrade preserves the proxy state

### Requirement: Webview and extension communicate through typed messages

The marketplace webview SHALL communicate with the extension only through typed postMessage contracts. The webview MUST NOT import `vscode`, and the extension MUST NOT import React or webview implementation modules.

#### Scenario: Webview requests install

- **WHEN** the user clicks install in the webview
- **THEN** the webview posts a typed install request message
- **THEN** the extension validates the message and delegates to market services

#### Scenario: Forbidden dependency is introduced

- **WHEN** webview source imports `vscode` or extension source imports React
- **THEN** architecture guard tests fail
- **THEN** the implementation is not ready to merge

### Requirement: Installed surface shows market and local assets distinctly
Marketplace Installed SHALL list market-installed and sideloaded local assets in one management surface while clearly distinguishing their source. Local assets MUST show a Local badge and MUST NOT expose market update, entitlement, rating, or publisher verification actions.

#### Scenario: Local asset appears in Installed
- **WHEN** a reusable local asset is installed through the local install flow
- **THEN** Installed shows the asset with a Local badge
- **THEN** detail actions reflect local management semantics rather than registry package semantics

#### Scenario: Local asset has no update action
- **WHEN** a sideloaded asset is selected in Installed
- **THEN** the UI does not offer registry update or renewal actions
- **THEN** it may offer disable, uninstall, reveal, or edit local metadata actions according to asset type

### Requirement: Local install flow discloses copy versus link behavior
Marketplace UI SHALL make local install storage semantics explicit. Copy-managed installs and external local links MUST show different uninstall behavior before the user confirms installation.

#### Scenario: User chooses copy-managed local install
- **WHEN** the user installs a local asset in copy mode
- **THEN** the confirmation UI shows that the asset will be copied under `${NEKO_HOME}/local`
- **THEN** uninstall indicates that the managed local copy will be removed

#### Scenario: User chooses local link install
- **WHEN** the user installs a local asset as an external link
- **THEN** the confirmation UI warns that the original external file remains user-managed
- **THEN** uninstall indicates that only the local install record will be removed

### Requirement: Developer Mode management is explicit and expiring
Marketplace management surfaces SHALL expose Developer Mode as an explicit opt-in setting for native plugin development. The UI MUST show risk disclosure, current status, expiration, and a visible active indicator while Developer Mode is enabled.

#### Scenario: User enables Developer Mode
- **WHEN** the user enables Developer Mode
- **THEN** the UI requires explicit acknowledgement of native code risk
- **THEN** it records an expiration time and shows Developer Mode as active until expiration or manual disable

#### Scenario: Developer Mode active indicator is shown
- **WHEN** Developer Mode is active
- **THEN** Marketplace UI shows an active Developer Mode indicator
- **THEN** native plugin sideload actions remain marked as development-only and unsafe for untrusted workspaces

### Requirement: Workspace Trust promotion is explicit in management UI
Marketplace and relevant host surfaces SHALL expose Workspace Trust state and promotion actions without treating project-contained trust files as authoritative. Promotion MUST require a user action and MUST explain that sideload and native plugin activation can change after trust promotion.

#### Scenario: Restricted workspace shows promotion affordance
- **WHEN** the current workspace is restricted and contains blocked sideload assets
- **THEN** the UI shows the restricted state and blocked reason
- **THEN** the user can promote the workspace only through an explicit trust action

#### Scenario: Project-provided trust hint is not enough
- **WHEN** a project contains trust metadata but no matching local trust authority entry
- **THEN** the UI treats the workspace as not locally trusted
- **THEN** it may display the metadata as provenance information but not as an activation grant

### Requirement: Sideload warnings are type-specific
Marketplace UI SHALL present type-specific sideload warnings. Native plugins require Developer Mode warnings, shader binaries require validation/source warnings, models require source and resource warnings, and low-risk text/config assets may use minimal disclosure.

#### Scenario: Shader binary local install warns and validates
- **WHEN** the user installs a local SPIR-V shader
- **THEN** the UI warns that the shader is from a non-market source
- **THEN** activation status reflects validator results before the shader is available to consumers

#### Scenario: Model local install warns about resource and provenance
- **WHEN** the user installs a local model file
- **THEN** the UI warns about source provenance and runtime resource cost
- **THEN** validation diagnostics are visible if activation is blocked
