# Design: Agent TUI Markdown 渲染规范化

状态：Proposed（grilling 已完成，21 项设计决策已确认）

## Context

当前 TUI Markdown 链路由 `MessageItem` 在 streaming/final 状态间选择不同展示路径，final 路径再通过 package-local parser、Ink renderer 和正则 syntax highlighter 输出。Agent Webview 与 `@neko/markdown` 已存在另一组 Markdown 解析和投影能力。

本设计通过领域建模逐项确认权威语义、宿主边界、流式状态、布局策略、终端能力、错误语义和验收不变量。Decision 1–21 均已由用户确认，本文作为后续 capability specs、tasks 和实现评审的设计依据。

## Five-layer architecture analysis

### Responsibility

- `@neko/markdown` owns canonical CommonMark/GFM parsing, normalized semantic nodes, source provenance, annotations, streaming syntax stability, snapshot identity, and host-neutral diagnostics.
- `cli-tui` owns terminal projection, Unicode display metrics, table/code layout, terminal capabilities, theme resolution, async enhancement lifecycle, and safe terminal encoding.
- Ink components own only React lifecycle and rendering of already-laid-out terminal lines; they do not own Markdown grammar or width algorithms.
- Workspace/resource/link resolvers remain separate contextual ports and cannot mutate the normalized document.

### Dependency

- `@neko/markdown` remains host-agnostic and cannot depend on React, Ink, DOM, VSCode, ANSI, terminal width, or `cli-tui`.
- `cli-tui` depends on the shared semantic contract through public package exports and declares every runtime parser/Unicode/highlighter library it directly imports.
- The TUI does not import Webview renderer internals, and the temporary Webview path does not become a fallback dependency.
- Package-local terminal abstractions are retained because their lifecycle and display-column semantics are TUI-specific; extraction requires a second proven terminal host with the same contract.

### Interface

- Cross-package interfaces are typed normalized documents, streaming snapshots, annotations, resolution associations, diagnostics, and opaque session/revision/node identities.
- Package-local interfaces are `TerminalMarkdownProjector`, `TerminalMarkdownLayout`, `TerminalTextMetrics`, semantic style roles, terminal capabilities, and whole-block highlighter ports.
- Source coordinates use explicit half-open UTF-16 offsets; display coordinates use grapheme/display-column contracts and cannot cross the boundary implicitly.
- Async results carry enough session/revision/generation identity to reject stale or cross-session writes.

### Extension

- Standard Markdown nodes form an exhaustive union; new standard variants require normalizer and every host adapter to handle them visibly.
- Neko syntax extensions use explicit extension nodes, orthogonal interpretations use annotations, and workspace-dependent values use resolution snapshots.
- Theme growth occurs by extending existing semantic roles, parser growth occurs inside `@neko/markdown`, and highlighter grammar growth occurs behind the TUI highlighter port.
- No repository-wide terminal DSL, second theme runtime, or shared syntax runtime is introduced until demonstrated reuse justifies extraction.

### Testing

- Shared semantic fixtures prove CommonMark/GFM normalization, ranges, extension contexts, streaming stability, identity, diagnostics, and hard limits.
- Pure terminal tests prove Unicode width, wrapping, table modes/alignment, themes, links, controls, resource budgets, and resize behavior without Ink.
- Integration poison tests prove the canonical assistant path and make legacy parser/highlighter/renderers fail if invoked.
- Real PTY/Ink acceptance and focused script-driven Agent evaluation cover runtime capabilities and streaming event projection.

### Proportionality and fail-visible behavior

This design adds only two ownership layers that correspond to existing product boundaries: shared Markdown semantics and package-local terminal presentation. It does not add services, IPC, tenant policy, remote caches, feature-flag infrastructure, or generic rendering frameworks.

Invalid ranges, unknown standard nodes, missing renderers/theme roles, impossible layout states, wrong session association, and legacy-path invocation fail directly. Only external enhancement, content, capability, and trust-boundary failures receive typed safe presentation; they never activate old success paths.

## Decision 1: `@neko/markdown` owns the normalized semantic document

状态：Confirmed

### Decision

`@neko/markdown` SHALL own a Neko-defined, host-agnostic normalized Markdown document contract covering the supported CommonMark/GFM semantics and explicit Neko extensions.

Third-party parser models such as MDAST MAY be used inside `@neko/markdown`, but SHALL NOT become the long-term package boundary exposed to Webview, TUI, Canvas projection, or other hosts.

Host renderers SHALL consume the Neko-owned normalized document and SHALL NOT independently reinterpret Markdown source as their canonical path.

### Consequences

- Standard Markdown semantics, including table alignment and link/image metadata, have one cross-host source of truth.
- Webview and TUI retain separate presentation adapters but not separate semantic ownership.
- Parser library replacement remains an internal `@neko/markdown` concern.
- The public document contract must use an exhaustive, typed node union and explicit extension nodes.
- Unsupported or unregistered semantic nodes must produce a visible diagnostic during development/validation rather than silently disappearing.
- The current TUI package-local regex parser becomes migration-only debt and is not an extension point for new syntax.

### Rejected alternatives

- Expose host-specific parser results from a shared facade: rejected because it preserves multiple semantic models.
- Keep standard Markdown parsing inside each host and share only Neko projections: rejected because table, link, extension, and streaming semantics continue to diverge.


## Decision 2: Preserve source provenance in the normalized document

状态：Confirmed

### Decision

`NormalizedMarkdownDocument` SHALL retain the authoritative Markdown source for the parse snapshot. Every source-backed semantic node SHALL expose a valid source range using explicitly documented UTF-16 offsets into that source.

Source offsets, Unicode code points, grapheme clusters, and terminal display columns are distinct coordinate systems and SHALL NOT be used interchangeably.

The shared semantic document SHALL NOT contain host presentation state such as foreground/background colors, Ink props, ANSI sequences, viewport dimensions, wrapped line positions, or calculated table column widths.

Synthetic nodes created by a Neko projection SHALL be distinguishable from source-backed nodes and SHALL retain explicit provenance to the originating node/range or projection operation.

### Invariants

- `0 <= startOffset <= endOffset <= document.source.length`.
- A source-backed child range is contained by its source-backed parent range unless the node contract explicitly defines a cross-source reference.
- Slicing `document.source` by a source-backed node range yields that node's original source region; normalization does not require duplicating a `raw` string on every node.
- Renderer layout coordinates never mutate or replace source ranges.
- Invalid, missing, out-of-bounds, or structurally inconsistent ranges fail validation visibly.

### Consequences

- Diagnostics, links, fenced-code copy, source mapping, incremental identity, and resize re-projection can refer to one source coordinate system.
- Host renderers may cache presentation by node/range but may not treat cache identity as Markdown semantics.
- Parser adapters must normalize third-party position data into the documented UTF-16 offset contract.

### Rejected alternatives

- Semantic nodes without source provenance: rejected because streaming identity and diagnostics would require a second implicit coordinate model.
- Shared renderer-oriented blocks: rejected because they leak terminal/Webview presentation into the cross-host Markdown contract.

## Decision 3: Split streaming syntax stability from terminal commit/layout

状态：Confirmed

### Decision

