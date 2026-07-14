## ADDED Requirements

### Requirement: Evaluation reports are versioned and evidence-linked
Every real Evaluation SHALL produce versioned result, evidence, artifact manifest, and human-readable quality report artifacts, with Judge and baseline diff artifacts when those stages execute.

#### Scenario: Evaluation terminates
- **WHEN** a run passes, fails, cannot execute, or cannot be compared
- **THEN** the report MUST identify suite/case/run, target and model identities, effective configuration, fixture digest, commands, assertions, artifact evidence, usage/cost, result locations, skipped stages, and residual risk
- **AND** outcome MUST be pass, case fail, infrastructure fail, configuration invalid, or non-comparable

### Requirement: Hard gates precede subjective quality
The platform SHALL compute deterministic hard-gate status before applying subjective Judge scores.

#### Scenario: Judge scores an invalid path highly
- **WHEN** canonical path, process, output contract, artifact, permission, evidence completeness, or no-fallback fails but Judge quality is high
- **THEN** the case MUST remain failed
- **AND** Judge output MUST be marked supplemental rather than corrective

### Requirement: Judge input is restricted and reproducible
Judges SHALL receive only an allowlisted evidence projection and SHALL record provider, model, profile, rubric, prompt hash, sampling parameters, evidence refs, score reasons, and uncertainty.

#### Scenario: Judge evaluates output or artifact quality
- **WHEN** subjective quality scoring executes
- **THEN** it MAY receive user intent, public target contract, assistant output, approved artifact summaries, domain QualityEvidence, and hard-gate results
- **AND** it MUST NOT receive hidden prompts, credentials, unredacted internal logs, unauthorized local files, candidate labels, or repository diffs

### Requirement: Failure attribution distinguishes facts from hypotheses
Reports SHALL separate observed failures from suspected owning layer, confidence, missing evidence, and recommended handoff.

#### Scenario: Failure cause is not proven
- **WHEN** evidence shows an output defect but cannot distinguish Prompt, routing, Tool, runtime, provider, or artifact ownership
- **THEN** the report MUST record an unconfirmed attribution with confidence and missing evidence
- **AND** it MUST NOT present the suspected owner as an established root cause

### Requirement: Baselines are approved, sanitized, and comparable
Baselines SHALL bind target identity/content fingerprint, repository revision, fixture digest, runtime/model profiles, sampling/budget policy, validator/Judge identity, hard gates, score distribution, report id, approver, and approval time.

#### Scenario: Skill baseline is recorded
- **WHEN** Evaluation records a baseline for a local Skill development checkpoint
- **THEN** it MUST record portable name, Host source/provenance/root/location and Host-computed fingerprint
- **AND** it MUST NOT create or update a Market package id, semver, publication or installation record

#### Scenario: Comparison inputs differ materially
- **WHEN** baseline and current runs differ in a required comparability dimension without an explicit policy allowance
- **THEN** the platform MUST return non-comparable
- **AND** it MUST NOT calculate or claim an improvement percentage

### Requirement: Raw evidence and committed summaries have separate retention
Raw reports SHALL remain local or trusted-CI artifacts, while committed baselines and OpenSpec/PR summaries SHALL contain only approved sanitized evidence.

#### Scenario: Report is prepared for commit or sharing
- **WHEN** Evaluation evidence leaves the local gitignored report directory
- **THEN** secrets, hidden prompts, machine-specific absolute user paths, unauthorized content, and raw provider configuration MUST be removed
- **AND** stable case/run ids and evidence references MUST remain sufficient for audit
