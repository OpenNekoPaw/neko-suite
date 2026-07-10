---
name: neko-agent-evaluation
description: Plan, create, validate, run, and analyze script-driven evaluations for Neko Agent behavior changes. Use when work affects prompts, Skills, capability or tool routing, provider/model selection, AgentSession workflows, asynchronous tasks, validation/recovery, or TUI Agent event projection; also use when asked to add an Agent evaluation, verify a real Agent path, or provide Agent evaluation evidence for OpenSpec, review, or release readiness.
---

# Neko Agent Evaluation

Create path-level evidence for real Neko Agent behavior through the repository's script-driven evaluation system.

## Preserve the Boundary

Treat Neko Agent as the system under test:

- Keep evaluation manifests, scenario orchestration, assertions, judges, and reports under `scripts/agent-eval`.
- Drive the real TUI and `AgentSession` through the generic debug automation interface exposed by Neko Agent.
- Do not add or restore a `neko eval` command.
- Do not register evaluation authoring or execution as a normal Neko Agent Skill or runtime capability.
- Extend the debug interface only with generally useful control or observable facts. Do not add evaluation-specific pass/fail concepts to it.

Use these sources of truth before editing:

- `AGENTS.md`
- `openspec/project.md`
- `docs/architecture/agent.md`
- `scripts/agent-eval/README.md`
- `scripts/agent-eval/test-cases.md`
- the current runner, tests, scenario manifests, and debug automation fact contracts

Trust current executable code over historical OpenSpec completion marks or reports when they disagree.

## Decide Whether Evaluation Is Required

Require a focused Agent evaluation when the change can alter model-driven runtime behavior, including:

- prompt or Skill behavior;
- capability/tool registration, injection, routing, or schema;
- provider, model, or profile selection;
- multi-turn, queue, resume, asynchronous-task, or recovery behavior;
- runtime evidence projected to TUI or other Agent hosts.

Prefer deterministic unit or contract tests when the change is limited to pure parsing, schema validation, or non-Agent logic. Use the appropriate Webview, Extension, Engine, or package validation instead of inventing an Agent evaluation for unrelated changes.

## Workflow

### 1. Inspect the Change

Read the relevant OpenSpec artifacts, changed files, tests, and existing scenarios. Identify:

- user-visible behavior;
- the canonical runtime path that must execute;
- forbidden legacy or fallback paths;
- expected success and fail-visible behavior;
- external providers, fixtures, credentials, or local assets required by the case.

For a new feature, plan evaluation evidence before implementation is complete so missing observability is discovered early.

### 2. Define Evidence Before Prompts

For each case, write down:

1. user behavior;
2. canonical path;
3. observable runtime evidence;
4. forbidden fallback;
5. expected result;
6. expected failure behavior.

Prefer path evidence such as capability/tool calls, Skill activation, task lifecycle, model identity, diagnostics, artifact refs, and source provenance. Do not use final-answer text as the sole proof that a feature path executed.

### 3. Audit Debug Observability

Inspect the current debug automation facts and controls. Confirm that every proposed assertion can be proven from exported facts or a deterministic post-check.

If evidence is missing:

- identify the minimal generic debug fact or control required;
- add it to the owning runtime boundary only when the task includes that work;
- otherwise report the evaluation as blocked by missing evidence.

Do not replace missing runtime evidence with a weak text assertion, silent fallback, or manual assumption.

### 4. Inspect Runner Support

Read the current runner and assertion tests before choosing case kinds or assertions. Do not infer support from manifest examples, documentation, or historical reports alone.

An assertion is usable only when the runner has an executable evaluator for it. Unknown, metadata-only, or unsupported assertions must fail validation rather than appearing in a passing report.

### 5. Design Focused Cases

Create the smallest set that proves the feature:

- one positive case proving the new canonical path;
- one negative or fail-visible case proving unavailable, invalid, denied, or disabled states cannot return success;
- additional sequence, queue, cancellation, artifact, or quality cases only when required by the feature.

Use deterministic assertions for facts, schemas, formats, references, permissions, tasks, models, and artifacts. Use an LLM judge only for subjective quality. A judge must not substitute for deterministic path evidence.

For prelaunch replacements, poison or explicitly assert against retained legacy paths so a fallback cannot make the new case pass.

### 6. Create or Update the Scenario

Keep committed scenario definitions under `scripts/agent-eval/scenarios`. Reuse the canonical schema and existing fixtures. Use relative paths or environment-backed paths instead of committing developer-specific absolute paths, credentials, or secrets.

When the required driver or assertion does not exist, update the canonical script runner and its focused key-free tests before relying on the new scenario. Do not create a second orchestration path in Neko Agent or another CLI command.

### 7. Validate Progressively

Run the smallest reliable checks first:

```bash
pnpm test:agent:eval
```

Validate the selected manifest case without starting real Agent behavior when the current runner supports dry-run:

```bash
node scripts/agent-eval/protocol-smoke.mjs \
  --manifest scripts/agent-eval/scenarios/<suite>.scenarios.json \
  --case <case-id> \
  --dry-run
```

Then run the focused real case through TUI debug automation when credentials, network, models, and fixtures are available:

```bash
node scripts/agent-eval/protocol-smoke.mjs \
  --manifest scripts/agent-eval/scenarios/<suite>.scenarios.json \
  --case <case-id>
```

Treat current runner behavior as authoritative. If it only checks generic completion, do not claim that richer manifest assertions passed.

### 8. Analyze and Record Evidence

Review assertion-level evidence, not only process exit code or final output. Record:

- manifest and case id;
- command executed;
- selected provider/model when relevant;
- canonical path evidence;
- negative/no-fallback evidence;
- deterministic assertion results;
- judge identity and rubric when used;
- result/report location;
- skipped validation, reason, and residual risk.

Classify target behavior or rubric failures as case failures, unavailable evaluation infrastructure as infrastructure failures, and invalid or unsupported manifests as configuration failures.

## Hard Rules

- Never revive `neko eval` or add an alias that silently delegates to scripts.
- Never duplicate Agent session orchestration inside an evaluation command or Neko Agent capability.
- Never accept mock-only or result-only evidence as real Agent behavior acceptance.
- Never mark metadata-only assertions as executed.
- Never let a judge read hidden prompts, secrets, internal logs, or source material outside the evaluation-produced evidence projection.
- Never let a good final answer hide an unexecuted canonical path or a successful fallback.
- Never expose credentials or secret-bearing configuration in manifests or reports.

## Coordination with Quality Review

Use this skill to produce Agent evaluation evidence. Use `neko-quality-review` to review whether the evidence and broader repository quality gates are sufficient. Keep the detailed evaluation workflow here rather than duplicating it in the general quality-review skill.

## Output Format

Report work in this shape:

```text
Evaluation Scope
- Change/feature:
- Why evaluation is or is not required:
- Canonical path:
- Forbidden fallback:

Cases
- Created or updated:
- Assertions and evidence:
- Missing observability or unsupported runner features:

Verification
- Ran:
- Passed/failed:
- Not run and reason:

Residual Risk
- ...
```
