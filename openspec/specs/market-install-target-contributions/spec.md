# market-install-target-contributions Specification

## Purpose
TBD - created by archiving change align-neko-market-registry-contracts. Update Purpose after archive.
## Requirements
### Requirement: Install targets map to v4 AssetTypes

The system SHALL define install target routing for the 11 v4 AssetTypes. Every installable manifest type MUST resolve to exactly one active target before staging or activation proceeds.

#### Scenario: Builtin target handles X class type

- **WHEN** a package has type `media`, `starter`, `preset`, or `bundle`
- **THEN** the market runtime can resolve a builtin install target
- **THEN** no domain extension activation is required solely to stage that X class type

#### Scenario: Missing target blocks install

- **WHEN** a package type has no builtin target and no registered contributed target
- **THEN** install fails before staging
- **THEN** the UI reports which extension or contribution is required when known

### Requirement: X class targets stay in neko-market

The market extension SHALL own only the X class builtin targets: MediaInstallTarget, StarterInstallTarget, PresetInstallTarget, and BundleInstallTarget. These targets MUST avoid importing domain package APIs and MUST communicate with consumers through shared contracts and events.

#### Scenario: Preset target notifies consumers by event

- **WHEN** a preset package is installed
- **THEN** the market target stages files under the preset install path
- **THEN** it emits a typed install event for interested consumers
- **THEN** it does not import a consumer package to directly mutate that package's registry

#### Scenario: Bundle target orchestrates only package references

- **WHEN** a bundle is installed
- **THEN** the bundle target processes `contents` references and reference counts
- **THEN** it does not implement media, model, shader, provider, or skill domain logic itself

### Requirement: Y class targets are contributed by domain extensions

The system SHALL support contributed install targets for `skill`, `plugin`, `shader`, `identity`, `endpoint`, `provider`, and `model`. Domain extensions MUST register concrete targets at activation time through the market API.

#### Scenario: Agent contributes skill endpoint and provider targets

- **WHEN** `neko-agent` is installed and activated for market target contribution
- **THEN** it can register targets for `skill`, `endpoint`, and `provider`
- **THEN** market installation dispatches those types through the registered agent targets

#### Scenario: Model runtime contributes model target

- **WHEN** a model package is installed and a model target contribution is declared
- **THEN** the market extension activates the contributing extension
- **THEN** the contributed target handles model-specific runtime registration

### Requirement: Contributions are discovered statically and activated lazily

The market extension SHALL discover `contributes.neko.installTargets` without activating all domain extensions. It MUST activate the declared extension only when installing or inspecting install readiness for the contributed type or kind.

#### Scenario: Startup scans contribution declarations

- **WHEN** the market extension starts
- **THEN** it scans extension contribution metadata for install target declarations
- **THEN** it records type or kind ownership without invoking domain activation code

#### Scenario: Install activates selected contributor

- **WHEN** installing a Y class package and a static contributor exists
- **THEN** the market extension activates the contributor using the declared activation event
- **THEN** it waits for the contributor to register a live target before staging

### Requirement: RegisterInstallTarget returns a disposable registration

The exported `NekoMarketAPI.registerInstallTarget` SHALL register a live install target and return a Disposable-like object. Disposing it MUST unregister the target and update future target resolution.

#### Scenario: Extension deactivates target

- **WHEN** a contributing extension disposes its target registration
- **THEN** future installs for that target type no longer use the disposed instance
- **THEN** the market UI can show the type as missing a live contributor

#### Scenario: Registration validates interface

- **WHEN** an extension registers a target
- **THEN** the market API validates required target identity and lifecycle methods
- **THEN** invalid registrations are rejected with diagnostics before they can handle installs

### Requirement: Duplicate target ownership is rejected

The market extension SHALL reject duplicate active ownership for the same type or type-kind route. X class builtin routes MUST NOT overlap with contributed routes, and Y class routes MUST have deterministic conflict handling.

#### Scenario: Duplicate type contribution is found

- **WHEN** two extensions contribute the same install target type without a kind-level override rule
- **THEN** the market extension rejects the duplicate route
- **THEN** installs for that type are blocked until the conflict is resolved

#### Scenario: Builtin route cannot be overridden