`@neko/markdown` SHALL own host-agnostic streaming parse state and SHALL expose snapshots that distinguish a syntactically stable source prefix from a mutable source tail.

The Agent TUI SHALL own terminal presentation state: stable rendered blocks, mutable rendered blocks, layout/cache identity, viewport reflow, and any commit into terminal history or scrollback.

The TUI SHALL NOT implement an independent Markdown grammar scanner for fences, tables, lists, or incomplete blocks. Structural table holdback belongs to the shared streaming parse/stability contract; table width and visual fallback belong to the TUI renderer.

### Contract direction

```ts
interface MarkdownStreamingSnapshot {
  readonly source: string;
  readonly document: NormalizedMarkdownDocument;
  readonly stableEndOffset: number;
  readonly mutableRange: SourceRange;
  readonly isFinal: boolean;
  readonly diagnostics: readonly MarkdownDiagnostic[];
}
```

The exact API shape may be refined, but it SHALL support append/finalize semantics or an equivalent monotonic-source session model.

### Invariants

- `stableEndOffset` is a source/grammar boundary, not evidence that the TUI has committed the region to scrollback.
- A non-final snapshot may reparse/reclassify nodes intersecting `mutableRange`; source-backed nodes fully before `stableEndOffset` retain their semantic meaning for append-only input.
- Once a table header plus delimiter establishes an active table, the table remains in the mutable region until the parser confirms the table has ended or the session is finalized.
- Fenced-code content that resembles a table does not activate ordinary table holdback.
- A final snapshot satisfies `stableEndOffset === source.length` and has an empty mutable range.
- Invalid source mutation that violates the session's append-only contract fails visibly; it does not silently reset to a different legacy parser path.

### Consequences

- Shared Markdown grammar remains the source of truth while terminal-specific redraw and scrollback behavior stay package-local.
- Webview may adopt the same streaming snapshots later but is not required to share terminal presentation or commit policy.
- TUI resize can re-project the authoritative source/snapshot without changing source coordinates.

### Rejected alternatives

- Stateless shared parser plus TUI-owned line/table scanner: rejected because it recreates a second Markdown grammar in the host.
- Full current-text rerender as the only streaming model: rejected because it does not define terminal commit safety or active-table stability.

## Decision 4: Use a package-local pure terminal presentation and layout model

状态：Confirmed

### Decision

The Agent TUI SHALL introduce a Markdown-specific, package-local presentation and layout pipeline between the normalized semantic document and Ink components.

```text
NormalizedMarkdownDocument
  -> TerminalMarkdownProjector
  -> TerminalMarkdownBlock[]
  -> TerminalMarkdownLayout
  -> TerminalLine[]
  -> thin Ink adapter
```

The projector/layout implementation SHALL be testable without React mounting, Ink rendering, or ANSI string inspection. The Ink adapter SHALL map resolved terminal lines/segments to components and interactions without owning Markdown parsing or layout policy.

This presentation model SHALL remain inside `cli-tui`; it SHALL NOT be exported from `@neko/markdown`, moved into a cross-host contract, or expanded into a general repository-wide terminal UI DSL without a separate demonstrated reuse case and decision.

### Responsibilities

The package-local presentation/layout layer owns:

- Markdown semantic-role to terminal-theme resolution;
- foreground/background and text attributes;
- Unicode display-width measurement and wrapping;
- table grid, alignment, width allocation, and fallback projection;
- Unicode/ASCII border selection;
- hyperlink-capability projection;
- stable/mutable block presentation identity and layout cache inputs.

It does not own:

- Markdown grammar or normalization;
- source-range semantics;
- Neko extension parsing;
- provider streaming source accumulation outside the Markdown streaming session;
- Ink application layout unrelated to Markdown;
- terminal command localization/presentation.

### Contract direction

```ts
interface StyledSegment {
  readonly text: string;
  readonly role: MarkdownStyleRole;
  readonly sourceRange?: SourceRange;
  readonly linkTarget?: MarkdownLinkTarget;
}

interface TerminalLayoutContext {
  readonly viewportWidth: number;
  readonly unicodeMode: 'unicode' | 'ascii';
  readonly colorMode: 'none' | 'basic' | 'ansi256' | 'truecolor';
  readonly hyperlinks: boolean;
  readonly theme: MarkdownTerminalTheme;
}

interface TerminalLine {
  readonly segments: readonly ResolvedTerminalSegment[];
  readonly displayWidth: number;
}
```

Names and detailed unions remain subject to implementation design, but the dependency boundary is fixed.

### Invariants

- ANSI escape sequences are generated only at the terminal/Ink output boundary, never used as presentation-model text.
- Theme resolution does not mutate Markdown semantic nodes.
- Layout/cache identity is derived from semantic node identity/range plus relevant layout context, not array position alone.
- A viewport resize invalidates width-dependent layout but does not require a different Markdown semantic parse for the same source snapshot.
- Ink components do not independently recalculate GFM alignment or parse Markdown delimiters.

### Rejected alternatives

- AST-to-JSX as the only renderer boundary: rejected because parsing, layout, style, and component lifecycle would remain coupled and difficult to test deterministically.
- Cross-host terminal presentation model in `@neko/markdown`: rejected because terminal concepts are not host-agnostic Markdown semantics.

## Decision 5: Treat tables as semantic data with adaptive terminal presentations

状态：Confirmed

### Decision

A normalized Markdown table remains a table semantic node independent of viewport width. The TUI SHALL adapt its presentation among aligned grid, vertical records, and stacked label/value records according to deterministic readability policy.

```text
MarkdownTableNode
  -> readable aligned grid
  -> vertical records
  -> stacked label/value records
```

Presentation fallback SHALL NOT mutate the normalized document or replace the semantic table with list/paragraph nodes.

### Priority order

1. Preserve semantic relationships and all non-empty cell content.
2. Preserve readable terminal presentation.
3. Preserve source-copy fidelity through the authoritative Markdown source.
4. Execute GFM alignment correctly when a columnar grid is used.
5. Preserve a visual grid only while it remains readable.

### Invariants

- Left, center, and right alignment metadata is preserved in the normalized table node.
- Grid mode applies alignment after wrapping each visual cell line and bases padding on terminal display width.
- Record modes do not pretend to preserve column alignment after columns no longer exist.
- Viewport resize may select a different presentation mode without reparsing the same source or changing table semantics.
- Vertical/stacked fallback does not truncate non-empty cell content by default.
- Source copy uses the authoritative source range rather than reconstructed terminal borders/padding.
- A header-only table or other shape without record semantics remains in a table/raw-pipe-compatible presentation rather than fabricating records.
- Uneven source rows are handled by one documented normalization/diagnostic policy; renderer behavior is not allowed to depend on incidental array access or Ink wrapping.

### Rejected alternatives

- Always preserve a grid through extreme wrapping: rejected because it preserves shape at the expense of readable information.
- Default truncation or nested horizontal scrolling: rejected because it hides content and complicates scrollback, copy, and interaction; it may be reconsidered as an explicit future interactive view.

## Decision 6: Use content-aware column profiles and deterministic readability policy

状态：Confirmed

### Decision

