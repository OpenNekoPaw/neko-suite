## ADDED Requirements

### Requirement: Creative media workflow changes receive path-level quality validation
Changes to creative media Skills, capability routing, Storyboard contracts, provider operation support, quality evaluators, project validators, production orchestration, or export Gates SHALL receive validation proportional to the affected canonical path. Harness self-tests alone MUST NOT be reported as evidence of real Agent or media workflow behavior.

#### Scenario: Skill routing or content changes
- **WHEN** a change modifies canonical creative Skill metadata, prompt content, profile routing, capability activation, provider/model selection, validation/recovery, or AgentSession workflow behavior
- **THEN** implementation evidence SHALL include focused scripted Agent evaluation using the repository Agent evaluation Skill
- **AND** `pnpm test:agent:eval` MAY be listed only as key-free harness self-validation.

#### Scenario: Project Gate changes
- **WHEN** a change modifies `.nk*` validation, project authoring, revision invalidation, pre-export, export, or post-export behavior
- **THEN** tests SHALL assert the canonical owning validator/authoring/export path was invoked
- **AND** legacy Webview, path-only, or stage-Skill paths SHALL be poisoned or otherwise proven absent.

### Requirement: Media and Engine validation matches the changed boundary
The implementation SHALL run the minimum necessary package tests and expand validation according to affected boundaries, including Rust tests for Engine media analysis and Extension Development Host smoke for Webview runtime behavior. Browser-only testing MUST NOT be accepted as proof of VSCode Webview correctness.

#### Scenario: FFmpeg probe or frame analysis changes
- **WHEN** implementation changes Rust/Engine codec probe, extraction, decode, loudness, black-frame, or frozen-frame behavior
- **THEN** verification SHALL include focused cargo tests and representative media fixtures
- **AND** TypeScript mocks alone SHALL not be considered sufficient.

#### Scenario: Quality UI evidence projection changes
- **WHEN** implementation changes how quality evidence, stale state, approval, or Gate diagnostics render in a VSCode Webview
- **THEN** verification SHALL include Extension Development Host runtime smoke using the VSCode extension debugger path.
