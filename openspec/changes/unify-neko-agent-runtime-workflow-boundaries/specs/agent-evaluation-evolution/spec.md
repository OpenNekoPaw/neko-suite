## ADDED Requirements

### Requirement: Ablation toggles cover agent workflow capabilities
The system SHALL expose independent ablation toggles for IDC workflow, plan mode profile, skill discovery, skill injection, dynamic tool sets, capability protocol enforcement, prompt fragments, prompt/schema generator, subagent orchestration, multimodal context injection, evaluator hints, memory recall, and retry/validation hooks.

#### Scenario: Skill discovery and injection can be separated
- **WHEN** an experiment disables skill injection but leaves skill discovery enabled
- **THEN** registry metrics still show discovered skills while generated prompts and tool schemas omit skill-injected content

#### Scenario: Subagent orchestration can be disabled
- **WHEN** an experiment disables subagent orchestration
- **THEN** workflow runtime uses the non-subagent fallback path or records an unavailable capability reason

### Requirement: Evaluation records comparable metrics
The system SHALL record comparable metrics for baseline and variant runs, including latency, token usage, tool calls, tool success/failure, retry count, workflow node completion, task completion, approval interruptions, generated artifacts, evaluator scores, and custom media quality evidence.

#### Scenario: Workflow comparison includes node metrics
- **WHEN** an experiment compares baseline and no-skill-injection variants
- **THEN** the comparison includes per-node completion, latency, tool usage, and evaluator outcome

### Requirement: Prompt and schema artifacts are captured for experiments
The system SHALL capture generated prompt/schema snapshots or stable hashes for experiment runs. Captured artifacts MUST be linkable to workflow run, node, model/provider, active skill, capability injection set, and ablation variant.

#### Scenario: Prompt hash differs by variant
- **WHEN** a prompt fragment is ablated
- **THEN** the experiment output records the changed prompt/schema hash or snapshot reference

### Requirement: Dynamic evolution changes are auditable
The system SHALL record capability additions, removals, version changes, prompt fragment changes, schema changes, workflow definition changes, and provider card changes in a way that can be inspected during debugging or experiments.

#### Scenario: Market skill update appears in evolution log
- **WHEN** a market skill is updated and its prompt fragment changes
- **THEN** runtime records the capability version and fragment change used by subsequent workflow runs

### Requirement: Evaluation does not become a user-facing stage
The system SHALL keep ablation and evaluation infrastructure outside the normal IDC stage sequence. Evaluator nodes MAY exist inside explicit test/eval workflows, but ordinary user PlanMode MUST remain Draft, Plan, Apply unless a user explicitly requests evaluation behavior.

#### Scenario: PlanMode remains three-stage
- **WHEN** a normal user enables PlanMode
- **THEN** the workflow does not insert an ablation or evaluation stage into the user-facing IDC sequence

### Requirement: Evaluation harness is host-agnostic
The system SHALL allow evaluation and ablation runs to execute in tests or CLI-like environments with mocked host adapters. The harness MUST NOT require VSCode Webview to collect core metrics.

#### Scenario: Experiment runs without Webview
- **WHEN** a test runs a workflow experiment with mock adapters
- **THEN** it collects metrics and outputs comparison data without constructing a Webview
