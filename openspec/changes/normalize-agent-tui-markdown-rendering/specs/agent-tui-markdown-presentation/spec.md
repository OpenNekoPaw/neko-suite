## ADDED Requirements

### Requirement: One canonical assistant Markdown presentation path
Agent TUI assistant content SHALL use the same streaming-session, normalized-document, terminal projection/layout, and Ink-adapter path from the first source delta through finalization. The TUI MUST NOT switch from a plain streaming renderer to a separate final Markdown renderer or invoke legacy parser/highlighter paths as fallback.

#### Scenario: First delta enters the canonical path
- **WHEN** the first assistant Markdown delta arrives
- **THEN** the TUI creates or updates a `MarkdownStreamingSession` and presents its normalized snapshot through terminal projection/layout

#### Scenario: Finalization retains the session
- **WHEN** assistant generation completes
- **THEN** the TUI finalizes the existing Markdown session and does not create a second final-only renderer state

#### Scenario: Legacy path is poisoned
- **WHEN** the canonical parser, projector, highlighter, or layout reports a failure in a path-level test
- **THEN** the TUI exposes the defined diagnostic/fatal presentation and the poisoned legacy parser or renderer is never invoked

#### Scenario: Plain status text remains separate
- **WHEN** the TUI displays explicitly non-Markdown status or progress text
- **THEN** a plain-text component may render that named responsibility without becoming the assistant Markdown path

### Requirement: Pure terminal projection and thin Ink adapter
The TUI SHALL project normalized Markdown through a package-local, Markdown-specific, pure model equivalent to `TerminalMarkdownBlock[]`, `TerminalMarkdownLayout`, and `TerminalLine[]`. Projection and layout MUST be testable without React, Ink, or ANSI. Ink components SHALL only adapt structured terminal output to component lifecycle/rendering.

#### Scenario: Layout executes without Ink
- **WHEN** a normalized document, viewport width, theme roles, and terminal capabilities are supplied to the layout model
- **THEN** structured terminal lines are produced without constructing React or Ink components

#### Scenario: Ink does not parse Markdown
- **WHEN** the Ink adapter receives laid-out terminal lines
- **THEN** it renders their structured spans and metadata without scanning Markdown table, fence, list, or inline grammar

#### Scenario: TUI abstraction remains package-local
- **WHEN** the Markdown terminal model is introduced
- **THEN** it remains inside the TUI owning package and does not become a repository-wide terminal DSL

### Requirement: Canonical terminal text metrics
All terminal Markdown measurement, wrapping, padding, and alignment SHALL use one package-local `TerminalTextMetrics` contract. Layout MUST use grapheme-safe segmentation and terminal display columns rather than `string.length`, UTF-16 visible slicing, ANSI-string wrapping, or undocumented Ink width behavior.

#### Scenario: CJK and full-width text align correctly
- **WHEN** a table or styled line contains CJK/full-width characters
- **THEN** padding and column allocation use their terminal display width rather than UTF-16 length

#### Scenario: Grapheme sequence remains intact
- **WHEN** wrapping encounters combining marks, emoji ZWJ sequences, flags, skin-tone sequences, or Indic clusters
- **THEN** no visual line boundary splits the grapheme cluster

#### Scenario: Styled segments wrap without ANSI parsing
- **WHEN** foreground/font roles span a terminal wrap boundary
- **THEN** structured styled segments are fragmented safely before ANSI encoding and retain their semantic style roles

#### Scenario: Direct dependency owns width behavior
- **WHEN** a third-party Unicode width or segmentation library backs `TerminalTextMetrics`
- **THEN** the TUI package declares it as a direct runtime dependency and tests it behind the Neko-owned contract

### Requirement: Semantic Markdown theme and terminal capabilities
Markdown semantic roles SHALL extend the existing TUI theme runtime. Theme resolution SHALL map semantic role to terminal capability and resolved style without introducing a second theme system. Default background SHALL be inherited, and syntax-theme backgrounds SHALL be ignored unless a future explicit presentation contract enables them.

#### Scenario: Color-capable terminal resolves semantic roles
- **WHEN** terminal color is available
- **THEN** headings, links, inline code, quotes, table borders, diagnostics, and syntax token roles resolve through the existing TUI theme extension

#### Scenario: NO_COLOR preserves structure
- **WHEN** `NO_COLOR` is active
- **THEN** foreground, background, and syntax colors are removed while supported bold, italic, underline, strikethrough, borders, markers, and hyperlink metadata remain

#### Scenario: Background is not required for meaning
- **WHEN** the terminal uses an unknown or user-controlled background
- **THEN** Markdown remains readable because required semantics do not depend on renderer-owned background colors

