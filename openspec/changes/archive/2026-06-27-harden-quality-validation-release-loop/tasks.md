## 1. OpenSpec and Policy

- [x] 1.1 Create proposal, design, spec, and tasks for the quality validation and release loop.
- [x] 1.2 Define Engine and Webview as explicit validation surfaces in the new spec.
- [x] 1.3 Define pre-implementation feasibility expectations for L3/L4 changes.
- [x] 1.4 Document prelaunch breaking compatibility policy and validation expectations.
- [x] 1.5 Document component reuse audit expectations before adding Webview/React components.
- [x] 1.6 Document that new-path development must remove or isolate legacy compatibility paths.
- [x] 1.7 Document that development/test defaults must not let compatibility fallback mask new-path failure.
- [x] 1.8 Document shared foundation audit expectations for cross-cutting behavior.
- [x] 1.9 Document cross-package capability reuse audit expectations.
- [x] 1.10 Document residual/debt and unused-code checks as development validation evidence.
- [x] 1.11 Document that a legacy-path hit during new-path development/validation must fail closed instead of returning legacy success.
- [x] 1.12 Document path-level new-path acceptance so result-only fallback tests cannot prove a new path works.
- [x] 1.13 Document local-client proportional design and defensive-code limits to avoid overdesign and overdefense.
- [x] 1.14 Document fail-visible handling so fallback, compatibility, defaults, and no-ops cannot hide code defects.

## 2. Quality Gate Implementation

- [x] 2.1 Add machine-readable release-channel governance under `quality/`.
- [x] 2.2 Add a validation script for release-channel metadata.
- [x] 2.3 Add `check:quality` to run release-channel validation, code-debt ledger validation, Agent boundaries, and 3D Route A boundaries.
- [x] 2.4 Wire `check:quality` into GitHub Actions code-quality.

## 3. Release Hardening

- [x] 3.1 Remove swallowed VSIX packaging failures from CI main-branch packaging.
- [x] 3.2 Remove swallowed VSIX packaging failures from tag release packaging.
- [x] 3.3 Add expected artifact checks for TS extension packaging loops.

## 4. Validation

- [x] 4.1 Run `node scripts/check-release-channels.mjs`.
- [x] 4.2 Run `pnpm check:quality`.
- [x] 4.3 Run focused workflow/static checks for changed YAML/scripts/docs.
- [x] 4.4 Run `openspec validate harden-quality-validation-release-loop`.
- [x] 4.5 Record any smoke checks not run and why: full `pnpm ci:local`, `pnpm smoke:engine`, and `pnpm smoke:webview` were not run because this change only wires existing quality scripts, release metadata, and workflow fail-closed behavior; the direct quality gate, YAML parse, OpenSpec validation, and formatting checks cover the edited surfaces.

## 5. OpenSpec and Debugger Skill Smoke

- [x] 5.1 Add CI OpenSpec validation for `openspec/**` changes.
- [x] 5.2 Add a local VS Code debugger Skill smoke harness that connects to an existing remote-debugging session without installing VSIX.
- [x] 5.3 Run the VS Code debugger Skill smoke: `pnpm smoke:vscode-debugger -- --skill vscode-extension-debugger --require-webview` observed VS Code CDP page and webview targets from the running debugger session and recorded the Skill test evidence.
- [x] 5.4 Add `pnpm smoke:webview:runtime` as the default Extension Webview runtime smoke entry so visual/interaction validation uses VS Code debugger Skill instead of a regular browser.

## 6. Strict TypeScript Baselines

- [x] 6.1 Enable or gate strict TypeScript for `neko-market` extension.
- [x] 6.2 Enable or gate strict TypeScript for `neko-agent` extension.
- [x] 6.3 Add quality automation so these strict gaps cannot silently regress.
- [x] 6.4 Run focused typecheck/build validation for both packages.