The TUI table layout SHALL classify columns as `compact`, `narrative`, or `token-heavy` and SHALL derive natural, preferred-floor, hard-floor, and unbreakable-content width metrics using terminal display width.

Grid/record fallback SHALL use a deterministic package-local readability policy based on both horizontal allocation and projected wrapping/row-height expansion. It SHALL NOT rely solely on proportional width reduction.

The first implementation SHALL NOT expose internal width floors, readability ratios, or fallback thresholds as user configuration. These values remain implementation policy covered by fixtures and may be promoted to a bounded user preference only after a demonstrated user-facing need.

### Column profiles

- `compact`: numbers, statuses, booleans, dates, short labels, and short enumerations; prefer preserving complete values in narrow columns.
- `narrative`: natural-language descriptions and sentences; may absorb growth and wrap at natural boundaries, but must not be reduced into persistently narrow text columns.
- `token-heavy`: URLs, paths, hashes, UUIDs, package identifiers, and long code-like tokens; track unbreakable spans and prefer record fallback before extreme character-column wrapping.

### Layout policy direction

1. Account for borders, separators, gaps, and padding.
2. Compute natural width and content profile per column.
3. Use natural grid widths when the viewport permits.
4. Shrink according to profile and unmet width demand, not equal/proportional allocation alone.
5. Estimate wrapped visual row height.
6. Reject grid mode when hard floors or readability constraints are violated.
7. Select vertical records, then stacked records if label/value pairs do not remain readable inline.

### Invariants

- Width calculations use the canonical terminal text-metrics service defined by a subsequent decision.
- Token-heavy content is never sliced by UTF-16 code unit.
- Table fallback thresholds are deterministic and testable for the same semantic table and layout context.
- User configuration does not expose unstable internal algorithm constants in the first version.

### Rejected alternatives

- Pure proportional shrink: rejected because it treats statuses, prose, numbers, URLs, and identifiers as equivalent content.
- User-configurable internal thresholds in the initial contract: rejected because it expands configuration before the algorithm and user need are stable.

## Decision 7: Centralize terminal width, grapheme segmentation, wrapping, and padding

状态：Confirmed

### Decision

The Agent TUI SHALL define one package-local `TerminalTextMetrics` contract used by all Markdown terminal layout. It SHALL provide deterministic display-width measurement, grapheme-safe segmentation, styled-segment wrapping, and display-width-based padding/alignment.

Markdown layout code SHALL NOT use JavaScript `string.length`, code-unit slicing, ANSI-string slicing, or undocumented Ink internals as its width/alignment contract.

A mature Unicode width implementation MAY be used behind the Neko-owned contract. Any such runtime library SHALL be declared as a direct `@neko/cli` dependency rather than consumed transitively through Ink or another package.

### Coordinate systems

- UTF-16 offset: normalized AST source ranges.
- Unicode code point: scalar iteration where explicitly needed.
- Grapheme cluster: safe user-perceived text segmentation and wrap boundary.
- Terminal display column: measurement, padding, alignment, and viewport allocation.

These coordinate systems SHALL remain explicit and SHALL NOT be substituted for one another.

### Invariants

- Styled segments are wrapped before ANSI/output encoding and retain semantic role, source provenance, and link metadata across splits.
- Grapheme-safe operations do not split combining sequences, variation selectors, ZWJ emoji, flags, or skin-tone sequences.
- Padding and GFM alignment are based on display columns, not source/code-unit length.
- Width behavior is covered by a corpus including ASCII, CJK, combining marks, full-width forms, emoji, ZWJ sequences, flags, skin tones, Indic scripts, and mixed text.
- Terminal/runtime acceptance tests may compare the final Ink rendering, but Ink internals do not define the domain contract.

### Rejected alternatives

- Ink-only/private text measurement: rejected because it couples pure layout and tests to framework internals.
- Neko-maintained Unicode width database/algorithm: rejected because owning evolving Unicode width tables is outside the product boundary; Neko owns the adapter behavior and tests instead.

## Decision 8: Resolve semantic Markdown roles through the existing TUI theme

状态：Confirmed

### Decision

The terminal presentation layer SHALL map Markdown semantic style roles through an extension of the existing Agent TUI theme and terminal-capability resolver. The normalized Markdown document SHALL contain no foreground/background values or terminal font attributes.

Markdown semantic theming and code syntax theming SHALL remain separate contracts. They may compose inside a code block, but neither replaces the other.

The change SHALL extend the existing `cli-tui` theme infrastructure rather than introduce a parallel Markdown theme runtime or package-local design system.

### Background policy

- Body and ordinary Markdown content inherit the terminal/application background by default.
- Background color is an optional presentation enhancement for bounded roles such as inline code, code blocks, table headers, or diagnostics; it does not carry required semantics.
- Syntax-highlighting theme backgrounds are ignored by default. Syntax projection primarily applies foreground and supported text attributes over the Markdown code-block base style.
- A theme/capability combination that cannot preserve readable contrast must omit the optional background rather than silently substituting an unrelated hard-coded color.

### `NO_COLOR` policy

When color is disabled:

- Markdown and syntax foreground/background colors are omitted.
- Structural layout, indentation, borders, markers, and prefixes remain.
- Bold, italic, underline, and strikethrough remain when supported because they are text attributes rather than color channels.
- Hyperlink metadata may remain when independently supported by the terminal.

### Invariants

- Heading level, links, checked state, diagnostics, table headers, block quotes, and code blocks are not communicated by color alone.
- Actual terminal font family, font size, line height, ligatures, and installed font weight files are outside the renderer contract.
- Theme changes may invalidate resolved styles/layout cache inputs but do not mutate or reparse Markdown semantics.
- Theme tokens are semantic; renderer code does not hard-code Codex, Gemini, OpenCode, or editor-theme color values.

### Rejected alternatives

- Colors/backgrounds in normalized AST: rejected because presentation capability and host theme are not Markdown semantics.
- Syntax theme as the Markdown theme: rejected because code-token categories and Markdown structural roles have different ownership and fallback behavior.

## Decision 9: Use a package-local whole-block code highlighter port

状态：Confirmed

### Decision

The Agent TUI SHALL replace line-oriented regex syntax highlighting with a package-local, whole-code-block highlighter port. `@neko/markdown` owns fenced-code semantics, source ranges, and normalized language identity; the TUI owns grammar/runtime selection, tokenization lifecycle, terminal syntax-theme projection, and performance guardrails.

The first implementation SHALL NOT create a cross-host syntax-highlighting runtime package. A neutral shared implementation may be extracted only after Webview and TUI demonstrate reuse of the same tokenizer/runtime and host-neutral token taxonomy.

### Contract direction

```ts
interface TerminalCodeHighlighter {
  highlight(request: CodeHighlightRequest): Promise<CodeHighlightResult>;
}

interface CodeHighlightRequest {
  readonly code: string;
  readonly language?: NormalizedCodeLanguage;
  readonly generation: number;
  readonly signal?: AbortSignal;
}

interface SyntaxToken {
  readonly text: string;
  readonly role: SyntaxTokenRole;
  readonly sourceRange: SourceRange;
}
```

Detailed types and sync/async optimization remain implementation decisions, but the whole-block and stale-result rules are fixed.

### Invariants

