## 1. Contract and Command Setup

- [x] 1.1 Add `neko eval` command wiring in `packages/neko-agent/packages/cli-tui/src/cli.tsx` with `--manifest <path>` and `--output-dir <dir>` options.
- [x] 1.2 Create `packages/neko-agent/packages/cli-tui/src/core/eval/` with manifest, result, check, and report types for `neko.eval.v1` and `neko.eval-result.v1`.
- [x] 1.3 Implement strict manifest parsing for `single`, `sequence`, and `feedback-lite`, including unsupported mode, unknown check kind, missing workDir, missing Skill, and missing controller/judge config diagnostics.
- [x] 1.4 Add pure unit tests for eval manifest parsing, invalid manifest/config classification, redaction rules, and exit-code mapping.

## 2. AgentSession Scenario Runner

- [x] 2.1 Extract or reuse the existing TUI/headless AgentSession assembly so eval uses the same config, provider/model, Skill, capability, task, artifact, and content-access setup as production headless TUI.
- [x] 2.2 Implement `single` mode through one real AgentSession turn and record selected target provider/model, conversation id, prompt, output, status, and errors.
- [x] 2.3 Implement `sequence` mode so all turns run in order inside the same AgentSession and conversation.
- [x] 2.4 Add boundary tests proving eval core does not import Ink App/components, TUI UI stores, Webview code, VS Code APIs, or Desktop/Electron adapters.
- [x] 2.5 Add focused tests or poisoned-path assertions proving eval does not use mock provider fallback, eval-only fake business tools, or repeated standalone `runAgent` calls for sequence history.

## 3. Feedback Controller and Judge

- [x] 3.1 Implement real controller model calls for `feedback-lite`, with controller input limited to eval-produced results.
- [x] 3.2 Record controller model identity, controller input summary, generated prompt, and generated turn id in `result.json`.
- [x] 3.3 Implement real judge model calls for quality checks, recording judge model identity, verdict, score or pass/fail, and reason.
- [x] 3.4 Classify controller or judge provider/model/API unavailability as infrastructure failure.
- [x] 3.5 Add pure tests for controller input projection so hidden system prompt, AGENTS content, Skill source, secrets, runtime internals, and logs are not included.

## 4. Skill Artifact Task and Check Results

- [x] 4.1 Record command-trigger Skill activation through the canonical Skill lifecycle path.
- [x] 4.2 Record natural-language-trigger Skill activation only when the Agent activates the Skill through the canonical Agent-owned path.
- [x] 4.3 Fail natural-language Skill trigger cases when the target Skill is not activated, even if target output or judge result is otherwise good.
- [x] 4.4 Record task and artifact summaries exposed by the runtime without reading private `.neko` backing files, cache manifests, Webview URIs, or host-private logs.
- [x] 4.5 Implement artifact existence and format checks, leaving quality scoring to the real judge model.
- [x] 4.6 Implement v1 check predicates for success, model-used, skill-activated, artifact-exists, artifact-format, judge-pass, and error-rate/consecutive-error limits.

## 5. Failure Policy and Reports

- [x] 5.1 Implement default retry limits of at most two attempts per turn and two consecutive transient errors before infrastructure failure.
- [x] 5.2 Write v1 output files: `manifest.json`, `result.json`, and `summary.md`.
- [x] 5.3 Ensure result/report artifacts redact API keys, auth headers, tokens, provider secrets, and secret-bearing config values.
- [x] 5.4 Add report snapshot tests for pass, case failure, infrastructure failure, and manifest/config invalid outcomes.
- [x] 5.5 Ensure process exit codes map to pass `0`, case failure `1`, infrastructure failure `2`, and manifest/config invalid `3`.

## 6. Documentation and Validation

- [x] 6.1 Document `neko eval` usage, manifest shape, output files, failure classification, and real-API-only behavior in the CLI/TUI docs.
- [x] 6.2 Update quality validation notes to explain when eval evidence is expected and how to record residual risk when real API eval cannot run.
- [x] 6.3 Add an example redacted eval manifest that contains no credentials and does not require repository-local private fixtures.
- [x] 6.4 Run focused eval unit tests for parser/check/report/boundary logic.
- [x] 6.5 Run the relevant `neko eval` real API scenario locally when credentials and provider access are available, or record the attempted command and residual risk.
- [x] 6.6 Run `pnpm --filter @neko/cli test:run` or the narrower focused Vitest command covering the new eval modules.
