## ADDED Requirements

### Requirement: Canonical normalized Markdown document
`@neko/markdown` SHALL own one host-agnostic, Neko-defined normalized document contract for assistant Markdown. The contract MUST represent the supported CommonMark and GFM semantics as an exhaustive typed standard-node union and MUST keep remark, micromark, MDAST, React, Ink, DOM, VSCode, ANSI, viewport state, colors, and calculated terminal layout outside the public semantic boundary.

#### Scenario: Hosts receive one semantic model
- **WHEN** identical Markdown source is prepared for TUI and Webview presentation
- **THEN** both hosts can consume the same normalized standard-node and extension contracts without choosing host-specific parser ASTs

#### Scenario: Parser implementation remains private
- **WHEN** `@neko/markdown` parses source through remark or micromark internals
- **THEN** no MDAST or parser-library type is required by a host renderer

#### Scenario: New standard node is not silently ignored
- **WHEN** a new standard-node variant is added without exhaustive normalizer or host projection coverage
- **THEN** compilation or contract validation fails instead of flattening or discarding the node

### Requirement: CommonMark and GFM semantic baseline
The normalized standard-node union SHALL cover headings 1–6, paragraphs, blockquotes, ordered/unordered/nested/task lists, fenced and indented code, thematic breaks, soft and hard breaks, emphasis, strong, nested formatting, strikethrough, inline code, escapes, entities, inline/reference links, autolinks, images, definitions, GFM tables with alignment metadata, and raw HTML nodes.

#### Scenario: Nested standard Markdown is preserved
- **WHEN** source contains nested lists, blockquotes, links, emphasis, strong text, inline code, and task state
- **THEN** normalization preserves the ordered parent/child semantic relationships and standard-node types

#### Scenario: GFM table alignment is retained
- **WHEN** a recognized GFM table declares left, center, right, or unspecified alignment
- **THEN** each semantic table column retains the corresponding alignment metadata independently of viewport width

#### Scenario: Raw HTML is preserved safely
- **WHEN** source contains inline or block raw HTML
- **THEN** normalization preserves it as a distinct raw HTML node with source provenance and does not execute, interpret, or discard it

#### Scenario: Image remains a distinct semantic node
- **WHEN** Markdown contains an image with alt text, title, and destination
- **THEN** normalization retains those values in an image node rather than replacing the image with generic text

### Requirement: Authoritative source provenance
Every parse snapshot SHALL retain the authoritative Markdown source. Every source-backed node MUST contain a valid half-open UTF-16 range `[startOffset, endOffset)` into that source. Source offsets, Unicode code points, grapheme indexes, and terminal display columns MUST remain distinct coordinate systems.

#### Scenario: Node source can be recovered
- **WHEN** a source-backed node is normalized
- **THEN** slicing the snapshot source from `startOffset` to `endOffset` returns that node's original source region

#### Scenario: Invalid range fails visibly
- **WHEN** a node range is negative, reversed, out of bounds, or structurally inconsistent with its source-backed parent
- **THEN** validation fails with a contract violation instead of clamping or inventing a range

#### Scenario: Synthetic semantic data has explicit provenance
- **WHEN** normalization or projection introduces semantic data without an independent source region
- **THEN** it is marked synthetic and references its originating node, range, or projection operation without fabricating a source range

### Requirement: Standard nodes, annotations, and resolution snapshots remain separate
Source-occupying Markdown or Neko syntax SHALL be represented by semantic nodes. Orthogonal, overlapping, or interpretive metadata SHALL be represented by annotations linked by source range or target identity. Workspace-, entity-, authorization-, or resource-dependent results SHALL be represented by a separate resolution snapshot associated with one document revision.

#### Scenario: Prompt metadata overlaps syntax
- **WHEN** a prompt/provenance span overlaps links, emphasis, or other semantic nodes
- **THEN** it is represented as an annotation without restructuring or duplicating the semantic tree

#### Scenario: Creative table interpretation remains an annotation
- **WHEN** a standard GFM table also has a Neko creative-table interpretation
- **THEN** the table remains a standard semantic table and the domain interpretation is linked as an annotation

#### Scenario: Contextual resolution does not mutate the document
- **WHEN** a mention, resource reference, image, or annotation is resolved against workspace context
- **THEN** the result is stored in a resolution snapshot and the normalized document remains unchanged

#### Scenario: Parsing performs no workspace IO
- **WHEN** source is parsed and normalized
- **THEN** no workspace, entity, resource, image, or authorization resolver is invoked

### Requirement: Context-aware Neko extension normalization
Mentions, resource references, and other registered source-occupying Neko extensions SHALL be normalized only in explicitly eligible text contexts. Extension matching MUST use AST context and source provenance rather than an independent whole-source regex grammar.

#### Scenario: Extension is recognized in ordinary text
- **WHEN** valid registered extension syntax occurs in an eligible text node
- **THEN** normalization emits the corresponding typed extension node with source provenance

#### Scenario: Code content is not reinterpreted
- **WHEN** extension-like text occurs inside inline code, fenced code, or indented code
- **THEN** it remains code content and no extension node is emitted

#### Scenario: Raw HTML content is not reinterpreted
- **WHEN** extension-like text occurs inside a raw HTML node
- **THEN** it remains raw HTML content and no extension node is emitted

#### Scenario: Unknown extension fails visibly
- **WHEN** a normalized document contains an unknown or unregistered Neko extension variant
- **THEN** validation or host projection produces a visible typed diagnostic instead of silently omitting the content

### Requirement: Ragged table semantics preserve actual cells
For every canonical GFM table recognized by the parser, normalization SHALL preserve the actual ordered source-backed cells in each header and body row. It MUST NOT truncate extra cells, merge them into another cell, or insert fabricated source-backed cells to make the semantic table rectangular.

