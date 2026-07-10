## 1. Replacement Boundary and Dependency Audits

- [x] 1.1 Inventory every assistant Markdown entry point and call site in `cli-tui`, including `MessageItem`, timeline rows, streaming deltas, final messages, legacy parser/highlighter calls, theme roles, terminal capabilities, extension projection, and copy/link behavior; record the bounded replacement set in the change design if it differs from the current inventory.
- [x] 1.2 Add canonical-path integration test scaffolding that can poison the regex Markdown parser, per-line regex highlighter, assistant `StreamingText` Markdown path, final-only renderer, and Webview fallback; keep the assertions focused on path invocation rather than final text alone.
- [x] 1.3 Audit `@neko/shared`, `@neko/ui`, `@neko/content`, adjacent Agent packages, existing terminal localization/theme/capability utilities, and current Webview Markdown dependencies; record which public capability is reused and why `TerminalTextMetrics`, terminal Markdown layout, and highlighter lifecycle remain `cli-tui`-local.
- [x] 1.4 Run bounded spikes for Prism core versus lowlight (or another already-approved candidate) using multiline code, startup/bundle cost, grammar loading, ESM compatibility, cancellation, and token taxonomy; select one runtime and document the evidence without creating a shared syntax-runtime package.
- [x] 1.5 Audit available Unicode grapheme/display-width libraries against ASCII, CJK, combining, emoji/ZWJ, flags, skin tones, Indic, and mixed text; select direct dependencies behind the Neko-owned `TerminalTextMetrics` contract.

## 2. Shared Markdown Contract Skeleton

- [x] 2.1 Split `packages/neko-markdown/src/index.ts` into contract-first modules for document/nodes, source ranges, annotations, resolution snapshots, streaming identity, diagnostics, parser normalization, and public exports while preserving the package boundary.
- [x] 2.2 Define branded session, revision, node, and annotation identity types; define `{ startOffset, endOffset }` half-open UTF-16 ranges, source-backed/synthetic provenance, and validators that fail on invalid containment, bounds, collisions, or wrong session association.
- [x] 2.3 Define the exhaustive CommonMark/GFM standard-node union, separate registered Neko extension-node union, table/header/row/cell/alignment contracts, raw HTML and image nodes, and normalized fenced-code language identity.
- [x] 2.4 Define range/node-linked annotation contracts for prompt spans, creative-table interpretation, provenance/evidence, and related overlapping semantics; define immutable revision-associated resolution snapshots for mentions, resources, images, authorization, and derived handoff references.
- [x] 2.5 Define stable phase-aware diagnostic contracts, codes, severities, structured parameters, optional source/node/annotation association, and separate external detail; remove final localized sentence ownership from `@neko/markdown`.
- [x] 2.6 Replace affected `{ start, end }` APIs and fixtures with `{ startOffset, endOffset }`, migrate all repository callers in the bounded change scope, and delete compatibility aliases rather than leaving dual range contracts.
- [x] 2.7 Add contract tests for exhaustive node coverage, range validation, synthetic provenance, opaque identity behavior, diagnostic shape, annotation overlap, and resolution/document separation.

## 3. Canonical CommonMark/GFM Parser and Normalization

- [x] 3.1 Add only the remark/micromark parser packages actually imported by `@neko/markdown` as direct runtime dependencies; keep MDAST and parser-library types internal.
- [x] 3.2 Implement canonical CommonMark/GFM parsing and normalization for all standard block/inline nodes, links/definitions/autolinks/images, raw HTML, task lists, strikethrough, fenced/indented code, tables, and alignment metadata.
- [x] 3.3 Normalize parser positions into validated half-open UTF-16 source ranges and preserve the authoritative source once per document snapshot.
- [x] 3.4 Replace regex-first image/mention/resource extraction with AST-aware extension normalization that emits source-occupying extension nodes only in eligible text contexts and explicitly skips inline code, code blocks, and raw HTML.
- [x] 3.5 Preserve actual ragged table row cell counts, escaped-pipe parsing, and extra cells; emit `MD_TABLE_ROW_WIDTH_MISMATCH` without truncating, merging, padding the semantic AST, or heuristically repairing non-table source.
- [x] 3.6 Implement source-deterministic annotation projection for prompt spans and creative-table interpretations without workspace/entity/resource IO.
- [x] 3.7 Implement the deterministic source hard limit and `MD_SOURCE_LIMIT_EXCEEDED` contract; calibrate its initial value with repository fixtures and add `limit - 1`, `limit`, and `limit + 1` tests.
- [x] 3.8 Add shared semantic fixtures covering the full CommonMark/GFM baseline, nested structures, entities/escapes, raw HTML, images, extensions, extension-ineligible contexts, Unicode source ranges, ragged tables, and malformed provider content.

