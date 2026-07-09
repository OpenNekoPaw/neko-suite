## Why

`neko run`, `neko eval`, and `real-api-suite` created a second headless Agent execution path that drifted from the interactive TUI runtime assembly, task observation, Skill activation, media delivery, and resume behavior users actually exercise. We need a non-invasive validation surface that tests the real TUI path while keeping eval orchestration outside Agent business code.

## What Changes

- **BREAKING** Remove the deprecated `neko run`, `neko eval`, `real-api-suite`, and `test:real-api:tui` command surfaces instead of keeping them as fallback validation paths.
- Add an explicit dev-only `neko debug automation` command group described as "local developer automation"; it runs the complete TUI App/session owner and only replaces input/output adapters for scripted control.
- Expose a local automation protocol for input-queue message injection, sequential turns, split idle waiting, resume, disposal, and machine-readable session facts.
- Keep eval suites as external scripts or tools that call the debug automation protocol. Those scripts may own manifests, controller prompts, judge prompts, result classification, existence/format checks, reports, and retry policy, but must not import Agent, Canvas, media, Skill, or provider business internals.
- Place the first repo-owned eval scripts under `scripts/agent-eval/` as developer tooling that calls the debug protocol.
- Make real API acceptance opt-in and fail-visible: controller/judge/API unavailability is infrastructure fail, bad controller prompts or target behavior are case fail, and invalid manifests/configs fail before running.
- For Canvas workflows, v1 acceptance validates the Agent-sent Canvas message, creation of the Canvas JSON file, and expected content in that file.
- Supersede the previous `introduce-agent-real-api-eval` and `complete-tui-real-api-validation` command-based designs for current implementation work.

## Capabilities

### New Capabilities

- `tui-debug-automation`: Defines the dev-only TUI automation command and protocol for session create/resume, message submit, idle waiting, fact collection, and disposal through the real TUI runtime path.

### Modified Capabilities

- `quality-validation-release-loop`: Replaces `neko eval` evidence expectations with TUI debug automation evidence for AgentSession, Skill, provider/model, artifact workflow, and real API scenario acceptance.

## Impact

- Affected package: `packages/neko-agent/packages/cli-tui`.
- Affected command surface: removes old headless run/eval/real API suite commands; adds a future debug automation command under the TUI CLI.
- Affected docs and quality policy: real API Agent acceptance evidence moves from in-package eval commands to external scripts driving debug automation.
- Affected tests: CLI command tests must prove old commands are absent; future protocol tests must prove automation hits the TUI runtime path rather than a duplicated headless Agent path.
- No change to durable project files, user data, marketplace state, Engine contracts, or Webview runtime contracts in this proposal.