- A fenced code block is tokenized as a whole so multiline strings, comments, templates, heredocs, and JSX/TSX state are preserved.
- Streaming updates use generation/snapshot identity; an older asynchronous result cannot replace a newer code snapshot.
- Cancellation and maximum byte/line guardrails bound highlighter work.
- Unknown languages, oversized code, or external tokenizer failure render the authoritative code as plain code and emit appropriate diagnostic/log evidence.
- Failure never invokes the legacy regex highlighter as a compatibility fallback.
- Syntax tokens retain source-relative ranges and are themed after tokenization; tokenizer output does not embed ANSI or syntax-theme background escapes.

### Implementation evaluation

Prism core and lowlight/highlight.js are initial bounded spike candidates. Tree-sitter or Shiki requires separate evidence that grammar/runtime, startup, package size, and lifecycle costs are justified.

### Extraction condition

A shared syntax package requires all of:

1. at least two hosts using the same tokenizer/runtime implementation;
2. a stable host-neutral token taxonomy;
3. compatible language-loading and error contracts;
4. no browser-only or Node-only dependency leakage across package layers.

### Rejected alternatives

- Immediate shared syntax runtime: rejected until real implementation reuse is demonstrated.
- Per-line regex highlighter: rejected because it loses multiline lexical state and grows through unbounded keyword-regex patches.

## Decision 10: Treat links and terminal control output as a structured trust boundary

状态：Confirmed

### Decision

`@neko/markdown` SHALL preserve Markdown link destinations, titles, children, and source provenance as semantic data. The TUI SHALL resolve those destinations through a host-owned link policy and SHALL be the only layer permitted to encode terminal hyperlinks or other terminal control sequences.

Provider/Markdown source text SHALL NOT directly emit ANSI, CSI, OSC, BEL, or other C0/C1 terminal controls. Unsafe controls remain observable through source provenance and diagnostics but are rendered as visible safe representations rather than executed or silently removed.

### Link policy

- Initial clickable Web schemes are limited to `http:` and `https:`.
- Workspace/local-file destinations use a distinct target kind and existing path resolution/authorization boundaries; arbitrary model-produced absolute paths are not converted directly to `file://` links.
- Unsupported/custom schemes remain non-clickable and preserve a visible safe destination/diagnostic reason.
- No Markdown link performs an automatic open action.
- When safe hyperlink metadata is unavailable, a label that differs from its destination is rendered as `label (destination)`; a label already equal to the destination is not duplicated.
- `NO_COLOR` does not disable independently supported safe hyperlink metadata.

### Terminal control policy

Only renderer-owned output encoding may generate ANSI/OSC sequences from resolved styles and validated structured links. Source text containing terminal controls is never passed through as executable terminal data.

### Invariants

- Link label and actual clickable target remain associated in structured presentation data.
- URL targets are sanitized and cannot contain terminal controls before hyperlink encoding.
- Link/source ranges survive wrapping so each visual segment retains the same target/provenance.
- Unsafe control handling is explicit and testable; renderer output cannot clear, move, retitle, ring, or overwrite terminal state based on provider text.
- Path/link rejection degrades to safe visible text, not a legacy opener or silent no-op that claims success.

### Rejected alternatives

- Label-only rendering: rejected because non-hyperlink terminals would hide the actual destination.
- Raw source escape pass-through: rejected because external model output is not trusted terminal program input.

## Decision 11: Define CommonMark plus GFM as the normalized semantic baseline

状态：Confirmed

### Decision

`@neko/markdown` SHALL normalize the supported CommonMark and GFM syntax into an exhaustive Neko-owned standard-node union, with Neko extension nodes represented separately and explicitly.

The TUI projector SHALL exhaustively handle every normalized standard-node variant. A newly added standard node without a TUI projection SHALL fail compilation or focused contract tests rather than silently flatten to text or disappear.

### Baseline semantics

The baseline includes headings 1-6, paragraphs, block quotes, ordered/unordered/nested lists, task-list state, fenced and indented code, thematic breaks, soft/hard breaks, emphasis, strong, nested inline formatting, strikethrough, inline code, escapes/entities, inline/reference links, autolinks, images, definitions, GFM tables with alignment, and raw HTML nodes.

### Raw HTML policy

- Raw HTML is preserved as a typed node with source provenance.
- TUI does not parse, execute, or convert HTML into terminal widgets/control sequences in the initial implementation.
- Raw HTML is rendered as a safe visible literal/source representation and is not silently discarded.
- Ad-hoc tag regexes such as special-casing `<u>` do not form an alternate markup parser.

### Image policy

- Images remain distinct semantic nodes with destination, alt text, optional title, and source range.
- Ordinary terminal fallback visibly identifies the item as an image and exposes both useful alt text and a safe target representation.
- Future Kitty/iTerm/Sixel projection is a terminal capability adapter and does not change the normalized image node.

### Reference and extension policy

- Shared normalization resolves reference definitions while retaining source provenance and reference identity needed for diagnostics/copy.
- Standard Markdown nodes and Neko extension nodes use distinct unions/contracts.
- Known non-visual terminal projections for Neko extensions are explicit adapters.
- Missing/unregistered extension renderers emit a visible diagnostic and cannot silently flatten to empty or generic text.

### Rejected alternatives

- Curated undocumented subset: rejected because valid parser nodes would continue to receive ad-hoc host behavior.
- Generic unknown-node text extraction: rejected because links, images, checked state, extensions, and diagnostics would lose semantics while tests appeared successful.

## Decision 12: Replace the dual streaming/final renderer with one canonical path

状态：Confirmed

### Decision

Assistant Markdown content SHALL use one canonical streaming session, normalized semantic document, terminal projector, layout, and Ink adapter from the first source delta through finalization.

Finalization SHALL update the same Markdown streaming session/snapshot contract; it SHALL NOT switch from a plain-text streaming component to a separate final Markdown parser/renderer.

The current package-local regex Markdown parser, line-regex highlighter path, and `StreamingText` use as the assistant Markdown renderer SHALL be removed from the canonical call chain. They SHALL NOT remain as compatibility fallback for parser, extension, table, or highlighter failures.

`StreamingText` MAY remain for explicitly non-Markdown status/progress/plain-text responsibilities if those responsibilities are named and tested independently.

### Migration policy

- The prelaunch internal message/rendering path may change incompatibly.
- No durable content migration is required because authoritative stored message content remains Markdown source and is reparsed by the new path.
- No default dual renderer or long-lived feature flag is introduced.
- A temporary migration switch requires a separately documented compatibility need, owner, removal condition, and tests proving it is not selected by new assistant messages.

### Path-level acceptance

Tests SHALL prove that new assistant messages invoke the streaming session, normalized projector, and layout path; they SHALL poison or otherwise make the legacy parser/renderer fail if invoked.

Finalization tests SHALL prove that the existing session is finalized rather than replaced by a second renderer model. Highlighter/parser/extension failures SHALL follow their explicit diagnostic/plain-presentation policy without invoking legacy success paths.

### Rejected alternatives

- Long-lived new/legacy renderer flag: rejected because no released rendering contract or durable rendered data requires compatibility and the fallback would hide new-path defects.
- Plain streaming plus rich final rendering: rejected because it preserves the core semantic and visual discontinuity.