- **WHEN** an extension contributes a target for an X class builtin type
- **THEN** the contribution is rejected
- **THEN** the builtin target remains the only route for that type

### Requirement: Kind-level overrides are explicit

The contribution protocol SHALL support optional kind-level activation events such as `onInstallKind:shader.material`. Kind-level routes MUST be explicit and MUST NOT silently replace a type-level contributor unless the route is more specific for the package metadata kind.

#### Scenario: Shader material uses kind route

- **WHEN** a shader package has metadata kind matching a registered kind-level route
- **THEN** the market extension selects the kind-level target
- **THEN** the generic shader type-level target is not used for that install

#### Scenario: Kind route does not match

- **WHEN** a package type has a kind-level route for a different kind
- **THEN** target resolution falls back to the type-level route if one exists
- **THEN** the unrelated kind route is not activated

### Requirement: Market extension remains decoupled from domain packages

The market extension SHALL NOT import implementation types from `neko-agent`, `neko-cut`, `neko-assets`, `neko-model`, `neko-tools`, or other creative domain packages. Cross-extension coordination MUST use shared types, VSCode extension exports, postMessage, or market events.

#### Scenario: Architecture guard detects forbidden import

- **WHEN** market extension source imports a forbidden domain package
- **THEN** architecture guard tests fail
- **THEN** the change is not considered implementation-ready

#### Scenario: Domain target receives only shared contract inputs

- **WHEN** market dispatches to a contributed target
- **THEN** it passes shared `AssetManifest`, install path, progress, and lifecycle state contracts
- **THEN** it does not pass market webview component state or private domain service internals

### Requirement: Contribution failures are surfaced, not downgraded

If a contributed extension fails to activate or fails to register the promised target, the market runtime SHALL fail the install with a concrete contributor error. It MUST NOT downgrade to a generic target for that Y class type.

#### Scenario: Contributor activation throws

- **WHEN** activating the contributor for a Y class type throws an error
- **THEN** install fails before staging
- **THEN** the error identifies the extension id and asset type

#### Scenario: Contributor activates but does not register

- **WHEN** the contributor activation completes without registering the promised target
- **THEN** install fails before staging
- **THEN** the UI reports that the extension did not provide the required install target

### Requirement: Install target events are stable consumer contracts

The market API SHALL expose typed events for install, uninstall, update, enable, disable, status change, and large asset state change. Consumer extensions MUST subscribe to events rather than polling market internals or reading webview state.

#### Scenario: Consumer updates registry after install

- **WHEN** a package installation is recorded
- **THEN** market emits an install event with package id, manifest, install path, type, and installed state
- **THEN** consumers can update their own registries from the event

#### Scenario: Consumer removes registry entry after uninstall

- **WHEN** a package is uninstalled
- **THEN** market emits an uninstall event with package id and manifest identity
- **THEN** consumers remove their own projections without importing market private files

### Requirement: Puppet Model And Config Install Targets
The system SHALL support domain install targets for puppet model and puppet config media kinds.

#### Scenario: Puppet model package installs through puppet target
- **WHEN** a media package has media kind `puppet-model`
- **THEN** target resolution selects the puppet model install target and installs it under the configured puppet model preset location

#### Scenario: Puppet config package installs through puppet target
- **WHEN** a media package has media kind `puppet-config`
- **THEN** target resolution selects the puppet config install target and installs it under the configured puppet config preset location

### Requirement: Model Asset Install Targets
The system SHALL support domain install targets for 3D model, model motion, and model config media kinds.

#### Scenario: 3D model package installs through model target
- **WHEN** a media package has media kind `model-3d`
- **THEN** target resolution selects the model asset install target and installs it under the configured 3D model location

#### Scenario: Model motion package installs through model target
- **WHEN** a media package has media kind `model-motion`
- **THEN** target resolution selects the model motion install target

### Requirement: Voice Pack Install Target
The system SHALL support a voice-pack media install target that can be shared by puppet and model consumers.

#### Scenario: Voice pack installs as shared media
- **WHEN** a media package has media kind `voice-pack`
- **THEN** target resolution selects the voice-pack install target and emits install events that puppet/model consumers can observe
