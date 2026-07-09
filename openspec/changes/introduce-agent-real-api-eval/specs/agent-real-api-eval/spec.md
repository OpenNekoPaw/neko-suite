## ADDED Requirements

### Requirement: Eval runs only real API Agent scenarios
`neko eval` SHALL execute real API Agent scenarios through the existing TUI/headless runtime path. It MUST NOT provide a mock execution lane, register eval-only fake business tools, silently fall back to mock providers, or call package-internal business functions as a substitute for real Agent behavior.

#### Scenario: Eval requires real provider configuration
- **WHEN** `neko eval` starts a scenario
- **THEN** it MUST resolve provider and model configuration through the real TUI/headless config path
- **AND** missing credentials, missing provider, missing model, disabled model, or provider/model mismatch MUST fail visibly before the scenario is marked successful
- **AND** the run MUST NOT fall back to another provider, another model, mock service, or default success result

#### Scenario: Eval does not use fake business tools
- **WHEN** an eval case validates a Skill, capability, task, artifact, or model behavior
- **THEN** it MUST invoke the real Agent runtime path for that behavior
- **AND** it MUST NOT register eval-only fake tools or directly call package-internal business implementations to produce a passing result

### Requirement: Eval uses one real AgentSession per case
Each eval case SHALL execute through one real `AgentSession` and one conversation. Sequential and feedback turns MUST share the same AgentSession history, Skill lifecycle, task context, and runtime state.

#### Scenario: Sequence turns share conversation
- **WHEN** an eval case defines multiple sequential turns
- **THEN** every turn MUST execute in the same conversation id
- **AND** later turns MUST observe prior conversation history through the AgentSession rather than through manual prompt concatenation only

#### Scenario: Single mode uses same session assembly
- **WHEN** an eval case defines one prompt
- **THEN** the prompt MUST execute through the same headless AgentSession assembly used by multi-turn eval
- **AND** the result MUST record the selected provider, selected model, conversation id, output, and status

### Requirement: Eval v1 supports single sequence and feedback-lite modes
Eval v1 SHALL support `single`, `sequence`, and `feedback-lite` modes. Unsupported modes MUST fail manifest validation before provider invocation.

#### Scenario: Single case executes one prompt
- **WHEN** a manifest case uses mode `single`
- **THEN** eval MUST execute exactly one target turn
- **AND** it MUST produce a result with one recorded turn

#### Scenario: Sequence case executes prompts in order
- **WHEN** a manifest case uses mode `sequence`
- **THEN** eval MUST execute the listed prompts in manifest order
- **AND** it MUST stop on a non-retriable case failure, infrastructure failure, or manifest/config failure

#### Scenario: Feedback-lite case generates follow-up prompts
- **WHEN** a manifest case uses mode `feedback-lite`
- **THEN** eval MAY call a configured real controller model to generate follow-up prompts
- **AND** each controller-generated prompt MUST be recorded before the target turn executes

### Requirement: Feedback controller reads only eval-produced results
The feedback controller SHALL generate follow-up prompts from eval-produced facts only. It MUST NOT read hidden system prompts, AGENTS content, Skill source text, provider secrets, runtime internals, private logs, `.neko` backing files, cache manifests, or Webview/VS Code private state.

#### Scenario: Controller receives eval history
- **WHEN** eval asks the controller model for the next prompt
- **THEN** the controller input MUST be built from recorded eval facts such as prior prompts, outputs, generated prompts, judge results, artifact summaries, task summaries, and error status
- **AND** the controller output prompt MUST be persisted in the eval result

#### Scenario: Controller API unavailable
- **WHEN** the controller provider, model, credentials, network, or API is unavailable
- **THEN** eval MUST classify the run as infrastructure failure
- **AND** it MUST NOT substitute a fixed prompt, mock controller, or another provider/model

### Requirement: Judge model evaluates quality
Eval SHALL use a real judge model for quality review when a scenario requires quality judgment. The judge is the evaluator by default and MUST NOT be treated as the target under test unless the manifest explicitly defines a judge-focused case in a future capability.

#### Scenario: Judge reviews target output
- **WHEN** an eval case includes a quality check
- **THEN** eval MUST call the configured real judge model with eval-produced results and the configured rubric or case context
- **AND** the judge verdict, score or pass/fail decision, and reason MUST be recorded in the result

#### Scenario: Judge API unavailable
- **WHEN** the judge provider, model, credentials, network, or API is unavailable
- **THEN** eval MUST classify the run as infrastructure failure
- **AND** it MUST NOT use target output text alone as a quality pass

