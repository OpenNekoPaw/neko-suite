## ADDED Requirements

### Requirement: Evaluation suites are externally owned and target-scoped
Real Agent Evaluation suites SHALL be owned under `scripts/agent-eval` and SHALL declare a target kind of Skill, Prompt, Capability, Tool, Model, Runtime, or Workflow.

#### Scenario: Suite is discovered
- **WHEN** the runner selects a suite
- **THEN** it MUST load the suite owner, target identity/hash, cases, fixtures, runtime/model policies, rubric references, approved baseline, and report policy
- **AND** it MUST NOT load runner or assertion implementations from the target package

### Requirement: Skill targets use Host-owned identity and fingerprints
Skill-targeted suites SHALL identify the Skill with its portable name and Host-owned source/provenance/root/location projection, and SHALL bind each tested development snapshot to the existing Host-computed package fingerprint.

#### Scenario: Two sources contain the same Skill name
- **WHEN** project, personal, builtin, plugin, or Marketplace sources expose the same portable Skill name
- **THEN** suite selection MUST resolve the full Host identity instead of choosing by name or hidden precedence
- **AND** Market package version or publication state MUST NOT substitute for the local tested fingerprint

### Requirement: Real cases execute through canonical TUI automation
Every real case and controller message SHALL execute through the complete TUI App/session owner and TUI input queue using configured real provider APIs.

#### Scenario: Controller submits multiple turns
- **WHEN** a sequential, queue, feedback, iterative, resume, cancellation, or recovery case submits messages
- **THEN** every message MUST enter the TUI input queue for the selected session
- **AND** direct Agent turn execution, mock providers, or alternate session assembly MUST NOT count as acceptance evidence

### Requirement: Suite and scenario schemas fail visibly
The platform SHALL validate versioned suite/scenario fields, target kinds, case groups, steps, assertions, runtime profiles, model policies, Judges, setup operations, post-checks, budgets, and report policies before creating a TUI session.

#### Scenario: Unsupported field is declared
- **WHEN** a manifest contains an unknown schema version, field, kind, assertion, Judge, setup operation, or post-check
- **THEN** the run MUST return configuration invalid before TUI spawn
- **AND** the unsupported declaration MUST NOT be ignored or reported as passed metadata

### Requirement: Runtime configuration matrices prove effective configuration
The platform SHALL accept session-scoped immutable runtime and model profiles only when every setting is supported by the canonical TUI runtime configuration boundary.

#### Scenario: Requested profile is applied
- **WHEN** a case selects a runtime/model profile
- **THEN** facts MUST expose the effective configuration identity or digest needed to prove the selected settings
- **AND** a mismatch, unsupported field, missing setting, or default fallback MUST fail as configuration invalid

### Requirement: Hard gates prove behavior and no fallback
Cases SHALL use deterministic assertions for trigger/injection, model identity, process completion, output contract, artifacts, permissions, canonical path, and forbidden fallback before subjective quality is considered.

#### Scenario: Final answer looks correct through the wrong path
- **WHEN** output satisfies textual expectations but required path evidence is absent or a forbidden Skill, Tool, Model, adapter, legacy field, or fallback participated
- **THEN** the case MUST fail
- **AND** Judge quality MUST NOT override the failure

### Requirement: Artifact-producing cases prove durable artifacts
Cases expecting authored or generated outputs SHALL validate terminal task/tool results, stable artifact identity, format, provenance, revision/digest, owning validator status, and required content.

#### Scenario: Agent claims an artifact was created
- **WHEN** the final answer references an expected artifact
- **THEN** the case MUST verify the real file or stable ref and owning validator result
- **AND** cache paths, Webview URIs, runtime tokens, temp paths, or final-answer claims MUST NOT substitute for durable identity

### Requirement: Samples and workspaces are isolated
Model-driven suites SHALL preserve every repetition and SHALL isolate mutable session state, workspace fixtures, task outputs, reports, and resource cleanup per run.

#### Scenario: Variant or repetition completes
- **WHEN** a repeated or matrix run finishes, fails, cancels, or times out
- **THEN** its evidence and artifacts MUST remain attributable to that run
- **AND** mutable state or output from another run MUST NOT satisfy its assertions
