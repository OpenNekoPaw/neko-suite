## ADDED Requirements

### Requirement: Functional acceptance uses a real Extension Development Host
VS Code Webview functional acceptance SHALL load the real Neko Extension in an isolated Extension Development Host and operate the visible Webview through the VS Code runtime.

#### Scenario: Webview functional scenario starts
- **WHEN** the functional runner starts a package scenario
- **THEN** the current development window MUST use a VS Code built-in `extensionHost` Debug configuration with the target extension development paths, remote debugging enabled, and the sibling `../neko-test` workspace
- **AND** the functional runner MUST only attach to that already-running Debug Host, verify its controller and workspace identity, and isolate fixtures under `../neko-test/.neko/.functional/`
- **AND** runner cleanup MUST disconnect its CDP/controller clients without closing or terminating the VS Code-owned Debug Host
- **AND** invoking the system `code` command from the runner MUST NOT satisfy this requirement
- **AND** a downloaded `.vscode-test` host, ordinary Chrome, or an independent Electron page MUST NOT satisfy this requirement
- **AND** it MUST identify the expected Webview by extension id, view/editor identity, and VS Code CDP target.

#### Scenario: Agent or developer captures debugger evidence
- **WHEN** local functional acceptance is claimed
- **THEN** `vscode-extension-debugger` MUST connect to the same VS Code debugger port and capture preflight, target, DOM or JavaScript assertion, console/log, and VS Code page screenshot evidence
- **AND** target discovery alone MUST remain environment smoke.

### Requirement: Scenarios drive structured user operations
The functional runner SHALL support a closed schema of host and Webview operations and MUST NOT allow scenario manifests to execute arbitrary JavaScript or mutate private application state.

#### Scenario: User edits through a Webview
- **WHEN** a scenario declares click, input, selection, key, command, reload, hide/reveal, or close/reopen steps
- **THEN** the runner MUST perform them against the real VS Code host or Webview DOM
- **AND** the scenario MUST NOT call a private store, handler, or test-only business shortcut to produce success.

### Requirement: Functional success proves behavior and authoritative result
A Webview scenario SHALL pass only when user-visible behavior, the canonical runtime path, and the authoritative or durable result all satisfy declared assertions.

#### Scenario: Project edit succeeds
- **WHEN** a user changes a project through a Webview and saves it
- **THEN** the scenario MUST assert the expected UI state, canonical message/command/service path evidence, saved project content or revision, and successful close/reopen projection
- **AND** a visible control or process exit code alone MUST NOT count as success.

#### Scenario: Engine-backed action succeeds
- **WHEN** a Webview action requires Engine state or media processing
- **THEN** the scenario MUST assert the EngineClient/Engine observable result or expected typed diagnostic
- **AND** it MUST NOT replace the Engine action with a Webview-local fake implementation.

### Requirement: Runtime errors are global functional assertions
The functional runner SHALL monitor Webview and Extension runtime errors for the complete scenario and fail on unknown or unexpected errors.

#### Scenario: Webview emits an unexpected runtime error
- **WHEN** the runner observes a Webview exception, unhandled rejection, CSP violation, failed required resource, unexpected console error, or Extension Host exception
- **THEN** the scenario MUST fail and preserve the error evidence
- **AND** only versioned, source-matched benign VS Code container warnings MAY be filtered.

#### Scenario: Failure behavior is expected
- **WHEN** a negative scenario expects an unavailable dependency or invalid input
- **THEN** it MUST assert the typed diagnostic code and user-visible failure state
- **AND** it MUST NOT ignore all errors or treat fallback success as the expected result.

### Requirement: Functional evidence is reproducible and structured
Every functional scenario SHALL produce a versioned report containing host identity, steps, assertions, runtime errors, side effects, DOM evidence, logs, and screenshots required to reproduce failures.

#### Scenario: Scenario completes
- **WHEN** a functional scenario passes, fails, or is blocked
- **THEN** the runner MUST write a structured result with scenario id, extension/version, VS Code version, fixture digest, assertion evidence, error classification, and artifact locations
- **AND** raw secrets, credentials, or unauthorized workspace content MUST NOT appear in committed summaries.

### Requirement: Browser and target smoke are not functional acceptance
Build smoke, target discovery, JSDOM, ordinary browsers, Vite localhost, and browser Playwright SHALL NOT be accepted as VS Code Extension Webview functional evidence.

#### Scenario: Only a Webview target is observed
- **WHEN** validation only proves that a VS Code page or Webview iframe target exists
- **THEN** the result MUST be classified as environment smoke
- **AND** it MUST NOT close a functional acceptance requirement.
