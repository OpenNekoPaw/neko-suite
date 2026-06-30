## Why

Agent can produce useful Markdown for plans, storyboard tables, prompts, and resource references, but the current draft-runtime/compiler direction makes Agent and Agent Webview understand too much Canvas creation policy. That creates a thick intermediate protocol, repeats parser/compiler work for each new creative scenario, and still fails visible workflows such as rendering or binding image references in Markdown tables.

This change moves Markdown-to-Canvas from a compiler-first pipeline to a Canvas MCP-like capability model: Agent generates Markdown and intent, Agent Webview renders and diagnoses resource references, and Canvas owns validation, resource binding, node creation, and follow-up actions.

## What Changes

- Add typed Canvas Markdown capabilities for creating Markdown notes, tables, storyboard drafts, storyboard nodes, resource attachments, and validation-only previews.
- Add Agent Webview Markdown resource rendering for GFM tables, CommonMark images, resource token diagnostics, and a phased path for Neko resource-reference `![[...]]` / `[[...]]` embeds.
- Change Send to Canvas for Markdown content from direct payload transfer/compiler output to capability invocation with typed input/output DTOs and fail-visible diagnostics.
- Add skill/prompt output declarations for supported Markdown extensions and resource reference policy so skills can request `gfm-table`, `commonmark-image`, and later `resource-reference` without inventing raw paths or Canvas node JSON.
- De-canonicalize the existing `@neko/draft-runtime` storyboard compiler path for new work. Useful pure parsing or alias logic may be migrated into Canvas-owned capability implementation or Agent Webview display helpers, but new paths must not depend on `@neko/draft-runtime` as the cross-package contract.
- Keep `CompositeArtifact`, `GenericTable`, and existing structured content contracts for validated tool results, but stop using `neko-composite` as the preferred storyboard authoring format for Agent-generated Markdown drafts.

### Non-Goals

- Do not create a generic Markdown-to-Canvas compiler that tries to own every future Canvas node type.
- Do not let Agent or Agent Webview write `CanvasNode[]` directly as durable project facts.
- Do not make ordinary `.md` files automatically gain all Canvas authoring semantics.
- Do not persist Webview URIs, blob URLs, cache paths, system temp paths, Engine tokens, or raw local scratch paths as resource identity.
- Do not implement full document transclusion or Neko resource-reference embedding in the first phase; it is designed as a follow-up on the same renderer contract.

### Compatibility

This is a prelaunch cleanup of internal Agent/Canvas draft handoff behavior. Existing generated chat Markdown remains readable as text; existing internal draft-runtime tests and fixtures may be removed or rewritten when their only purpose is the old compiler path. No valuable user project data should be silently deleted; unsupported old storyboard draft transfer paths must fail visibly or be intentionally migrated to the Canvas capability path.

## Capabilities

### New Capabilities

- `canvas-markdown-capabilities`: Defines typed Canvas MCP-like capabilities for validating Markdown, binding stable resources, creating Canvas note/table/storyboard draft/storyboard nodes, returning diagnostics, and exposing follow-up actions.
- `agent-markdown-resource-rendering`: Defines Agent Webview Markdown rendering behavior for resource-aware GFM tables, CommonMark images, extension declarations, resource diagnostics, and phased Neko resource-reference embeds/links.

### Modified Capabilities

- None.

## Impact

- Contracts and shared types:
  - `@neko/shared` or Canvas public extension API for the minimal `CanvasMarkdownCapabilityInput` / `CanvasMarkdownCapabilityResult` DTOs.
  - Agent skill metadata and prompt templates that declare Markdown extensions and resource reference rules.
- Canvas:
  - `packages/neko-canvas/packages/extension/src/agentCapabilityProvider.ts` or successor capability provider.
  - Canvas Webview message/store/apply paths for creating text, table, storyboard draft, storyboard, and resource attachment nodes from capability results.
  - Canvas validators and diagnostics for Markdown storyboard/table input.
- Agent:
  - Agent Webview Markdown renderer and Send to Canvas menu/actions.
  - Agent Extension/Webview bridge request-response path for invoking Canvas capabilities.
  - Agent transfer runtime cleanup for old Markdown storyboard payload/compiler paths.
- Resource access:
  - Host-side content access, resource cache projection, and local resource projection remain the only allowed path for resolving resource refs into Webview-safe display URIs.
  - Markdown resource references must remain stable refs, document resource refs, workspace-relative paths, or `${VAR}/path` where allowed by existing content-access policy.
- Cleanup and validation:
  - Remove or fail-close new-path usage of `@neko/draft-runtime` and old storyboard draft compiler transfer paths.
  - Add contract, renderer, capability, bridge, and path-level tests proving the Canvas capability path is hit by default.
