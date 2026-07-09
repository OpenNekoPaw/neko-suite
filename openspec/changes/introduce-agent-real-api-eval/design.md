## Context

Neko Agent currently has three adjacent validation paths:

- `neko run` executes one prompt through the CLI/TUI headless path and can write structured run results.
- `real-api-suite` executes real API cases through run-mode and writes reports for prompt, content, model, timeout, and provider error checks.
- Interactive TUI owns the terminal AgentSession experience, including resume, Skill lifecycle, task projection, references, and queue UI.

The missing path is a real API scenario runner that keeps one real `AgentSession` alive for sequential turns and feedback loops. This is needed for Skill quality, prompt iteration, model judge review, and creative artifact acceptance where one prompt is too shallow but full TUI interaction is too manual.

This change stays inside the local TUI/headless product boundary. It does not create remote evaluation services, distributed queues, cloud orchestration, or another Agent business runtime.

### Five-Layer Analysis

**Responsibility**

- `cli-tui` owns the `neko eval` command, manifest parsing, scenario orchestration, report formatting, and local output files.
- `@neko/agent` owns AgentSession execution, Skill lifecycle activation, tool/capability invocation, artifact/task observation contracts, and conversation identity.
- `@neko/platform` and existing config/runtime code own provider/model selection and real API invocation.
- Controller and judge behavior are real model calls, but they are eval orchestration roles rather than business capabilities.
- Domain packages keep owning their capabilities and artifacts. Eval only invokes and observes them through the normal Agent path.

**Dependency**

- `eval` reuses the existing Node/TUI headless composition root: config loader, platform bootstrap, runtime bootstrap, capability loader, Skill loader, task manager, and artifact services.
- `eval` must not import Ink UI components, React hooks, Zustand UI stores, Webview code, VS Code APIs, Desktop/Electron IPC, or feature package internals.
- Agent core must not import eval code.
- If existing runtime APIs do not expose needed result facts, add narrow public observation hooks at the owning runtime boundary instead of reading `.neko` backing files or cache manifests.

**Interface**

- Eval manifest and result are versioned JSON contracts: `neko.eval.v1` and `neko.eval-result.v1`.
- The v1 manifest supports `single`, `sequence`, and `feedback-lite`.
- The v1 result records mandatory run facts, not detailed event logs: turns, prompts, generated controller prompts, outputs, selected models, Skill activations, task/artifact summaries, judge result, error counters, and failure kind.
- Exit codes distinguish pass, case failure, infrastructure failure, and manifest/config invalid.

**Extension**

- New checks are small predicates over the result facts.
- New feedback strategies are built-in prompt-generation policies that call a real controller model with eval-produced history.
- Future v2 work can add async/concurrent task orchestration, model matrices, external controllers, Desktop/VS Code adapters, or detailed trace evidence without changing v1 single/sequence/feedback contracts.

**Testing**

- Pure unit tests cover manifest validation, check evaluation, result/report formatting, exit-code classification, and import boundaries.
- Agent behavior acceptance uses real API eval runs only.
- Default CI remains key-free; it does not run `neko eval`.
- Delivery evidence for Agent/Skill/model changes records the attempted eval command, selected provider/model identities, output directory, and residual risk when real API validation cannot run.

**Proportionality**

The abstraction is intentionally thin: a scenario runner over an existing local AgentSession path. It does not add a new scheduler, a new business task manager, a new provider router, or a generic cross-host testing platform.

**Fail-visible behavior**

Invalid manifest schema, missing workDir, missing model config, missing Skill, missing controller/judge config, provider/model mismatch, unsupported mode, unknown check kind, unavailable controller/judge API, or missing required artifact facts fail visibly. Eval must not fall back to mock, another provider, another model, legacy run paths, empty defaults, or successful no-op results.

## Goals / Non-Goals

**Goals:**

- Add `neko eval` as a real-API-only scenario acceptance command.
- Execute each case through one real `AgentSession` and one conversation.
- Support v1 `single`, `sequence`, and `feedback-lite` modes.
- Let the controller model generate follow-up prompts from eval-produced results.
- Let the judge model provide quality verdicts.
- Require observable Skill activation for command-trigger and natural-language-trigger Skill tests.
- Record minimal structured result facts and a Markdown summary.
- Preserve `neko run` and `real-api-suite` behavior during v1.

**Non-Goals:**

- Do not provide a mock execution mode for `neko eval`.
- Do not replace unit tests, pure contract tests, or Webview/VS Code runtime smoke.
- Do not add a new Agent runtime, provider router, task system, artifact service, Skill activation mechanism, or business capability.
- Do not use eval-only fake tools or direct internal package calls to mimic real Agent behavior.
- Do not validate TUI keyboard/input/focus behavior, Webview UI behavior, or Desktop UI behavior.
- Do not emit detailed event/token/log evidence in v1.
- Do not implement external controller plugins, concurrent scheduling, or model matrix evaluation in v1.

## Decisions

### Decision 1: Implement eval inside cli-tui first

`neko eval` will live under `packages/neko-agent/packages/cli-tui` and reuse the same Node/TUI headless composition root as `neko run` and `real-api-suite`.

Alternatives considered:

- Create a new `agent-eval` package now. Rejected because the current problem is to validate the existing local TUI/headless Agent runtime without adding another composition root.
- Build eval in `@neko/agent`. Rejected because eval is a developer command and report writer; Agent core should not depend on Node filesystem output, CLI parsing, or provider config files.

### Decision 2: Use AgentSession instead of repeated runAgent calls

