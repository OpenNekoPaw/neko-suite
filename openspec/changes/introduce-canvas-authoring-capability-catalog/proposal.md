## Why

Agent can already call several Canvas node tools, and Markdown handoff now routes through Canvas-owned capabilities, but the visible `Send to Canvas` experience is still split between asset transfer and Markdown/table ingestion. This leaves Agent with tool names but not enough Canvas-owned authoring semantics to reliably create or repair nodes, containers, connections, media references, prompts, and storyboard structures as a closed loop.

Neko needs a general Canvas authoring capability surface: Canvas should expose its current node model, presets, container/connection rules, supported operations, and structured feedback, while Agent remains responsible for deciding whether and how to use Canvas for a user request.

## What Changes

- Add a Canvas-owned authoring capability catalog that Agent can query on demand. The catalog describes node types, presets, container policies, connection types/rules, targetable fields, resource identity rules, recommended recipes, supported commands, risk levels, and confirmation requirements.
- Replace the specialized Canvas Markdown storyboard Skill with a general Canvas authoring Skill. The Skill teaches Canvas semantics and operation strategy, including Markdown/table handling, storyboard composition, media nodes, prompts, resource binding, context queries, and feedback repair loops; it does not hard-route Agent into a storyboard-only workflow.
- Add Canvas-owned declarative field/profile descriptors so storyboard and future creative tables can extend scene, character appearance, voice, prompt, and execution fields without changing Agent code or hard-coding every field in Canvas runtime code.
- Treat storyboard authoring as prompt-first but field-backed: prompts are editable creative objects with semantic spans, `@` references, media embeds, provenance, and sync state; table columns become review projections over those semantic prompts and profile fields.
- Introduce a public `@neko/markdown` package that defines the unified Markdown extension syntax, pure parsing/projection contracts, diagnostics, and rendering adapter boundary for GFM tables, CommonMark image references such as `![alt](token#hint)`, `@` mentions, future Neko resource links/embeds such as `[[...]]` / `![[...]]`, semantic prompt spans, and stable handoff refs.
- Expand the Agent-facing Canvas command surface around query, mutation, and feedback:
  - keep and document node/context operations such as `canvas_get_active_context`, `canvas_list_nodes`, `canvas_get_node`, `canvas_create_node`, `canvas_create_composite`, `canvas_update_node`, `canvas_update_block`, and `canvas_apply_agent_content`;
  - expose connection query/mutation operations where Canvas already owns the underlying API;
  - add or expose delete/update operations only where they can be confirmation-gated, undo-aware, and return structured diagnostics.
- Standardize Canvas authoring command results so Agent receives stable created/updated/deleted node refs, connection refs, diagnostics, blocked reasons, and suggested next actions instead of opaque success/error strings.
- Reframe `Send to Canvas` and related chat buttons as Agent handoff shortcuts. A click creates an Agent-visible intent envelope with source content/resources/provenance; it does not directly execute Canvas commands or bypass Agent tool selection.
- Keep ordinary asset import as a distinct, explicitly named add-source/import operation. Asset transfer remains useful, but it is not the canonical Canvas authoring path.
- **BREAKING** for unreleased internal Skill/capability behavior: new Agent-to-Canvas authoring requests must not depend on `canvas-markdown-storyboard` as the primary Skill, direct Webview Canvas commands, old structured plugin-transfer payloads, or hidden Webview/Extension routing that mutates Canvas before Agent chooses tools.

### Non-Goals

- Do not introduce a standalone Canvas MCP server as the canonical implementation in this change. Canvas state is currently owned by the VS Code Custom Editor/Webview/Extension Host boundary; a future MCP server may adapt the same typed Canvas API after the Extension Host path is canonical.
- Do not make Agent own Canvas node schemas, storyboard recipes, connection rules, durable `.nkc` writes, resource authorization, or Canvas undo/history semantics.
- Do not create a universal compiler that turns arbitrary Agent output into Canvas JSON.
- Do not make every chat button a command invocation button. Buttons may create handoff intents, but Agent still decides whether to query Canvas, activate the Canvas Skill, call tools, ask for approval, or decline.
- Do not expose full `.nkc` document JSON to Agent when bounded summaries, catalog entries, refs, and explicit query tools are enough.
- Do not make Skill-authored field names, prompt strings, `@` mentions, or Markdown image tokens authoritative by themselves. They are hints until Canvas or the owning domain resolves them to trusted descriptors and stable refs.

## Capabilities

### New Capabilities

- `canvas-authoring-capability-catalog`: Canvas-owned authoring catalog, query/mutation command surface, node/container/connection operation semantics, and structured command feedback for Agent-led Canvas authoring.
- `agent-canvas-authoring-handoff`: Agent-led handoff behavior for `Send to Canvas` and similar shortcuts, including intent envelopes, Agent tool selection, no hidden Canvas mutation, and closed-loop result projection.
- `neko-markdown-extension-rendering`: Public `@neko/markdown` package and unified Markdown extension rendering pipeline for resource/entity references, creative tables, semantic prompt spans, diagnostics, rendering adapters, and stable handoff refs.

### Modified Capabilities

- None.

## Impact

- Shared contracts:
  - `@neko/shared` Canvas DTOs for authoring catalog entries, operation descriptors, targetable fields, connection descriptors, command diagnostics, Canvas refs, and authoring result envelopes where they cross package boundaries.
  - Existing tool-name constants and skill metadata for the new Canvas authoring query/command surface.
- New shared package:
  - `packages/neko-markdown` / `@neko/markdown` for Markdown extension grammar, pure tokenization/projection contracts, diagnostics, semantic prompt spans, reference syntax normalization, and optional React-safe rendering adapters.
  - The package must not import Agent, Canvas, VS Code, Extension Host modules, or domain implementation internals.
- Canvas extension:
  - `packages/neko-canvas/packages/extension/src/agentCapabilityProvider.ts` and related Canvas API adapters.
  - Canvas node, container, connection, active context, Markdown, media/resource, and generation command handlers.
  - Canvas-owned Skill registration and capability facet metadata.
  - Canvas field/profile registry and semantic prompt/prompt-alignment validators.
- Agent runtime and extension:
  - Tool discovery and Skill activation remain Agent-owned through `GetContext` / `ActivateSkill`.
  - Handoff routing must create Agent-visible intent/context payloads instead of hidden Canvas mutations.
  - Tool result handling must preserve Canvas refs, diagnostics, and next actions for follow-up repair or approval.
- Agent Webview:
  - `Send to Canvas` UI and related content actions become shortcut/handoff affordances.
  - Lifecycle/action rendering should distinguish Agent-led authoring results from direct asset import results.
  - Markdown rendering consumes `@neko/markdown` extension projections for GFM tables, `@` mentions, CommonMark image references, future resource-reference embeds/links, semantic prompt spans, diagnostics, and stable handoff refs.
- Compatibility and validation:
  - Existing Markdown ingest and creative table capabilities remain Canvas-owned tools, but their Skill entry point becomes part of the broader Canvas authoring guidance.
  - Path-level tests must prove Canvas mutation only happens after Agent-selected Canvas tools/capabilities run.
  - No Rust engine, Protobuf, or durable project migration is expected, except any `.nkc` schema metadata needed for new Canvas-owned authoring descriptors must follow existing project-file validation rules.