## 4. Streaming Session, Stability, and Resolution Association

- [x] 4.1 Implement `MarkdownStreamingSession` with append, coalesced latest-source updates, finalize, immutable normalized snapshots, session ID, monotonic revision, `stableEndOffset`, and explicit mutable range.
- [x] 4.2 Implement syntax-stability rules for unfinished fences/lists/blocks and active-table holdback inside `@neko/markdown`; do not expose table/fence grammar scanning to the TUI.
- [x] 4.3 Implement deterministic session-local node/annotation identity so unchanged stable-prefix nodes retain IDs across append revisions while mutable-tail nodes may be rebuilt.
- [x] 4.4 Add cancellable/contextual resolution orchestration that consumes a normalized snapshot and produces a separate session/revision-associated resolution snapshot without mutating semantic nodes.
- [x] 4.5 Implement wrong-session/revision rejection for resolution and other async associations, and classify stale results as discardable control flow rather than user-facing diagnostics.
- [x] 4.6 Add streaming tests for incomplete fences/tables/lists, stable-prefix identity, mutable-tail reparsing, delta coalescing, active-table holdback, finalization of the same session, cross-session rejection, and complete final semantics.
- [x] 4.7 Calibrate and implement the mutable-tail immediate-update/coalescing budget in the centralized resource policy, with boundary and invocation-count tests that do not falsely mark unstable syntax as stable.

## 5. Terminal Text, Theme, Localization, and Encoding Foundations

- [x] 5.1 Add `@neko/markdown` and the selected Unicode metric dependencies as direct `@neko/cli` runtime dependencies; update lockfile and verify no package imports a transitive dependency accidentally.
- [x] 5.2 Define the package-local `TerminalTextMetrics` port and implement display width, grapheme segmentation, styled-segment wrapping, tab/display padding behavior, and alignment without ANSI-string or UTF-16 visible slicing.
- [x] 5.3 Add the canonical Unicode corpus tests for ASCII, CJK/full-width, combining marks, emoji/ZWJ, flags, skin tones, Indic, long tokens, mixed scripts, and nested styled spans.
- [x] 5.4 Extend the existing TUI theme contracts/tokens with semantic Markdown roles and syntax token roles; resolve roles through current theme/capability infrastructure rather than introducing a parallel runtime.
- [x] 5.5 Implement `NO_COLOR`, inherited-background, syntax-background suppression, extended-color, Unicode/ASCII-border, and hyperlink capability resolution while preserving supported font attributes and structural markers.
- [x] 5.6 Extend the existing Agent terminal localization bundles/presenter contracts for Markdown diagnostics, fatal rendering blocks, synthetic table column labels, unresolved markers, image/link fallback labels, and safe-control descriptions; add bundle parity/interpolation tests.
- [x] 5.7 Implement renderer-owned safe terminal encoding for structured styles and validated hyperlinks; make provider ESC/CSI/OSC/BEL/C0/C1 data inert and visibly diagnosable before encoding.
- [x] 5.8 Add focused theme/capability/security tests proving `NO_COLOR`, inherited background, ASCII borders, safe controls, and renderer-only terminal sequence generation.

## 6. Pure Terminal Markdown Projector and Layout

