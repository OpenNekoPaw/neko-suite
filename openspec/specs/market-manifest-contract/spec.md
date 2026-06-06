# market-manifest-contract Specification

## Purpose
TBD - created by archiving change align-neko-market-registry-contracts. Update Purpose after archive.
## Requirements
### Requirement: AssetManifest v4 is the shared market schema

The system SHALL expose AssetManifest v4 from the shared asset types package as the single client/server manifest contract. The manifest MUST include `id`, `name`, `version`, `type`, `source`, `distributionKind`, `createdAt`, and `updatedAt`, and MUST allow v4 optional fields for `typeMetadata`, `distribution`, `effects`, `dependencies`, `contents`, `largeAsset`, `semantics`, `intent`, `embeddings`, `deprecation`, and `thumbnail`.

#### Scenario: Public registry manifest uses v4 fields

- **WHEN** a market package detail is parsed from the registry
- **THEN** the manifest exposes `distributionKind`
- **THEN** the manifest type is one of the v4 asset types
- **THEN** registry-source manifests expose `source.kind = 'registry'` with an integrity value before installation is allowed

#### Scenario: Local development manifest remains supported

- **WHEN** a local development manifest uses `source.kind = 'local'`
- **THEN** the manifest MAY omit marketplace `distribution`
- **THEN** the manifest still MUST provide v4 `type`, `distributionKind`, `createdAt`, and `updatedAt`

### Requirement: AssetType v4 uses 11 implementation types

The system SHALL replace legacy market asset type routing with exactly these implementation-level AssetTypes: `media`, `starter`, `identity`, `model`, `endpoint`, `provider`, `skill`, `plugin`, `shader`, `preset`, and `bundle`. Subtype differences MUST be represented in type-specific metadata rather than additional top-level AssetType values.

#### Scenario: Media subtype is represented by metadata

- **WHEN** a package represents a video, audio, image, sequence, 3d model, puppet motion, or document asset
- **THEN** its `type` is `media`
- **THEN** its `typeMetadata.data.mediaKind` identifies the media subtype

#### Scenario: Model subtype is represented by metadata

- **WHEN** a package represents a base model, LoRA, or embedding
- **THEN** its `type` is `model`
- **THEN** its `typeMetadata.data.modelKind` identifies `base`, `lora`, or `embedding`

#### Scenario: Legacy type is not routed directly

- **WHEN** a manifest or installed record contains a legacy type such as `video`, `audio`, `ai-model`, `lora`, `template`, `lut`, or `provider-card`
- **THEN** the system MUST migrate or reject it before install routing
- **THEN** the install runtime MUST NOT dispatch directly on the legacy type

### Requirement: AssetCategory is a UI dimension

The system SHALL derive AssetCategory from AssetType using the v4 category map. AssetCategory MUST be limited to `media`, `ai`, `tooling`, and `bundle`, and MUST NOT replace AssetType for installation routing.

#### Scenario: Browse category filters map to asset types

- **WHEN** the user filters Browse by category `ai`
- **THEN** the market query and UI state include the corresponding `model`, `endpoint`, and `provider` types
- **THEN** installation still dispatches on the concrete AssetType

#### Scenario: Bundle remains its own category

- **WHEN** a package has type `bundle`
- **THEN** its derived category is `bundle`
- **THEN** the UI MUST NOT display it as media, ai, or tooling

### Requirement: DistributionKind defines install shape

The manifest contract SHALL define `DistributionKind` as `archive`, `orchestration`, or `registration`. Install behavior MUST be selected from `distributionKind`; it MUST NOT be inferred only from AssetType or file extension.

#### Scenario: Archive package downloads payload

- **WHEN** a package has `distributionKind = 'archive'`
- **THEN** the install runtime expects a downloadable payload and integrity verification path

#### Scenario: Bundle uses orchestration

- **WHEN** a package has `type = 'bundle'`
- **THEN** it MUST use `distributionKind = 'orchestration'`
- **THEN** it MUST provide `contents`

#### Scenario: Endpoint uses registration

- **WHEN** a package has `type = 'endpoint'`
- **THEN** it MUST use `distributionKind = 'registration'`
- **THEN** client installation MUST NOT require an archive download

### Requirement: Type metadata matches AssetType

The system SHALL model `AssetTypeMetadata` as a discriminated union whose `type` matches the manifest `type`. Required fields MUST be enforced for every v4 AssetType before detail rendering or installation proceeds.

#### Scenario: Metadata type mismatch is rejected