### Requirement: Skill trigger checks require observable activation
Eval Skill cases SHALL distinguish command-triggered Skill activation from natural-language-triggered Skill activation. Natural-language trigger cases MUST require observable Agent-initiated activation of the target Skill.

#### Scenario: Command trigger activates Skill
- **WHEN** an eval case uses command trigger for a Skill
- **THEN** eval MUST invoke the real explicit Skill activation path
- **AND** the result MUST record that the target Skill was activated through the canonical Skill lifecycle path

#### Scenario: Natural language trigger activates Skill
- **WHEN** an eval case uses natural-language trigger for a Skill
- **THEN** eval MUST send the prompt as natural language without pre-activating the Skill
- **AND** the Agent MUST activate the target Skill through the canonical Agent-owned activation path
- **AND** missing activation MUST fail the case even if final output appears acceptable

### Requirement: Eval records mandatory result facts
Eval v1 SHALL write `manifest.json`, `result.json`, and `summary.md`. The structured result MUST include enough facts to audit the real path without requiring detailed event or token logs.

#### Scenario: Result records required facts
- **WHEN** an eval case finishes
- **THEN** `result.json` MUST include schema, case id, status, failure kind, exit code, conversation id, selected models, turns, prompts, outputs, generated controller prompts, Skill activation summaries, artifact summaries, task summaries, judge result, and error counters when applicable
- **AND** API keys, tokens, auth headers, provider secrets, and secret-bearing config values MUST be redacted

#### Scenario: Detailed logs are omitted by default
- **WHEN** eval writes v1 output artifacts
- **THEN** it MUST NOT require detailed event logs, token streams, tool trace logs, or UI render logs to determine pass/fail
- **AND** missing detailed logs MUST NOT prevent artifact, Skill, model, task, judge, or turn facts from being recorded

### Requirement: Artifact checks are existence and format checks
Eval v1 SHALL limit local artifact checks to existence and format validation. Artifact quality MUST be evaluated by the real judge model or future owning-domain validators, not by eval-owned business heuristics.

#### Scenario: Artifact exists
- **WHEN** an eval case requires an artifact
- **THEN** eval MUST verify that the artifact reference recorded by the runtime is present and resolves through the allowed local/headless artifact path
- **AND** missing artifact facts or missing artifact content MUST fail the case

#### Scenario: Artifact format matches
- **WHEN** an eval case declares an expected artifact format
- **THEN** eval MUST validate the artifact format using a narrow format check
- **AND** it MUST NOT claim quality success from local heuristic scoring

### Requirement: Eval classifies failures with stable exit codes
Eval SHALL map final status to stable process exit codes: `0` for pass, `1` for case failure, `2` for infrastructure failure, and `3` for manifest/config invalid.

#### Scenario: Case fails
- **WHEN** the real Agent path executes but required checks fail, Skill activation is missing, judge fails the output, artifact checks fail, or controller-generated prompts lead to unmet scenario goals
- **THEN** eval MUST exit with code `1`
- **AND** the result MUST classify the failure as case failure

#### Scenario: Infrastructure fails
- **WHEN** provider, target, controller, judge, network, or API availability fails beyond configured retry limits
- **THEN** eval MUST exit with code `2`
- **AND** the result MUST classify the failure as infrastructure failure

#### Scenario: Manifest or config invalid
- **WHEN** the manifest schema is invalid, workDir is missing, mode is unsupported, check kind is unknown, Skill is missing, model config is invalid, or required controller/judge configuration is absent before execution
- **THEN** eval MUST exit with code `3`
- **AND** it MUST NOT invoke the target provider for that invalid case

### Requirement: Eval uses bounded retry counters
Eval v1 SHALL use a simple bounded retry policy for transient real API errors. The default policy MUST be at most two attempts per turn and at most two consecutive errors before infrastructure failure unless the manifest sets stricter limits.

#### Scenario: Transient error retried
- **WHEN** a target, controller, or judge call fails with a retryable transient error and the attempt limit is not exhausted
- **THEN** eval MAY retry the call
- **AND** it MUST record attempt count and transient error count in the result

#### Scenario: Consecutive errors exceed limit
- **WHEN** consecutive retryable errors reach the configured limit
- **THEN** eval MUST stop the case as infrastructure failure
- **AND** it MUST preserve the diagnostic that explains which model role failed