## Decision 13: Consolidate remark/GFM parsing inside `@neko/markdown`

状态：Confirmed

### Decision

`@neko/markdown` SHALL own the canonical CommonMark/GFM parse by using the existing remark/micromark ecosystem as an internal implementation and normalizing its MDAST output into the Neko-owned document contract.

MDAST and remark/micromark types SHALL NOT be exported as the cross-package semantic boundary. Webview and TUI SHALL converge on the normalized Neko document rather than keep separate canonical parser results.

Runtime parser dependencies SHALL be declared directly by `@neko/markdown` only when its implementation imports them. Existing Webview dependency declarations are not copied mechanically.

### Extension migration

Current regex-based image, mention, resource-reference, and creative-table extraction SHALL migrate to AST-aware normalization/traversal. Extension matching SHALL explicitly define eligible node contexts and SHALL not accidentally recognize tokens inside inline code, fenced/indented code, or raw HTML.

The existing `{ start, end }` source-range contract SHALL be replaced by explicit `{ startOffset, endOffset }` UTF-16 naming across the affected prelaunch internal APIs. A long-lived compatibility alias SHALL NOT remain.

### Invariants

- The same Markdown source produces one canonical normalized standard-node structure for all hosts.
- Third-party parser positions are validated and normalized before crossing the package boundary.
- Parser replacement remains possible without changing host semantic contracts.
- Webview migration cannot claim success while continuing to independently reinterpret standard Markdown as its canonical behavior.
- Extension recognition is context-aware and source-range-preserving.

### Rejected alternatives

- Introduce another TypeScript Markdown parser without measured blocker evidence: rejected because it creates parser diversity while an existing GFM stack is already present.
- Continue regex projection as the semantic base: rejected because it cannot reliably represent nested/context-sensitive Markdown.

## Decision 14: Separate source-occupying nodes, orthogonal annotations, and contextual resolution

状态：Confirmed

### Decision

The normalized Markdown model SHALL use three distinct mechanisms:

1. semantic nodes for syntax/content that occupies a position in the document tree;
2. range/node-linked annotations for orthogonal, overlapping, or interpretive metadata;
3. resolution snapshots for workspace/entity/authorization-dependent results and derived handoff references.

Parsing/normalization SHALL be source-deterministic and SHALL NOT invoke mention, resource, image, entity, workspace, or host resolvers. Resolution is a separate cancellable/cacheable phase that does not mutate the normalized semantic document.

### Migration mapping

- CommonMark images remain standard image nodes.
- Mentions and resource references become inline extension nodes in eligible text contexts.
- Creative-table interpretation becomes an annotation linked to the standard table node.
- Semantic prompt spans, generation parts, evidence/provenance, and similar overlapping semantics become range annotations.
- Resolution status, authorized render URIs, stable refs, and handoff refs belong to a resolution/projection result.

### Invariants

- Nodes participate in one ordered parent/child semantic tree and own their source position.
- Annotations may overlap nodes or other annotations but must retain explicit range/target identity.
- Resolution results reference one document snapshot's node/annotation identities and cannot rewrite AST/source semantics.
- Extension resolution failure does not prevent the underlying standard Markdown from rendering.
- An unsupported annotation projection produces a visible diagnostic while preserving underlying standard content.
- Parser and streaming-session tests require no external workspace/entity/resource IO.

### Rejected alternatives

- Every extension as a tree node: rejected because overlapping prompt/provenance/table interpretations are not a single-parent syntax tree.
- Every extension as sidecar arrays: rejected because source-occupying mentions/resources would duplicate text and force each host to perform range subtraction/conflict resolution.

## Decision 15: Scope deterministic node identity to the streaming session

状态：Confirmed

### Decision

Each Markdown streaming session SHALL expose a session identity and monotonically increasing document revision. Semantic nodes and annotations SHALL have opaque deterministic identities suitable for equality, cache association, and asynchronous-result validation within that session.

For append-only input, source-backed nodes fully inside the stable prefix and unchanged by normalization SHALL retain identity across revisions. Nodes intersecting the mutable tail MAY be rebuilt and receive different identities.

Node/annotation identities SHALL be opaque branded values. Host code may compare them but SHALL NOT parse their internal representation or persist them as durable project/entity identifiers.

### Identity inputs

Implementation may derive identity from node/annotation kind, source range, parent/path discriminator, deterministic sibling ordinal, extension kind, and synthetic provenance. Source range alone is insufficient identity.

### Async association

Resolution, code highlighting, annotation projection, and asynchronous layout results SHALL carry session/revision identity or a more specific node generation and SHALL be discarded when stale.

### Non-goals

Node/annotation identity does not promise stability across arbitrary source edits, processes, persisted documents, parser-contract migrations, or different sessions. It is not a Canvas/entity/stable-resource identifier.

### Invariants

- Stable semantic content is reusable across append revisions without random identity churn.
- Mutable-tail reconstruction cannot cause stale async output to attach to a different node.
- Synthetic-node identity includes explicit provenance/discriminator.
- Random UUID assignment on every parse is not used for source-deterministic node identity.
- Cache keys include all relevant semantic and layout/theme/capability inputs; node identity alone does not validate width-dependent layout.

### Rejected alternatives

- Source range as the complete ID: rejected because parent/child, multiple annotations, and synthetic nodes may share or lack ranges.
- Fresh random UUIDs per parse: rejected because they invalidate stable-block and resolution/highlight reuse on every append.

## Decision 16: Separate contract failures, content diagnostics, external enhancement failures, and stale results

状态：Confirmed

### Decision

Markdown rendering SHALL use typed phase-aware diagnostics for recoverable source/context/external-boundary conditions, while developer contract violations remain fail-visible.

Development/tests SHALL throw or fail on invalid ranges, unknown standard-node variants, missing canonical renderers/theme roles, node-ID collisions, invalid resolution/session association, impossible table/layout state, or legacy-path invocation.

Production MAY catch an unexpected contract failure only at the assistant-message rendering boundary to keep the local TUI alive. It SHALL display an explicit fatal Markdown-rendering block and emit structured evidence; it SHALL NOT present raw/plain text as if canonical rendering succeeded and SHALL NOT invoke a legacy renderer.

### Diagnostic contract direction

Diagnostics SHALL carry stable machine code, severity, phase, structured parameters, and optional source/node/annotation association. Shared Markdown code SHALL NOT own final localized English/Chinese UI sentences. Host presenters localize Neko-owned messages; raw external details remain separate.

Phases include parse, normalize, resolve, project, layout, highlight, and security.

### Recoverable conditions

- Source/context conditions preserve safe semantic content plus diagnostics: unsupported schemes, unsafe controls, unresolved/ambiguous references, raw HTML literal presentation, malformed Neko extensions, unauthorized image/resource targets, and domain-table interpretation issues.
- External enhancement failures use explicit bounded presentations: plain code, alt plus target, visible link fallback, or unresolved marker.
- Stale async results are discarded as expected control flow and do not become user-facing errors.

### Invariants

