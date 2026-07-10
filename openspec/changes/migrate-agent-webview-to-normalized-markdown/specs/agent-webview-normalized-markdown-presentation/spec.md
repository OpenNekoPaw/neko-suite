## ADDED Requirements

### Requirement: Webview SHALL consume the normalized Markdown semantic contract
Every production Agent Webview Markdown entry point SHALL render an `@neko/markdown` normalized document/session snapshot and SHALL NOT invoke `react-markdown`, remark/unified, a regex parser, or an equivalent host-local Markdown parser.

#### Scenario: Assistant Markdown renders from normalized nodes
- **WHEN** an assistant message contains CommonMark/GFM source
- **THEN** the Webview SHALL render exhaustive normalized nodes and annotations without reparsing the source

#### Scenario: Unknown normalized contract fails visibly
- **WHEN** the adapter receives an unknown node variant, extension registration, schema version, or invalid identity association
- **THEN** the Webview SHALL expose an explicit diagnostic or test/build failure and SHALL NOT fall back to raw or legacy successful rendering

### Requirement: Streaming and final presentation SHALL retain one semantic session
Assistant message, timeline block and Markdown-capable thinking content SHALL retain stable session identity from first delta through finalization. Historical finalized content SHALL enter the same adapter through an immediately finalized session rather than a final-only renderer.

#### Scenario: Streaming delta finalizes in place
- **WHEN** append-only source grows across intermediate deltas and then completes
- **THEN** the same session SHALL produce successive revisions and finalization SHALL NOT replace the session or parser path

#### Scenario: Non-append replacement is rejected
- **WHEN** an existing streaming content identity receives replacement source that violates the append-only contract
- **THEN** the path SHALL fail visibly instead of resetting to another renderer

#### Scenario: Historical and failure presentation uses canonical adapter
- **WHEN** a historical finalized message or assistant failure/retry presentation contains Markdown
- **THEN** it SHALL render through the normalized session/document adapter and legacy parser poison SHALL remain uninvoked

### Requirement: All Webview Markdown entry points SHALL be covered
`MessageItem`, `ContentBlockItem`, `ThinkingBlock` when Markdown-capable, and their re-export/call paths SHALL use one normalized adapter contract. No production entry point MAY bypass it.

#### Scenario: Active timeline and ordinary message share the adapter
- **WHEN** equivalent Markdown appears in an active timeline block and a finalized assistant message
- **THEN** both SHALL consume normalized snapshots with the same semantic interpretation

#### Scenario: Thinking content has an explicit contract
- **WHEN** thinking content is rendered as Markdown
- **THEN** it SHALL have stable identity and use the normalized adapter; otherwise it SHALL be explicitly typed and presented as non-Markdown plain text

### Requirement: Standard and Neko semantics SHALL be exhaustively adapted
The Webview adapter SHALL cover the normalized CommonMark/GFM node union, source ranges, table alignment/ragged shape, code language identity, raw HTML policy, links, images, diagnostics, annotations and registered Neko extensions. Webview-only rich presentation SHALL consume typed normalized inputs.

#### Scenario: GFM table retains semantic shape
- **WHEN** source contains aligned columns, ragged rows, escaped pipes or multiline cell semantics represented by the normalized contract
- **THEN** Webview presentation SHALL preserve alignment and authoritative source row/cell shape without parser-AST inference

#### Scenario: Code and rich extensions retain behavior
- **WHEN** normalized code/table/image nodes represent Mermaid, composite content, creative storyboard tables or resource references
- **THEN** registered Webview strategies SHALL preserve existing rich presentation without parsing source through a second Markdown engine

### Requirement: Resource enhancement SHALL remain revision-associated and host-authorized
Resource/image/link enhancement SHALL be supplied through immutable resolution associated with the current session and revision. Runtime Webview URIs, blob URLs, cache paths and authorization decisions SHALL remain outside the normalized document and SHALL NOT be persisted as semantic identity.

#### Scenario: Stale resolution is discarded
- **WHEN** resource resolution for an older revision completes after a newer revision is current
- **THEN** the older result SHALL NOT enhance the current DOM

#### Scenario: Unsafe or unauthorized target remains inert
- **WHEN** model-authored Markdown contains an unsafe scheme, arbitrary file target or unauthorized local resource
- **THEN** the Webview SHALL render safe text/diagnostics and SHALL NOT navigate, read or persist the target as authorized content

### Requirement: Shared semantic fixtures SHALL prevent cross-host drift
`@neko/markdown`, TUI and Webview tests SHALL consume a shared fixture corpus for semantic source/document expectations, while host-specific tests SHALL assert terminal or DOM presentation separately.

#### Scenario: Fixture covers semantic baseline
- **WHEN** the shared corpus is executed
- **THEN** it SHALL cover CommonMark/GFM nodes, ranges, tables, links/images/raw HTML, Unicode, extensions, diagnostics and incomplete streaming/finalization transitions

#### Scenario: Host presentation extends without redefining semantics
- **WHEN** Webview tests cover resource previews, Mermaid, creative tables, composite content, Canvas handoff or copy behavior
- **THEN** they SHALL layer presentation assertions on the shared normalized expectation rather than introduce a different parser expectation

### Requirement: Legacy Webview parser SHALL be removed behind a poison gate
Migration SHALL delete direct production parser imports, AST-specific fallback paths and package dependencies once exhaustive adapter coverage exists. Path-level poison tests SHALL prove successful rendering does not invoke the removed path.

#### Scenario: Dependency cleanup is complete
- **WHEN** repository and built-bundle dependency checks run after migration
- **THEN** no production Agent Webview code SHALL import or bundle `react-markdown`, `remark-gfm` or an equivalent fallback parser owned solely by the removed path

#### Scenario: Poisoned parser cannot return success
- **WHEN** first delta, intermediate streaming, finalization, historical message, timeline block, thinking Markdown and failure/retry cases execute with the legacy parser poisoned
- **THEN** all expected presentations SHALL succeed through the normalized adapter and the poison SHALL have zero invocations

### Requirement: Webview runtime acceptance SHALL use Extension Development Host
Final acceptance SHALL run the built Agent extension and Webview in VS Code Extension Development Host using the `vscode-extension-debugger` workflow. JSDOM, Vite, Chrome, generic browser or Playwright-only evidence SHALL NOT satisfy this gate.

#### Scenario: Real Webview lifecycle and visuals are accepted
- **WHEN** the runtime acceptance suite executes in Extension Development Host
- **THEN** it SHALL verify streaming/final/historical/timeline/thinking Markdown, tables, code, Unicode, links, resources, Mermaid/composite content, Canvas handoff, CSP, theme, focus, selection/copy and legacy poison evidence

#### Scenario: Runtime environment is unavailable
- **WHEN** Extension Development Host or debugger access cannot run
- **THEN** the change SHALL record the exact blocker and residual risk and SHALL NOT be archived as complete
