# engine-plugin-activation-bridges Specification

## Purpose
TBD - created by archiving change complete-engine-plugin-activation-bridges. Update Purpose after archive.
## Requirements
### Requirement: Every Declared Plugin Kind Has An Activation Outcome
The plugin system SHALL provide an explicit activation outcome for every `PluginKind` declared by the engine manifest contract.

#### Scenario: Supported plugin kind activates through a bridge
- **WHEN** a plugin with kind Shader, Lut, Model, Format, Device, Exporter, Connector, or EffectPreset passes load gates and declares valid capabilities
- **THEN** PluginManager routes activation through the bridge responsible for that plugin kind or contribution family
- **THEN** activation either registers behavior or returns a typed unsupported-capability error

#### Scenario: Plugin kind is not silently inert
- **WHEN** a plugin kind is recognized but no runtime bridge is available
- **THEN** activation fails with an explicit unsupported-capability result
- **THEN** the plugin is not reported as active

### Requirement: Activation Bridges Are Focused
Plugin activation bridges SHALL register contributions through focused registry boundaries instead of one all-purpose activator.

#### Scenario: Effect bridge remains effect-scoped
- **WHEN** Shader, Lut, or EffectPreset contributions are activated
- **THEN** they may use the effect/audio registry activation path
- **THEN** non-effect kinds such as Format, Device, Exporter, and Connector are not routed through effect-specific code unless they declare effect capabilities

#### Scenario: Registries receive plugin-scoped contributions
- **WHEN** a bridge registers a format, device, exporter, connector, model, shader, LUT, or preset contribution
- **THEN** the registry records the source plugin id
- **THEN** the contribution can be removed by plugin id during deactivation

### Requirement: Deactivation Cleans Up Registered Contributions
Plugin deactivation SHALL reverse every registry contribution made during activation.

#### Scenario: Plugin deactivation unregisters contributions
- **WHEN** an active plugin is deactivated
- **THEN** all contributions registered by that plugin are removed from their registries
- **THEN** later lookups do not return stale plugin-provided capabilities

#### Scenario: Partial activation failure rolls back
- **WHEN** activation registers one or more contributions and then a later contribution fails
- **THEN** activation rolls back previously registered contributions for that plugin
- **THEN** the plugin is not left partially active

### Requirement: Signature Verification Has Explicit Results
Native plugin activation SHALL consume an explicit signature verification result rather than checking only that signature metadata exists.

#### Scenario: Invalid signature blocks activation
- **WHEN** a native plugin artifact has an invalid Ed25519 signature or mismatched integrity metadata
- **THEN** the load gate rejects activation before registry registration
- **THEN** the failure is reported as signature verification failure

#### Scenario: Verification unavailable is explicit
- **WHEN** the configured verifier cannot verify because key material, algorithm support, or platform support is unavailable
- **THEN** activation returns a verification-unavailable or unsupported-algorithm result
- **THEN** it does not treat signature field presence as success

### Requirement: Plugin Activation Is Auditable
Activation and deactivation SHALL emit audit events that identify plugin id, kind, bridge outcome, and permission-gate result.

#### Scenario: Activation failure is audited
- **WHEN** plugin activation fails due to trust, permission, signature, unsupported capability, or bridge registration error
- **THEN** the audit event records the plugin id, plugin kind, failure category, and timestamp

#### Scenario: Native syscall boundary remains documented
- **WHEN** a native plugin is activated
- **THEN** audit messaging does not claim to sandbox direct native syscalls
- **THEN** host-api audit remains scoped to engine host API calls and activation lifecycle events

