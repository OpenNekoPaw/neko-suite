# Quality Review Evidence

## Findings

- **Blocking:** `scripts/agent-eval/suites/skills/creation-persona/suite.json` contains one public canonical case, uses `repositoryRevision: working-tree`, and has no holdout or protected regression selection. Stable current-v2 platform revisions now exist, but no human approval record binds a candidate and protected matrix to one of them, so the real Skill Debug Functional pilot and task 7.1 remain blocked.
- **Blocking:** repository-wide `check:legacy-debt`, `check:unused`, and `check:quality` are not green. The failures are outside the new optimization modules, but task 7.4 explicitly requires these gates.
- **Resolved during review:** blocked holdout/regression checks previously substituted an unrelated report id to satisfy a non-empty schema. Blocked checks now retain an empty evidence list, while pass/fail checks require real report evidence.
- **Resolved during review:** optimization history previously appended four checkpoints as separate writes, used candidate-independent checkpoint ids, and could not form a second explicit baseline after an accepted/rejected candidate. It now validates and writes a batch atomically, detects a changed history snapshot, derives candidate-specific ids, binds decision/candidate/approval, and parents the next baseline to the unique terminal checkpoint.
- **Resolved during review:** optimization budget usage previously represented provider cost as a bare number, allowing unavailable evidence to be supplied as zero. It now reuses Evaluation cost availability and blocks acceptance when cost is unavailable.

No remaining change-specific correctness or architecture finding was identified after the focused regressions passed.

## Risk and architecture

Risk is **L3** because this change defines an AI workflow, real model/Judge comparison, isolated build execution and durable development-history contracts.

- Responsibility: the external Evaluation platform owns intake, candidates, approval evidence, isolated execution, blind comparison and history; Agent runtime remains the system under test; Market retains package version/publication/install ownership.
- Dependency: optimization imports Evaluation schemas, suite discovery, Judge adapters, comparison and implementation-ablation targets only. It does not import Agent runtime internals or add a product CLI/Skill/Dashboard path.
- Interface: strict schemas bind full Host Skill identity, Host package fingerprint, evidence refs, budget and required matrix. Unknown fields, Market state, hidden prompts and stale identities fail visibly.
- Extension: new Prompt/Skill targets reuse one owner gate and one isolated-target contract. Configuration variants remain canonical session settings; implementation changes remain isolated revisions/builds.
- Testing: schema, history, report intake, candidate artifact, approval, holdout, isolated evaluation, blind comparison, acceptance and end-to-end synthetic state-machine paths have key-free coverage. Real output-content acceptance remains blocked as recorded in `verification.md`.

## Evaluation evidence

- Target identity/fingerprint lineage: baseline and variant identities/fingerprints are recorded in `verification.md`; no accepted local checkpoint has been created.
- Target model: `nekoapi-chat:gpt-5.5` for the retained blocked implementation attempt.
- Judge: configured `openai:gpt-5-mini`, not executed because hard/effective-config evidence was invalid.
- Usage/cost: target report token/cost data and Judge cost are unavailable; the optimization contract now preserves unavailable cost and blocks the decision. Latency alone is not content quality.
- Holdout: no current `creation-persona` holdout case or trusted selection exists; no holdout input was exposed to an optimizer.
- Unexecuted: human approval, normal candidate apply, current-v2 baseline/candidate isolated runs, holdout, protected regression, blind A/B Judge and final accepted/rejected history.
- Remaining bias/overfitting risk: the only authored creative case is a single rain-station Draft prompt. Even a future green pilot needs paraphrase/adjacent-negative coverage, hidden holdout, protected regression and repeated samples; a favorable visible-case mean or formatting improvement is insufficient.

## Verification

See `verification.md` for commands and outcomes. Key-free harness and dry-run results prove contracts only. The real pilot and the three failing repository gates remain explicit completion blockers.
