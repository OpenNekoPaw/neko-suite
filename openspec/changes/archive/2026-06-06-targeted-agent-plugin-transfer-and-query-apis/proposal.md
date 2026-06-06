## Why

Agent can already call many domain tools, but it still lacks a consistent way to query editor state before acting and to send generated content to a specific Canvas node, container, or plugin destination. Without structured query and target-aware transfer contracts, workflows fall back to screenshots/OCR or broad "send to plugin" commands, which is slower, less reliable, and unsafe for precise edits.

## What Changes

- Add a typed Agent plugin-transfer contract for text, prompts, structured content, media assets, and storyboard payloads.
- Add target-aware routing metadata so Agent and UI actions can send content to a selected node, explicit node, container, slot, or insertion point.
- Extend Canvas query contracts so Agent can retrieve active selection, viewport/insertion context, container children, and compact node summaries before mutating data.
- Add Canvas import/apply commands for Agent-generated text, optimized prompts, and structured storyboarding content, using the same domain service path as UI buttons.
- Define confirmation and safety policy for targetless writes, destructive replacements, and ambiguous destinations.
- Clarify that OCR and screenshots are optional visual evidence paths, not the primary source of editable project state.
- Prepare asset/model provider gaps for follow-up Agent tools where packages already expose command/API surfaces but lack capability providers.

## Capabilities

### New Capabilities
- `agent-plugin-transfer-contract`: Defines typed, target-aware transfer payloads and command-routing behavior for sending Agent outputs to Canvas, Cut, Sketch, Model, Explorer, and future plugin destinations.

### Modified Capabilities
- `agent-capability-injection`: Add requirements for tool metadata to distinguish structured query tools, mutation tools, destructive operations, and target/confirmation needs.
- `agent-multimodal-tooling`: Clarify that visual evidence tools supplement structured query APIs and must not replace state-query contracts for editable targets.
- `canvas-agent-composite-operations`: Add requirements for Agent-readable active Canvas context and target-aware text/prompt/structured-content application.
- `canvas-container-organization`: Add requirements for target-aware insertion into containers through generic container membership actions.

## Impact

- Shared contracts: `packages/neko-types/src/types/extension-api.ts`, `packages/neko-types/src/types/tool-names.ts`, Canvas and Agent transfer payload types.
- Agent runtime: plugin-transfer planning, Webview send menus, tool-result projections, confirmation policy.
- Canvas extension/webview: target-aware import/apply commands, active selection/context queries, container insertion dispatch.
- Capability providers: Canvas updates first; Assets and Model should receive minimal providers or adapter tasks in later implementation steps.
- Tests: contract tests for transfer payload routing, Canvas target resolution, query-before-mutate behavior, and Webview send-menu actions.