#### Scenario: Font family remains outside renderer control
- **WHEN** Markdown requests emphasis, heading, or code presentation
- **THEN** the TUI controls only terminal-supported attributes and does not claim control over font family, size, or line height

### Requirement: Adaptive semantic table presentation
A semantic table SHALL remain viewport-independent. The TUI SHALL choose among aligned-grid, vertical-record, and stacked-record presentation according to content profiles, available display columns, hard/preferred floors, unbreakable width, and projected wrapped row height. Selection MUST be deterministic for the same document, viewport, theme/capabilities, and resource policy.

#### Scenario: Readable table uses aligned grid
- **WHEN** column floors, borders, and projected row heights fit the viewport readably
- **THEN** the TUI presents an aligned grid and applies GFM left/center/right alignment to every visual cell line

#### Scenario: Narrow table becomes vertical records
- **WHEN** grid allocation would violate a hard floor or produce unreadable projected row height
- **THEN** each body row is presented as header-label/value pairs without changing semantic table data

#### Scenario: Extremely narrow table becomes stacked records
- **WHEN** label and value cannot remain readable on one record line
- **THEN** the TUI presents labels and values on separate stacked lines

#### Scenario: Column profile affects allocation
- **WHEN** a table contains compact, narrative, and token-heavy columns
- **THEN** allocation preserves compact values, gives narrative text useful wrapping width, and accounts for long unbreakable tokens before choosing a mode

### Requirement: Ragged tables are rectangularized only for presentation
For a recognized ragged semantic table, the TUI SHALL derive `columnCount` from the maximum header, alignment, and body-row cell counts. Missing cells SHALL become synthetic empty presentation cells without source ranges. Extra cells SHALL remain visible and record modes SHALL assign deterministic localized synthetic labels to headerless columns. Missing alignment SHALL resolve to unspecified alignment.

#### Scenario: Missing body cell is synthesized for layout
- **WHEN** a row has fewer cells than the presentation column count
- **THEN** the TUI inserts an empty presentation cell linked to table/row projection provenance without fabricating source provenance

#### Scenario: Headerless extra cell remains visible
- **WHEN** a row contains an extra source-backed cell beyond the header width
- **THEN** grid presentation includes the cell and record presentation uses a localized label such as `Column 4`

#### Scenario: Width mismatch is diagnosed
- **WHEN** recognized table rows, header, or alignment metadata have inconsistent widths
- **THEN** the TUI can present all content and associates `MD_TABLE_ROW_WIDTH_MISMATCH` with the relevant table or row

### Requirement: Whole-block syntax highlighting
The TUI SHALL use a package-local whole-block highlighter port. `@neko/markdown` SHALL provide fenced-code semantics and normalized language identity; the TUI SHALL own grammar runtime, syntax theme, limits, asynchronous lifecycle, and generation validation. Per-line regex highlighting MUST NOT be used.

#### Scenario: Multiline grammar state is preserved
- **WHEN** code contains multiline comments, strings, templates, or another cross-line construct
- **THEN** the highlighter processes the complete code block before terminal wrapping

#### Scenario: Unknown language produces plain code
- **WHEN** normalized language identity has no registered grammar
- **THEN** the TUI displays complete plain code with a typed diagnostic and never invokes the legacy regex highlighter

#### Scenario: Highlighter failure produces plain code
- **WHEN** the external highlighter throws, rejects, or cannot initialize
- **THEN** the TUI displays complete plain code with an external-enhancement diagnostic and does not treat the legacy highlighter as fallback

#### Scenario: Stale highlighter result is discarded
- **WHEN** an older highlight generation completes after a newer document revision or code generation is current
- **THEN** the old result is discarded and cannot overwrite the current code presentation

### Requirement: Code source lines, visual wrapping, and copy fidelity
Normalized code value and logical source lines SHALL remain authoritative. The TUI SHALL apply grapheme-safe visual wrapping to highlighted or plain structured spans after whole-block highlighting. Visual fragment boundaries, gutters, and continuation markers MUST NOT alter source content or semantic copy output.

#### Scenario: Long code line wraps visually
- **WHEN** a logical code line exceeds available content width
- **THEN** it is split into visual fragments that retain source line, fragment, source-range, and continuation association

#### Scenario: Long token wraps without truncation
- **WHEN** a URL, path, identifier, or other unbreakable token exceeds the viewport
- **THEN** the TUI wraps it at grapheme boundaries and does not ellipsize or require canonical horizontal scrolling

#### Scenario: Narrow viewport sacrifices decoration first
- **WHEN** borders, padding, line-number gutter, or continuation gutter would leave insufficient code width
- **THEN** presentation removes or collapses decoration before hiding code content

