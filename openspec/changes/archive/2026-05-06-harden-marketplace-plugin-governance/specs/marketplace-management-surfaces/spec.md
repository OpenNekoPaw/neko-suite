## ADDED Requirements

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
