## Why

The repository has quality policies and local validation commands, but several critical checks are still advisory rather than enforced in CI or release. This change turns the demand-development-test-validation loop into a traceable OpenSpec change and adds machine-readable release/channel governance before more feature work depends on it.

## What Changes

- Add a quality validation capability that requires non-trivial changes to connect OpenSpec requirements, implementation tasks, validation commands, and residual risk.
- Promote existing Agent boundary, 3D Route A, code-debt ledger, and release-channel checks into a single quality gate.
- Add release-channel metadata for local, canary, beta, stable, and disabled/dev-only package handling.
- Harden release packaging so a failed VSIX package step fails the workflow instead of being swallowed.
- Document Engine and Webview as separately constrained validation surfaces.

## Capabilities

### New Capabilities

- `quality-validation-release-loop`: Covers OpenSpec validation evidence, Engine/Webview专项门禁, CI quality gates, release-channel metadata, and local/pre-release feasibility checks.

### Modified Capabilities

- None.

## Impact

- Affected systems: OpenSpec change artifacts, `package.json` scripts, GitHub Actions CI/release workflows, `scripts/`, and `quality/` governance data.
- No runtime user behavior changes are introduced.
- Release workflows become stricter: packaging failures must be fixed instead of silently ignored.
