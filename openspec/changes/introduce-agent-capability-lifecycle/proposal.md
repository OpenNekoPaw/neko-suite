## Why

Agent can already discover provider tools and Canvas now has Markdown capabilities, but cross-domain creative handoff still lacks one typed lifecycle for validation, review, approval, execution, diagnostics, and follow-up actions. Without that lifecycle, Canvas Markdown, Cut timeline creation, Model operations, and future interactive video planning will keep growing separate ad hoc DTOs, direct Webview routes, and legacy payload fallbacks.

## What Changes

- Add a shared Agent capability lifecycle contract for local MCP-like provider calls: describe, validate, review, apply, execute, and return typed diagnostics/actions/artifact refs.
- Extend provider metadata so Canvas, Cut, Model, Sketch, Puppet, and future domains can expose capability lifecycle descriptors without Agent importing their implementation modules.
- Add a typed capability invocation result shape that Agent can understand generically: status, diagnostics, review artifact, approval requirements, actions, created/changed refs, and safe next-step guidance.
- Make Canvas Markdown capability invocation use the same lifecycle path for Agent tool calls and Webview "Send to Canvas" shortcuts, while keeping Canvas as the owner of Markdown validation, resource binding, table profiles, and node creation.
- Add a Canvas-owned table profile layer for Markdown tables so storyboard is one profile among others, not a hardcoded table special case. Profiles can describe field aliases, required fields, unknown-column preservation, review metadata, and apply actions.
- Remove legacy Canvas structured transfer success paths for Markdown authoring drafts so new-path validation cannot silently pass through `canvasStoryboard`, `canvasStructuredContent`, or direct import command fallbacks.
- Keep the design proportional to a local VSCode client: no remote orchestration service, no universal Markdown compiler, no cross-domain workflow engine, and no Agent-authored Canvas/Cut/Model project JSON.

### Non-Goals

- Do not replace all existing tools with a new tool system.
- Do not make Markdown the durable project format for Canvas, Cut, Model, or interactive video.
- Do not let Agent or Webview generate final domain node JSON directly.
- Do not implement full Neko resource-reference Markdown transclusion in this change.
- Do not remove validated structured tool result rendering such as `CompositeArtifact` or `GenericTable`.

## Capabilities

### New Capabilities

- `agent-capability-lifecycle`: Defines the shared local MCP-like lifecycle for Agent invoking owning-domain capabilities, including typed descriptors, validation/review/apply phases, diagnostics, actions, approval context, artifact refs, table profile descriptors, and legacy path isolation.

### Modified Capabilities

- None.

## Impact

- Contracts:
  - `packages/neko-types/src/types/agent-capability.ts`
  - `packages/neko-types/src/types/tool.ts`
  - Canvas Markdown DTOs in `packages/neko-types/src/types/canvas-markdown-capabilities.ts`
- Agent runtime:
  - Capability registry and injection runtime.
  - Tool execution result handling and confirmation/permission integration.
  - Webview-to-Extension request/response path for capability invocations.
- Canvas:
  - Canvas capability provider, Markdown capability handlers, table parsing/profile logic, node creation adapters, and tests.
- Agent Webview:
  - `SendToMenu`, Markdown capability presenter, diagnostic/action rendering, and resource-aware Markdown rendering integration.
- Legacy cleanup:
  - Plugin transfer paths that allowed Canvas Markdown authoring drafts to succeed through old `canvasStoryboard`, `canvasText`, or `canvasStructuredContent` behavior.
- Validation:
  - Contract tests, provider tests, Agent runtime tests, Webview bridge tests, Canvas Markdown/table profile tests, poison-path tests for legacy transfer, and OpenSpec strict validation.
