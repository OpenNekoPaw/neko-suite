## Context

Current Agent-to-Canvas behavior has useful pieces but not a unified authoring contract:

- Asset/image handoff uses `sendToPlugin` and `neko.canvas.importAsset`. This is an add-source/import path, not Canvas authoring.
- Markdown/table handoff uses `requestCanvasMarkdownHandoff` so Agent can select Canvas Markdown capabilities. This is closer to the desired boundary, but it remains Markdown-oriented.
- Canvas already exposes Agent tools such as `canvas_get_active_context`, `canvas_list_nodes`, `canvas_get_node`, `canvas_create_node`, `canvas_create_composite`, `canvas_update_node`, `canvas_update_block`, `canvas_apply_agent_content`, and Markdown lifecycle capabilities.
- Shared Canvas contracts already define node types, presets, connection types, container policies, active context summaries, and agent operation DTOs.
- The current Canvas Skill is `canvas-markdown-storyboard`, which is too narrow. It teaches a specific Markdown storyboard workflow instead of Canvas as a general authoring surface.
- Storyboard authoring is increasingly prompt-first: users directly modify image/video/voice prompts, while table fields exist to make the creative state reviewable, bindable, and batch-operable.
- Agent Markdown rendering already supports GFM, resource token projection, CommonMark image projection, and Canvas Markdown handoff, but the extension handling lives in Agent Webview and is not yet a public `@neko/markdown` package shared by Agent, Canvas, and future Markdown-capable surfaces.

The architectural gap is not lack of a single mutation tool. The gap is that Agent can discover tool names but cannot query Canvas-owned authoring semantics: supported node families, presets, container and connection rules, targetable fields, recipes, operation risks, repairable diagnostics, and how to compose query/mutate/feedback loops.

### Five-layer analysis

| Layer                 | Analysis                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Responsibility        | `@neko/markdown` owns Markdown extension grammar, pure tokenization/projection contracts, syntax diagnostics, semantic prompt span projection types, and rendering adapter boundaries. Canvas owns Canvas domain semantics, node/preset/container/connection rules, field/profile descriptors, semantic prompt validation, active editor state, validation, undo/history participation, resource binding, and diagnostics. Agent owns reasoning, Skill activation, tool choice, repair loops, approval decisions, and user-facing explanation. Agent Webview owns shortcut presentation, diagnostics display, renderer composition, and intent handoff only. Extension Host owns VS Code commands, Custom Editor access, Webview bridge, authorization, and capability provider registration. |
| Dependency            | `@neko/markdown` core must not import Agent, Canvas, VS Code, React, DOM, or feature package internals. If React helpers are needed, they must live behind a React-safe subpath such as `@neko/markdown/react`. Shared DTOs live in `@neko/shared` only when broader non-Markdown packages need them; Markdown syntax/projection DTOs should live in `@neko/markdown`. Canvas implementation stays in `neko-canvas`; Agent must not import Canvas internals or hard-code Canvas recipes. A future MCP server can wrap the same typed Canvas authoring API but must not become the source of truth before the Extension Host path is canonical.                                                                                                                                                |
| Interface             | The main interfaces are a Canvas authoring catalog query, active context queries, bounded node/connection query tools, declarative field/profile descriptors, semantic prompt blocks, prompt-field alignment diagnostics, confirmation-gated mutation tools, `@neko/markdown` extension projections, resolver adapter contracts, renderer adapter contracts, and structured authoring result envelopes. The interface is not raw `.nkc` JSON, direct `CanvasNode[]` authoring by Agent, hidden Webview commands, or old plugin-transfer structured payloads.                                                                                                                                                                                                                                  |
| Extension             | New Canvas node types, presets, subsystems, connection rules, recipes, field descriptors, semantic prompt spans, or generation actions are added by Canvas-owned descriptors and tool registrations. Agent consumes the catalog dynamically through `GetContext(includeTools)` plus Canvas query tools/Skill guidance. Other domains can follow the same pattern by providing their own domain catalog and tools without Agent core changes.                                                                                                                                                                                                                                                                                                                                                  |
| Testing               | Contract tests cover catalog DTOs, operation descriptors, structured diagnostics, and result refs. Canvas provider tests prove catalog/tool/Skill registration. Agent route tests prove shortcut handoffs become Agent-visible context and that Canvas mutations only happen through Agent-selected tools. Path-level tests poison hidden Webview/direct command/legacy plugin-transfer paths. VS Code Webview runtime smoke validates the button-to-Agent-to-Canvas loop when UI behavior changes.                                                                                                                                                                                                                                                                                           |
| Proportionality       | This remains a local VS Code client design. It uses typed provider tools and local Extension APIs already present in Neko Suite. It does not introduce remote service discovery, a distributed command bus, tenant policy, or a standalone MCP server as canonical infrastructure.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Fail-visible behavior | Unknown node types, presets, container policies, connection endpoints, target fields, field descriptor ids, prompt span types, catalog versions, unregistered tools, unsupported operations, missing approvals, unresolved `@` mentions, ambiguous Markdown resource refs, runtime-only resource identities, and stale node refs return typed diagnostics or throw in tests. They must not fall back to no-op success, generic empty data, hidden import, or direct Canvas JSON mutation.                                                                                                                                                                                                                                                                                                     |

