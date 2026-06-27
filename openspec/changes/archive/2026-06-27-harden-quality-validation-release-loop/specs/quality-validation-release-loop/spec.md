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

#### Scenario: Canonical replacement is introduced

- **WHEN** a change introduces a canonical replacement for an unreleased internal API, DTO, Webview message, Agent workflow payload, fixture, command, or `nk*` draft format
- **THEN** obsolete compatibility shims, legacy adapters, fallback branches, dual-read/dual-write paths, old field mappings, and legacy command aliases MUST be removed, disabled, or converted to fail-closed diagnostics by default
- **AND** any retained compatibility path MUST name an owner, replacement path, validation command, removal condition, and expiry task
- **AND** development and validation defaults MUST disable compatibility fallback for the new path, so a legacy-path hit MUST throw, return a fail-closed diagnostic, or emit assertable telemetry/log failure instead of returning a legacy success result
- **AND** only tests explicitly scoped to migration, rejection, or diagnostics MAY intentionally observe the retained legacy path
- **AND** new-path acceptance MUST include path-level evidence that the canonical path, new handler, new renderer, new adapter, or new contract was hit
- **AND** result-only tests that can pass through fallback behavior MUST NOT count as new-path acceptance evidence
- **AND** tests MUST prove retained legacy paths did not participate by using a spy, counter, log assertion, or poisoned legacy path that throws
- **AND** validation MUST prove the canonical path is hit by default and the legacy path cannot return success for new-path requests or mask new-path failure

### Requirement: Repository quality gate

The repository SHALL expose a single quality gate command that runs machine-readable quality checks for code-debt ledgers, Agent boundaries, Route A boundaries, and release-channel metadata.

#### Scenario: CI runs quality gate

- **WHEN** CI executes the code-quality job for a TypeScript, workflow, script, or main-branch change
- **THEN** the job MUST run the repository quality gate and fail if any included quality check fails

### Requirement: Residual and redundant code validation

Development validation SHALL include residual/debt and unused-code checks when a change touches legacy terms, compatibility paths, or redundant code.

#### Scenario: Residual or redundant code changes

- **WHEN** a change adds, modifies, or removes `legacy`, `fallback`, `deprecated`, `compat`, `shim`, `dirty`, `hack`, `temporary`, `workaround`, dead code, unused code, or duplicate implementation surfaces
- **THEN** the validation evidence MUST record `pnpm check:legacy-debt` and `pnpm check:unused`, or record that `pnpm ci:local` / `pnpm check:quality` covered the relevant checks
- **AND** new residual/debt matches MUST be removed, renamed, or recorded in the appropriate debt ledger with owner, replacement, validation, and removal criteria

### Requirement: Local-client proportional design

Neko Suite changes SHALL keep architecture and defensive code proportional to a local VSCode client plus local Rust Engine.

#### Scenario: New abstraction or defensive layer is introduced

- **WHEN** a change introduces an interface, factory, registry, strategy, plugin hook, feature flag, configuration layer, protocol layer, fallback, retry, cache, validation guard, or broad error handler
- **THEN** the proposal, design, PR notes, or delivery summary MUST explain the real local client/engine boundary, current caller, external provider, release, or trust boundary that requires it
- **AND** cloud multi-tenant, distributed-service, remote-scale, or speculative future requirements MUST NOT justify extra layers unless they map to a real external provider, marketplace/release, security, or user-data boundary
- **AND** defensive code MUST fail visibly for development errors and MUST NOT hide them behind silent defaults, broad catch blocks, no-op guards, repeated validation, or fallback success

### Requirement: Fail-visible defects

Code defects and contract violations SHALL be surfaced directly instead of hidden by fallback, compatibility, or no-op behavior.

#### Scenario: Development error or contract violation is encountered

- **WHEN** code encounters a missing new implementation, contract mismatch, unreachable state, illegal message, unknown schema/version, bad configuration, missing dependency, or unregistered handler, renderer, or adapter
- **THEN** it MUST throw, return a typed diagnostic, or fail the test visibly
- **AND** it MUST NOT return empty data, default success, no-op, silently degrade, or fall back to old compatibility behavior unless the path is explicitly scoped to user-data recovery, migration, external provider degradation, release compatibility, or security/trust handling

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

### Requirement: Shared foundation audit

Changes that introduce or modify cross-cutting behavior SHALL prefer existing shared foundations and domain services over package-local parallel implementations.

#### Scenario: Cross-cutting behavior is introduced

- **WHEN** a change introduces or modifies component styling, theming, i18n, logging, errors/diagnostics, config, paths, project file save/load, resource authorization, cache, DTOs, or cross-package contracts
- **THEN** the proposal, design, tasks, PR notes, or delivery summary MUST record whether `@neko/shared`, `@neko/ui`, `@neko/neko-client`, `@neko/proto`, entity/search services, project-file-io, resource cache, or another domain service was reused or updated
- **AND** package-local parallel implementations of design systems, theme tokens, i18n runtimes, logger/error taxonomies, project file IO, cache managers, path resolvers, Engine HTTP/WS clients, or shared DTOs MUST be avoided unless the owning boundary and extraction criteria are documented
- **AND** the change MUST include focused validation for the reused or updated shared foundation, or document residual risk and follow-up

### Requirement: Cross-package capability reuse audit

Changes that introduce reusable package capability patterns SHALL audit adjacent packages and shared layers before adding package-local implementations.

#### Scenario: Reusable package capability is introduced

- **WHEN** a change introduces or modifies a provider, registry, bridge, protocol, message router, status bar, tree view, file decoration, history, selection, recent items, projector, facade, command router, capability provider, store slice, workflow adapter, or similar package capability pattern
- **THEN** the proposal, design, tasks, PR notes, or delivery summary MUST record which adjacent packages and shared layers were checked for equivalent behavior, interaction patterns, host adapters, protocol shapes, or reusable tests
- **AND** if two or more packages need the same pattern, the change MUST prefer a neutral shared contract, domain service, adapter factory, registry, strategy, hook, test utility, or `@neko/ui` primitive
- **AND** the change MUST NOT copy another feature package implementation or import another feature package's internals; reuse MUST go through shared packages, public subpaths, command/API facades, ports, provider registries, or domain services
- **AND** package-local implementations MUST document why responsibility, lifecycle, domain semantics, dependency direction, or runtime environment prevents shared extraction, plus extraction criteria and validation commands

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
