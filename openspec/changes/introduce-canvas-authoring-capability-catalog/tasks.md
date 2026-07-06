## 1. Contract And Reuse Audit

- [x] 1.1 Audit existing Canvas Agent tools, Markdown lifecycle capabilities, node/preset/subsystem contracts, connection APIs, and Send to Canvas routes; record which contracts are reused, extended, deprecated, or kept Canvas-private.
- [x] 1.2 Define shared Canvas authoring DTOs for catalog sections, node/preset descriptors, container policies, connection descriptors, operation descriptors, targetable fields, Canvas refs, diagnostics, and authoring result envelopes.
- [x] 1.3 Add validators or type guards for catalog requests/results and authoring diagnostics where they cross Agent/Canvas package boundaries.
- [x] 1.4 Add or update tool-name constants for the authoring catalog query and any newly exposed Canvas connection/delete operations.
- [x] 1.5 Add contract tests proving catalog/result DTOs reject unsupported versions, runtime-only resource identities, malformed refs, and unknown operation descriptors fail visibly.
- [x] 1.6 Define `@neko/markdown` core projection DTOs for GFM creative tables, CommonMark image refs, `@` mentions, Neko resource-reference tokens, semantic prompt spans, diagnostics, resolver adapters, renderer adapters, and Canvas handoff refs.
- [x] 1.7 Define Canvas field/profile descriptor DTOs for dynamic fields, aliases, roles, value types, storage targets, prompt span behavior, capability bindings, and prompt-field alignment state.

## 2. Canvas Provider And Skill

- [x] 2.1 Implement a Canvas-owned authoring catalog builder from existing node types, presets, container policies, subsystem manifests, connection types/rules, targetable field summaries, recipes, and registered tools.
- [x] 2.2 Register `canvas_describe_authoring_capabilities` as a read-only Canvas Agent tool with section/filter parameters, localized metadata, traits, and bounded output.
- [x] 2.3 Replace the primary `canvas-markdown-storyboard` Skill contribution with a general `canvas-authoring` Skill that covers query-before-mutate, Markdown/table routing, storyboard recipes, media/resource binding, prompt persistence, generation prep, and repair loops.
- [x] 2.4 Remove the `canvas-markdown-storyboard` compatibility alias during prelaunch cleanup and assert storyboard guidance is available only through `canvas-authoring`.
- [x] 2.5 Update Canvas capability facets or provider metadata so Agent can discover Canvas authoring as a capability family without embedding Canvas semantics in Agent core.
- [x] 2.6 Add Canvas provider tests for catalog tool registration, section filtering, Skill metadata, zh/en localization, and absence of storyboard-only canonical Skill dependence.
- [x] 2.7 Implement Canvas field/profile descriptor validation for new scene, character appearance, voice cue, prompt span, and execution fields without requiring Agent core changes.
- [x] 2.8 Add Canvas catalog sections for registered field/profile descriptors, semantic prompt support, prompt-field alignment commands, and capability-bound fields.

## 3. Canvas Operation Feedback

- [x] 3.1 Add shared helpers in Canvas provider code to convert node, composite, block, apply-content, Markdown, and generation command results into structured authoring result envelopes.
- [x] 3.2 Update existing Canvas authoring mutation tools to return refs, status, diagnostics, blocked reasons, and suggested next actions while preserving compatibility wrappers where currently required.
- [x] 3.3 Expose connection list/detail/create operations to Agent using the existing Canvas API and validate endpoints, connection types, subsystem rules, and safe extension data.
- [x] 3.4 Decide implementation slice for node/connection update/delete operations; expose them only if confirmation, undo/history, validation, and affected-ref feedback are covered, otherwise mark them unavailable in the catalog.
- [x] 3.5 Ensure mutation tool descriptors include target requirements, query-before-mutate guidance, risk/confirmation metadata, and failure diagnostics.
- [x] 3.6 Add unit tests for successful composite creation, invalid child preset repair diagnostics, invalid connection endpoint diagnostics, stale node refs, missing approval, and runtime-only resource identity rejection.
- [x] 3.7 Add Canvas semantic prompt validation for prompt text, semantic spans, field projections, sync states, user overrides, field suggestions, and unresolved `@`/resource refs.
- [x] 3.8 Add tests proving free-form prompt edits do not silently overwrite fields and field edits produce explicit prompt alignment diagnostics or merge actions.

## 4. Markdown Extension Rendering

