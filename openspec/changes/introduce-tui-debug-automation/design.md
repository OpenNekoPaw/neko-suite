## Context

The CLI/TUI package previously had three automation surfaces for Agent validation: `neko run`, `neko eval`, and `real-api-suite`. They solved short-term real API testing, but they assembled Agent sessions outside the same interactive TUI runtime path. That split made the test subject different from the user path for runtime assembly, journal/history, context settings, authorized read roots, background task result observation, Skill lifecycle, and media delivery.

This change deliberately removes the old successful command paths first, then introduces a debug automation contract for the canonical TUI path. Eval remains valuable, but it becomes an external harness that drives a TUI-owned protocol instead of importing Agent business internals.

Five-layer analysis:

- Responsibility: the complete TUI App/session owner owns session lifecycle, runtime assembly, input queue processing, idle detection, task observation, and facts projection. External eval scripts own manifests, controller/judge prompts, result classification, reports, and retry policy.
- Dependency: `cli-tui` may depend on Node/TUI runtime pieces it already owns. External eval scripts must not depend on Agent, Canvas, media, Skill, or provider internals. No new shared assembly layer is introduced.
- Interface: the debug protocol is a small local command protocol over stdio. It exposes requests and facts, not package-internal services.
- Extension: new eval case types, controller strategies, judges, or report formats can be added outside `cli-tui` without changing Agent business code, as long as the required observation appears in `session.facts`.
- Testing: unit tests prove old commands are absent and protocol parsing/failure paths are fail-visible; integration tests prove debug sessions hit the TUI runtime path; real API acceptance is opt-in and driven by external scripts.

## Goals / Non-Goals

**Goals:**

- Provide an explicit dev-only automation entry that can create or resume a complete TUI session, submit sequential messages through the TUI input queue, wait until the session is idle, and return machine-readable facts.
- Preserve the same TUI App/session owner as interactive TUI while allowing only input/output adapters to be replaced for scripted runs.
- Allow external eval scripts to implement single prompts, message queues, feedback loops, async task checks, concurrent case scheduling, continuous generation/review iteration, Skill activation checks, and model/provider/profile cases.
- Store the first repo-owned external eval scripts under `scripts/agent-eval/`.
- Make old command paths fail visibly by being absent instead of retained as deprecated fallbacks.
- Record enough facts for LLM judge and deterministic existence/format checks without requiring debug evidence logs as a product artifact.

**Non-Goals:**

- Do not reintroduce `neko run`, `neko eval`, `real-api-suite`, or package-local real API suites.
- Do not extract a new Agent runtime assembly layer.
- Do not implement Agent, Canvas, media, EPUB, Skill, controller, or judge business logic inside eval/debug command code.
- Do not mock real API acceptance in the debug automation path.
- Do not inject directly into Agent turns, because that bypasses the TUI input queue and can interrupt the active conversation.
- Do not validate TUI UI controls such as focus, resize, or exit prompts through this protocol; those remain PTY/TUI smoke concerns.

## Decisions

### Decision 1: Debug automation is a TUI port, not an eval runner

`neko debug automation --stdio` starts a local developer automation protocol owned by `cli-tui`. The protocol accepts commands such as `session.create`, `session.resume`, `message.submit`, `session.waitForIdle`, `session.facts`, and `session.dispose`.

Alternative considered: keep `neko eval` as the scenario runner and repair its assembly. Rejected because it keeps validation orchestration coupled to Agent business code and makes it too easy to add eval-only behavior that users never exercise.

### Decision 2: Reuse the complete TUI App/session owner

The debug command must run the complete TUI App/session owner. It may replace input and output adapters for automation, but it must not replace the session owner or runtime assembly. It must reuse the same TUI session runtime construction, input queue, task result observation, Skill activation lifecycle, media delivery host, context settings, authorized read roots, and conversation storage semantics as interactive TUI.

Alternative considered: create a separate `AgentSession` factory for debug. Rejected because that is the drift this change removes.

### Decision 3: Submit messages through the TUI input queue

`message.submit` injects a user message into the TUI input queue and waits for the TUI owner to dispatch it. It must not call the Agent turn runner directly, because direct turn injection can bypass queue semantics, interrupt the current conversation, and fail to reproduce user-facing message ordering.

Alternative considered: call the Agent turn function from the protocol handler. Rejected because it recreates the old headless path and loses TUI queue behavior.

### Decision 4: External scripts own eval flow and quality judgment

Eval scripts can read manifests, generate the next prompt with a controller API, run a judge model, check artifact existence/format, classify failures, and write reports. Those scripts call only the debug protocol and real provider APIs.

