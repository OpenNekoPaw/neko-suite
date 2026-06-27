# agent-external-processor-sandbox Specification

## Purpose
TBD - created by archiving change implement-agent-external-processor-sandbox. Update Purpose after archive.
## Requirements
### Requirement: Processor manifests are canonical JSON contracts

The system SHALL accept Agent external processors only through a versioned JSON `ExternalProcessorManifest` contract. The manifest MUST declare schema id, schema version, processor id, version, entry executable, argument template, inputs, outputs, root policy, env profile, timeout/resource policy, and approval requirements. Unknown schema, unknown schema version, unknown root alias, missing required fields, invalid argument templates, or illegal output roots MUST produce fail-visible diagnostics and MUST NOT register an executable processor.

#### Scenario: Valid manifest registers

- **WHEN** the Host loads a valid `.neko-processor.json` manifest with `schema="neko.externalProcessor"` and `schemaVersion=1`
- **THEN** the registry exposes a normalized processor registration with no validation diagnostics

#### Scenario: Unknown schema is rejected

- **WHEN** the Host loads a processor manifest with an unknown schema or schema version
- **THEN** the registry records a diagnostic and the processor cannot be resolved for execution

#### Scenario: Non-JSON author input is normalized first

- **WHEN** a future TOML or YAML authoring file is supported
- **THEN** the runtime validates only the converted JSON contract and does not execute from the authoring format directly

### Requirement: Processor registry normalizes all discovery sources

The system SHALL expose a single `ExternalProcessorRegistry` projection for builtin, project, personal/local, Market, and extension/plugin processors. The registry MUST track `sourceScope`, `AgentCapabilitySource`, `AgentCapabilityTrustLevel`, enabled state, immutable registration snapshot, revision, package/location metadata, and diagnostics. Project and personal/local processors MUST be source scopes, not new trust levels.

#### Scenario: Five sources project to one catalog

- **WHEN** builtin, project, personal, Market, and extension processors are discovered
- **THEN** Agent runtime receives them only through the normalized registry catalog

#### Scenario: Project processor uses stable project path

- **WHEN** a workspace contains `.neko/processors/example.neko-processor.json`
- **THEN** the Host registers it with `sourceScope=project` and `AgentCapabilitySource=local`

#### Scenario: Personal processor requires explicit registration

- **WHEN** a tool exists in HOME, PATH, Downloads, Desktop, or an arbitrary install directory
- **THEN** the Host does not auto-register it unless Settings, UI, CLI, or another explicit user action added its manifest to the registry

### Requirement: Registry lifecycle changes are observable and revisioned

The registry SHALL provide `upsert`, `unregister`, `setEnabled`, `list`, `resolve`, and `onDidChange` semantics. Updates MUST create a new immutable registration snapshot and increment catalog revision. Running processor invocations MUST continue using their start snapshot; later invocations MUST use the new revision. Unregister and disable operations MUST prevent future resolution while preserving diagnostics when appropriate.

#### Scenario: Market uninstall unregisters processor

- **WHEN** a Market package that contributed a processor is uninstalled
- **THEN** the registry emits an `unregistered` change and future resolution of that processor fails with a diagnostic

#### Scenario: Manifest update does not mutate running invocation

- **WHEN** a processor manifest is updated while an invocation is running
- **THEN** the running invocation continues with its original registration snapshot and the next invocation resolves the updated revision

#### Scenario: Disabled processor remains visible for diagnostics

- **WHEN** policy disables a processor registration
- **THEN** the catalog shows it as disabled with diagnostics and execution is blocked

### Requirement: Ordinary creative Agent does not get arbitrary shell execution

The system SHALL NOT inject arbitrary `Bash`, `sh -c`, `zsh -c`, or unconstrained local command tools into ordinary creative Agent sessions by default. Local external processing MUST be invoked through registered processors with manifest, policy, approval, and resource constraints.

#### Scenario: Ordinary session lacks Bash

- **WHEN** a normal creative Agent session is assembled
- **THEN** the tool allowlist does not include arbitrary shell execution

#### Scenario: Shell-like processor without manifest is rejected

- **WHEN** an Agent request attempts to execute an unregistered command string
- **THEN** the runtime returns a diagnostic instead of spawning a shell

### Requirement: Developer Mode one-shot commands use processor policy

Developer Mode SHALL be an explicit user-enabled mode. One-shot command execution in Developer Mode MUST be represented as a temporary processor request and MUST pass through PathAccessPolicy, cwd limits, env allowlist, Host secret denylist, output root allocation, approval, timeout, and network policy. Developer Mode MUST NOT create persistent `Bash(*)` allow rules.

#### Scenario: Developer command is policy checked

