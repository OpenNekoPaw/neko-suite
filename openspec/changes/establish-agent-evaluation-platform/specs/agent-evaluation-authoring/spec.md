## ADDED Requirements

### Requirement: Agent behavior changes declare an Evaluation decision
Every change that can alter Prompt, Skill, Capability, Tool, Provider/Model, AgentSession, task/recovery, artifact, or TUI Agent behavior SHALL record exactly one `reuse`, `update`, `create`, or `excluded` Evaluation decision for each affected behavior.

#### Scenario: New model-driven behavior is proposed
- **WHEN** an OpenSpec adds or changes model-driven Agent behavior
- **THEN** its Evaluation decision MUST identify the owning suite or the new suite to create
- **AND** an `excluded` decision MUST identify a deterministic non-Agent validation path and explain why real Agent behavior cannot change

### Requirement: Evidence contracts precede scenario prompts
An Evaluation case SHALL define user behavior, canonical runtime path, observable evidence, forbidden fallback, expected result, and expected failure before its test prompt or controller flow is accepted.

#### Scenario: Case has no path evidence
- **WHEN** a proposed case can only assert final-answer text and cannot prove the required Skill, Tool, Model, task, or artifact path
- **THEN** authoring validation MUST reject the case as incomplete evidence
- **AND** it MUST NOT silently downgrade the case to generic completion

### Requirement: Coverage deltas are explicit
Evaluation authoring SHALL map each changed contract to applicable canonical, paraphrase, boundary, failure, workflow, artifact, quality, regression, and holdout groups.

#### Scenario: Artifact-producing Skill changes
- **WHEN** a Skill change can create or update a durable artifact
- **THEN** the coverage delta MUST include a canonical positive case, a negative or fail-visible case, an artifact validation case, and applicable regressions
- **AND** omitted groups MUST be marked not applicable with a reason

### Requirement: Missing observability blocks acceptance
Authoring SHALL verify that every required assertion is supported by executable runner semantics and available runtime facts or deterministic post-checks.

#### Scenario: Runtime does not expose required evidence
- **WHEN** a case requires evidence that current debug facts and public validators cannot provide
- **THEN** the case MUST be reported as blocked by missing observability
- **AND** metadata, manual assumption, weak text matching, or silent fallback MUST NOT substitute for the missing evidence

### Requirement: Change-to-suite selection is deterministic and reviewable
The repository SHALL provide a change-to-suite selector for known Prompt, Skill, Capability/Tool, Provider/Model, AgentSession, task/recovery, TUI facts, and evaluation-platform ownership paths.

#### Scenario: Changed path has no suite mapping
- **WHEN** the selector encounters a behavior-affecting path without a suite owner or explicit exclusion
- **THEN** validation MUST fail with an unmapped-coverage diagnostic
- **AND** it MUST NOT choose an unrelated default suite