#### Scenario: Short row retains its actual cell count
- **WHEN** a recognized table body row has fewer cells than another row
- **THEN** the semantic row contains only its actual source-backed cells and records a row-width mismatch diagnostic

#### Scenario: Extra cells are not lost
- **WHEN** a recognized table body row has more cells than the source header
- **THEN** all extra cells remain ordered semantic cells with their original source ranges

#### Scenario: Escaped pipe uses canonical grammar
- **WHEN** a table cell contains an escaped pipe
- **THEN** canonical GFM parsing determines the cell boundary and no downstream component performs `split('|')` tokenization

#### Scenario: Non-table source is not heuristically repaired
- **WHEN** the canonical GFM parser does not recognize source as a table
- **THEN** normalization returns the standard nodes produced by the parser and does not reinterpret the source as a table

### Requirement: Streaming session exposes stable and mutable semantics
`@neko/markdown` SHALL provide an append/finalize streaming session that emits normalized snapshots with a stable prefix boundary and mutable range. Syntax stability, including active-table holdback and unfinished block behavior, MUST be owned by the shared Markdown session rather than inferred by the TUI.

#### Scenario: Stable prefix survives append
- **WHEN** additional source is appended after a semantically complete stable prefix
- **THEN** the snapshot retains that prefix before `stableEndOffset` while reparsing only semantics that can still change

#### Scenario: Active table remains mutable
- **WHEN** streaming source currently ends inside an active GFM table
- **THEN** the table remains within the mutable range until later source or finalization establishes its boundary

#### Scenario: Unclosed fence remains mutable
- **WHEN** streaming source contains an unclosed fenced code block
- **THEN** the unfinished construct remains mutable and is not incorrectly committed as stable syntax

#### Scenario: Finalization uses the same session
- **WHEN** the assistant message completes
- **THEN** `finalize()` produces the final snapshot from the existing session rather than creating a separate final parser model

#### Scenario: Rapid deltas may be coalesced
- **WHEN** source deltas arrive faster than snapshots can be produced
- **THEN** the session may parse the latest accumulated source without promising an intermediate snapshot for every token, while final semantics remain complete

### Requirement: Session-scoped deterministic identity
Every streaming session SHALL have an opaque session ID and monotonically increasing document revision. Semantic nodes and annotations SHALL have opaque deterministic session-local identities. Unchanged stable-prefix nodes MUST retain identity across append revisions, while mutable-tail identities MAY change.

#### Scenario: Stable node identity is retained
- **WHEN** append-only input does not change a source-backed node fully inside the stable prefix
- **THEN** that node has the same opaque identity in the next revision

#### Scenario: Mutable identity may change
- **WHEN** appended source changes the parse of a node intersecting the mutable tail
- **THEN** the rebuilt node may receive a different identity

#### Scenario: Identity is not a durable project key
- **WHEN** a document is reparsed in another process, arbitrary edit session, or parser migration
- **THEN** no contract promises that prior session-local node or annotation IDs remain valid

#### Scenario: Cross-session result is rejected
- **WHEN** a resolution or enhancement result associated with session A is applied to session B
- **THEN** association validation fails instead of accepting the result by matching source ranges alone

### Requirement: Typed phase-aware diagnostics
The shared Markdown contract SHALL expose diagnostics with a stable code, severity, phase, structured parameters, and optional source/node/annotation association. Shared code MUST NOT compose final localized user sentences or embed terminal style information.

#### Scenario: Content issue preserves semantic content
- **WHEN** source contains raw HTML, malformed extension syntax, an unsafe destination, or another recoverable content issue
- **THEN** the safe semantic content is retained with a typed diagnostic for host presentation

#### Scenario: Contract violation fails directly
- **WHEN** normalization encounters an invalid range, node-ID collision, unknown standard node, or impossible session association
- **THEN** development and contract tests fail rather than returning a successful plain-text document

#### Scenario: Host localizes a diagnostic
- **WHEN** a host presents a shared diagnostic
- **THEN** it uses the stable code and structured parameters to produce localized text while external details remain separately identifiable

### Requirement: Deterministic semantic resource boundary
The canonical parser SHALL enforce a named deterministic source hard limit. Source at or below the limit MUST be parsed without silent semantic truncation. Source above the limit MUST produce `MD_SOURCE_LIMIT_EXCEEDED` and MUST NOT expose a partial AST as complete or activate a legacy parser.

#### Scenario: Source within the limit is complete
- **WHEN** source size is at or below the configured semantic limit
- **THEN** every recognized semantic node and source region is preserved by the canonical result

#### Scenario: Source exceeds the limit
- **WHEN** source size is greater than the configured semantic limit
- **THEN** parsing returns an explicit `MD_SOURCE_LIMIT_EXCEEDED` failure contract without partial success or legacy fallback

#### Scenario: Machine speed does not change semantics
- **WHEN** the same source and resource policy are processed on machines with different performance
- **THEN** the semantic accept/reject result is determined by input measurements rather than a wall-clock parsing timeout

### Requirement: Prelaunch range contract is replaced explicitly
Affected internal Markdown APIs SHALL use `{ startOffset, endOffset }` and SHALL remove the legacy `{ start, end }` range contract from the new canonical path. Historical assistant messages SHALL be reparsed from their authoritative Markdown source and SHALL require no rendered-data migration.

#### Scenario: New consumer uses explicit offsets
- **WHEN** a host, annotation, diagnostic, or resolver associates data with source
- **THEN** it uses `startOffset` and `endOffset` and does not rely on compatibility aliases

#### Scenario: Historical source is rendered by the new parser
- **WHEN** an existing assistant message is displayed after migration
- **THEN** its stored Markdown source is parsed through the canonical path without requiring persisted AST or terminal-layout migration