- CommonMark-tolerated source that parses as ordinary text is not misclassified as a parser contract failure.
- Diagnostics do not embed terminal style/color.
- Not every warning is injected into message body; presentation policy chooses inline, block, log-only, or fatal projection by code/severity.
- Broad catch-and-return-raw-Markdown fallback is prohibited.

### Rejected alternatives

- Universal raw-text fallback: rejected because it hides parser/projector/layout defects.
- Fail entire message for every external/content issue: rejected because safe standard content should remain readable across real provider/resource boundaries.

## Decision 17: Preserve ragged table semantics and rectangularize only for presentation

状态：Confirmed

### Decision

A normalized GFM table SHALL preserve the actual cell count and source-backed cells of every recognized header/body row. Normalization SHALL NOT drop, merge, or invent source-backed cells merely to force a rectangular semantic table.

The TUI table projector SHALL derive a rectangular presentation matrix using:

```text
columnCount = max(headerCellCount, alignmentCount, ...bodyRowCellCounts)
```

Rows shorter than `columnCount` SHALL receive synthetic empty presentation cells. These cells SHALL reference their originating table/row as projection provenance and SHALL NOT receive fabricated source ranges.

Rows wider than the source header SHALL preserve all extra cells. Record-based presentation modes SHALL assign deterministic localized synthetic labels such as `Column 4` to headerless columns. Alignment entries missing for a projected column SHALL resolve to `null`.

### Diagnostics and parser boundary

A recognized table whose header, alignment metadata, or body rows have inconsistent widths SHALL emit `MD_TABLE_ROW_WIDTH_MISMATCH` with structured expected/actual row information and relevant table/row identity or source range.

Escaped pipes and other table tokenization rules SHALL be handled by the canonical remark/GFM parser; projection/layout SHALL NOT use `split('|')` or independently scan table grammar.

If the canonical GFM parser does not recognize source as a table, neither normalization nor the TUI SHALL heuristically repair or reinterpret it as one. The source SHALL render according to the standard nodes produced by the canonical parser.

### Invariants

- Every source-backed cell remains present, ordered, and attributable to its original row.
- Synthetic empty cells and synthetic column labels exist only in presentation and cannot claim source provenance.
- Grid, vertical-record, and stacked-record modes project the same rectangular column relationship.
- Ragged input never causes silent data loss.
- Table rectangularization does not mutate the normalized semantic document.

### Rejected alternatives

- Truncate extra cells to header width: rejected because it silently loses provider content.
- Merge extra cells into the final declared column: rejected because it invents semantics and corrupts source attribution.
- Pad semantic rows with fake AST cells/ranges: rejected because it makes projection artifacts appear source-authored.
- TUI heuristic table repair: rejected because it would recreate a second Markdown grammar and diverge from canonical parsing.

## Decision 18: Preserve code source lines and apply grapheme-safe visual wrapping

状态：Confirmed

### Decision

Normalized fenced/indented code content, source newlines, and source ranges SHALL remain authoritative and unchanged by terminal width. The TUI SHALL represent narrow-width wrapping only as presentation layout.

Whole-block syntax highlighting SHALL operate on the complete normalized code value before terminal wrapping. The layout phase SHALL wrap the resulting styled spans without reparsing or re-highlighting individual source lines.

Wrapping SHALL prefer natural whitespace boundaries and MAY break an otherwise unbreakable token only at a grapheme-cluster boundary. It SHALL NOT split combining sequences, emoji/ZWJ sequences, flags, skin-tone sequences, or corrupt a styled span's semantic role.

The default TUI code-block presentation SHALL show all code content by grapheme-safe soft wrapping. It SHALL NOT silently truncate long lines and SHALL NOT require horizontal scrolling as the canonical narrow-viewport behavior.

### Visual fragment contract

Each laid-out code fragment SHALL retain enough metadata to associate it with its authoritative logical source line, including the equivalent of:

```text
sourceLineIndex
fragmentIndex
sourceRange
isContinuation
```

A visual fragment boundary SHALL NOT insert a newline into normalized code, alter source ranges, or become highlighter input.

Renderer-owned continuation markers MAY appear only in a presentation gutter. They SHALL NOT become code text, semantic content, source provenance, or authoritative copy output. Borders, padding, line-number gutters, and continuation gutters SHALL collapse before code content when width is constrained. Layout SHALL still make progress by displaying at least one complete grapheme when a positive content width is available.

Line numbers SHALL be disabled by default. Any future line-number support remains presentation-only and cannot change code source identity or copy behavior.

### Copy fidelity

A semantic copy/export action for a code block SHALL return the original normalized code value, preserving source-authored characters and logical newlines. It SHALL NOT reconstruct code from `TerminalLine[]` or include visual wraps, borders, gutters, line numbers, or continuation markers.

Terminal mouse selection of visually wrapped output is environment-dependent and SHALL NOT be treated as the authoritative copy-fidelity contract.

### Invariants

- Resize changes visual fragments only; normalized code and highlight input remain unchanged.
- Styled wrapping uses canonical `TerminalTextMetrics` rather than ANSI-string slicing or UTF-16 character slicing.
- Multiline grammar state is retained because highlighting occurs before visual line fragmentation.
- Plain-code fallback follows the same wrapping and copy contracts as highlighted code.
- Extremely narrow viewports sacrifice decoration before content.

### Rejected alternatives

- Truncate or ellipsize long code lines: rejected because it hides source content.
- Horizontal scrolling as the only canonical behavior: rejected because it does not compose reliably with ordinary terminal scrollback and narrow Ink layouts.
- Insert continuation characters/newlines into rendered code text: rejected because it corrupts copy fidelity and source association.
- Highlight each wrapped or source line independently: rejected because multiline comments, strings, templates, and other grammar state would be incorrect.

## Decision 19: Apply deterministic hard semantic limits and soft enhancement budgets

状态：Confirmed

### Decision

Markdown rendering SHALL use one package-local, explicitly named resource policy that separates hard semantic admission limits from soft enhancement/layout budgets.

Within the supported source limit, canonical parsing and normalization SHALL preserve the complete Markdown source and recognized semantic content. The implementation SHALL NOT silently truncate nodes, table rows/cells, code, or the mutable tail to satisfy a resource budget.

If source exceeds the canonical renderer's hard admission limit, the message boundary SHALL emit `MD_SOURCE_LIMIT_EXCEEDED` and display an explicit fatal rendering block. It SHALL NOT expose a partial AST as complete, return raw Markdown as successful rendering, or invoke a legacy path.

Hard limits SHALL be based on deterministic input measurements such as source byte/code-unit count. Machine-speed-dependent wall-clock timeouts SHALL NOT decide semantic parse results.

### Streaming update cadence

A streaming session SHALL allow at most one parse/update generation to become current at a time. Every non-final source update SHALL enter one latest-only trailing-edge window so the parser produces a snapshot for the latest accumulated source rather than reparsing once per provider token. Source size SHALL NOT bypass this cadence through an immediate-update fast path.

Finalization SHALL cancel any pending non-final update and immediately run the canonical parse/normalize path against the complete final source. Coalescing SHALL never delay final semantics or create a second renderer/session path.

### Table layout budget

Tables inside the full profiling/allocation budget MAY use content-aware aligned-grid selection. Tables beyond that budget SHALL deterministically bypass expensive grid search and use a linear-complexity record presentation while preserving every semantic row, column, and cell.

