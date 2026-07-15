## REMOVED Requirements

### Requirement: Generated candidates appear as one runtime review Group
**Reason**: Creator-visible generated outputs become durable workspace outputs and ordinary persisted Inbox nodes; a runtime-only Group is no longer the canonical review surface.
**Migration**: Replace runtime projection creation with `canvas-workspace-inbox-projection`; preserve any resolvable source through an explicit retain/project action.

### Requirement: Runtime candidates expose unsaved lifecycle state
**Reason**: Creator-visible outputs are persisted before projection, so cache-backed unsaved/pinned state is no longer the normal lifecycle.
**Migration**: Present generated-output persistence, Board projection, optional Asset membership, unavailable, and failure as separate owner states.

### Requirement: Save to Assets is the promotion boundary
**Reason**: Save to Assets remains an explicit library-curation boundary but is no longer the durability or Board-authoring boundary.
**Migration**: Keep Asset promotion APIs for explicit curation and allow ordinary Board nodes to reference stable generated-output identity directly.

### Requirement: Durable Board authoring uses promoted Asset identity
**Reason**: Durable Board authoring may use either stable generated-output identity or a promoted Asset identity.
**Migration**: Update Canvas source validation and tests to accept canonical generated-output refs while still rejecting cache paths and runtime URIs.

### Requirement: Promotion and retry are idempotent and fail visible
**Reason**: Asset promotion idempotency remains Asset-owned, while Board projection idempotency moves to the Workspace Inbox projector and no longer forms one promotion/apply orchestrator.
**Migration**: Split existing promotion-and-apply orchestration into independent Asset promotion and Canvas projection operations with separate diagnostics.

### Requirement: Canvas deletion does not delete Asset Library content
**Reason**: The ownership rule now covers both generated-output and AssetLibrary content in the Workspace Inbox capability.
**Migration**: Preserve deletion behavior and move its canonical requirement to `canvas-workspace-inbox-projection`.
