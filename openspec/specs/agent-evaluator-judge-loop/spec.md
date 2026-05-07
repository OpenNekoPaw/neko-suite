# agent-evaluator-judge-loop Specification

## Purpose
TBD - created by archiving change harden-neko-agent-runtime-workflow-closure. Update Purpose after archive.
## Requirements
### Requirement: Evaluation harness runs schema-bound evaluator nodes
The system SHALL extend the evaluation harness with evaluator runner contracts that produce schema-bound evaluator results. Evaluator results MUST include score, pass/fail, reasons, evidence references, metrics, correction hints, and optional recovery signals.

#### Scenario: Deterministic evaluator returns compliance result
- **WHEN** a deterministic asset or spec compliance evaluator runs against a workflow artifact
- **THEN** it returns a schema-bound result with pass/fail, score, reasons, metrics, and evidence references

#### Scenario: Evaluator result links to workflow node
- **WHEN** an evaluator assesses a workflow node output
- **THEN** the result links to workflow definition, run id, node id, model/provider variant, prompt/schema snapshot, and artifact evidence

### Requirement: LLM-as-judge is a pluggable evaluator adapter
The system SHALL support LLM-as-judge through a pluggable Platform or AI SDK adapter. The adapter MUST produce the same evaluator result schema as deterministic evaluators and MUST record model/provider identity and prompt/schema hash.

#### Scenario: Mock judge produces structured result
- **WHEN** tests run the evaluator harness with a mock judge adapter
- **THEN** the harness records a structured judge result without requiring network access or VSCode Webview

#### Scenario: Judge adapter records provider identity
- **WHEN** a configured LLM judge runs
- **THEN** the evaluator result records provider id, model id, variant id, and prompt/schema snapshot reference

### Requirement: Evaluator correction hints feed recovery without becoming normal IDC stage
The system SHALL expose evaluator correction hints and recovery signals to workflow runtime or experiments without inserting evaluation into ordinary PlanMode Draft / Plan / Apply. Normal user PlanMode MUST remain a three-stage IDC workflow unless the user explicitly requests evaluation behavior.

#### Scenario: Normal PlanMode excludes evaluator stage
- **WHEN** a user enables normal PlanMode
- **THEN** workflow runtime does not automatically insert evaluator or ablation nodes into the user-facing IDC stage sequence

#### Scenario: Explicit evaluation workflow can request recovery
- **WHEN** an explicit evaluation workflow receives a failed evaluator result
- **THEN** it may emit a recovery signal such as retry node, regress stage, restart run, or escalate user

### Requirement: Evaluator comparison captures quality deltas
The system SHALL compare baseline and variant evaluator results in addition to existing token, latency, prompt hash, and omitted capability metrics.

#### Scenario: Variant quality regression is visible
- **WHEN** a no-multimodal-context variant reduces evaluator score compared with baseline
- **THEN** the comparison output reports the quality delta and linked evidence reasons

