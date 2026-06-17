## ADDED Requirements

### Requirement: OpenSpec validation evidence

Non-trivial changes SHALL connect requirements, design decisions, implementation tasks, validation commands, and residual risks in OpenSpec artifacts before implementation is considered complete.

#### Scenario: Non-trivial change is apply-ready

- **WHEN** an OpenSpec change is prepared for implementation
- **THEN** its tasks MUST identify validation evidence for changed contracts, Engine paths, Webview message paths, release packaging, or residual risk as applicable

### Requirement: Prelaunch breaking compatibility policy

Prelaunch changes SHALL treat breaks to unreleased internal contracts or draft formats as valid only when the break is explicit, validated, and recoverable.

#### Scenario: Prelaunch internal contract is broken

- **WHEN** a change breaks an unreleased internal API, DTO, Webview message, Agent workflow payload, fixture, or `nk*` draft format
- **THEN** the proposal, design, tasks, or PR notes MUST record what breaks, why compatibility shims are avoided, and whether old data is migrated, rebuilt, reimported, ignored, or intentionally discarded
- **AND** the change MUST NOT ignore runtime, security, or trust boundaries, or silently lose valuable local data

### Requirement: Repository quality gate

The repository SHALL expose a single quality gate command that runs machine-readable quality checks for code-debt ledgers, Agent boundaries, Route A boundaries, and release-channel metadata.

#### Scenario: CI runs quality gate

- **WHEN** CI executes the code-quality job for a TypeScript, workflow, script, or main-branch change
- **THEN** the job MUST run the repository quality gate and fail if any included quality check fails

### Requirement: Engine validation surface

Changes that affect Rust Engine actions, streams, file access, runtime state, native packaging, or EngineClient contracts SHALL include Engine-specific validation evidence.

#### Scenario: Engine runtime path changes

- **WHEN** a change modifies an Engine runtime path or its TypeScript client contract
- **THEN** the change MUST record targeted Rust tests, Proto/client validation, Engine smoke, fixture smoke, or explicit residual risk

### Requirement: Webview validation surface

Changes that affect Webview runtime behavior, Extension/Webview messaging, layout-critical UI, keyboard/focus behavior, or i18n SHALL include Webview-specific validation evidence.

#### Scenario: Webview message path changes

- **WHEN** a change modifies a Webview message path
- **THEN** the change MUST record message contract tests, focused package tests/builds, Webview smoke, VSCode smoke, screenshot evidence, or explicit residual risk

#### Scenario: Extension Webview visual or interaction changes

- **WHEN** a change modifies Extension Webview visuals, layout, user interaction, focus behavior, CSP-sensitive loading, media preview behavior, or VS Code lifecycle behavior
- **THEN** the default runtime validation MUST use an Extension Development Host observed through the `vscode-extension-debugger` Skill
- **AND** Chrome, the generic Browser plugin, Playwright, regular browser, or Vite localhost validation MUST NOT be used as the default runtime acceptance evidence unless the user explicitly requests browser-compatibility validation

### Requirement: Component reuse audit

Webview and React changes SHALL prefer enhancing existing components, hooks, shared primitives, or package-local adapters over generating parallel components.

#### Scenario: Webview component is added

- **WHEN** a change adds a Webview or React component
- **THEN** the proposal, design, tasks, PR notes, or delivery summary MUST record which existing `@neko/ui`, owning-package, adjacent-domain, and test surfaces were checked for reuse
- **AND** the record MUST explain why the existing component could not be enhanced safely through props, slots, variants, composition hooks, or package-local adapters
- **AND** the change MUST include focused validation for the new component or for the enhanced existing component

### Requirement: Pre-implementation feasibility check

High-risk or unclear feature requests SHALL include a feasibility check before broad implementation.

#### Scenario: L3 or L4 feature is proposed

- **WHEN** a proposed change is classified as L3 or L4
- **THEN** the proposal, design, or tasks MUST identify a spike, fixture, smoke, prototype, or failing test that proves the critical path is feasible before full implementation

### Requirement: Release-channel governance

Release, local development, canary, beta, stable, and disabled/dev-only package eligibility SHALL be represented in machine-readable quality configuration.

#### Scenario: Release channel metadata is validated

- **WHEN** release-channel metadata is changed
- **THEN** the release-channel validation script MUST verify package names, channel identifiers, promotion rules, and disabled/dev-only rationale before CI passes

### Requirement: Release packaging fail-closed

Release and main-branch packaging workflows SHALL fail when a package VSIX build fails or when expected artifacts are missing.

#### Scenario: Package VSIX command fails

- **WHEN** `vsce package` fails for a package included in release packaging
- **THEN** the workflow MUST fail and surface the failing package instead of continuing silently

### Requirement: OpenSpec CI validation

CI SHALL validate active OpenSpec changes and stable specs when OpenSpec artifacts change.

#### Scenario: OpenSpec artifacts change

- **WHEN** a pull request or push changes files under `openspec/`
- **THEN** CI MUST run OpenSpec validation and fail on invalid proposals, specs, designs, or task artifacts

### Requirement: VS Code debugger Skill smoke

Local and pre-release validation SHALL include a VS Code debugger smoke path that records Skill-based evidence for a running Extension Development Host or visible Webview without requiring VSIX installation.

#### Scenario: Debugger Skill smoke runs

- **WHEN** a VS Code debugger Skill smoke is requested
- **THEN** the harness MUST connect to an existing VS Code remote debugging port, verify observable VS Code page targets, optionally require visible Webview targets or target matchers, and record the Skill file used for the test evidence or an explicit failure

#### Scenario: Webview runtime smoke runs

- **WHEN** Webview runtime smoke is requested
- **THEN** the harness MUST route through the VS Code debugger Skill smoke path and require a visible Webview target by default
- **AND** the harness MUST NOT open Chrome, the generic Browser plugin, Playwright, or a regular browser as the default validation surface

### Requirement: Strict TypeScript extension baselines

Extension packages SHALL not disable TypeScript `strict` or `strictNullChecks` once their strict baseline is closed.

#### Scenario: Extension strict config is checked

- **WHEN** quality gates inspect extension package tsconfig files
- **THEN** `neko-agent` extension and `neko-market` extension MUST have `strict` and `strictNullChecks` enabled, or the gate MUST report the package as an active strict-mode gap with owner and follow-up validation