This condition SHALL emit `MD_TABLE_GRID_BUDGET_EXCEEDED`. It is a presentation-budget diagnostic, not permission to truncate the table or reinterpret its syntax.

### Highlight budget

Code blocks beyond the configured source-byte or logical-line highlight budget SHALL render complete plain code with `MD_HIGHLIGHT_LIMIT_EXCEEDED`. They SHALL continue to use canonical code wrapping/copy behavior and SHALL NOT invoke either the external highlighter or the legacy regex highlighter.

### Cache and resize policy

Parse, resolution, highlight, projection, and layout caches SHALL use deterministic bounded eviction based on relevant entry count, node count, or estimated bytes. Cache keys SHALL include every relevant semantic and presentation input rather than relying on node identity alone.

Resize SHALL invalidate/cancel only width-dependent projection/layout generations. It SHALL NOT reparse unchanged Markdown. Continuous resize events SHALL be coalesced/latest-only, and stale layout results SHALL be discarded according to the session/revision/generation contract.

### Configuration and validation

Initial thresholds SHALL be centralized in a package-local `MarkdownResourcePolicy` or equivalent named contract. They SHALL NOT be scattered magic numbers and SHALL NOT initially become user settings.

Numeric defaults SHALL be calibrated during implementation using repository-owned benchmark/fixture evidence rather than guessed as architecture facts. Boundary tests SHALL cover `limit - 1`, `limit`, and `limit + 1` for each enforced limit.

The benchmark corpus SHALL include, at minimum, a long streaming open fence/mutable tail, large tables, long unbreakable tokens, CJK/emoji/combining text, multiline highlighter input, and continuous viewport resize.

### Invariants

- Hard semantic limit exceeded means explicit failure, never partial success.
- Soft enhancement budget exceeded preserves complete semantic content with a typed diagnostic and bounded presentation.
- Coalescing may reduce intermediate snapshot frequency but cannot change final semantics.
- Resource behavior is deterministic for the same input/policy and does not depend on incidental machine speed.
- Resource-policy failures never activate compatibility renderers.

### Rejected alternatives

- Unlimited parse/highlight/layout work: rejected because provider-controlled content could block the local TUI or cause unbounded memory growth.
- One universal size limit for every phase: rejected because semantic parsing, table allocation, highlighting, and cache retention have different safe degradation behavior.
- User-configurable thresholds in the first release: rejected because no demonstrated workflow requires configuration and it would expose implementation tuning prematurely.
- Silent truncation or timeout-based partial AST: rejected because it makes incomplete semantics appear authoritative and produces machine-dependent results.

## Decision 20: Stage Webview migration behind an explicit bounded exit contract

状态：Confirmed

### Decision

This change SHALL deliver the canonical `@neko/markdown` parser/normalized-document contract and fully migrate the TUI assistant Markdown path without expanding the same implementation slice into an immediate rewrite of the complete Agent Webview renderer.

The existing Webview `react-markdown`/remark message-rendering path MAY remain temporarily as a legacy host implementation. It SHALL NOT be described as a second canonical semantic owner, imported or used as TUI fallback, or extended with new independent Markdown/extension semantics.

The transition SHALL be bounded by linked change [`migrate-agent-webview-to-normalized-markdown`](../migrate-agent-webview-to-normalized-markdown/) with an owner, implementation tasks, removal conditions, shared fixtures, Extension Development Host acceptance, and path-level poison evidence. The linked change SHALL exist before this TUI change is archived.

### Current change scope

The current change owns:

```text
@neko/markdown canonical parser
  → Neko normalized document
  → TUI projector/layout
  → Ink adapter
```

It SHALL establish the shared CommonMark/GFM, extension, source-range, streaming, identity, and diagnostic fixture corpus. It SHALL remove the TUI regex parser, line-regex highlighter, and plain-streaming/rich-final dual renderer from the canonical assistant path.

It does not claim that every Markdown host has converged while the Webview still parses assistant messages independently.

### Webview transition constraints

Until the Webview migration is complete:

- New Markdown or Neko-extension semantics SHALL be defined only in `@neko/markdown`.
- The legacy Webview parser SHALL NOT become the source of truth for shared semantic fixtures.
- TUI code SHALL NOT import, invoke, or fall back to Webview parsing/rendering code.
- A single Webview message SHALL NOT run dual parsers for production comparison or choose a renderer through fallback-on-failure.
- Missing Webview support for a newly shared semantic capability is tracked as an explicit migration gap, not resolved by inventing host-local grammar.

### Webview removal gate

Webview semantic convergence is complete only when:

1. every assistant Markdown entry point consumes a `NormalizedMarkdownDocument` or an equivalent shared snapshot contract;
2. the Webview renderer is a presentation adapter over the normalized standard/extension node unions;
3. direct `react-markdown` or host-local remark parsing is removed from the canonical assistant-message path;
4. parser dependencies no longer required by Webview-owned responsibilities are removed;
5. standard-node projection is exhaustive and missing Neko extension adapters produce a visible diagnostic;
6. Webview and TUI execute the same semantic/source-range fixture corpus;
7. path-level poison tests prove the legacy Webview parser is not invoked by new assistant messages.

### Documentation and completion claims

Before the Webview removal gate passes, project documentation MAY state that the TUI canonical migration is complete. It SHALL NOT state that all Markdown hosts have unified semantics, and the cross-host convergence decision SHALL NOT be promoted to an Accepted ADR.

The linked Webview migration SHALL NOT be represented only by an indefinite TODO. Its OpenSpec change provides the explicit owner, scope, validation, and removal contract.

### Rejected alternatives

- Rewrite TUI and complete Webview rendering in one indivisible implementation slice: rejected because it unnecessarily couples two host migrations and expands runtime/visual acceptance risk.
- Leave Webview divergence undocumented: rejected because the temporary parser would become a permanent second semantic owner.
- Runtime dual parsing with fallback: rejected because it doubles work, hides defects, and makes semantic ownership ambiguous.
- Promote cross-host unification to Accepted ADR after TUI-only completion: rejected because the repository would document a state the running Webview has not reached.

## Decision 21: Require layered contract, path, terminal, and Agent-evaluation acceptance

状态：Confirmed

### Decision

Acceptance SHALL combine shared semantic contract tests, pure terminal projection/layout tests, controlled async race tests, canonical-path integration tests, security/resource boundary tests, real PTY/Ink runtime checks, and a focused script-driven Neko Agent evaluation.

Whole-screen text snapshots MAY supplement focused assertions but SHALL NOT be the primary correctness contract. Tests SHALL assert structured node/segment roles, source ranges, display widths, provenance, session/revision/generation identity, diagnostics, and the actual execution path.

### Shared semantic contract matrix

`@neko/markdown` tests SHALL cover the complete CommonMark/GFM baseline, including headings, nested/task lists, blockquotes, breaks, nested inline formatting, fenced/indented code, links/definitions/autolinks/images, raw HTML, tables/alignment/escaped pipes/ragged rows, and unfinished streaming constructs.

They SHALL verify half-open UTF-16 source ranges, annotation overlap, separation of contextual resolution, extension recognition in eligible text, and explicit skipping inside inline code, code blocks, and raw HTML.