#### Scenario: Semantic copy returns original code
- **WHEN** a code-block copy/export action is invoked after visual wrapping
- **THEN** it returns the original normalized code value without visual newlines, borders, line numbers, or continuation markers

### Requirement: Structured link and local-resource trust boundary
The TUI SHALL resolve Markdown destinations into structured safe targets before terminal encoding. Initially only `http:` and `https:` destinations SHALL be eligible for clickable web hyperlinks. Workspace/local resources MUST use a separate authorization-aware resolver and arbitrary model-generated `file://` links MUST NOT be enabled or auto-opened.

#### Scenario: Safe web target becomes clickable
- **WHEN** a validated HTTP or HTTPS destination is presented in a terminal with safe hyperlink capability
- **THEN** renderer-owned encoding may attach hyperlink metadata to the visible label

#### Scenario: Hyperlink capability is unavailable
- **WHEN** a safe destination cannot be encoded as a clickable hyperlink
- **THEN** the TUI displays `label (destination)` or an equivalent destination-visible representation unless label and destination are already equal

#### Scenario: Arbitrary file target is rejected
- **WHEN** provider Markdown contains a `file://` destination without an authorized workspace resolver result
- **THEN** the TUI does not make it clickable or open it and emits the applicable typed diagnostic

#### Scenario: Image has an ordinary-terminal representation
- **WHEN** a semantic image is presented without a supported image protocol
- **THEN** the TUI visibly presents its image label, alt text, and safe target without changing the normalized image node

### Requirement: Provider terminal controls cannot execute
Provider-authored Markdown SHALL never directly execute ANSI, CSI, OSC, BEL, C0, or C1 controls. Only renderer-owned terminal encoding based on resolved styles and validated links SHALL produce terminal control sequences. Unsafe source controls MUST be represented safely and associated with a diagnostic rather than silently executed or silently discarded.

#### Scenario: OSC injection remains inert
- **WHEN** provider source contains an OSC hyperlink or clipboard sequence
- **THEN** it is shown through a safe visible representation or explicit diagnostic and does not execute

#### Scenario: ESC and BEL remain inert
- **WHEN** provider source contains ESC, BEL, or another unsafe control character
- **THEN** terminal output contains no provider-controlled executable sequence

#### Scenario: Renderer emits its own style sequence
- **WHEN** a resolved semantic style is encoded for a capable terminal
- **THEN** only the renderer-owned encoder creates the corresponding terminal control bytes

### Requirement: Failure taxonomy is visible and non-legacy
The TUI SHALL distinguish developer contract violations, recoverable source/content diagnostics, external enhancement failures, and stale async results. Unexpected production contract failures MAY be caught only at the assistant-message boundary and MUST display an explicit fatal rendering block without presenting raw Markdown as successful rendering.

#### Scenario: Recoverable content remains readable
- **WHEN** a link scheme is unsupported, a reference is unresolved, raw HTML is present, or an extension is malformed
- **THEN** safe semantic content remains visible with the typed diagnostic presentation selected by the host

#### Scenario: External enhancement fails safely
- **WHEN** highlighting, hyperlink capability, image resolution, or resource resolution is unavailable
- **THEN** the TUI uses the defined plain/visible presentation and does not invoke a compatibility renderer

#### Scenario: Unexpected layout contract fails fatally
- **WHEN** production reaches an impossible table/layout state or missing exhaustive renderer
- **THEN** the assistant-message boundary displays a fatal Markdown-rendering block and emits structured evidence

#### Scenario: Stale async is not a user error
- **WHEN** an obsolete highlight, resolution, or layout result arrives
- **THEN** it is discarded or debug-logged without replacing current content or showing a user-facing failure

### Requirement: Deterministic TUI resource budgets
The TUI SHALL centralize table, highlight, cache, and streaming-update budgets in a package-local `MarkdownResourcePolicy`. Limits MUST initially remain implementation configuration rather than user settings. Soft-budget exhaustion SHALL preserve complete semantic content through a bounded presentation and typed diagnostic.

#### Scenario: Large table bypasses grid search
- **WHEN** a semantic table exceeds the table grid profiling/allocation budget
- **THEN** the TUI selects a linear-complexity record presentation, retains every cell, and emits `MD_TABLE_GRID_BUDGET_EXCEEDED`

#### Scenario: Large code bypasses highlighting
- **WHEN** a code block exceeds the byte or logical-line highlight budget
- **THEN** the TUI displays complete wrapped plain code and emits `MD_HIGHLIGHT_LIMIT_EXCEEDED`

#### Scenario: Cache reaches its bound
- **WHEN** parse-associated, resolution, highlight, projection, or layout cache retention reaches its entry/node/estimated-byte bound
- **THEN** deterministic eviction removes eligible older entries without accepting stale results as current

