## 1. Baseline Audit and Feasibility

- [x] 1.1 Inventory all workspace test scripts, Vitest configs, coverage scopes, parent/child aggregators, empty-test allowances, CI triggers, smoke commands, and existing Extension Development Host evidence.
- [x] 1.2 Record the canonical test owner for every source-bearing workspace and identify duplicate, unowned, or implicitly skipped scopes before changing execution.
- [x] 1.3 Spike the VS Code built-in `extensionHost` Debug configuration with `../neko-test`, remote debugging, and `vscode-extension-debugger` evidence on macOS; record Linux/Xvfb built-in Debug automation as blocked unless an authorized runner exists.
- [ ] 1.4 Spike multi-extension loading through built-in Debug direct development paths and compare it with prebuilt dependency VSIX installation; record the selected configuration and startup cost without introducing a runner-owned launch path.
- [x] 1.5 Prove a runner can open an Agent View and a Canvas Custom Editor, locate their real Webview iframe targets, perform one structured DOM action, and capture console plus a VS Code screenshot.

## 2. Repository Test Orchestration Contracts

- [x] 2.1 Define versioned machine-readable test ownership, coverage scope, functional scenario selection, failure classification, and report contracts with validators and focused tests.
- [x] 2.2 Add canonical root commands for build, coverage tests, quality gates, full local CI, and explicitly non-equivalent fast checks.
- [x] 2.3 Update GitHub TypeScript build/test/quality jobs to always start for pull requests and invoke the same canonical commands as full local CI.
- [x] 2.4 Retain Rust and Proto change selection only through a tested detector, adding fixtures for nested source, config, workflow, lockfile, generated type, and root configuration changes.
- [x] 2.5 Configure Turbo global inputs and affected-package behavior so root test/build/quality configuration changes invalidate the necessary tasks.
- [x] 2.6 Implement the workspace test ownership audit and fail on duplicate scopes, unowned production workspaces, unexplained empty-test success, or nonexistent test commands.

## 3. Coverage and Workspace Test Ownership Migration

- [x] 3.1 Extend the shared Vitest coverage factory with explicit owning source includes, standard reporters, exclusions, thresholds, and schema-safe per-package overrides.
- [x] 3.2 Add a quality check proving every Vitest config with production sources uses the shared coverage contract or an approved documented exception.
- [x] 3.3 Generate an initial per-workspace all-source coverage baseline and record real gaps instead of excluding newly visible uncovered files.
- [x] 3.4 Migrate Agent workspaces to package-owned test configs and remove parent/child duplicate scanning while preserving platform, ai-sdk, agent-types, extension, TUI, Webview, and Skill coverage.
- [x] 3.5 Migrate Cut, Canvas, Story, Sketch, Dashboard, Preview, Desktop, and remaining workspace aggregators to one canonical test owner per test file.
- [x] 3.6 Replace unexplained `--passWithNoTests` and `<NONEXISTENT>` success with real tests, an explicit aggregator owner, or a machine-readable gap with owner and closing condition.
- [x] 3.7 Run the canonical coverage command and prove a production source file not imported by tests remains visible as uncovered.

## 4. VS Code Functional Runner Foundation

- [x] 4.1 Create `scripts/webview-functional/` with host, CDP, scenario runtime, assertion, error policy, report, fixture, and test modules; add only the audited dependencies required for VS Code CDP control.
- [x] 4.2 Implement attach-only discovery for the VS Code built-in Extension Debug Host with fixed `../neko-test`, isolated in-workspace fixtures, deterministic controller/CDP readiness, workspace/extension identity checks, disconnect-only cleanup, and infrastructure diagnostics; reject direct `code`, `.vscode-test`, Chrome, and standalone Electron launch paths.
- [x] 4.3 Implement the Extension-side host controller for public VS Code commands, opening fixture files, reload, hide/reveal, close/reopen, workspace reads, and cleanup without test-only business commands.
- [x] 4.4 Implement the repository-owned CDP session for page/iframe discovery, target matching, DOM snapshot, screenshot, console/log subscriptions, and structured evaluation results.
- [x] 4.5 Define and validate the functional scenario schema for fixture, prerequisite, activation, target, step, assertion, timeout, platform, error policy, and evidence settings.
- [x] 4.6 Implement structured `wait-visible`, `click`, `input`, `select`, `key`, `wait-state`, `reload`, `hide-reveal`, and `close-reopen` operations using role, accessible name, test id, and audited selector fallbacks.
- [x] 4.7 Reject arbitrary JavaScript, private-store mutation, direct private handler calls, and unknown operation/assertion kinds before launching VS Code.
- [x] 4.8 Implement UI, command/log correlation, durable file/revision, Engine observable result, typed diagnostic, lifecycle, and forbidden-path assertions.
- [x] 4.9 Implement full-session Webview exception, unhandled rejection, console, Log, CSP, resource failure, Extension Host error, and known benign VS Code warning classification.
- [x] 4.10 Implement versioned `result.json`, step/assertion evidence, side-effect manifest, DOM, log, screenshot, failure classification, and redaction output under gitignored reports.
- [x] 4.11 Add key-free unit tests for schema rejection, selector resolution, operation sequencing, timeout, error policy, redaction, report generation, and legacy target-smoke non-acceptance.