- **WHEN** a manifest has `type = 'shader'` but `typeMetadata.type = 'model'`
- **THEN** the client treats the package as invalid for detail and install
- **THEN** the package list MAY skip the item with a warning instead of crashing

#### Scenario: Bundle metadata and contents are required

- **WHEN** a manifest has `type = 'bundle'`
- **THEN** `typeMetadata.data.installPolicy` is required
- **THEN** `contents` is required and contains package references with semver ranges

### Requirement: EffectsManifest declares side effects

The manifest contract SHALL include an optional `EffectsManifest` for file access, resource consumption, runtime registrations, conflicts, and network access. Effects data MUST be consumed by preflight, activation, UI disclosure, and uninstall inversion.

#### Scenario: Registration effects are disclosed

- **WHEN** a manifest declares tools, providers, runtimes, effects, or commands in `effects.registrations`
- **THEN** the install preflight can present those registrations to the user or trust gate
- **THEN** uninstall can reverse the registered effects without relying on hidden target state

#### Scenario: Unknown future effect fields are tolerated

- **WHEN** a manifest contains an unknown nested field under `effects`
- **THEN** the client ignores the unknown field for backward compatibility
- **THEN** the client MUST NOT fail list rendering solely because of the unknown field

### Requirement: Large asset strategy is explicit

The manifest contract SHALL represent large asset behavior through `LargeAssetStrategy`. The strategy MUST include `totalSize` when present, and MUST require mode-specific data for `sparse`, `proxy`, and `variant` modes.

#### Scenario: Variant model exposes selectable variants

- **WHEN** a model manifest includes `largeAsset.modes` containing `variant`
- **THEN** it MUST include `variants`
- **THEN** at least one variant is marked or derivable as recommended before showing the variant picker

#### Scenario: Sparse package exposes item list

- **WHEN** a manifest includes `largeAsset.modes` containing `sparse`
- **THEN** it MUST include `sparseItems`
- **THEN** each sparse item has a stable `itemId`, name, and size

### Requirement: Semantics and intent are typed facets

The manifest contract SHALL keep objective facets in `semantics` and usage-oriented facets in `intent`. Client code MUST preserve this boundary when building queries, UI filters, and agent-facing context.

#### Scenario: Semantics filter uses semantic fields

- **WHEN** the user filters LUTs by warmth, contrast, mood, or film stock
- **THEN** the client builds semantic facet query parameters
- **THEN** it MUST NOT encode those objective filters as intent fields

#### Scenario: Intent filter uses usage fields

- **WHEN** the user filters packages by use case, audience, workflow stage, domain, or not-for constraints
- **THEN** the client builds intent facet query parameters
- **THEN** it MUST NOT encode those usage filters as semantic fields

### Requirement: Embeddings are references, not inline vectors

The manifest contract SHALL allow package embedding metadata and server-side vector references, but MUST NOT allow inline vector arrays in the manifest payload.

#### Scenario: Manifest references server vector row

- **WHEN** a package has server-side vector indexing
- **THEN** the manifest MAY include `distribution.embeddingHash`
- **THEN** the manifest MUST NOT include raw vector arrays

#### Scenario: Payload embedding metadata points inside package

- **WHEN** a package includes payload embeddings
- **THEN** `embeddings.files` references package-internal paths
- **THEN** each embedding declaration includes model id, model version, and dimension

### Requirement: Manifest evolution is backward compatible within v1

The system SHALL treat new manifest fields as optional in v1, MUST ignore unknown optional fields, and MUST reject unknown `distributionKind` or unsupported required enum values from installation with an upgrade-required result.

#### Scenario: Unknown optional field does not break rendering

- **WHEN** the registry returns a manifest with a new optional field
- **THEN** the client preserves or ignores the field without throwing
- **THEN** list and detail rendering continue if required v4 fields are valid

#### Scenario: Unknown distribution kind blocks install

- **WHEN** a manifest has a `distributionKind` not supported by the client
- **THEN** the detail view reports that the client must be upgraded
- **THEN** the install runtime MUST NOT attempt to install the package

### Requirement: Plugin metadata represents native engine artifacts
The manifest contract SHALL represent `type = 'plugin'` as a native neko-engine `cdylib` artifact. Plugin metadata MUST include entry point, engine host-api version, declared permissions, engine requirements, target triple, and runtime artifact type.

#### Scenario: Plugin metadata is complete
- **WHEN** a manifest has `type = 'plugin'`
- **THEN** `typeMetadata.type` is `plugin`
- **THEN** `typeMetadata.data.entryPoint`, `apiVersion`, `permissions`, and `engineRequirements.targetTriple` are present
- **THEN** `engineRequirements.runtimeArtifacts` contains only `cdylib`

