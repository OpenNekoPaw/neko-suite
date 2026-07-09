## 1. Remove Obsolete Validation Paths

- [x] 1.1 Remove `run`, `eval`, `real-api-suite`, and `test:real-api:tui` command/script registration from `packages/neko-agent/packages/cli-tui`.
- [x] 1.2 Remove old headless runner, eval, run-result, formatter, real-api-suite source files, public exports, docs, examples, and tests.
- [x] 1.3 Update CLI command tests so old commands are absent and unknown runtime classification fails visibly.
- [x] 1.4 Update quality policy documentation so Agent real API evidence points to TUI debug automation instead of old `neko eval` or `neko run`.

## 2. Define Debug Automation Contract

- [x] 2.1 Add typed protocol DTOs for request, response, error, session id, timeout, split idle state, and facts payloads.
- [x] 2.2 Implement stdio JSON message framing for `neko debug automation --stdio` under an explicit dev command group whose help text identifies it as local developer automation.
- [x] 2.3 Add fail-visible validation for unknown method, unknown schema version, malformed payload, missing session id, disposed session id, and invalid timeout.
- [x] 2.4 Add protocol contract tests that do not require provider credentials or real API calls.

## 3. Reuse TUI Runtime Path

- [x] 3.1 Add a debug automation host that runs the complete TUI App/session owner and only replaces input/output adapters.
- [x] 3.2 Implement `session.create`, `session.resume`, and `session.dispose` with canonical TUI conversation id behavior.
- [x] 3.3 Implement `message.submit` through the TUI input queue so sequential turns share one Agent session history and runtime state without direct Agent turn injection.
- [x] 3.4 Implement `session.waitForIdle` across `turnIdle`, `backgroundTasksIdle`, `mediaDeliveryIdle`, and `taskResultObservationIdle`, including timeout diagnostics.
- [x] 3.5 Implement `session.facts` with conversation id, model identity, turn summaries, assistant outputs, Skill activations, task observations, artifact summaries, runtime errors, Canvas message/file summaries, split idle state, and optional full history.
- [x] 3.6 Add poisoned-path or spy tests proving debug automation does not call old headless runner/eval assembly.

## 4. External Eval Script Boundary

- [x] 4.1 Document the external eval script contract under `scripts/agent-eval/`: manifests, controller, judge, checks, reports, retries, and failure classification stay outside `cli-tui`.
- [x] 4.2 Add a minimal `scripts/agent-eval/` example or fixture that calls debug automation without importing Agent, Canvas, media, Skill, EPUB, provider, or TUI internals.
- [x] 4.3 Record how controller/judge API unavailability maps to infrastructure fail and bad controller prompts map to case fail.
- [x] 4.4 Add Canvas workflow checks for Agent-sent Canvas messages, Canvas JSON file creation, and expected JSON file content.

## 5. Validation

- [x] 5.1 Run focused CLI tests for command absence and interactive/resume behavior.
- [x] 5.2 Run focused protocol/runtime tests for debug automation once implemented, keeping parser, invalid request, stdio framing, and timeout classification tests key-free while real Agent behavior acceptance uses real APIs.
- [x] 5.3 Run `openspec validate introduce-tui-debug-automation --strict`.
- [x] 5.4 Record residual risk for any real API scenario that cannot run because credentials, provider availability, network, quota, model access, local fixtures, controller model, or judge model are unavailable.
