## ADDED Requirements

### Requirement: Child-node slots render through generic node cards
The system SHALL render Canvas child-node slots through a generic `NodeCard` component backed by a `NodeCardPolicy` registry. Child-node slot rendering MUST NOT require adding node-type branches to a monolithic child card component for each supported node type.

#### Scenario: Scene child slot renders heterogeneous summaries
- **WHEN** a Scene content tree includes Shot, Media, Text, Annotation, Gallery, or Group child nodes
- **THEN** the child-node slot renders each child through `NodeCard` using the matching `NodeCardPolicy` or fallback policy

#### Scenario: New node type reuses card slots
- **WHEN** a new Canvas node type registers a `NodeCardPolicy`
- **THEN** the child-node slot renders its preview, metadata, badges, and actions without modifying the generic `NodeCard` component

#### Scenario: Unknown node type falls back
- **WHEN** a child node has no registered `NodeCardPolicy`
- **THEN** the child-node slot renders a bounded fallback card with a title, icon preview, and safe remove action

### Requirement: Node card policies produce pure view models
The system SHALL keep `NodeCardPolicy` implementations pure and synchronous. Policies MUST produce preview source descriptors, metadata, badges, and action descriptors without creating React elements, resolving runtime URLs, mutating stores, or sending extension messages.

#### Scenario: Policy resolves card metadata during render
- **WHEN** `NodeCard` resolves title, subtitle, badges, preview source, and action descriptors for a child node
- **THEN** the policy returns plain data that can be tested without mounting React or initializing a Webview runtime

#### Scenario: Runtime work stays in slots and dispatchers
- **WHEN** a card needs a preview URL or action side effect
- **THEN** `CardPreviewSlot` or a typed action dispatcher performs that runtime work outside the policy