#### Scenario: Plugin metadata does not describe VSCode extension
- **WHEN** plugin metadata is rendered or validated
- **THEN** the manifest contract describes the artifact as a neko-engine native extension
- **THEN** it MUST NOT describe the package as a VSCode extension or WASM module

### Requirement: Publisher verification is projected in distribution metadata
The manifest contract SHALL expose publisher verification through `distribution.publisher`. The legacy `distribution.verified` field MAY be read for compatibility, but new plugin governance decisions MUST use `distribution.publisher.verified` with server-provided `trustLevel`.

#### Scenario: Verified plugin publisher is represented
- **WHEN** the registry emits a verified third-party plugin manifest
- **THEN** `distribution.trustLevel` is `community`
- **THEN** `distribution.publisher.verified` is `true`
- **THEN** `distribution.publisher.verificationTier` is `verified`

#### Scenario: Client does not infer verification from display fields
- **WHEN** a manifest has a publisher name or badge-like text but lacks `distribution.publisher.verified = true`
- **THEN** the client MUST NOT treat it as a verified plugin publisher
- **THEN** native plugin publication and loading gates remain blocked unless another valid trust path exists

### Requirement: Local install sources avoid absolute-path persistence by default
The manifest contract SHALL support local install records that default to copied storage under a variable-based Neko local path. Absolute original file paths MUST NOT be persisted in normal copied local install manifests.

#### Scenario: Copied sideload manifest uses Neko local path
- **WHEN** a user installs a reusable local asset through the local install flow
- **THEN** the created manifest source points to a `${NEKO_HOME}/local/...` path or equivalent PathResolver variable form
- **THEN** the manifest does not persist the user's original absolute source path by default

#### Scenario: External local link is explicit
- **WHEN** a local install intentionally references an asset outside `${NEKO_HOME}/local`
- **THEN** the manifest or installed record marks the source as an explicit local link
- **THEN** uninstall removes the local install record but MUST NOT delete the external target file

### Requirement: Sideload manifests omit marketplace distribution authority
The manifest contract SHALL distinguish sideload manifests from registry manifests. Sideload manifests MUST NOT contain marketplace signature, publisher verification, entitlement, or market trust authority, and the runtime MUST treat them as local/untrusted unless a type-specific rule allows activation.

#### Scenario: Sideload manifest has no distribution authority
- **WHEN** a local asset manifest is generated for sideload
- **THEN** it may omit `distribution`
- **THEN** it MUST NOT claim a registry signature, verified publisher, or server-computed trust level

#### Scenario: Registry manifest still requires integrity and signature metadata
- **WHEN** a public registry manifest is installed
- **THEN** registry-source integrity and distribution signature metadata remain required by the existing manifest contract
- **THEN** sideload exceptions do not weaken registry package validation

### Requirement: Shader and model local metadata supports validation
The manifest contract SHALL provide enough metadata for shader and model local installs to validate format, compatibility, and resource requirements before activation.

#### Scenario: Binary shader local install records artifact form
- **WHEN** a local SPIR-V shader is registered
- **THEN** its metadata identifies the shader artifact form and stage or compatible usage
- **THEN** activation can select the required validator before loading it into the engine

#### Scenario: Model local install records runtime constraints
- **WHEN** a local model is registered
- **THEN** its metadata identifies framework or file form such as GGUF, ONNX, or safetensors
- **THEN** activation can evaluate runtime compatibility and resource warnings before use

### Requirement: Puppet And Model Media Kinds
Market media manifests SHALL support puppet/model asset media kinds for model, motion, config, and voice assets.

#### Scenario: Validate puppet model media manifest
- **WHEN** a media manifest declares media kind `puppet-model`
- **THEN** manifest validation accepts it only when required media metadata and files are present

#### Scenario: Validate model config media manifest
- **WHEN** a media manifest declares media kind `model-config`
- **THEN** manifest validation accepts it only when required config metadata and files are present

### Requirement: Character And Motion Bundle Types
Market bundle manifests SHALL support character-pack and motion-pack bundle type metadata.

#### Scenario: Character pack bundle
- **WHEN** a bundle manifest declares bundle type `character-pack`
- **THEN** bundle contents can reference model, motion, config, and optional voice packages

#### Scenario: Motion pack bundle
- **WHEN** a bundle manifest declares bundle type `motion-pack`
- **THEN** bundle contents can reference one or more motion packages for puppet or model consumers