- [x] 6.1 Define pure package-local `TerminalMarkdownBlock`, styled inline segment, layout input, `TerminalLine`, provenance, visual-fragment, diagnostic-presentation, and cache-key contracts with no React, Ink, or ANSI dependencies.
- [x] 6.2 Implement exhaustive standard block/inline projection for headings, paragraphs, quotes, lists/task state, thematic/break nodes, nested emphasis/strong/strikethrough, inline code, links, images, definitions, raw HTML literals, and registered Neko extension nodes.
- [x] 6.3 Implement visible failure for unknown/unregistered extension adapters and compile/contract-test exhaustiveness for every standard-node variant.
- [x] 6.4 Implement semantic link-target resolution for HTTP/HTTPS, destination-visible fallback, separate authorization-aware local-resource targets, image ordinary-terminal projection, and rejection of arbitrary model-generated `file://` targets.
- [x] 6.5 Implement typed presentation policies for source/content diagnostics, external enhancement failures, stale async results, and fatal contract blocks without raw-text or legacy-renderer success fallback.
- [x] 6.6 Add pure projector tests for nested inline roles, lists, raw HTML, images, safe/unsafe links, Neko extensions, localized diagnostics, source/projection provenance, and exhaustive-node behavior.

## 7. Adaptive Table Layout

- [x] 7.1 Implement table column profiling for compact, narrative, and token-heavy content, including natural width, preferred floor, hard floor, longest unbreakable width, and projected wrapped row height.
- [x] 7.2 Implement deterministic aligned-grid allocation with GFM left/center/right display-width padding across multiline cell content.
- [x] 7.3 Implement vertical-record and stacked-record projections that preserve header/value relationships, every semantic row/cell, and semantic order at narrow widths.
- [x] 7.4 Implement presentation-only rectangularization using maximum header/alignment/body width, synthetic empty cells with projection provenance, synthetic localized labels for headerless columns, and unspecified alignment for missing metadata.
- [x] 7.5 Implement deterministic grid-to-record fallback and `MD_TABLE_GRID_BUDGET_EXCEEDED` for oversized tables using linear-complexity record presentation without truncation.
- [x] 7.6 Calibrate initial table floors/profile thresholds/grid budget against fixtures instead of exposing user settings; centralize values in `MarkdownResourcePolicy` and add boundary tests.
- [x] 7.7 Add structured layout tests for all three modes, ragged rows, escaped pipes, multiline cells, alignment, Unicode width, long tokens, profile allocation, mode transitions, and extremely narrow viewports.

## 8. Whole-Block Code Presentation

- [x] 8.1 Define the package-local whole-block highlighter port, normalized-language mapping, host-neutral syntax token roles, highlight generation, cancellation, guardrails, and plain-code result contract.
- [x] 8.2 Add the selected highlighter as a direct `@neko/cli` runtime dependency and implement grammar registration/loading behind the port without exporting parser/runtime-specific token types.
- [x] 8.3 Implement async highlight generation/revision validation so stale or cross-session results are discarded and cannot overwrite current code presentation.
- [x] 8.4 Implement unknown-language, runtime-failure, and highlight-byte/line-budget paths as complete plain code with typed diagnostics; remove any path to the line-regex highlighter.
- [x] 8.5 Implement post-highlight grapheme-safe visual wrapping with logical source-line and fragment metadata, natural-boundary preference, long-token grapheme wrapping, and decoration collapse before content.
- [x] 8.6 Implement semantic code copy/export from normalized code value so visual wraps, borders, gutters, line numbers, and continuation markers cannot enter the copied source.
- [x] 8.7 Calibrate highlight byte/line limits and cache weights using multiline and oversized fixtures; add boundary, cancellation, cache-eviction, multiline grammar, resize-reflow, and copy-fidelity tests.

## 9. Ink Integration and Legacy Removal

- [x] 9.1 Add a TUI composition owner/hook for assistant Markdown session lifecycle, resolution/highlight generations, viewport-dependent layout, cache disposal, and message-boundary fatal handling; keep these responsibilities out of leaf Ink text components.
- [x] 9.2 Implement a thin Ink adapter that renders structured terminal lines/spans, borders, attributes, and validated hyperlink metadata without parsing Markdown or calculating display width.
- [x] 9.3 Replace `MessageItem` and `TimelineRowLine` assistant streaming/final branches with the same canonical Markdown session/projector/layout path from first delta through finalization.
- [x] 9.4 Ensure `StreamingText` remains only for explicitly named non-Markdown status/progress/plain-text responsibilities and add tests preventing it from rendering assistant Markdown.
- [x] 9.5 Add resize subscription/coalescing so unchanged normalized documents are reprojected/reflowed without reparsing; reject stale width/layout generations.
- [x] 9.6 Remove the TUI regex Markdown parser, line-regex syntax highlighter, obsolete final-only renderer logic, compatibility branches, and unused dependencies/exports after all assistant call sites are migrated.
- [x] 9.7 Complete path-level poison tests proving first delta, intermediate streaming, timeline rows, historical finalized messages, failure presentations, and same-session finalize never invoke removed/legacy paths.
- [x] 9.8 Add Ink component/integration tests for streaming continuity, table mode projection, code wrapping, fatal blocks, `NO_COLOR`, Unicode/ASCII capabilities, and output stability without relying only on whole-screen snapshots.