Eval cases run through a real `AgentSession` so sequential and feedback turns share conversation history, Skill lifecycle, task context, and runtime state. The implementation should extract or reuse the existing headless session assembly rather than call `runAgent` once per turn.

Alternatives considered:

- Repeated `runAgent` calls with previous output pasted into the next prompt. Rejected because that tests prompt concatenation rather than the actual continuous AgentSession path.
- Interactive TUI automation. Rejected for v1 because the target is Agent behavior acceptance, not terminal input/focus validation.

### Decision 3: Keep controller and judge as explicit real model roles

Eval can configure `targetModel`, `controllerModel`, and `judgeModel`. The controller may read eval-produced history and generate the next prompt. The judge evaluates quality. Controller/judge API unavailability is infrastructure failure; poor controller prompts that cause a target scenario failure are case failure.

The controller input is limited to eval-produced facts: prior turn prompts, outputs, generated prompts, judge results, task/artifact summaries, and error status. It must not read hidden system prompt, AGENTS content, Skill source, provider secrets, or runtime logs.

Alternatives considered:

- Fixed manifest-only prompts. Rejected because feedback workflows need dynamic prompt flow.
- Controller reads full internal runtime context. Rejected because it would make eval behavior depend on hidden internals unavailable to normal users and harder to reproduce.

### Decision 4: Skill trigger tests require activation, not just good output

Command-trigger Skill cases use the real explicit activation path. Natural-language-trigger Skill cases send a normal user prompt and require the Agent to actively activate the target Skill through the canonical Agent-owned path. Good output without activation is failure for a Skill trigger case.

This aligns with the existing Skill trigger boundary: natural language enters the Agent first, and activation is owned by Agent reasoning/tooling, not host keyword routing.

Alternatives considered:

- Judge final output quality only. Rejected because the goal is to decide whether the Skill is useful, activatable, and stable. If the output succeeds without activation, the Skill may be redundant or poorly discoverable.

### Decision 5: Keep result facts minimal but mandatory

V1 writes `manifest.json`, `result.json`, and `summary.md`. It does not write detailed logs/events by default. `result.json` still records mandatory facts needed to diagnose and assert the real path: selected models, turns, prompts, outputs, controller-generated prompts, Skill activations, task/artifact summaries, judge output, error counters, status, failure kind, and exit code.

Alternatives considered:

- Full event log by default. Deferred to v2 to keep eval thin and avoid making the first version a new trace platform.
- Text-only summaries. Rejected because they would not prove path-level behavior or support deterministic checks.

### Decision 6: Artifact checks are existence and format only

Eval v1 may assert that an artifact exists and matches an expected format. Local artifact quality is not judged by eval code. Quality review belongs to the real judge model or future domain-specific validators owned by the relevant package.

Alternatives considered:

- Eval-owned quality heuristics. Rejected because it would create a parallel business-quality implementation and drift from actual user workflows.

### Decision 7: Distinguish failure classes with exit codes

Exit code `0` means pass, `1` means case failure, `2` means infrastructure failure, and `3` means manifest/config invalid.

Infrastructure failures include provider/controller/judge unavailability, network/provider instability above configured limits, and repeated transient errors. Manifest/config invalid includes invalid JSON/schema, missing workDir, missing model config, missing Skill, unsupported mode, or invalid checks before execution.

Alternatives considered:

- Single non-zero exit code. Rejected because automation needs to distinguish product behavior failure from local configuration/provider availability.

## Risks / Trade-offs

- Real API variance, cost, and rate limits -> Keep eval opt-in, small by default, and explicit about selected provider/model and error counters.
- Controller prompt generation can make failures hard to reproduce -> Record controller input summary, model identity, generated prompt, and decision for each generated turn.
- Judge quality can be subjective -> Treat judge as the configured referee for now and keep deterministic checks for model/Skill/artifact/status separate from judge text.
- Eval can drift from real user behavior -> Reuse AgentSession and existing headless runtime assembly; prohibit eval-only business capabilities and fallback paths.
- Natural-language Skill trigger may be flaky -> Record activation status and judge outcome separately so Skill discoverability and output quality can be diagnosed independently.
- Adding observation fields may tempt private storage reads -> Prefer narrow public runtime observations; fail visibly if a required fact is unavailable rather than reading backing files.
- Real API eval cannot be default CI -> Keep parser/check/report unit tests separate from real behavior evidence and record residual risk when eval cannot run locally.

## Migration Plan

1. Add the `eval` command and manifest/result schema as an opt-in developer command.
2. Extract or reuse headless AgentSession assembly so `run`, `real-api-suite`, and `eval` do not fork provider/model/Skill/capability setup.
3. Implement `single` mode and result/report output.
4. Add `sequence` mode with one conversation and sequential turns.
5. Add `feedback-lite` mode with real controller model prompt generation and real judge model quality evaluation.
6. Add Skill activation checks, artifact existence/format checks, failure classification, and exit-code mapping.
7. Update docs and release-loop guidance for when eval evidence is expected.
8. Leave `real-api-suite` in place for v1; later decide whether to wrap it around eval presets.

Rollback is simple because eval is opt-in and writes only report artifacts. Remove the command and generated output docs if necessary; no project data migration is required.

## Open Questions

- Should eval have a default built-in judge rubric per scenario type, or require every manifest to provide a rubric string?
- Which artifact formats are supported by v1 existence/format checks: Markdown, JSON, image, audio, video, or only a minimal subset?
- Should `real-api-suite` v1 reports link to eval reports when both are run for the same change?
- Should controller/judge model defaults inherit from target model when omitted, or should omission be manifest/config invalid for feedback/judge cases?
