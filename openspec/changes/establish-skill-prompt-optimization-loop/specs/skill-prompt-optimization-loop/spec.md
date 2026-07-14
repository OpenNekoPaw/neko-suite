## ADDED Requirements

### Requirement: Optimization begins from Evaluation evidence and ownership

Prompt or Skill optimization SHALL cite platform report ids, failed/regressed cases, rubric dimensions, evidence refs, suspected owner, confidence, proposed target, expected improvement, and regression risks.

#### Scenario: Report attributes a Skill-content defect

- **WHEN** evidence confirms the defect belongs to Skill content, public description, or Prompt-owned guidance
- **THEN** an optimization proposal MAY target that content
- **AND** it MUST preserve unrelated runtime, Tool, Provider and artifact contracts

#### Scenario: Skill optimization target is selected

- **WHEN** an optimization proposal targets a Skill
- **THEN** it MUST identify the full Host Skill identity and base package fingerprint
- **AND** name-only, active-Skill, Market version, or mutable path fallback MUST NOT select the target

### Requirement: Non-Prompt defects route to canonical owners

The optimization loop SHALL NOT modify Prompt or Skill text to compensate for Capability/Tool, Runtime/Session, Provider, Artifact or Evaluation infrastructure defects.

#### Scenario: Task result observation fails

- **WHEN** a case fails because task observation, continuation, routing, Tool schema, provider access or artifact authoring is incorrect
- **THEN** the loop MUST produce an owning OpenSpec handoff or blocker
- **AND** it MUST NOT generate a Prompt candidate unless separate evidence proves a Prompt-owned defect

### Requirement: Candidates are reviewable artifacts and do not mutate canonical content

The optimization system SHALL generate an optimization plan and candidate patch artifact outside canonical Skill/Prompt paths.

#### Scenario: Candidate is proposed

- **WHEN** optimizer analysis proposes content changes
- **THEN** it MUST record Skill identity, base and candidate fingerprints, evidence, expected impact, risks, budget and required Evaluation matrix
- **AND** it MUST NOT edit or commit canonical content or activate the candidate automatically

### Requirement: Candidate application requires explicit human approval

Candidate application SHALL require a valid approval record and the normal OpenSpec/apply workflow.

#### Scenario: Candidate hash changes after approval

- **WHEN** an approved candidate artifact is modified
- **THEN** its candidate fingerprint MUST change and the approval MUST become invalid
- **AND** execution or candidate acceptance MUST stop until the new candidate is reviewed

### Requirement: Baseline and candidate execute in isolated real targets

Approved candidates SHALL be evaluated using isolated baseline and candidate revisions/worktrees/builds through the platform's canonical TUI path.

#### Scenario: Blind comparison runs

- **WHEN** baseline and candidate outputs are compared
- **THEN** both targets MUST use comparable fixtures, runtime/model profiles, sampling, budgets, validators and Judge policy
- **AND** the Judge MUST receive randomized evidence without checkpoint labels, revision identities or repository diffs

### Requirement: Candidate acceptance requires holdout and regression protection

A candidate SHALL NOT be accepted unless hard gates, optimizer-hidden holdout, existing regressions and configured quality thresholds pass without protected regression.

#### Scenario: Candidate improves visible development cases only

- **WHEN** a candidate improves optimizer-visible cases but fails holdout, canonical path, artifact checks or protected regression
- **THEN** candidate acceptance MUST be rejected
- **AND** the report MUST retain both improvement and rejection evidence

#### Scenario: Candidate decision is recorded

- **WHEN** candidate Evaluation reaches accepted or rejected
- **THEN** the optimization loop MUST append an evidence-linked development history checkpoint for the candidate fingerprint
- **AND** acceptance MUST NOT be interpreted as Market publication or package version assignment

### Requirement: Iteration is bounded and fail-visible

Optimization SHALL enforce candidate count, iteration count, timeout, token/cost and no-improvement limits.

#### Scenario: No candidate reaches acceptance

- **WHEN** limits are reached or consecutive candidates do not improve the approved metric
- **THEN** the loop MUST stop with a quality report and residual risk
- **AND** it MUST NOT select the least-failing candidate as success

#### Scenario: Provider cost is unavailable

- **WHEN** target, controller, or Judge provider cost cannot be established from Evaluation evidence
- **THEN** budget usage MUST preserve cost as unavailable and the candidate decision MUST be blocked
- **AND** missing cost MUST NOT be represented as zero or accepted as being within budget
