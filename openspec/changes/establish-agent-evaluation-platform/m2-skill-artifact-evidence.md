## M2 Skill And Artifact Pilot Evidence

Run date: 2026-07-13

### Migrated pilot

- Suite/case: `skill.evaluation-artifact-author / create-portable-skill-artifact`.
- Migrated source: the v1 portable Skill creation scenarios.
- Target identity: project `evaluation-artifact-author` Skill with Host source,
  provenance, root, relative location, and Host-computed package fingerprint.
- Canonical path: TUI App/session owner -> input queue -> AgentSession -> Skill
  lifecycle/prompt composition -> `CreateSkill` -> contained project artifact ->
  session facts and public file validator.
- Forbidden fallback: ordinary `Write`, legacy Skill authoring, `.neko/skills`, direct
  Agent turn execution, and final-answer-only success.

### Key-free evidence

- Command: `pnpm test:agent:eval`.
- Result after M2 pilot implementation: 12 files, 110 tests passed.
- The pilot orchestration test copies the real fixture, evaluates all typed hard gates,
  validates the real generated file, writes v2 reports, and cleans the workspace.
- Negative variants keep the final answer `Created successfully.` while independently
  breaking Skill composition, model binding, task result observation, artifact delivery,
  and no-fallback evidence. Every variant returns `case-fail`.
- Dry-run command: `node scripts/agent-eval/protocol-smoke.mjs --suite
  skill.evaluation-artifact-author --case create-portable-skill-artifact --dry-run`.
- This is harness/path-contract evidence, not provider behavior acceptance.

### Real TUI attempts

1. Default bundled command, run id `run-m2-skill-artifact-real`:
   - Actual model: `nekoapi-chat/gpt-5.5`.
   - The model created the expected canonical `SKILL.md`; the contained digest and UTF-8
     artifact check passed.
   - Outcome: `configuration-invalid` because the bundled executable predates the M2
     `configuration`, `evidenceCompleteness`, and prompt-composition facts contract.
2. Current source command, run id `run-m2-skill-artifact-source`:
   - Outcome: `infrastructure-fail` before session creation.
   - Blocker: the current Node/tsx loader treats the `neko-assets/agent-headless` extension
     package as CommonJS and cannot consume its named TypeScript export.
3. Current `build:bundle` output:
   - Node run id `run-m2-skill-artifact-bundle` failed before session creation because an
     ESM bundle dependency attempted a dynamic CommonJS `require`.
   - Bun run id `run-m2-skill-artifact-bun-bundle` ended before the debug protocol returned
     a response.

Raw reports remain under the gitignored `reports/agent-eval/skill.evaluation-artifact-author/`
directory. None of these blocked attempts is reported as a passing real Agent case.

### Residual risk

- Real M2 facts acceptance remains blocked until a current TUI build can start through the
  canonical debug automation command.
- The successful artifact side effect from the stale binary proves the model/Tool path only
  partially; it cannot prove the new Skill Host identity or prompt-composition facts.
- The real case is one configured-model sample and intentionally has no Judge or baseline.
