## ADDED Requirements

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