## Goals / Non-Goals

**Goals:**

- Provide a Canvas-owned authoring catalog query that Agent can call on demand.
- Replace specialized Canvas storyboard Skill guidance with a general Canvas authoring Skill.
- Define query -> command -> feedback loops for nodes, containers, connections, blocks, Markdown/table content, media/resource refs, prompts, and generation preparation.
- Support declarative Canvas field/profile extension so scene facts, character appearance, voice cues, prompt spans, and execution fields can be registered without changing Agent core.
- Make storyboard authoring prompt-first but field-backed: users can edit prompts directly, while Canvas preserves semantic spans, field projections, prompt-field sync state, and repair diagnostics.
- Provide a public `@neko/markdown` package and unified Markdown extension rendering pipeline for tables, mentions, images, resource-reference syntax, semantic prompt spans, diagnostics, renderer adapters, and handoff refs.
- Standardize Canvas authoring result feedback so Agent can repair invalid calls by querying context/catalog and retrying or asking the user.
- Make `Send to Canvas` a shortcut that creates an Agent-visible handoff intent, not a direct Canvas command button.
- Keep direct asset import available as a clearly named import/add-source path outside canonical Agent authoring.
- Preserve existing Markdown ingest capabilities as Canvas tools inside the broader authoring model.

**Non-Goals:**

- Do not implement a standalone Canvas MCP server as the canonical path in this change.
- Do not make Agent own or duplicate Canvas node schemas, `.nkc` persistence, resource authorization, active editor state, or undo/history.
- Do not expose full `.nkc` JSON as the primary Agent context.
- Do not create a universal compiler from arbitrary Agent output to Canvas nodes.
- Do not bypass Agent reasoning through Webview/Extension keyword routing or hidden button commands.
- Do not make prompt reverse-parsing authoritative. Extraction from free-form prompt text may produce suggestions, but Canvas must not silently overwrite structured fields without descriptor validation and user/Agent apply intent.
- Do not make `@neko/markdown` a Canvas validator, resource authorizer, Agent router, document database, or domain execution layer. It provides syntax/projection contracts and adapters; owning domains resolve and validate semantics.
- Do not redesign visual Canvas editing UI beyond the handoff/result affordances needed for this contract.

## Decisions

1. **Use Extension Host typed Canvas capabilities as canonical; leave MCP server as future adapter.**
   - Canvas state depends on the active VS Code Custom Editor, Webview selection, viewport insertion point, local resource authorization, undo/history, and diagnostics.
   - The canonical implementation should therefore live behind `neko-canvas` Extension Host APIs and AgentCapabilityProvider tools.
   - A future MCP server may expose the same typed authoring API to external clients, but it should delegate to the Extension Host API instead of duplicating state ownership.
   - Alternative rejected: introduce a Canvas MCP server now as the source of truth. It would either lack active editor/Webview state or duplicate Extension Host logic.