- **WHEN** Developer Mode runs a one-shot local command
- **THEN** the request is evaluated as a temporary processor invocation and receives the same path/env/output diagnostics as a registered processor

#### Scenario: Persistent Bash allow is forbidden

- **WHEN** a user or capability attempts to persistently allow `Bash(*)`
- **THEN** the runtime rejects the rule or marks it ineffective for ordinary creative sessions

### Requirement: Processor inputs and outputs use authorized roots

The processor runtime SHALL authorize all inputs and outputs through root aliases and `PathAccessPolicy`. Stable root aliases are `workspace`, `mediaLibrary`, `resourceCache`, and `extensionPrivateResources`. The default output root SHALL be `resourceCache`. Unmanaged absolute paths, system temp, Downloads, Desktop, and undeclared external directories MUST NOT be implicit inputs or outputs.

#### Scenario: Media library is readable input but not scratch output

- **WHEN** a processor manifest declares `allowedInputRoots=["mediaLibrary"]`
- **THEN** it can read enabled, accessible, policy-authorized media library files but cannot write outputs back to the media library unless an explicit promote/create-asset flow is approved

#### Scenario: Resource cache output is allocated by Host

- **WHEN** a processor produces an image output with `root="resourceCache"`
- **THEN** the Host allocates a path under `.neko/.cache/resources` or extension `globalStorageUri/resources` and returns a `ResourceRef`

#### Scenario: Extension private output is not durable

- **WHEN** a processor writes to `extensionPrivateResources`
- **THEN** the result is marked extension-private and cannot be written into Canvas, Storyboard, Asset, or project facts until promoted to a durable source

### Requirement: Processor execution enforces env, cwd, network, and timeout policy

The processor runtime SHALL spawn only the executable and argument template declared by the resolved manifest snapshot. It MUST restrict cwd to an authorized workspace or processor workdir, apply timeout/resource limits, default network to disabled unless policy allows it, and build env from explicit profile rules. Host baseline secret denylist MUST override manifest allowlists for non-core processors.

#### Scenario: Secret env is blocked despite allowlist

- **WHEN** a manifest lists `GITHUB_TOKEN`, `AWS_SECRET_ACCESS_KEY`, `SSH_AUTH_SOCK`, or another baseline secret pattern in `envProfile.inherits`
- **THEN** the runtime rejects inheritance for that key and returns a diagnostic

#### Scenario: GPU env is allowed by profile

- **WHEN** a processor profile allows `CUDA_VISIBLE_DEVICES`
- **THEN** the runtime may pass that key if Host policy permits it and no secret rule matches

#### Scenario: Network defaults closed

- **WHEN** a processor manifest omits network permission
- **THEN** execution runs with network disabled or returns a diagnostic if the requested runtime cannot enforce that policy

### Requirement: Processor results return ResourceRef, diagnostics, and provenance

Processor execution SHALL return structured status, output `ResourceRef` values, diagnostics, and provenance. It MUST NOT return naked system paths, Webview URIs, file URLs, runtime tokens, or cache paths as durable output identity.

#### Scenario: Successful output returns ResourceRef

- **WHEN** a processor successfully writes an output file
- **THEN** the result includes a `ResourceRef`, output role, provenance, size/status metadata, and no durable absolute path

#### Scenario: Absolute temp output is rejected

- **WHEN** a processor result points to `/tmp`, system temp, Downloads, Desktop, or another unmanaged absolute path
- **THEN** the runtime rejects the output as a resource handoff and returns a diagnostic

### Requirement: ProcessorResourcePort owns Agent-to-Host resource intent

Agent runtime SHALL express processor resource lifecycle changes through a host-agnostic `ProcessorResourcePort`. Agent runtime MUST NOT import VS Code, read resource cache manifests, delete cache files, or call `ResourceCacheService` directly. Extension Host SHALL bind the port to `ResourceCacheService`, `LocalResourceAccessService`, and asset/project services.

#### Scenario: Agent pins resource through port

- **WHEN** Agent UI or approval flow needs to keep a processor output visible
- **THEN** Agent runtime sends a pin intent through `ProcessorResourcePort` and Extension Host updates cache retention state

#### Scenario: Direct cache file mutation is forbidden

- **WHEN** Agent runtime attempts to delete or mutate a cache file directly
- **THEN** architecture tests or contract tests fail

### Requirement: Processor run and stage provenance crosses turns

The system SHALL use `processorRunId` to identify one processor workflow run and `stageId` to identify an atomic processor invocation within that run. A processor run MAY span multiple Agent turns for approval or user-provided parameters. Retrying the same stage MUST preserve `stageId` with attempt metadata. Changing the creative target or replanning MUST create a new `processorRunId` linked by parent provenance.

