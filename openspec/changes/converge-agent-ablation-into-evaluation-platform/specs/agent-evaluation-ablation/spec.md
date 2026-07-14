## ADDED Requirements

### Requirement: Ablation is an Agent Evaluation mode
Developer ablation SHALL use the shared Agent Evaluation suite, TUI driver, fixtures, hard gates, Judge, metrics, reports, baseline and comparison contracts.

#### Scenario: Ablation matrix runs
- **WHEN** a baseline and one or more variants are evaluated
- **THEN** every run MUST execute through canonical TUI debug automation with isolated session/workspace state
- **AND** direct AgentSession execution or an ablation-specific runner MUST NOT count as behavior or quality evidence

#### Scenario: Canonical TUI executable starts
- **WHEN** Evaluation launches the source or isolated built TUI through its supported Node entrypoint
- **THEN** host-neutral workspace package subpaths and raw-TypeScript dependencies MUST resolve through explicit ESM/package and bundle contracts
- **AND** Node built-in specifiers MUST retain the `node:` protocol when the bare package name is not equivalent
- **AND** a built entrypoint MUST invoke the real CLI main guard and answer a real `session.create` request rather than only load and exit successfully
- **AND** initialization rejection MUST expose its owning diagnostic without waiting for the readiness timeout
- **AND** Evaluation MUST NOT add a loader fallback, runtime marker or alternate session entrypoint to bypass a product packaging defect

### Requirement: Configuration ablation uses supported runtime profiles
Configuration variants SHALL contain only session-scoped settings supported by canonical Agent/TUI runtime configuration.

#### Scenario: Configuration variant is selected
- **WHEN** a variant changes a supported model, budget, execution, memory/context, Skill or Capability setting
- **THEN** facts MUST prove the effective configuration identity/digest
- **AND** unspecified profile fields MUST preserve the loaded session defaults rather than overwrite them with `undefined`
- **AND** unknown, unapplied or default-fallback configuration MUST fail visibly

### Requirement: Implementation ablation uses isolated executable revisions
Removing or replacing an internal implementation that is not a supported product configuration SHALL be tested through isolated revision/worktree/build targets.

#### Scenario: Skill injection implementation is removed for comparison
- **WHEN** the compared behavior is not a real supported off-state
- **THEN** the variant MUST execute a distinct isolated build through the same TUI driver
- **AND** the selected development checkpoint MUST implement the current scenario evidence contract or the comparison MUST be configuration-invalid
- **AND** production runtime MUST NOT gain an eval-only feature flag, marker, no-op branch or fallback for the experiment

### Requirement: Skill ablation preserves development identity
Skill-targeted ablation SHALL bind base and variants to the platform's Host-owned Skill identity and package fingerprints and SHALL link resulting evidence to explicit development history checkpoints.

#### Scenario: Skill content variant is compared
- **WHEN** ablation compares two content snapshots of a Skill
- **THEN** the run MUST record the same Host identity with distinct base/variant fingerprints, or an explicit rename/move lineage
- **AND** it MUST NOT use or create a Market package version, publication state, or name-only identity

### Requirement: Runtime owns raw facts and Evaluation owns comparison
Agent runtime SHALL own valid configuration application and raw usage/timing/tool/task/artifact observations, while Evaluation SHALL own repetitions, aggregation, quality scoring and variant deltas.

#### Scenario: Ablation report compares performance and quality
- **WHEN** all variant samples finish
- **THEN** the report MUST retain every sample and separately report correctness hard gates, execution-efficiency metrics, and applicable output-content rubric scores from real model output
- **AND** only actual suite-owned rubric, owning-domain validator or blind-Judge evidence MAY produce an output-content quality score or delta
- **AND** format/schema/path pass rate, tokens/cost, latency, iterations and Tool/retry/task metrics MUST NOT be mapped to content quality or described as model quality improvement
- **AND** it MUST NOT select only successful runs or let performance gains override correctness failure

#### Scenario: Content quality is not evaluated
- **WHEN** an ablation plan declares `hard-gates-only`
- **THEN** quality MUST remain explicitly unavailable or not evaluated even when every deterministic gate passes
- **AND** the result MUST NOT infer quality from final-answer presence, required-field matches or execution-efficiency metrics

#### Scenario: Content quality rubric is selected
- **WHEN** an ablation plan declares `scenario-rubric`
- **THEN** its rubric reference MUST exactly match the selected indexed scenario and suite-owned rubric
- **AND** every available quality sample MUST come from the real output Judge stage after hard gates pass
- **AND** a missing or mismatched rubric/Judge profile MUST fail authoring before TUI execution

### Requirement: Variant matrices are focused and attributable
Ablation suites SHALL default to baseline plus single-dimension variants and SHALL add combinations only for evidenced interactions.

#### Scenario: Variant changes multiple unrelated dimensions
- **WHEN** a proposed variant cannot attribute its result to one responsibility or an explicitly documented interaction
- **THEN** authoring validation MUST reject or split the variant
- **AND** it MUST NOT run an unbounded Cartesian product by default

### Requirement: Existing presets are reclassified before migration
Every existing ablation toggle and preset SHALL be classified as supported configuration, implementation revision, obsolete, or not applicable before migration.

#### Scenario: Legacy preset is migrated
- **WHEN** an existing preset remains valuable
- **THEN** its new suite case MUST define expected path, forbidden fallback, effective configuration or build identity, performance metrics and quality rubric
- **AND** hard gates and the user prompt MUST NOT reintroduce the guidance or behavior being removed by the variant
- **AND** the old name or toggle MUST NOT remain as an alternate runtime success path