2. **Add `canvas_describe_authoring_capabilities` as a read-only catalog query.**
   - The query returns the current Canvas authoring model: node types, presets, composability, container policies, accepted child rules, connection types/rules, subsystem manifests, targetable fields, resource policies, supported operations, recipes, and confirmation requirements.
   - The result should be bounded and versioned. Agent can request relevant sections instead of always loading everything.
   - Existing `GetContext(includeTools)` remains useful for tool discovery, but tool names alone do not describe Canvas semantics.
   - Alternative rejected: inject all Canvas semantics into the system prompt. That increases context cost and still cannot reflect active Canvas state or installed descriptor changes.

3. **Make the Canvas Skill general, not storyboard-specific.**
   - Replace or deprecate `canvas-markdown-storyboard` as the primary Skill with `canvas-authoring`.
   - The Skill describes how Agent should reason with Canvas: query catalog/context first, prefer composable presets, create scene/shot structures through composites, use media nodes for single assets, use Markdown capabilities for Markdown review/ingest, write prompts/params before generation, and repair from diagnostics.
   - Storyboard guidance remains a recipe inside Canvas authoring, not a dedicated Skill that owns the Agent route.
   - Alternative rejected: keep adding specialized Skills such as storyboard table, image board, prompt table, gallery prep. That makes Agent pick workflow names instead of Canvas capabilities and duplicates common Canvas rules.

4. **Use Canvas field/profile descriptors as field authority, not Skill text.**
   - Skill guidance may recommend columns, prompt sections, `@` references, and resource syntax, but it cannot define durable Canvas field semantics by itself.
   - Canvas owns a field/profile registry. Descriptors can be declarative and package-contributed: field id, namespace, aliases, value type, role, required/cardinality, storage target, prompt span behavior, and optional capability binding.
   - Unknown Skill-generated fields are preserved as custom/review metadata with diagnostics; they do not write semantic node fields or trigger execution until a trusted descriptor exists.
   - Capability-bound fields, such as voice/TTS, character/entity appearance, or generated media refs, must resolve to trusted owning-domain capabilities before execution.
   - Alternative rejected: hard-code every storyboard column in Canvas runtime code. That blocks AI-native iteration and forces code changes for ordinary field vocabulary changes.
   - Alternative rejected: let Skills dynamically define executable fields. That would let prompt text bypass Canvas/domain validation and approval.

5. **Represent storyboard as semantic prompts plus field projections.**
   - The primary creative object for AI-native storyboard rows is a semantic prompt document/block, not a one-way field table or a plain prompt string.
   - Prompt blocks contain editable text plus semantic spans for scene, character/entity refs, visual action, camera motion, style, resource refs, voice cues, and execution targets.
   - Table columns are review projections over prompt spans and profile fields. Field panel edits update bound prompt spans when possible; free-form prompt edits update sync state and may produce field suggestions, not automatic authoritative overwrites.
   - Prompt-field alignment stores provenance and state such as `in-sync`, `prompt-overridden`, `fields-changed`, or `conflict`.
   - Alternative rejected: full table as the only source of truth with derived prompts. It is reviewable but feels unlike AI-native prompt iteration.
   - Alternative rejected: plain prompt as the only source of truth with AI reverse parsing. It is natural to edit but too unstable for entity/resource binding and batch validation.

