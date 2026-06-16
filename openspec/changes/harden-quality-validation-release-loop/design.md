## Context

Current governance already defines risk levels, OpenSpec artifacts, and validation commands. The gap is enforcement: several important checks exist as scripts but are not bundled into CI quality gates, release packaging can ignore VSIX failures, and package channel intent is split between package groups and informal knowledge.

## Goals / Non-Goals

**Goals:**

- Make quality validation repeatable through one repository-level script entry.
- Keep machine-readable release/channel data outside `docs/`.
- Require Engine and Webview changes to carry explicit validation evidence.
- Preserve local developer velocity by reusing existing focused checks instead of forcing full smoke on every PR.
- Make release packaging fail closed.
- Add a local VS Code debugger smoke path that records Skill-based test evidence without requiring VSIX installation.

**Non-Goals:**

- Introduce runtime feature-flag execution or remote rollout services.
- Implement Marketplace publishing or staged VS Code Marketplace rollout.
- Close strict-mode gaps outside the scoped `neko-agent` extension and `neko-market` extension baselines.
- Add full VSCode UI automation for every Webview.
- Treat packaged VSIX installation as the required local development smoke path.

## Decisions

1. **Use `quality/` for machine-readable gates.**
   - Rationale: `docs/` explains policy, while `quality/` is consumed by scripts and CI.
   - Alternative considered: keep JSON under `docs/architecture/`; rejected because cleanup/docs migrations can accidentally remove gate inputs.

2. **Create `pnpm check:quality` as the CI entrypoint.**
   - Rationale: one script makes local, CI, and release readiness agree on the same quality gate.
   - Alternative considered: inline each command only in GitHub Actions; rejected because local reproduction becomes harder.

3. **Keep Engine/Webview smoke as explicit impact-based checks.**
   - Rationale: Engine smoke builds native artifacts and Webview smoke builds many packages; they are valuable but heavier than the boundary/ledger checks.
   - Alternative considered: run all smoke checks on every PR; deferred until baseline runtime cost is known.

4. **Model release channels as metadata first.**
   - Rationale: the project needs an auditable source for local/canary/beta/stable/dev-only policy before runtime rollout code exists.
   - Alternative considered: encode channel decisions directly in workflows; rejected because package membership and release policy would drift.

5. **Use VS Code debugger + Skill evidence for local Extension smoke.**
   - Rationale: local development validates the Extension Development Host and visible Webviews through the VS Code debugger, while the Skill file records the repeatable test procedure and evidence boundary.
   - Alternative considered: install a generated VSIX into a disposable profile for smoke; rejected because it validates packaging/install behavior rather than the debugger-driven development loop requested for feature work.

## Risks / Trade-offs

- [Risk] `check:quality` can fail on existing baseline debt. → Mitigation: only include checks that already pass and keep legacy debt tracked by ledgers.
- [Risk] release-channel metadata may be mistaken for runtime rollout. → Mitigation: document that it is governance input, not a remote feature-flag system.
- [Risk] release packaging becomes stricter and may expose latent package failures. → Mitigation: fail closed and surface the failing package in workflow logs.

## Migration Plan

1. Add OpenSpec artifacts for this governance change.
2. Add release-channel metadata and validation script.
3. Add `check:quality` and wire it into CI code-quality.
4. Remove swallowed VSIX packaging failures in CI/release packaging loops.
5. Validate local quality scripts, release-channel check, workflow shape, and OpenSpec artifacts.

Rollback is straightforward: remove the new `check:quality` CI step and channel check script if it blocks unexpectedly, while keeping the OpenSpec record as residual-risk evidence.

## Open Questions

- Should Engine/Webview smoke run on every main push only, every PR touching relevant paths, or as a separate required release workflow?
- What package/channel policy should govern Marketplace publishing once the project moves beyond prelaunch?