Streaming tests SHALL cover append, delta coalescing, `stableEndOffset`, mutable-tail behavior, finalize, session/revision monotonicity, stable-prefix node identity, and mutable-tail identity changes. A newly added standard-node variant without normalization/exhaustive projection SHALL fail compilation or contract tests.

### Pure terminal projection/layout matrix

The Markdown-specific terminal model SHALL be tested without React, Ink, or ANSI against extremely narrow, narrow, normal, and wide viewports.

The corpus SHALL include ASCII, CJK/full-width text, combining sequences, emoji/ZWJ/flags/skin tones, Indic text, mixed scripts, and nested styled segments. Assertions SHALL cover display width, grapheme-safe wrapping, padding/alignment, visual code fragments, source-line association, semantic code copy, and decoration collapse.

Table tests SHALL cover aligned-grid, vertical-record, stacked-record, left/center/right alignment, compact/narrative/token-heavy profiles, synthetic empty cells, synthetic headers, and deterministic mode selection.

Capability/theme tests SHALL cover color-capable output, `NO_COLOR`, ASCII-border fallback, inherited background, safe link fallback, raw HTML literal presentation, and visible safe projection of unsafe terminal controls.

### Async and canonical-path tests

Controlled deferred results SHALL prove that stale highlight, resolution, and layout generations cannot overwrite current state; session-crossing results SHALL fail their association contract; cancellation SHALL not become a user-facing error.

Assistant-message integration tests SHALL exercise:

```text
first source delta
  → MarkdownStreamingSession
  → normalized snapshot
  → terminal projector/layout
  → Ink adapter
  → same-session finalize
```

The legacy regex Markdown parser, line-regex highlighter, assistant `StreamingText` Markdown path, final-only alternate renderer, and any Webview-renderer fallback SHALL be poisoned so invocation fails the test. Assertions SHALL prove the new session/projector/layout path was actually invoked rather than checking final text alone.

### Security and failure acceptance

Tests SHALL prove that provider-authored ESC, CSI, OSC, BEL, and other C0/C1 controls cannot execute and that only renderer-owned encoding can produce terminal controls.

They SHALL cover accepted HTTP/HTTPS targets, rejected arbitrary `file:`/unknown schemes, unauthorized local targets, destination-visible fallback without hyperlink capability, raw HTML preservation without interpretation, unknown extension diagnostics, fatal contract presentation, and prohibition of raw/legacy success fallback.

### Resource boundary acceptance

Every enforced numeric resource limit SHALL have `limit - 1`, `limit`, and `limit + 1` coverage. This includes the source hard limit, table grid budget, highlight byte/line budget, and cache eviction. Streaming/resize cadence SHALL instead use deterministic fake-timer, pending-latest, invocation-count, finalization, and stale-generation coverage.

Automated performance acceptance SHALL prefer deterministic complexity proxies, invocation counts, retained-entry/byte bounds, and generation behavior. Strict wall-clock thresholds that are unstable across CI machines SHALL NOT be the sole gate.

### Runtime and Agent evaluation

Acceptance SHALL include real PTY/Ink output checks for color-capable and `NO_COLOR` modes, viewport resize, table-mode transitions, code reflow, and streaming incomplete fence/table continuity through finalize.

Because this change affects TUI Agent event projection, implementation SHALL follow `.codex/skills/neko-agent-evaluation/SKILL.md` and run a focused script-driven evaluation covering mixed Markdown, GFM tables, multiline code, Unicode width, incomplete streaming syntax, and unsafe control payloads.

`pnpm test:agent:eval` MAY validate the evaluation harness but SHALL NOT be reported as evidence of real Agent behavior. If a real provider/model case cannot run, delivery evidence SHALL state the blocking condition and residual risk explicitly.

### Invariants

- Semantic correctness is proven at the shared normalized-document boundary.
- Layout correctness is proven on structured terminal output, not only snapshots.
- Canonical-path correctness is proven by poisoning legacy paths.
- Async correctness is proven with controllable generation ordering.
- Runtime correctness includes real terminal capability/resize behavior.
- Evaluation claims distinguish harness self-tests from real Agent execution.

### Rejected alternatives

- Snapshot-only tests: rejected because visually similar output can hide wrong ranges, roles, identity, unsafe controls, or legacy-path execution.
- Unit tests without PTY/Ink acceptance: rejected because terminal capabilities, ANSI encoding, resize, and scrollback integration are runtime boundaries.
- Final-message-only tests: rejected because the principal regression risk includes streaming syntax stability and renderer switching.
- Treat `pnpm test:agent:eval` as real behavior evidence: rejected because it validates the key-free harness rather than an actual provider/model path.

## Decision 22: Bound redraw cadence and make ChatView own a clipped live viewport

状态：Confirmed

### Decision

All non-final assistant Markdown source updates SHALL use one latest-only 50 ms trailing-edge coalescing window. The controller SHALL retain only the newest pending source, and finalization SHALL cancel pending work and immediately update/finalize the same canonical session. There SHALL be no source-size-based immediate parse/layout fast path.

`ChatView` SHALL own a clipped application viewport rather than relying on unbounded native terminal scrollback for the complete conversation. The scroll contract is `scrollOffset = rows above the live bottom`: offset zero follows new output, while a positive offset means the user is reading history. As content grows, the store SHALL increase a positive offset with the new scroll limit so the visible reading anchor remains stable.

The Agent store SHALL own turn timing. The first transition into `running` establishes `startTime`; repeated running updates and confirmation/resume preserve it; terminal `idle` or `error` clears it. Prompt input SHALL remain active during Agent execution and SHALL be disabled only when a selection, plan-review, approval, or another explicit modal owns the keyboard.

### Responsibility boundaries

- `TerminalMarkdownController` owns source-update cadence and same-session finalization.
- `AgentStore` owns turn status and timer lifecycle.
- `UIStore` owns bounded scroll state and the rows-above-live-bottom contract.
- `ChatView` measures content/viewport height, clips overflow, and maps the store contract to a negative content offset.
- `InputEditor` owns text editing only; the caller decides whether a modal disables it.

### Acceptance

Deterministic tests SHALL prove that every non-final update is coalesced, only the latest pending source is applied, finalization is immediate, repeated running/resume does not reset elapsed time, running input can submit a queued prompt, PageUp/PageDown obey the scroll contract, and content growth cannot force a user back to the live bottom.

Focused validation SHALL distinguish key-free evaluation-harness health from real provider/TUI behavior. A scenario dry-run proves manifest/protocol validity only; provider credentials/model execution and manual terminal-emulator observation remain separately reported runtime evidence.

### Rejected alternatives

- Parse small source deltas immediately: rejected because provider token cadence would still trigger full parse/project/layout redraw bursts and visible terminal fluctuation.
- Disable input while the Agent runs: rejected because it prevents queued follow-up prompts without a modal ownership reason.
- Express scroll position from the history top: rejected because streaming growth changes the bottom boundary and makes follow-mode/reading-anchor behavior harder to state and test.
- Depend on native terminal scrollback for the full transcript: rejected because every render can grow/reflow terminal output and cannot preserve an application-level reading anchor reliably.
