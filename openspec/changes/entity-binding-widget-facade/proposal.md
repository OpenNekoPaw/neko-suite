## Why

Creative tools can produce or edit character representations, but entity binding and lightweight entity edits currently require users to leave the creative context and open Dashboard. This causes duplicated UI work across Canvas, Sketch, Model, Agent, and Story, and risks inconsistent validation or entity writes.

## What Changes

- Introduce an Entity Facade command layer for binding, confirming, resolving, reading, and quick-editing creative entities from any VSCode extension host.
- Define `EntityBindingWidget` as a lightweight trigger protocol: tools expose buttons or menus, while entity writes remain centralized in the facade/runtime.
- Route Quick Edit through Extension Host native UI or Dashboard forms rather than per-Webview embedded editors.
- Require a project-scoped shared entity runtime/event bus so command results and `onDidChangeEntity` refreshes are observed consistently.
- Keep overlay components optional future UI containers; overlay MUST NOT own Quick Edit logic or become a dependency for this change.

## Capabilities

### New Capabilities

- `entity-binding-widget-facade`: Defines the shared facade commands, widget trigger protocol, quick-edit command behavior, runtime/event ownership, and cross-extension binding workflow for creative entities.

### Modified Capabilities

None.

## Impact

- `packages/neko-entity`: registers typed `neko.entity.*` facade commands and owns project-scoped runtime instances.
- `packages/neko-types`: may add serializable request/result DTOs and guards for facade commands.
- `packages/neko-dashboard`: continues to provide complex entity management and can reuse facade commands.
- `packages/neko-agent`, `neko-canvas`, `neko-sketch`, `neko-model`, `neko-story`, `neko-assets`: add only trigger points or command calls, not duplicated entity editing forms.
- Tests cover command validation, runtime sharing, event propagation, quick-edit validation, and no direct Webview writes.
