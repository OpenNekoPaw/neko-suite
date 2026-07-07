## ADDED Requirements

### Requirement: Agent tools cannot directly access managed workspace storage

Agent-facing generic file tools SHALL deny direct read, write, delete, and list operations for managed workspace storage internals such as `workspace/.neko`, `.neko/.cache`, `.neko/logs`, `.neko/tmp`, entity stores, search indexes, resource manifests, and runtime data. Agent MAY consume sanitized domain projections produced by owning runtimes.

#### Scenario: Generic file read targets `.neko`

- **WHEN** an Agent generic file tool receives a path under `workspace/.neko`
- **THEN** the tool SHALL return a fail-visible diagnostic
- **AND** it SHALL NOT read the file through a direct filesystem fallback

#### Scenario: Domain projection summarizes managed storage

- **WHEN** Agent needs memory, asset, entity, search, or content context derived from managed workspace storage
- **THEN** the owning domain runtime SHALL provide a sanitized projection, summary, stable ref, or diagnostic
- **AND** the Agent SHALL NOT receive cache manifests, index files, database paths, log paths, or runtime token files as reusable context

### Requirement: TUI registers Agent content tools through domain capability providers

TUI SHALL register content, asset, entity, and search tools through domain capability providers backed by host ports. It MUST NOT rely on VSCode Extension-only internal tool factories or Webview projection paths for headless Agent turns.

#### Scenario: TUI tool context includes document tools

- **WHEN** TUI initializes an Agent session with content capabilities available
- **THEN** `GetContext` with tool listing SHALL include `ReadDocument` and `ReadImage`
- **AND** those tools SHALL route through the content-domain runtime rather than extension-internal implementations

#### Scenario: TUI rejects path-only image inputs

- **WHEN** TUI Agent calls `ReadImage` with cache paths, EPUB entry paths, Webview URIs, or path-only image inputs that lack a stable `resourceRef`
- **THEN** the tool SHALL fail with a diagnostic
- **AND** it SHALL NOT recover success by scanning `.neko/.cache`, document-reader scratch directories, or Webview projection fields

### Requirement: Agent storage mutations are proposal-based

Agent SHALL NOT directly commit `.neko` mutations. When Agent identifies a useful memory, asset, entity, search, or project-local configuration update, it SHALL emit a mutation proposal or tool result for the client/domain runtime to validate and commit.

#### Scenario: Agent proposes memory update

- **WHEN** Agent determines that project memory should be updated
- **THEN** it SHALL produce a structured proposal or invoke an approved client/domain mutation path
- **AND** the actual `.neko` write SHALL be performed by the client process or owning domain runtime after policy and validation

#### Scenario: Agent proposes search rebuild

- **WHEN** Agent determines that a search or semantic index should be rebuilt
- **THEN** it SHALL request or propose the operation through a domain/client command
- **AND** it SHALL NOT directly rewrite search index files under `.neko`

