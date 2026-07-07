## ADDED Requirements

### Requirement: Content access composes through host ports for non-VSCode clients

The cross-domain content access runtime SHALL support composition from host-neutral filesystem, workspace, path, diagnostics, and access-policy ports so non-VSCode clients can read documents and resources without importing VSCode Extension internals.

#### Scenario: TUI reads a document through content access

- **WHEN** TUI registers content reading capabilities for a workspace
- **THEN** `ReadDocument` SHALL resolve supported text, EPUB, PDF, CBZ/CBR, Office, or document sources through content-domain runtime composition backed by TUI host ports
- **AND** it SHALL return stable source refs, locators, text, manifest data, and `imageInfo[].resourceRef` without requiring a Webview URI

#### Scenario: TUI reads document images through content access

- **WHEN** TUI passes `ReadDocument.imageInfo[]` entries to `ReadImage`
- **THEN** image materialization and metadata resolution SHALL use content-domain runtime composition backed by host ports and cache-hidden resource refs
- **AND** the result SHALL NOT expose cache paths, document entry paths, or Webview URIs as successful durable identity

### Requirement: Content capability ownership stays in the content domain

Document and image reading capability factories SHALL be owned by the content domain or a content-owned capability subpath. VSCode Extension and TUI hosts SHALL register those capabilities through their composition roots instead of importing each other's internal tool implementations.

#### Scenario: VSCode and TUI register the same content capability

- **WHEN** VSCode Extension and TUI initialize Agent capabilities
- **THEN** both hosts SHALL register document and image reading tools from the content-owned capability boundary
- **AND** neither host SHALL import tool factories from the other host's internal source tree

#### Scenario: Agent package remains domain-neutral

- **WHEN** content reading tools are made available to Agent sessions
- **THEN** `@neko/agent` SHALL consume tool and capability contracts without becoming the owner of document parsing, document image refs, or content materialization behavior

### Requirement: Host-specific projection is target-bound

Content access SHALL create Webview URI projection only for VSCode/Webview display targets. Headless TUI and CLI targets SHALL receive stable refs, metadata, diagnostics, saved output paths, or provider attachments instead of Webview-only handles.

#### Scenario: TUI requests content for terminal workflow

- **WHEN** a TUI workflow reads a document, image, generated output, or asset reference
- **THEN** the content access result SHALL use stable source refs, `ResourceRef`s, metadata, attachments, diagnostics, or user-facing saved output paths
- **AND** it SHALL NOT require `webviewUri`, blob URL, preview token, or Webview runtime state

#### Scenario: VSCode Webview requests display projection

- **WHEN** a VSCode Webview needs to display a content resource
- **THEN** Extension Host SHALL request projection through the authorized Webview/content access boundary
- **AND** projection failure SHALL be surfaced as diagnostics or omitted renderable output instead of falling back to raw local or cache paths