#### Scenario: Rapid streaming updates are coalesced
- **WHEN** one or more non-final provider deltas update the current assistant Markdown source
- **THEN** the TUI/session applies only the latest accumulated source after the configured trailing-edge delay while preserving current session identity
- **AND** finalization cancels any pending update and immediately parses the complete final source through the same canonical session

### Requirement: Resize reflows presentation without reparsing
Viewport resize SHALL invalidate only width-dependent projection/layout work. It MUST NOT reparse unchanged Markdown or mutate the normalized document. Continuous resize SHALL use latest-only/coalesced generations.

#### Scenario: Table changes mode after resize
- **WHEN** the viewport narrows below the readable grid threshold
- **THEN** the same semantic table is reprojected into vertical or stacked records without source reparsing

#### Scenario: Code fragments change after resize
- **WHEN** viewport width changes
- **THEN** visual code fragments are recalculated while normalized code and whole-block highlighter input remain unchanged

#### Scenario: Old resize result arrives late
- **WHEN** layout for an older width completes after a newer width generation
- **THEN** the older result is discarded and cannot replace the current layout

### Requirement: TUI runtime interaction remains live during Agent execution
The TUI SHALL keep turn timing, prompt input, and application-owned scrolling responsive while assistant Markdown is streaming. Timer ownership SHALL remain with the Agent turn state, input SHALL remain active unless an explicit modal owns the keyboard, and scroll position SHALL be represented relative to the live bottom so new content does not steal a user's reading anchor.

#### Scenario: A running turn keeps elapsed time and prompt input live
- **WHEN** an Agent turn is running or resumes after confirmation
- **THEN** elapsed time continues from the original turn start and the prompt editor can accept and submit queued input

#### Scenario: A user reads above the live bottom
- **WHEN** the user pages upward and new streaming content increases the scrollable range
- **THEN** the clipped ChatView viewport preserves the same reading anchor instead of forcing the viewport back to the live bottom

#### Scenario: A user returns to the live bottom
- **WHEN** the user pages down until the offset reaches zero
- **THEN** subsequent content follows the live bottom without growing native terminal scrollback for the full message history

### Requirement: Canonical path and terminal behavior are acceptance-gated
Implementation SHALL include structured semantic/layout assertions, controllable async generation tests, legacy poison tests, resource-boundary triplets, real PTY/Ink checks, and a focused script-driven Neko Agent evaluation for Markdown event projection. Snapshot-only success MUST NOT be treated as sufficient evidence.

#### Scenario: Legacy renderer cannot make a test pass
- **WHEN** an assistant-message integration test executes streaming and final rendering
- **THEN** poisoned legacy parser, highlighter, streaming Markdown renderer, and final-only renderer remain uninvoked while canonical path evidence is asserted

#### Scenario: Resource boundary is tested exactly
- **WHEN** an enforced limit is added
- **THEN** tests cover inputs at `limit - 1`, `limit`, and `limit + 1`

#### Scenario: PTY capability modes are exercised
- **WHEN** runtime acceptance is performed
- **THEN** color-capable, `NO_COLOR`, resize, streaming incomplete syntax, and finalization behavior are checked in a real PTY/Ink environment

#### Scenario: Agent evaluation evidence is classified correctly
- **WHEN** validation results are reported
- **THEN** focused real provider/model evaluation evidence is distinguished from `pnpm test:agent:eval` harness self-tests, and unavailable external evaluation records its blocker and residual risk

### Requirement: Webview divergence has a bounded exit
The TUI migration MAY complete before the full Agent Webview renderer migration, but the existing Webview parser SHALL be classified as a temporary legacy host implementation. A linked Webview migration OpenSpec change with owner, tasks, removal conditions, shared fixture adoption, and legacy-path poison acceptance MUST exist before this TUI change is archived.

#### Scenario: TUI ships without Webview fallback
- **WHEN** the TUI canonical migration is complete while Webview still uses its existing path
- **THEN** TUI never imports or falls back to Webview parser/rendering code and project claims are limited to TUI completion

#### Scenario: New semantics remain shared-owned
- **WHEN** a new Markdown or Neko extension semantic is introduced during the transition
- **THEN** it is defined in `@neko/markdown` rather than in the legacy Webview parser

#### Scenario: Cross-host unification is not claimed early
- **WHEN** the Webview removal gate has not passed
- **THEN** documentation does not claim all hosts are unified and does not promote that conclusion to an Accepted ADR

#### Scenario: Linked migration closes the legacy path
- **WHEN** the future Webview migration satisfies its removal gate
- **THEN** assistant Markdown entry points consume the normalized document and poison tests prove the independent Webview canonical parser is no longer invoked
