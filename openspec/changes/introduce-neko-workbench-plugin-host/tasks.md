## 1. Architecture Artifacts

- [x] 1.1 Add the Workbench Core / Plugin Host ADR and link it from the architecture index.
- [x] 1.2 Validate the OpenSpec proposal, design, and specs.

## 2. Workbench Core Package

- [x] 2.1 Create `packages/neko-workbench-core` package metadata, TypeScript config, Vitest config, and public exports.
- [x] 2.2 Define host-neutral contribution, command, menu, keybinding, view, editor, resource source, Agent surface, viewport, host capability, diagnostic, and registry contracts.
- [x] 2.3 Implement contribution registry creation, duplicate detection, unsupported kind validation, required capability validation, and snapshot projection.
- [x] 2.4 Add boundary and registry tests proving Workbench Core has no React/DOM/VSCode/Electron/Node/feature-package dependency and fails visibly for invalid registrations.

## 3. Plugin Host Contract

- [x] 3.1 Define versioned Neko plugin manifest, contribution declarations, activation events, trust levels, permissions, and VSCode-subset compatibility DTOs.
- [x] 3.2 Implement manifest validation and plugin descriptor projection without executing plugin code.
- [x] 3.3 Add tests for valid manifests, unsupported versions, duplicate contribution ids, missing permissions, unsupported contribution kinds, and trusted/untrusted provenance.

## 4. Desktop Adapter Boundary

- [x] 4.1 Add a desktop workbench adapter module that maps the current desktop snapshot inputs into Workbench Core bootstrap contributions without making desktop the canonical contribution owner.
- [x] 4.2 Add tests proving desktop uses Workbench Core descriptors for workbench surfaces and records temporary bootstrap providers explicitly.

## 5. Documentation And Validation

- [x] 5.1 Update architecture/package boundary documentation to list `@neko/workbench-core` as the host-neutral workbench/plugin contract layer.
- [x] 5.2 Run focused typecheck/tests for `neko-workbench-core`, desktop adapter tests, OpenSpec validation, and relevant boundary checks; record any residual risk.