- [x] 4.1 Scaffold `packages/neko-markdown` as public `@neko/markdown` with core exports that are host-agnostic and do not import Agent, Canvas, VS Code, React, DOM, or feature package internals.
- [x] 4.2 Move or reimplement pure Markdown extension parsing/projection helpers in `@neko/markdown` for GFM creative tables, resource token normalization, CommonMark image targets, placement fragments, diagnostics, and source preservation.
- [x] 4.3 Define resolver adapter contracts for `@` mentions, resource tokens, CommonMark image targets, Neko resource-reference targets, semantic prompt spans, and renderable projection data.
- [x] 4.4 Add optional React-safe rendering adapter subpath only if reused UI helpers are needed in the first slice; otherwise keep React rendering in Agent Webview while consuming `@neko/markdown` core projections.
- [x] 4.5 Update Agent Webview Markdown rendering to consume `@neko/markdown` projections and provide Agent-specific resolvers for context chips, mention items, ambient Canvas nodes, tool-result resources, and diagnostics.
- [x] 4.6 Add explicit unsupported diagnostics or a resolver-backed implementation path for Neko resource-reference syntax `![[...]]` and `[[...#...]]`.
- [x] 4.7 Add read-only semantic prompt span projection for color/underline/chip display, source refs, field ids, diagnostics, and Canvas handoff metadata.
- [x] 4.8 Add package boundary and Agent Webview tests proving `@neko/markdown` core has no feature/host/UI imports, creative tables remain valid Markdown, unknown columns are preserved, `@` mentions do not resolve by display order, and runtime-only refs are not handed to Canvas.

## 5. Agent Handoff And UI Semantics

- [x] 5.1 Define a general Agent Canvas authoring handoff message/context payload that carries source content, source kind, stable resource refs, title, provenance, user intent, and optional target hints.
- [x] 5.2 Update Agent Webview `Send to Canvas` actions to create the Agent handoff intent for Markdown, generated text, structured content, and resource-backed content instead of directly invoking Canvas commands.
- [x] 5.3 Ensure Markdown-based Send to Canvas reuses `@neko/markdown` projection stable refs, diagnostics, semantic prompt metadata, and profile hints instead of reparsing through a second path.
- [x] 5.4 Keep or add explicitly labeled direct asset import/add-source affordances for asset transfer, and ensure their UI/result copy does not present them as Agent-authored Canvas composition.
- [x] 5.5 Update Agent Extension routing so Canvas authoring handoffs become Agent-visible context/user messages and do not pre-activate Canvas Skills or choose tools through host-side heuristics.
- [x] 5.6 Update Agent result rendering to preserve Canvas authoring refs, diagnostics, blocked reasons, prompt-field alignment status, and approval-gated next actions for follow-up turns.
- [x] 5.7 Add Webview and Extension route tests proving `Send to Canvas` does not call `neko.canvas.importAsset`, Canvas Markdown capabilities, or Canvas mutation tools before Agent-selected tool invocation.

## 6. Legacy Path Fail-Closed Cleanup

- [x] 6.1 Poison or remove new-authoring success through old structured plugin-transfer payloads, direct Webview Canvas mutations, storyboard-specific compiler fallbacks, and hidden Send to Canvas import routing.
- [x] 6.2 Update architecture boundary guards so Canvas tool localization/metadata remains out of Agent core and Canvas authoring semantics stay in Canvas provider/Skill/catalog contracts.
- [x] 6.3 Update existing Markdown handoff tests to assert Markdown capabilities remain Canvas-owned tools inside the broader Canvas authoring model.
- [x] 6.4 Add path-level tests proving final Canvas state assertions cannot pass through legacy fallback routes.
- [x] 6.5 Add path-level tests proving `@neko/markdown` projections do not become Canvas validation or mutation authority.

## 7. Validation And Documentation

- [x] 7.1 Run focused shared contract and Canvas provider tests for authoring catalog, Skill registration, command descriptors, field/profile descriptors, semantic prompt validation, and structured diagnostics.
- [x] 7.2 Run focused `@neko/markdown`, Agent Webview, and Extension tests for Markdown extension projection, handoff routing, shortcut semantics, lifecycle/result rendering, and direct import separation.
- [x] 7.3 Run OpenSpec validation for this change and update artifacts if requirements or tasks drift.
- [x] 7.4 Run affected package checks such as `pnpm --filter neko-canvas test`, `pnpm --filter neko-agent test`, and narrower Vitest commands selected during implementation.
- [x] 7.5 Run VS Code Webview runtime smoke with `vscode-extension-debugger` for the Markdown rendering and button-to-Agent-to-Canvas loop if UI behavior changes.
- [x] 7.6 Update Canvas/Agent/Markdown architecture docs after implementation stabilizes, including the Extension Host canonical path, prompt-first storyboard model, public `@neko/markdown` syntax/rendering boundary, and future MCP-server-as-adapter boundary.
