## 1. Shared Contracts

- [x] 1.1 Add target-aware plugin transfer types for text, prompt, structured content, target refs, and mutation modes in `@neko-agent/types`.
- [x] 1.2 Extend plugin transfer command plan types to include `neko.canvas.importAgentContent` while preserving existing asset/storyboard command plans.
- [x] 1.3 Add Canvas Agent content/query request and result types in `@neko/shared`, including active context, selected-node summary, insertion point, and container target summaries.
- [x] 1.4 Add or extend tool-name constants for Canvas active context query and target-aware content application.
- [x] 1.5 Add contract tests for transfer payload narrowing, target references, unsupported plan results, and backward compatibility with existing payload kinds.

## 2. Agent Runtime And Webview Routing

- [x] 2.1 Update plugin transfer runtime planning to route new text, prompt, and structured content payloads to Canvas command plans.
- [x] 2.2 Preserve ordered expansion for asset batches while carrying target metadata through each expanded plan.
- [x] 2.3 Add confirmation/unsupported handling for targetless replace, unsupported target/content combinations, and ambiguous mutation modes.
- [x] 2.4 Update extension transfer bridge to execute the new Canvas command plan and return typed success/error details.
- [x] 2.5 Extend Agent Webview send actions to create typed transfer payloads for text, prompts, structured content, selected-node targets, and container targets.

## 3. Canvas Query APIs

- [x] 3.1 Extend `NekoCanvasAPI` with read-only active context, selection, insertion point, and container summary query methods.
- [x] 3.2 Implement active context queries in the Canvas extension/editor provider without exposing Webview-only runtime objects.
- [x] 3.3 Add compact node summary projection that omits large preview/media data by default and supports explicit detail options.
- [x] 3.4 Add focused container and child constraint summaries using existing generic container policy helpers.
- [x] 3.5 Register Agent capability tools for Canvas active context/query flows and mark them read-only/concurrency-safe.

## 4. Canvas Target-Aware Mutations

- [x] 4.1 Implement a shared Canvas service for applying Agent text, prompt, and structured content payloads to targets.
- [x] 4.2 Register `neko.canvas.importAgentContent` and route it through the shared Canvas service.
- [x] 4.3 Support node-field updates for validated prompt/text fields while preserving unrelated node data.
- [x] 4.4 Support insert/create-child modes through generic container membership actions and viewport insertion fallback.
- [x] 4.5 Reject invalid node, container, slot, field path, child type, cycle, and ambiguous replace requests atomically.
- [x] 4.6 Emit consistent Canvas change events for UI-triggered and Agent-triggered content applications.

## 5. Provider Gaps And Cross-Package Alignment

- [x] 5.1 Add a minimal `neko-assets` Agent capability provider for list/get/import asset flows using existing `NekoAssetsAPI` contracts.
- [x] 5.2 Add or defer a minimal `neko-model` Agent capability provider decision with explicit scope for scene snapshot query and model asset import.
- [x] 5.3 Add query-before-mutate guidance metadata for Canvas mutation tools and document how other providers should follow it.
- [x] 5.4 Audit existing Cut, Story, Sketch, Audio, Puppet, and Engine tools for missing read-only/destructive/concurrency metadata.

## 6. Tests And Documentation

- [x] 6.1 Add Agent runtime tests for new transfer payload routing, unsupported plans, batch target propagation, and safety gating.
- [x] 6.2 Add Canvas extension/provider tests for active context queries, compact summaries, target validation, and command execution.
- [x] 6.3 Add Canvas Webview or presenter tests for send-menu payload creation and selected-target behavior.
- [x] 6.4 Add provider tests for any new Assets/Model capability providers.
- [x] 6.5 Update architecture documentation with the query-first/evidence-second rule and the shared service path for UI and Agent mutations.
- [x] 6.6 Run focused package tests for `neko-agent`, `neko-canvas`, `neko-assets`, and any touched shared contract packages.
