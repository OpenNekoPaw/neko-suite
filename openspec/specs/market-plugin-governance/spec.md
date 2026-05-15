# market-plugin-governance Specification

## Purpose
TBD - created by archiving change harden-marketplace-plugin-governance. Update Purpose after archive.
## Requirements
### Requirement: Native plugin identity and trust tiers are authoritative
The system SHALL treat `plugin` marketplace assets as neko-engine native `cdylib` artifacts only. The system MUST NOT treat VSCode extensions or WASM modules as `plugin` assets, and market-published native plugins MUST come from core publishers or verified publishers.

#### Scenario: Community publisher cannot publish native plugin
- **WHEN** the registry receives a package with `type = 'plugin'` from a publisher whose final manifest would have `trustLevel = 'community'` and `distribution.publisher.verified != true`
- **THEN** the registry rejects the package before publication
- **THEN** non-plugin AssetTypes from the same publisher remain eligible for the normal community workflow

#### Scenario: T2 plugin uses verified publisher projection
- **WHEN** the registry returns a T2 plugin manifest
- **THEN** `distribution.trustLevel` is `community`
- **THEN** `distribution.publisher.verified` is `true`
- **THEN** the client and engine MUST NOT recompute publisher verification locally

### Requirement: Plugin permissions are declarative governance metadata
The system SHALL use `PluginPermission` values for user disclosure, publisher review, host-api audit, and publisher risk handling. The system MUST NOT describe native plugin permissions as a runtime sandbox or as protection against direct native syscalls.

#### Scenario: Host-api call exceeds declared permissions
- **WHEN** a loaded plugin calls an engine host API action mapped to a permission not declared in its manifest
- **THEN** the engine records an audit event containing plugin id, action, mapped permission, declared=false, and timestamp
- **THEN** the engine reports the violation to the registry audit endpoint without claiming that direct syscalls are blocked

#### Scenario: Native direct syscall is outside audit boundary
- **WHEN** a plugin bypasses host APIs and calls libc, Win32, CoreFoundation, or another native library directly
- **THEN** the in-process PluginManager does not claim to intercept the call
- **THEN** governance relies on KYC, signing, license revocation, user disclosure, and post-incident handling

### Requirement: High-sensitive plugin permissions have explicit review rules
The system SHALL apply explicit review and disclosure rules for high-sensitive permissions. `network:any`, `fs-write:project`, `process-spawn`, and `system-info` MUST produce distinct review and user-facing disclosure behavior.

#### Scenario: Plugin declares network any
- **WHEN** a verified publisher submits a plugin manifest declaring `network:any`
- **THEN** registry review requires a specific justification
- **THEN** installation UI presents a prominent network warning before installation can continue

#### Scenario: Plugin declares process spawn
- **WHEN** a plugin manifest declares `process-spawn`
- **THEN** the registry applies the configured policy for this high-sensitive permission before publication
- **THEN** the policy result is deterministic and does not simultaneously state both unconditional T1-only and routine T2 acceptance

#### Scenario: Plugin requests system information
- **WHEN** a plugin accesses system information through host APIs
- **THEN** the host API returns only coarse-grained values needed for compatibility or performance selection
- **THEN** it MUST NOT return precise fingerprinting identifiers through the plugin system information permission

### Requirement: Developer Mode is required for native plugin sideload
The system SHALL reject native `cdylib` sideload activation unless Developer Mode is enabled, unexpired, and the current Workspace Trust level allows sideload activation. Developer Mode MUST expire automatically after the configured duration.

#### Scenario: Native sideload without Developer Mode
- **WHEN** a local `.so`, `.dylib`, or `.dll` is discovered as a plugin and Developer Mode is disabled or expired
- **THEN** the engine refuses to load it
- **THEN** marketplace UI shows the user that Developer Mode is required for native plugin testing

#### Scenario: Developer Mode expires
- **WHEN** Developer Mode has been enabled for longer than its configured validity period
- **THEN** the system disables Developer Mode automatically
- **THEN** previously enabled local native plugins are no longer loaded until the user explicitly re-enables Developer Mode

### Requirement: Workspace Trust gates plugin and sideload activation
The system SHALL gate plugin and sideload activation by Workspace Trust. Trusted workspaces can load eligible verified plugins and explicitly enabled local assets, restricted workspaces MUST NOT load sideload assets, and limited workspaces MUST load only core native plugins.

#### Scenario: Restricted workspace blocks sideload
- **WHEN** a workspace trust level is `restricted`
- **THEN** sideload assets are not activated for that workspace
- **THEN** native sideload plugins remain blocked even if Developer Mode is enabled

#### Scenario: Limited workspace blocks verified third-party plugin
- **WHEN** a workspace trust level is `limited`
- **THEN** T2 verified native plugins are not loaded
- **THEN** only T1 core plugins can be activated

### Requirement: Engine performs final native plugin load gates
The engine SHALL perform final native plugin load checks before `dlopen` or equivalent loading. The checks MUST include integrity, signature, license or entitlement, trust tier, Workspace Trust, platform target compatibility, and configured machine binding before the native artifact is loaded.

#### Scenario: License check fails before load
- **WHEN** the engine is asked to load a native plugin whose entitlement is expired or not allowed
- **THEN** the engine rejects loading before `dlopen`
- **THEN** TypeScript-side state cannot override the engine decision

#### Scenario: Target triple mismatch blocks load
- **WHEN** a plugin artifact target triple does not match the current engine platform
- **THEN** the engine refuses to load the artifact
- **THEN** the failure is reported as an incompatible plugin artifact rather than a generic activation failure

### Requirement: Shader governance is less strict than native plugin governance but still validated
The system SHALL allow community shader assets while validating shader source and binary artifacts before activation. Shader validation MUST include format compatibility and resource safety checks appropriate to the artifact form.

#### Scenario: Community shader is accepted after validation
- **WHEN** a community publisher provides a shader asset that passes source or binary validation
- **THEN** the market may install and activate the shader without KYC publisher status
- **THEN** the shader remains subject to license, compatibility, and Workspace Trust rules

#### Scenario: Invalid binary shader is blocked
- **WHEN** a sideloaded or market-installed shader binary fails validation or exceeds configured resource limits
- **THEN** activation is blocked
- **THEN** the UI surfaces a shader validation error instead of loading the artifact into the engine

### Requirement: Plugin Load Gates Feed Activation Bridges
The system SHALL run native plugin trust, integrity, signature, entitlement, platform, and Workspace Trust load gates before any activation bridge registers plugin contributions.

#### Scenario: Load gate failure prevents registration
- **WHEN** a native plugin fails any required load gate
- **THEN** no activation bridge registers contributions for that plugin
- **THEN** the plugin remains inactive and the failure is audited

#### Scenario: Signature presence is not sufficient
- **WHEN** a native plugin manifest includes signature metadata
- **THEN** activation still requires a verifier result that proves the artifact matches the trusted signature and integrity data
- **THEN** mere presence of signature fields does not satisfy the load gate

