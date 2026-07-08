## Context

The Workbench Core contract supports `agent-surface` contributions, but Desktop still creates Agent surface descriptors with `neko-desktop-bootstrap` as owner. This contradicts the owning-package rule: Agent owns Agent UI semantics and hosts only decide how to render a supported placement.

## Goals / Non-Goals

**Goals:**

- Move Agent surface descriptor ownership into `@neko-agent/webview`.
- Keep Desktop rendering behavior unchanged.
- Keep descriptors host-neutral and free of React component instances.

**Non-Goals:**

- Do not redesign Agent chat UI.
- Do not implement the floating composer UI in this slice.
- Do not change Agent runtime/session behavior.

## Decisions

### Decision: Agent Webview exports descriptors

`@neko-agent/webview` will export `createAgentWorkbenchSurfaceContributions()`, returning pure Workbench Core descriptors for right panel, main panel, and floating composer.

Alternative considered: put descriptors in desktop. Rejected because it makes Desktop the owner of Agent surface semantics.

## Risks / Trade-offs

- [Risk] Descriptor export from a webview package adds a non-React public entry. -> Mitigation: the entry exports data only and can be consumed by any host.

## Migration Plan

1. Add Agent descriptor module and package export.
2. Update Desktop bootstrap adapter to consume the Agent module.
3. Add tests and focused validation.