6. **Create `@neko/markdown` as the unified Markdown extension owner.**
   - `@neko/markdown` should define Neko Markdown extension syntax, tokenization, projection DTOs, diagnostics, normalizers, and resolver/renderer adapter contracts.
   - Core exports remain host-agnostic and UI-agnostic. They may parse and classify syntax but must not call VS Code APIs, Canvas APIs, Agent runtime, content access services, or React.
   - Optional React rendering helpers may live in a React-safe subpath and consume projection data, but Agent Webview owns final chat composition and package-specific controls such as Send to Canvas.
   - Agent Webview should keep CommonMark/GFM as the baseline and layer `@neko/markdown` extension projections over it.
   - Extension projections cover GFM tables, CommonMark images like `![alt](token#hint)`, `@` mentions, future `![[...]]` / `[[...#...]]` resource-reference syntax, semantic prompt spans, diagnostics, and stable handoff refs.
   - `@` denotes semantic mentions such as entity, character, Canvas node, file, scene, or asset. It resolves to stable refs through context/mention data or remains text with diagnostics.
   - `![alt](token#hint)` denotes media/resource embedding. The target base token resolves to a stable resource; the `#hint` fragment is placement/crop/panel/section intent, not durable identity.
   - `![[...]]` / `[[...]]` should be implemented as a Neko resource-reference extension with explicit resolver rules; it is not automatically an image and must distinguish media embeds from document/entity links.
   - Canvas and Agent may both consume the same projection contracts, but Canvas remains the authority for Canvas field/profile validation and Agent remains the authority for tool choice.
   - Alternative rejected: create a storyboard-only renderer. It would duplicate Markdown/resource logic and couple Agent Webview to Canvas storyboard fields.
   - Alternative rejected: keep Markdown extension parsing inside Agent Webview only. Canvas, Agent handoff, and future domains would either reparse differently or depend on Agent Webview internals.

7. **Expose operation families, not an unbounded raw editor API.**
   - Query tools: active context, node list/detail, connection list/detail, catalog, structured extraction.
   - Mutation tools: create/update/delete node, create/update/delete connection, create composite, update block, apply content, attach/import resource, Markdown ingest, generation preparation/trigger where already owned by Canvas.
   - Delete and update operations must be confirmation-gated, undo-aware, and return refs/diagnostics. If Canvas cannot provide safe deletion or connection update semantics in the current editor path, those operations should be omitted from the catalog instead of advertised.
   - Alternative rejected: expose full raw `.nkc` patch operations to Agent. That bypasses Canvas validation and makes repair/undo/resource safety worse.

8. **Standardize structured authoring feedback.**
   - Mutating commands should return an authoring result envelope with `status`, refs, diagnostics, blocked reason, changed fields, and suggested next actions.
   - Errors must be machine-readable enough for Agent repair: code, target, expected/received, retryability, required query, required approval, and safe user-facing message.
   - String `error` fields may remain as compatibility wrappers during transition, but new authoring tests should assert structured diagnostics.
   - Alternative rejected: rely on thrown exceptions or `{ success: false, error: string }` only. Agent cannot reliably repair invalid field paths, container violations, or connection endpoint errors from opaque strings.

9. **Treat `Send to Canvas` as a shortcut for Agent intent.**
   - The button builds a handoff envelope: source content, source kind, stable resource refs, title, provenance, user intent, optional target hints, and current conversation id.
   - Agent receives the handoff as context and decides whether to activate Canvas Skill, query the catalog/context, call Canvas tools, ask approval, import an asset, or explain why Canvas is not appropriate.
   - Asset import remains a separate explicit affordance such as `Import Asset to Canvas` or domain add-source action.
   - Alternative rejected: make the button directly invoke `canvas_create_node`, `canvas.ingestMarkdown`, or `neko.canvas.importAsset` based on Webview-side heuristics. That violates the Agent-first activation boundary and hides capability choice.

## Risks / Trade-offs

- [Risk] Catalog grows too large for model context. -> Mitigation: make the catalog query sectioned and summarized; keep detailed schemas behind optional `includeDetails` or per-node/preset filters.
- [Risk] Agent loops on invalid operations. -> Mitigation: diagnostics include retryability, required query, and blocked reasons; tests should cover one repair pass for common invalid preset/field/connection cases.
- [Risk] General Canvas Skill becomes vague. -> Mitigation: keep it action-oriented with concrete recipes and required query-before-mutate rules, while avoiding fixed storyboard-only workflows.
- [Risk] Declarative fields become a backdoor schema system. -> Mitigation: descriptors are validated, namespaced, and limited to storage/projection unless a trusted owning-domain capability binds execution.
- [Risk] Prompt and fields drift after user edits. -> Mitigation: store semantic spans, provenance hashes, sync state, diagnostics, and explicit apply/merge actions instead of pretending prompt reverse parsing is authoritative.
- [Risk] Markdown renderer becomes a Canvas implementation. -> Mitigation: Agent Webview produces display projections and stable handoff refs only; Canvas still owns validation, field interpretation, and node creation.
- [Risk] `@neko/markdown` becomes a dumping ground for domain behavior. -> Mitigation: keep core syntax/projection-only, require domain resolvers/adapters for entity/resource/Canvas semantics, and add boundary tests preventing Agent/Canvas imports.
- [Risk] Adding CRUD commands invites unsafe destructive edits. -> Mitigation: advertise delete/update only when Canvas can gate confirmation, preserve undo/history, and return precise affected refs.
- [Risk] Existing Markdown tests assume storyboard-specific Skill. -> Mitigation: migrate tests to assert Canvas authoring Skill metadata and Markdown capabilities as tools; keep old Skill name only as a temporary alias if required, with removal criteria.
- [Risk] UI labels confuse asset import with authoring. -> Mitigation: rename/import paths explicitly and assert that `Send to Canvas` creates Agent handoff context instead of direct import.
- [Risk] MCP pressure returns before the local API is stable. -> Mitigation: document that any MCP server must be an adapter over the typed Canvas API and may not duplicate Canvas active state.