Alternative considered: make `cli-tui` own controller/judge/report implementations. Rejected because it would turn the debug command back into an eval product surface and couple test policy to runtime code.

### Decision 5: Facts are the machine-readable observation boundary

`session.facts` returns current session state needed for validation: conversation id, selected model identities, turn summaries, full history when requested, Skill activation records, task summaries, task result observations, artifact summaries, runtime errors, Canvas message/file summaries, and split idle state. Facts must be redacted for secrets but not hide contract failures.

Alternative considered: parse terminal output or require debug evidence logs. Rejected because terminal output is presentation, and the user already decided evidence logs are not required for v1.

### Decision 6: Idle state is split by runtime concern

`session.waitForIdle` and `session.facts` must distinguish `turnIdle`, `backgroundTasksIdle`, `mediaDeliveryIdle`, and `taskResultObservationIdle`. A session is fully idle only when all tracked concerns are idle or have reached a typed terminal state such as failed, cancelled, or timed out.

Alternative considered: expose one boolean idle flag. Rejected because media/task workflows can complete after the assistant text stream ends, which would make eval loops continue too early.

### Decision 7: Canvas validation uses observable messages and files

For Canvas workflows, Agent debug automation v1 validates that the Agent sent the expected Canvas message, that a Canvas JSON file was created, and that the file contains expected content. It does not read Webview in-memory Canvas state. If future cases need live Canvas node inspection, Canvas must expose its own owning debug facts.

Alternative considered: let Agent debug automation read Canvas Webview state directly. Rejected because it couples Agent debug to Canvas internals and violates package ownership.

### Decision 8: Mock boundary separates protocol tests from behavior acceptance

Protocol parser, invalid request, stdio framing, and timeout classification tests may run without real API calls. Agent behavior acceptance must use real configured APIs for target, controller, and judge calls and must not use mock providers or eval-only fake business tools.

Alternative considered: require real APIs for every debug test. Rejected because protocol correctness should remain key-free and deterministic.

### Decision 9: Old real API tests are removed with the old commands

The old `real-api-suite` and `real-api-tui-projection` tests are removed because they validated the deleted headless route. Future real API tests use external scripts against debug automation. Unit tests remain key-free and cover command absence, protocol contracts, and fail-visible invalid input.

Alternative considered: keep the old tests as a safety net. Rejected because passing tests on the wrong runtime path would hide the actual integration risk.

## Risks / Trade-offs

- Debug facts may initially miss a validation signal needed by an eval script. Mitigation: add facts fields to the owning debug protocol as observation-only contract changes, not by importing business internals into eval.
- Waiting for idle can be ambiguous when background tasks finish after an assistant turn. Mitigation: expose split idle states for turn, background tasks, media delivery, and task result observation, with timeout diagnostics.
- Input queue injection can expose TUI concurrency bugs that direct Agent turn calls would hide. Mitigation: treat those as real case failures or infrastructure failures according to typed diagnostics, because reproducing user-facing queue behavior is the point of debug automation.
- External eval scripts may generate bad controller prompts. Mitigation: classify that as case fail when the controller returns a poor next prompt, while API unavailability or protocol failure remains infrastructure fail.
- Removing old commands may break developer muscle memory. Mitigation: this is a prelaunch cleanup; the replacement design is explicit and old paths must not remain as fallback success paths.
- PTY/TUI UI behavior is outside the debug protocol. Mitigation: keep separate TUI smoke tests for exit prompts, input widgets, focus, and resize.

## Migration Plan

1. Remove `neko run`, `neko eval`, `real-api-suite`, their public exports, scripts, docs, examples, and tests from `cli-tui`.
2. Add focused command tests proving old commands are absent and unknown command runtime classification fails visibly.
3. Implement `neko debug automation --stdio` behind an explicit dev/debug command group with help text identifying it as local developer automation.
4. Add protocol contract tests for request parsing, response shape, invalid method handling, timeout diagnostics, and disposal.
5. Add runtime-path tests proving debug automation uses the TUI runtime assembly and task observation path rather than old headless runner code.
6. Move real API scenario execution to `scripts/agent-eval/` scripts that call the debug protocol and real provider APIs.

Rollback before debug implementation is possible by reverting the cleanup and proposal together. After debug automation ships, rollback must not restore old headless validation as the default acceptance path; it should disable the debug command with a fail-visible diagnostic while preserving interactive TUI.

## Open Questions

- Should `session.waitForIdle` expose timestamps for each split idle state in v1, or only booleans plus timeout diagnostics?
- Should Canvas JSON file checks live in the eval script helper or in a shared test utility once Canvas exposes its own debug facts?
