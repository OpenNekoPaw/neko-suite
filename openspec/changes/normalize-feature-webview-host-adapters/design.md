## Context

Neko now has a Workbench Core contribution model and Desktop can consume Workbench Core snapshots. However, feature Webview integration still has host-specific wiring: Desktop imports feature roots or local runtime names directly, while VSCode Webviews use extension-owned setup and future hosts would need their own mapping. This creates drift in UI ownership, theme/i18n assumptions, logging/error behavior, and custom editor registration.

The correct boundary is package-owned UI semantics with host-owned shell effects. Feature packages own their React root, domain adapters, message schema, i18n keys, and runtime requirements. Hosts own VSCode Webview creation, Electron windows/preload, sandboxing, local resource projection, focus, and container placement.

This change is L2: it adds cross-package public contracts and Desktop adapter wiring, but does not alter VSCode runtime behavior, Webview CSP, Engine streaming, or durable project formats.

## Goals / Non-Goals

**Goals:**

- Define a host-neutral feature Webview adapter descriptor in Workbench Core.
- Let feature packages expose adapter descriptors through public subpaths.
- Let Desktop consume adapter descriptors as canonical package-owned metadata.
- Keep current Desktop rendering intact for migrated adapters.
- Make missing/unsupported adapter ids fail visibly.
- Preserve VSCode-specific Webview styles, CSP, and bridge behavior.

**Non-Goals:**

- Do not redesign or restyle feature Webview UI.
- Do not replace VSCode Webview providers in this slice.
- Do not make Workbench Core import React, DOM, VSCode, Electron, or feature package internals.
- Do not execute untrusted plugin UI.
- Do not introduce a full custom editor runtime loader beyond descriptor registration.

## Decisions

### Decision: Workbench Core owns adapter descriptor shape

Workbench Core will define `WorkbenchFeatureWebviewHostAdapterDescriptor` and validation helpers. The descriptor is pure data: stable id, owner, label/i18n key, surface kind, runtime entry id, supported hosts, required host capabilities, optional editor selectors, and theme/i18n requirements.

Alternative considered: keep descriptor types in Desktop. Rejected because VSCode, Desktop, and future hosts need the same metadata, and Desktop must not become the canonical UI registry.

### Decision: Feature packages own public descriptor factories

Feature packages may expose public subpaths such as `@neko-agent/webview/workbench-surfaces` or future `@neko-canvas/webview/host-adapter`. These subpaths return descriptors only. React components, stores, engine clients, VSCode bridges, and Electron handles stay behind package-owned runtime entries.

Alternative considered: import feature package internals from Desktop and infer descriptors. Rejected because it couples Desktop to package implementation layout and makes drift likely.

### Decision: Desktop uses a package adapter registry

Desktop will compose a registry of package-owned feature Webview adapter descriptors and use it when building custom editor Workbench contributions. Temporary Desktop bootstrap mappings may remain for unmigrated features, but they must be labeled as temporary and not claim package ownership.

Alternative considered: migrate every feature package in one change. Rejected as too broad; this slice proves the contract and the Desktop path with a small canonical set.

### Decision: Fail-visible adapter resolution

Unknown adapter ids, duplicate adapter ids, missing required host capabilities, unsupported hosts, and invalid selector/runtime combinations return diagnostics or throw in tests. They must not silently create empty panels or fall back to Desktop-owned descriptors.

## Five-Layer Analysis

Responsibility:

- Workbench Core owns descriptor contracts, validation, and diagnostics.
- Feature packages own UI roots, runtime adapter ids, i18n keys, and domain message contracts.
- Desktop owns Electron host effects, container placement, and descriptor consumption.
- VSCode extensions keep VSCode Webview lifecycle/CSP/resource mediation.

Dependency:

- Workbench Core remains host-neutral and cannot import feature packages.
- Desktop may import feature package public descriptor subpaths, not internals.
- Feature Webview packages may import Workbench Core types from public entrypoints.
- Extension Host continues to avoid React/Webview implementation imports.

Interface:

- Descriptor ids are stable and package-owned.
- Selectors and surface kinds are declarative.
- Runtime entry ids identify a package adapter but do not carry React elements or runtime handles.
- Diagnostics are machine-readable and host-displayable.

Extension:

- New creative packages add a public descriptor factory and Desktop/VSCode host wiring can register it without editing domain UI.
- Future plugin UI can map into the same descriptor model after Plugin Host execution exists.

Testing:

- Workbench Core tests cover valid descriptors, duplicate ids, unsupported hosts, missing capabilities, and forbidden runtime handles by shape.
- Desktop tests prove custom editor metadata for migrated adapters uses package owners.
- Focused typecheck/tests cover Workbench Core and Desktop.

Proportionality:

- A small descriptor contract is justified now because multiple feature packages and hosts already exist.
- A full runtime loader is deferred until package adapters are migrated beyond descriptor registration.

Fail-visible behavior:

- Missing adapter descriptor, duplicate id, unsupported host, and invalid descriptor shape fail with diagnostics.
- Desktop temporary bootstrap mappings remain visible as temporary and do not mask canonical package-owned adapters.

## Risks / Trade-offs

- [Risk] Descriptor factories in Webview packages could accidentally pull React/runtime dependencies into host code. -> Mitigation: descriptor subpaths export pure data only and tests assert serializable host-neutral shape.
- [Risk] Partial migration leaves a mixed registry. -> Mitigation: temporary Desktop mappings are explicit and tests distinguish package-owned descriptors from bootstrap descriptors.
- [Risk] Adapter ids become another naming layer. -> Mitigation: ids match Workbench contribution ids or package runtime entry names where possible and are validated for uniqueness.

## Migration Plan

1. Add Workbench Core descriptor and validation helpers.
2. Add package-owned descriptor factories for the initial feature adapters needed by Desktop.
3. Update Desktop workbench adapter to consume descriptor registry results.
4. Keep unmigrated mappings as explicit temporary bootstrap mappings.
5. Validate Workbench Core and Desktop focused tests.

Rollback: remove descriptor consumption from Desktop and return to existing bootstrap mapping. No durable project data migration is involved.

## Open Questions

- Which feature packages should be migrated immediately after the first canonical adapter set: Cut/Canvas, Preview, or Model/Sketch/Audio?
- Should descriptor factories eventually live in package root exports or remain narrow subpaths to avoid importing heavy Webview modules?