## 10. Resource Policy, Cache, and Runtime Acceptance

- [x] 10.1 Centralize source, mutable-tail update, table grid, highlight, and cache limits in one package-local `MarkdownResourcePolicy`; document the evidence used for initial numeric defaults and keep them out of user settings.
- [x] 10.2 Implement bounded parse-associated, resolution, highlight, projection, and layout caches with complete semantic/theme/capability/viewport/generation keys and deterministic entry/node/estimated-byte eviction.
- [x] 10.3 Add `limit - 1`, `limit`, and `limit + 1` tests for every enforced resource limit plus deterministic invocation-count/retention assertions that avoid flaky machine-speed gates.
- [x] 10.4 Add a real PTY/Ink acceptance harness or focused runtime fixture covering color-capable output, `NO_COLOR`, ASCII borders, hyperlink fallback, continuous resize, table mode transitions, code reflow, and incomplete fence/table streaming through finalize.
- [x] 10.5 Verify provider-authored terminal controls remain inert in captured PTY output and only renderer-owned ANSI/OSC sequences appear for resolved styles/validated links.

## 11. Agent Evaluation and Repository Quality Gates

- [x] 11.1 Follow `.codex/skills/neko-agent-evaluation/SKILL.md` to add focused script-driven scenarios under `scripts/agent-eval` for mixed Markdown, GFM alignment/ragged tables, multiline code, Unicode width, incomplete streaming syntax, resize, and unsafe terminal-control payloads.
- [x] 11.2 Add path-level evaluation assertions/facts only through generally useful TUI debug automation contracts; do not add evaluation-specific pass/fail semantics or restore a `neko eval` command.
- [x] 11.3 Run `pnpm --filter @neko/markdown test:run`, `pnpm --filter @neko/cli test:run`, and `pnpm --filter @neko/cli build`; fix all contract, strict TypeScript, and bundle failures.
- [x] 11.4 Run `pnpm test:agent:eval` as key-free harness validation and separately run the focused real Agent/provider evaluation; if credentials, network, model, controller, or judge access blocks the real case, record the blocker and residual risk without calling the harness result behavior evidence.
- [x] 11.5 Run `pnpm check:agent-boundaries`, `pnpm check:legacy-debt`, `pnpm check:unused`, `pnpm check:openspec`, and the applicable broader `pnpm check`/`pnpm ci:local` gate; record any command that cannot run and its residual risk.
- [x] 11.6 Apply `.codex/skills/neko-quality-review/SKILL.md` after implementation, resolve blocking findings, and document affected risk level, architecture boundaries, validation evidence, and remaining external/runtime risk.

## 12. Documentation and Bounded Webview Follow-up

- [x] 12.1 Update `packages/neko-markdown/README.md` and relevant Agent TUI/package documentation with the normalized document/session entry points, terminal adapter boundary, diagnostic/resource behavior, and migration from removed legacy APIs.
- [x] 12.2 Update the existing unified Markdown/resource ADR with the implemented TUI state and explicit Webview convergence gap, but do not mark cross-host semantic unification Accepted before the Webview removal gate passes.
- [x] 12.3 Audit every Agent Webview assistant Markdown entry point and direct `react-markdown`/remark parser dependency against the shared normalized contract and fixture corpus.
- [x] 12.4 Create a linked Webview migration OpenSpec change with owner, proposal, design, capability specs, tasks, dependency cleanup, exhaustive adapter coverage, shared fixtures, runtime acceptance through Extension Development Host, and legacy-parser poison removal gate before archiving this change.
- [x] 12.5 Re-run OpenSpec validation, confirm the TUI proposal/specs/tasks match implemented behavior, and archive only after all current-change acceptance evidence and the linked Webview change exist.