## 5. Real Extension Development Host Pilots

- [x] 5.1 Add an isolated Agent fixture and P0 scenario that activates the real Agent View, verifies a nonblank UI, enters and submits input, observes the real host message/session projection, and checks runtime errors.
- [x] 5.2 Add Agent lifecycle steps for queue/cancel or another deterministic runtime projection, hide/reveal, reload, continued input, and no stale or cross-runtime state.
- [x] 5.3 Add an isolated Canvas `.nkc` fixture and P0 Custom Editor scenario that opens the real editor, selects and edits through UI, saves, closes, reopens, and verifies durable project content/revision.
- [x] 5.4 Add Canvas keyboard/focus and invalid input/resource cases that assert visible typed diagnostics and no fallback success.
- [x] 5.5 Run both pilots through Extension Development Host and `vscode-extension-debugger`, recording commands, host/extension versions, reports, screenshots, canonical-path evidence, and residual risk.
- [x] 5.6 Add boundary tests proving the pilot uses real Webview/Extension/project services and does not introduce test-only message handlers, commands, store mutation, or direct filesystem bypass.

## 6. Package Functional Scenario Matrix

- [x] 6.1 Add Cut P0 scenarios for open, source/timeline interaction, save/reopen, Engine ready/unavailable, and runtime errors.
- [x] 6.2 Add Story P0 scenarios for open/edit/validation/save/reopen and source/diagnostic behavior.
- [ ] 6.3 Add Audio P0 scenarios for project open, mode/selection interaction, save/reopen, Engine/audio diagnostic, and focus.
- [ ] 6.4 Add Model, Sketch, and Puppet P0 scenarios covering their primary editor interaction, durable save/reopen, host-private or Engine behavior, and failure diagnostics.
- [ ] 6.5 Add Preview P0 scenarios for supported resource open, media/document interaction, authorization/CSP behavior, and unsupported resource diagnostic.
- [ ] 6.6 Add Dashboard, Assets, Market, Live, Tools, and remaining visible Webview P0 scenarios for activation, core command/result, lifecycle, and runtime errors.
- [ ] 6.7 Add P1 cross-plugin add/link/send/handoff scenarios that verify stable refs, owning authoring services, destination save/reopen, and poisoned legacy Webview paths.
- [ ] 6.8 Add P2 media/Engine and long-lifecycle scenarios with explicit prerequisites, cancellation/resource disposal, platform requirements, and no business-failure retry.

## 7. Desktop Functional Acceptance

- [x] 7.1 Implement the Desktop host adapter to start/stop the real Electron AppHost with isolated workspace and user state and connect to Electron CDP.
- [x] 7.2 Reuse structured DOM operations, error policy, evidence, and reports while keeping Desktop IPC/window/restart control separate from VS Code APIs.
- [x] 7.3 Add a Desktop P0 Workbench scenario that verifies nonblank package Webview mounting, file navigation, editor tab behavior, and no renderer/preload/main errors.
- [x] 7.4 Add a Desktop edit/save/restart scenario that verifies the owning package authoring path, durable project state, and restored UI projection without direct store injection.
- [x] 7.5 Add Engine ready/unavailable and host-private capability cases with real Engine observability or visible typed diagnostics.
- [x] 7.6 Retain the existing Desktop bundle checker as build smoke, rename/document it accordingly, and prove it cannot satisfy Desktop functional acceptance.

## 8. CI, Reports, and Cleanup

- [x] 8.1 Implement changed-package/P0 scenario selection that uses package/dependency ownership without allowing the functional job itself to disappear on relevant changes.
- [ ] 8.2 Add trusted PR jobs for selected VS Code P0 scenarios only after an authorized runner can start VS Code built-in Extension Debug with `../neko-test`; retain report upload and bounded concurrency requirements, and keep the task blocked rather than directly launching `code`.
- [ ] 8.3 Add nightly and release workflows for the full built-in Debug package matrix, Desktop scenarios, cross-plugin P1/P2, Engine/media prerequisites, and macOS coverage after the same automation boundary is available; no direct-launch fallback is permitted.
- [x] 8.4 Enforce one infrastructure-only startup retry and prohibit retry of business assertions, runtime errors, CSP violations, or durable result failures.
- [x] 8.5 Rename target-discovery commands to smoke terminology, migrate documentation and active OpenSpec tasks, and remove claims that target/build/JSDOM/browser evidence is functional acceptance.
- [x] 8.6 Update `AGENTS.md`, contribution guides, quality ADR, architecture docs, package authoring guidance, and report retention/redaction policy in Chinese and corresponding English semantics.
- [ ] 8.7 Run focused runner tests, ownership/coverage checks, canonical build/test/quality commands, real Agent/Canvas/Desktop pilots, `pnpm check:legacy-debt`, `pnpm check:unused`, and strict OpenSpec validation.
- [ ] 8.8 Run `neko-quality-review`, document risk level, commands/results, UI evidence locations, unexecuted platform/package scenarios, and remaining rollout risk before closing the change.
