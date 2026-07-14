## 1. Architecture And Migration Inventory

- [x] 1.1 Define the `apps/*` versus `packages/*` ownership matrix and dependency direction.
- [x] 1.2 Inventory Desktop modules, commands, dependencies, fixtures, scenarios, and durable state with a replacement or retirement decision.
- [x] 1.3 Inventory TUI and VSCode product entries, stable identities, CI, Evaluation, packaging, and release callers.
- [x] 1.4 Resolve active-change overlap and add application boundary checks before product movement.

## 2. Shared Contracts And Data Protection

- [x] 2.1 Define/reuse minimal application identity, handoff, startup diagnostic, and storage inventory contracts.
- [x] 2.2 Extract only proven shared host capabilities and keep single-product composition in its app.
- [x] 2.3 Add producer/consumer and fail-visible tests for shared contracts and missing capabilities.
- [x] 2.4 Prove settings, conversations, credentials, trust, installed packages, generated artifacts, and project data are preserved or explicitly rebuilt.

## 3. Neko Home

- [x] 3.1 Create `apps/neko-home` Electron main/preload/renderer, build, test, and package root without the Desktop editor shell.
- [x] 3.2 Compose the initial typed bridge, security, theme/i18n, settings, Engine Core, Agent conversation, resource, and handoff slice through canonical owners.
- [x] 3.3 Define and implement the Home multi-session application runtime with explicit session/runtime identity and independently owned config, queue, task, log, async, and resource state.
- [x] 3.4 Implement Codex-style session navigation and controls for create/select/resume/queue/cancel while keeping selection projection separate from runtime ownership.
- [ ] 3.5 Compose AIGC creation task/run projection, progress, diagnostics, retry/cancel, generated-output provenance/validation, and promotion actions through owning public contracts.
- [x] 3.6 Implement stable Resource/Artifact/Task handoff to professional tools without cache-path identity or Desktop editor fallback.
- [x] 3.7 Add initial Home boundary/unit/build/smoke tests and generalized Electron functional-host ownership.
- [x] 3.8 Pass the initial Home Electron startup/restart, typed IPC, Engine ready/unavailable, Agent/resource, handoff, and conversation-preservation scenarios.
- [ ] 3.9 Add deterministic instance-isolation and stale-identity tests plus real Electron scenarios for multi-session switching, background queue/task continuity, cancel/resume, and restart recovery.
- [ ] 3.10 Add real Electron scenarios for AIGC creation progress, generated-output identity/provenance/validation, failure diagnostics, and professional-tool handoff.

## 4. Neko TUI Build Root

- [x] 4.1 Create `apps/neko-tui` package metadata, executable build, typecheck, and tests.
- [x] 4.2 Move terminal runtime, Commander commands, Ink UI, presentation, Node host composition, tests, and debug automation into `apps/neko-tui`, retaining only proven host-neutral capabilities in existing public owners.
- [x] 4.3 Route root commands, CI, debug automation, ablation, cross-host conformance, and Agent Evaluation source/executable selection through `apps/neko-tui`.
- [x] 4.4 Add path-level tests proving the app owns the TUI source and executable while poisoning `@neko/cli`, package-local source, and legacy executable participation.
- [x] 4.5 Run focused real Agent Evaluation through the relocated `apps/neko-tui` source and record effective config, canonical-path, queue/resume/Skill/artifact, and forbidden-old-path evidence.
- [x] 4.6 Delete `packages/neko-agent/packages/cli-tui`, the `@neko/cli` dependency/export surface, and every package-local product, test, documentation, and tooling caller.

## 5. Neko For VSCode Build Root

- [x] 5.1 Confirm `packages/neko-suite` is a pure Extension Pack product root with no domain runtime.
- [x] 5.2 Create `apps/neko-vscode` with the preserved `neko.neko-suite` manifest, member extension IDs, packaging, README/license inputs, and release metadata.
- [x] 5.3 Update root scripts, workspace/Turborepo selection, CI/release, launch configuration, and Marketplace packaging to use the app root.
- [x] 5.4 Add manifest/boundary/VSIX tests proving exactly one product root and unchanged published identity.
- [x] 5.5 Run packaged install/activation plus focused Extension Development Host/Webview scenarios with runtime-error gates.
- [x] 5.6 Delete `packages/neko-suite`, checked-in obsolete VSIX output, and package-local product callers after acceptance.

## 6. Remove Neko Desktop

- [x] 6.1 Map every remaining Desktop scenario and source module to Home/shared coverage or explicit retirement.
- [x] 6.2 Delete CodeMirror/editor tabs, workbench renderer, creative-editor composition, project-editor fixtures, shell styles, and obsolete dependencies.
- [x] 6.3 Delete remaining Desktop main/preload/shared adapters only after reference scans and replacement tests prove no canonical consumer.
- [x] 6.4 Delete `packages/neko-desktop`, root build/start/test/smoke commands, CI/release entries, functional owner registration, scenarios, fixtures, and rebuildable outputs.
- [x] 6.5 Add legacy-debt/unused/boundary checks rejecting Desktop references, successful aliases, editor-shell dependencies, and buildable Studio roots.

## 7. Documentation And Final Validation

- [x] 7.1 Update Chinese/English README, architecture, package boundaries, client targets, contribution, release, test ownership, and navigation for the three app roots, complete TUI ownership, and no current Desktop/Studio product.
- [x] 7.2 Run OpenSpec validation, `git diff --check`, focused app/package tests, and path-level no-fallback assertions.
- [x] 7.3 Run real Home Electron, real TUI Agent Evaluation, and packaged VSCode Extension Development Host/Webview acceptance.
- [x] 7.4 Run `pnpm check:legacy-debt`, `pnpm check:unused`, `pnpm build`, `pnpm test`, `pnpm check`, and `pnpm ci:local`, recording external blockers.
- [ ] 7.5 Record removed product roots, preserved user-data policy, canonical build evidence, unexecuted validation, and residual risk before archive.
