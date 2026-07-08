## ADDED Requirements

### Requirement: TUI project resource cache follows shared cache lifecycle

TUI Agent content access SHALL use the same project resource-cache root, manifest, quota policy, materialization rules, and GC lifecycle as the shared Host content-access runtime for workspace-scoped resources.

#### Scenario: TUI starts with a workspace
- **WHEN** TUI starts in a workspace with project resource-cache storage
- **THEN** it MUST initialize resource cache from the shared storage layout
- **AND** it MUST run or schedule the same project cache quota/GC policy used by the shared Host cache lifecycle
- **AND** it MUST report GC failures through diagnostics or logs rather than ignoring cleanup

#### Scenario: Webview and TUI materialize the same document resource
- **WHEN** Webview and TUI request the same document image or archive entry resource for the same workspace source
- **THEN** both surfaces MUST address the resource through the shared resource-cache service contract
- **AND** neither surface MUST expose cache paths as durable successful output

### Requirement: Extension-private cache remains host-private

Extension-private resource cache SHALL remain scoped to no-workspace or Extension-owned resources. TUI MUST NOT attempt to read Extension-private cache manifests or treat Extension-private cache paths as workspace resources.

#### Scenario: No workspace resource exists in Extension-private cache
- **WHEN** Extension creates a no-workspace resource under extension-private cache
- **THEN** TUI MUST treat that resource as unavailable or non-portable unless it is promoted into a workspace-visible source
- **AND** TUI MUST NOT reverse-resolve the Extension-private cache path

#### Scenario: Project cache is deleted
- **WHEN** workspace `.neko/.cache/resources` is deleted
- **THEN** both Webview and TUI MUST rebuild cacheable resources from stable sources or return typed cache-miss diagnostics
- **AND** neither surface MUST treat the missing cache artifact as loss of durable project data
