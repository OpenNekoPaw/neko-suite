## ADDED Requirements

### Requirement: Session facts expose typed Agent execution evidence
TUI debug automation SHALL expose typed Skill activation/injection, Tool, task, continuation, model, artifact, diagnostic, usage, timing, retry, and evidence-completeness facts available to the canonical TUI runtime.

#### Scenario: Agent executes a Skill workflow
- **WHEN** a Skill activates, injects content or tool policy, calls tools, creates tasks, observes results, or emits artifacts
- **THEN** `session.facts` MUST preserve associated session/turn/task identities, lifecycle status, stable refs and provenance needed for external path assertions
- **AND** each bounded fact collection MUST expose a dropped count when evidence is truncated

#### Scenario: Skill execution identity is projected
- **WHEN** a Skill participates in a turn
- **THEN** facts MUST expose its portable name, Host source/provenance/root/location and Host-computed package fingerprint when available
- **AND** facts MUST NOT infer local development identity from Market package version or mutable active selection

### Requirement: Session facts expose effective runtime configuration
Debug automation SHALL expose the effective session configuration identity or digest for generally supported runtime/model settings applied by canonical TUI assembly.

#### Scenario: Session is created with a runtime profile
- **WHEN** automation creates a session using supported session-scoped configuration
- **THEN** facts MUST identify the effective provider/model/profile and configuration digest needed to verify application
- **AND** unsupported or inconsistent configuration MUST fail visibly rather than fall back to active/default state

### Requirement: Debug automation remains Evaluation-neutral
Debug automation controls and facts SHALL contain runtime observations only and MUST NOT contain suite, case, variant, assertion, rubric, score, baseline, optimizer, pass/fail, or report concepts.

#### Scenario: External Evaluation needs a new rule
- **WHEN** an assertion can be computed from existing runtime facts
- **THEN** the assertion MUST be implemented in `scripts/agent-eval`
- **AND** no Evaluation result field may be added to TUI runtime facts

### Requirement: Debug evidence protects hidden and secret content
Debug automation SHALL redact credentials, hidden prompt bodies, unauthorized local content, secret-bearing provider configuration, cache/runtime handles, and unbounded binary payloads.

#### Scenario: Prompt composition is observed
- **WHEN** an external evaluator needs prompt path evidence
- **THEN** facts MAY expose fragment id, source, order, version and hash
- **AND** complete hidden prompts and provider credentials MUST NOT be projected