## Migration Plan

1. Define shared Canvas authoring catalog, operation descriptor, diagnostic, ref, and result envelope DTOs.
2. Add the read-only Canvas authoring catalog query tool and provider tests.
3. Add Canvas field/profile descriptor contracts and validation for declarative fields, prompt spans, capability-bound fields, and unknown-field preservation.
4. Introduce `canvas-authoring` Skill and migrate current storyboard/Markdown guidance into Canvas recipes.
5. Add semantic prompt/prompt-field alignment contracts for storyboard rows and prompt blocks.
6. Introduce `@neko/markdown` with core syntax/projection contracts and migrate Agent Markdown extension projection for GFM tables, `@` mentions, CommonMark image fragments, future resource-reference syntax diagnostics, semantic spans, and stable handoff refs.
7. Update Canvas authoring tools to advertise query-before-mutate requirements and return structured result envelopes.
8. Expose connection query/mutation and delete/update operations only where Canvas API/editor support can provide validation, confirmation, undo, and structured feedback.
9. Change `Send to Canvas` and related chat buttons to create Agent handoff intents for all authoring-capable content.
10. Rename or separate direct asset import affordances so users and tests can distinguish import from Agent-led authoring.
11. Add path-level tests proving Canvas mutations occur only after Agent-selected Canvas tool/capability calls.
12. Update docs/architecture references after implementation stabilizes.

Rollback is local to Agent/Canvas Extension/Webview contracts. Before removing old aliases, the existing Markdown handoff and asset import paths can remain operational as explicit lower-level actions. If the general Skill or catalog fails validation, disable the new catalog tool and keep direct Markdown capabilities available, but do not restore hidden Webview mutation as the default `Send to Canvas` behavior.

## Implementation Slice Notes

- The first `@neko/markdown` slice ships only core syntax/projection exports. React rendering helpers are not added yet; Agent Webview continues to own React composition while consuming core projections.
- Neko resource-reference syntax `![[...]]` / `[[...#...]]` is projected and preserved, but returns unsupported-extension diagnostics until resolver-backed rendering and handoff semantics are implemented.
- Agent Webview resource rendering consumes `@neko/markdown` for CommonMark image targets, placement fragment handling, resource token normalization, and Neko resource-reference diagnostics. Tool-result resource indexing and stable resource binding remain Agent Webview presenter responsibilities.
- This slice deliberately does not make `@neko/markdown` a Canvas field validator, resource authorizer, or mutation authority; Canvas and owning domains still resolve durable semantics through their own descriptors and tools.

## Open Questions

- Should the first catalog version expose detailed targetable field schemas for every preset, or only compact summaries plus `canvas_get_node`/`canvas_get_active_context` for details?
- Should `canvas-markdown-storyboard` remain as a compatibility alias for one release cycle, or be removed immediately because the product is prelaunch?
- Should delete/update connection commands be in the first implementation slice, or should the first slice expose read/list/create only and add destructive connection edits after undo/history tests are stronger?
- Should semantic prompt span editing ship first in Canvas only, or should Agent Markdown rendering show read-only spans first and defer editing to Canvas?