#### Scenario: Approval continues same run

- **WHEN** step 2 of a chain pauses for user approval and resumes in a later Agent turn
- **THEN** the resumed invocation uses the same `processorRunId`

#### Scenario: Retry preserves stage identity

- **WHEN** a failed processor stage is retried with adjusted parameters
- **THEN** the retry records a new attempt under the same `stageId`

#### Scenario: Replan creates new run

- **WHEN** the user changes the goal from upscaling an image to generating a new style variant
- **THEN** the system creates a new `processorRunId` and records parent provenance from the prior output if used

### Requirement: Processor chains are explicit invocations, not shell pipelines

The system SHALL model chained processing as explicit processor invocations with resource handoff between stages. Skill prompt chains MAY plan the sequence but MUST NOT hide multiple high-risk processors inside one shell command or bypass per-stage registry resolve, approval, output root allocation, and diagnostics.

#### Scenario: Chain records every stage

- **WHEN** a workflow performs remove-background, upscale, and style-transfer
- **THEN** each step has a distinct stage record, resolved processor registration, output `ResourceRef`, approval status when required, and provenance

#### Scenario: Shell pipeline is rejected

- **WHEN** a Skill attempts to run the same chain as one `bash -c` pipeline
- **THEN** the runtime rejects it for ordinary creative sessions

### Requirement: Intermediate processor resources have retention and GC semantics

Processor outputs SHALL carry retention hints: `intermediate`, `debug`, `pinned`, or `promoted`. `intermediate` outputs are releasable after run completion, `debug` outputs are retained for failed/cancelled diagnostics until TTL or budget cleanup, `pinned` outputs are protected while UI/session references exist, and `promoted` outputs leave scratch lifecycle and are managed by Asset or Project services.

#### Scenario: Successful intermediate can be garbage collected

- **WHEN** a chain succeeds and non-final stage outputs are no longer pinned
- **THEN** those outputs are marked releasable and ResourceCacheService may garbage collect them

#### Scenario: Failed chain keeps debug output

- **WHEN** stage B fails after stage A produced output
- **THEN** stage A output is retained as debug material for retry/diagnostics until debug TTL, user cleanup, or budget pressure

#### Scenario: Promoted output is durable

- **WHEN** the user promotes a final processor output to an asset or project source
- **THEN** the result is no longer treated as scratch cache and durable ownership moves to Asset or Project services

### Requirement: Resource cache GC prevents processor cache growth

ResourceCacheService SHALL provide P0/P1 processor cache garbage collection based on max-byte budgets and LRU ordering. GC MUST skip pinned, session-active, promoted, non-rebuildable, and outside-managed-root variants. After deleting a file, the manifest MUST mark the variant as missing or diagnostic rather than ready.

#### Scenario: Budget GC removes oldest intermediate

- **WHEN** processor cache exceeds configured max bytes
- **THEN** GC removes the least recently accessed rebuildable intermediate variants first

#### Scenario: Pinned resource survives GC

- **WHEN** a processor output is pinned by approval UI or Canvas draft
- **THEN** budget GC skips it and records a skipped reason

#### Scenario: Manifest updates after delete

- **WHEN** GC deletes a cached variant file
- **THEN** the resource cache manifest no longer reports that variant as ready

### Requirement: Webview display uses managed projection only

Webviews SHALL receive processor and document/image resources as `ResourceRef` projections or Host-projected URIs through `LocalResourceAccessService`. Webviews MUST NOT receive system temp paths, raw file URLs, unmanaged absolute paths, or cache file paths as durable display identity.

#### Scenario: Managed output displays

- **WHEN** a processor output is sent to Agent Webview or Canvas
- **THEN** the Host projects the managed `ResourceRef` through `webview.asWebviewUri(...)`

#### Scenario: Temp path display fails visibly

- **WHEN** a tool result attempts to display a system temp image path
- **THEN** Webview projection rejects it and the user receives a diagnostic instead of a broken silent image

### Requirement: Market processor packages follow Market trust governance

Market-provided processors SHALL be installed, updated, disabled, revoked, and uninstalled through Market install targets and registry lifecycle. They MUST reuse Market publisher, package id, version, trustLevel, entitlement, signature/revocation, and diagnostics. Market or extension manifests MUST NOT self-declare `core` trust.

#### Scenario: Untrusted Market processor is not auto-executable

- **WHEN** a Market processor has `trustLevel=untrusted`
- **THEN** it is visible with diagnostics/policy state but not injected into default executable tool allowlists

#### Scenario: Revoked processor cannot resolve

- **WHEN** Market revokes or disables a processor package
- **THEN** the registry marks it disabled or unregistered and future execution attempts fail visibly
