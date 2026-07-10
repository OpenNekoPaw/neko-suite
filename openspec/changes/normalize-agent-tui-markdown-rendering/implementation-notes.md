# Implementation Notes: Agent TUI Markdown Rendering

日期：2026-07-10

本文件记录实现期审计、bounded spike、验证证据和剩余风险。它属于当前 OpenSpec change，不作为稳定架构事实来源。

## Phase 1 replacement-boundary inventory

### Assistant Markdown entry points

| Entry point                          | Current path                                                                                                       | Replacement obligation                                                                                                                              |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MessageItem` non-timeline assistant | `isStreaming` → `StreamingText(currentDelta)`; finalized → `MarkdownRenderer(message.content)`                     | Replace both branches with one message-scoped `MarkdownStreamingSession` and terminal projector/layout path.                                        |
| `TimelineRowLine` `assistant_text`   | `row.status === 'streaming'` → `StreamingText`; otherwise → `MarkdownRenderer`                                     | Use the same canonical session identity across row updates and finalization.                                                                        |
| Historical finalized messages        | Stored `Message.content` enters `MarkdownRenderer` on render                                                       | Create/finalize a canonical session from authoritative stored source; do not invoke a final-only parser/renderer.                                   |
| Streaming delta accumulation         | `conversation-store.appendDelta` concatenates `currentDelta`; timeline projection updates `assistant_text` rows    | Preserve accumulation ownership, but feed append/coalesced source revisions into the canonical Markdown session rather than a plain-text component. |
| Finalization                         | `conversation-store.completeMessage` copies final source into the last assistant message and clears `currentDelta` | Finalize the existing session for live messages; the final source remains authoritative and must not switch renderer state.                         |

### Legacy implementation surface to remove

- `components/Markdown/MarkdownRenderer.tsx` parses on render through `utils/markdown-parser.ts`.
- `utils/markdown-parser.ts` is a package-local regex parser exported from `src/index.ts`.
- `components/Markdown/CodeBlock.tsx` highlights each source line independently through `highlightLine`.
- `utils/syntax-highlight.ts` is a package-local regex highlighter; `highlightCode` is only a line-by-line wrapper.
- `StreamingText.tsx` is currently an assistant Markdown renderer in both message and timeline paths; it may remain only for explicitly non-Markdown status/progress text.
- `src/index.ts` publicly exports all of the legacy renderer/parser/highlighter entry points and must stop doing so after migration.

### Theme, capability, link, copy, and extension behavior

- Existing TUI capability detection in `utils/terminal.ts` already owns `NO_COLOR`, color depth, Unicode fallback, terminal size, and hyperlink capability detection. The Markdown adapter must consume that public capability result rather than duplicate environment probing.
- Existing `theme/tokens.ts`, `types/theme.ts`, and `core/theme.ts` own TUI colors/attributes but do not yet expose the complete semantic Markdown role set. The implementation extends this theme boundary; it does not create another theme runtime.
- Current TUI Markdown links are underlined labels only. There is no assistant Markdown copy command and no trusted OSC-8 link encoder. The replacement therefore adds validated `http:`/`https:` metadata and safe visible-target fallback without pretending an existing copy workflow exists.
- `@neko/markdown` extension projection is consumed by Agent Webview presenters and Agent output validation. The CLI TUI currently has no direct dependency on `@neko/markdown`; it must add one and consume normalized nodes/annotations/resolution snapshots without importing Webview renderers.
- Agent Webview directly owns `react-markdown`, remark/GFM, and Prism-based presentation today. It is explicitly outside the TUI fallback path and remains a bounded follow-up migration surface.

The inventory matches the replacement boundary in the design; no additional assistant Markdown entry point was found outside `MessageItem`/`TimelineRowLine`, their store/timeline source updates, legacy parser/highlighter exports, and historical-message rendering.

## Shared capability and reuse audit

Audited `@neko/shared`, `@neko/ui`, `@neko/content`, `@neko/platform`, the Agent Webview, and CLI TUI source using repository-wide symbol/dependency searches.

### Reused public capabilities

- `@neko/markdown`: host-neutral normalized Markdown semantic contract and parser/session ownership.
- Existing CLI TUI terminal capability detection: color/`NO_COLOR`, Unicode, dimensions, and hyperlink support.
- Existing CLI TUI theme runtime and token types: semantic role resolution is added here.
- Existing CLI TUI locale boundary: final diagnostic strings remain host-localized.
- Existing `@neko/content`/Agent resource services: contextual resolution and authorization remain outside parsing and are associated through immutable resolution snapshots.

### Capabilities intentionally kept `cli-tui`-local

- `TerminalTextMetrics`: it maps grapheme clusters to terminal display columns and is therefore terminal-host presentation policy, not a DOM/shared semantic concern.
- Terminal Markdown projector/layout: it emits Markdown-specific terminal blocks/lines and must not become an `@neko/ui` component or repository-wide terminal DSL.
- Whole-block highlighter lifecycle: grammar loading, generation/cancellation, budget handling, and terminal token-role mapping are specific to the CLI TUI runtime. A second host adopting the same lifecycle is the extraction gate.

No existing public package provides these three contracts without importing DOM/React, host-specific state, or unrelated domain semantics. Keeping them local preserves L0/L1/L2 dependency direction and avoids a new shared syntax runtime.

## Whole-block highlighter spike

Compared `lowlight@3.3.0` with `prismjs@1.30.0` in an isolated ESM spike using a multiline JavaScript block containing a multiline comment and Unicode text.

| Criterion                                  | lowlight                                                | Prism core                                              |
| ------------------------------------------ | ------------------------------------------------------- | ------------------------------------------------------- |
| Whole-block multiline state                | Preserved                                               | Preserved                                               |
| ESM loading                                | Native ESM; explicit `createLowlight` registry          | CJS-oriented core plus global component side effects    |
| One-language minified Node bundle in spike | 29,889 bytes                                            | 24,555 bytes                                            |
| Cold import in spike                       | ~34.5 ms                                                | ~3.3 ms                                                 |
| First highlight in spike                   | ~7.2 ms                                                 | ~6.3 ms                                                 |
| Grammar loading                            | Explicit language function registration                 | Component imports mutate Prism grammar registry         |
| Token taxonomy                             | HAST text/elements with `hljs-*` classes                | Nested Prism `Token` values                             |
| Cancellation                               | Must be owned by outer generation/cancellation contract | Must be owned by outer generation/cancellation contract |

Selection: **`lowlight`** as a direct `@neko/cli` runtime dependency. Its small measured overhead is acceptable for the local TUI, while native ESM, explicit registry construction, and data-only HAST output reduce coupling and make grammar ownership/test isolation clearer. The adapter will flatten HAST into Neko-owned token spans and reject stale generations; no lowlight/HAST type escapes the package-local port.

## Unicode grapheme/display-width spike

Compared platform `Intl.Segmenter`, `unicode-segmenter@0.17.0`, and `string-width@7.2.0` against ASCII, CJK, combining marks, emoji ZWJ, flags, skin tones, Indic conjuncts, Indic ZWJ, and mixed text.

Observed expected widths with `string-width@7.2.0`: ASCII `abc` = 3, `你好` = 4, `é` = 1, `👩🏽‍💻` = 2, `🇨🇳` = 2, `👍🏽` = 2, `क्ष` = 1, `क्‍ष` = 1, and the mixed fixture = 9. Both tested segmenters produced the same grapheme boundaries for the fixture corpus.

Selection:

- **`unicode-segmenter`** as the direct deterministic grapheme-boundary dependency.
- **`string-width@7.2.0`** as the direct display-width dependency because it supports the CLI's Node 18 target; version 8 requires a newer runtime policy and is not selected.

Both remain behind the Neko-owned `TerminalTextMetrics` interface. Source UTF-16 offsets are never derived from display widths, and wrapping/padding iterate whole grapheme clusters only.

## Shared parser source-limit calibration (2026-07-10)

The initial `1,000,000` UTF-16 code-unit hard limit was checked against repository Markdown and Agent/OpenSpec fixture-like text (`docs/`, `openspec/`, `packages/neko-agent/`, and `scripts/agent-eval/`, excluding generated dependency output). The largest checked source was `74,532` code units (`docs/superpowers/plans/2026-07-03-creative-table-profile-prompt-slots.md`); the selected limit is about 13.4× that observed source and remains deterministic rather than machine-time based. Tests now exercise the configured default at `limit - 1`, `limit`, and `limit + 1`, in addition to a small-policy boundary fixture.

## 2026-07-10 TUI terminal presentation implementation

Implemented the terminal adapter under `packages/neko-agent/packages/cli-tui/src/markdown/` and kept semantic parsing/session ownership in `@neko/markdown`:

- `TerminalTextMetrics` is backed directly by `unicode-segmenter@0.17.0` and `string-width@7.2.0`; styled wrapping, padding, table allocation, and code wrapping operate on grapheme clusters and terminal display columns rather than UTF-16 offsets.
- Semantic Markdown/syntax roles extend the existing TUI `ThemeTokens`. Markdown and syntax backgrounds remain inherited/suppressed, while `NO_COLOR` disables color without removing structural/font attributes.
- Injectable terminal capabilities resolve color, extended color, Unicode/ASCII borders, and OSC 8 hyperlink support independently; `NO_COLOR` wins over `FORCE_COLOR`.
- Renderer-owned encoding makes provider C0/C1/ESC/BEL data inert and only emits SGR/OSC sequences from structured styles and validated HTTP(S) or authorization-associated local-resource targets.
- The normalized-document projector and terminal layout are pure modules with no React, Ink, ANSI, DOM, VSCode, or Webview dependency. Ink remains a thin `<Text>` adapter over renderer-owned encoded lines.
- Adaptive tables use compact/narrative/token-heavy profiles and deterministic aligned-grid → vertical-records → stacked-records fallback. Presentation-only ragged rectangularization preserves all source cells and adds localized synthetic headers where required.
- The whole-block lowlight port normalizes language identity, preserves multiline grammar state, enforces byte/line budgets, supports cancellation and stale-generation rejection, maps into Neko syntax roles, and preserves authoritative code source for copy behavior.
- `CanonicalMarkdownRenderer` owns one `TerminalMarkdownController` and one `MarkdownStreamingSession` from the first delta through finalization. Ordinary assistant messages, timeline assistant rows, and historical finalized messages all enter this path. Resize reuses the normalized revision and performs only projection/layout work.
- The TUI regex Markdown parser, per-line regex syntax highlighter, `CodeBlock`, final-only `MarkdownRenderer`, their exports, and assistant `StreamingText` Markdown calls were removed. `StreamingText` remains only for explicitly named non-Markdown status/progress/plain-text responsibilities.
- Generally useful path events (`session-created`, `source-updated`, `document-projected`, `layout-created`, `session-finalized`, coalescing, stale layout, and highlighting events) are exposed through TUI debug automation. The runner evaluates them; runtime code does not contain evaluation-specific pass/fail fields or a restored `neko eval` command.

### Controller ownership and cache identity

`TerminalMarkdownController` owns its labels, policy, resource resolver, highlighter, scheduler, streaming session, async generations, and all derived caches. These dependencies and caches are isolated per controller instance; no renderer-global mutable policy, resolver, grammar state, or presentation cache is shared between assistant messages.

The implemented cache identities are:

- parse-associated retention: numeric document revision within the controller-owned session;
- resolution: `sessionId:revision`;
- projection: `revision:presentationVersion`;
- layout: `revision:presentationVersion:viewportWidth:supportsUnicode`;
- highlight: normalized language identity, a NUL separator, and the complete normalized code source.

The highlight key intentionally excludes theme and viewport because cached values contain semantic syntax roles and authoritative source ranges, not encoded colors or wrapped visual fragments. Theme/capability encoding remains downstream, and viewport reflow consumes the same whole-block tokens. Deterministic highlighted results and deterministic plain results caused by unsupported language or resource budgets are cached; `runtime-failure` plain results are not cached. Stale/cancelled results are discarded before cache insertion.

### Centralized resource policy

The implemented package-local defaults are guardrails rather than user settings:

| Policy                        |                             Default | Enforcement/evidence                                                                                 |
| ----------------------------- | ----------------------------------: | ---------------------------------------------------------------------------------------------------- |
| streaming/resize coalescing   |                               50 ms | every non-final source update and resize is latest-only; final source update/finalization is immediate |
| aligned table grid            |                         1,024 cells | larger tables fail over to linear record layout with `MD_TABLE_GRID_BUDGET_EXCEEDED`                 |
| whole-block highlight bytes   |                             256 KiB | exact byte boundary tests                                                                            |
| whole-block highlight lines   |                               4,096 | exact line boundary tests                                                                            |
| parse-associated cache        |                        32 revisions | deterministic entry eviction                                                                         |
| resolution cache              | 64 revisions / 4,096 resolved nodes | deterministic entry and node-weight eviction                                                         |
| projection cache              |                          64 entries | semantic/presentation-version key and deterministic eviction                                         |
| layout cache                  |                         128 entries | revision/presentation/viewport/capability key and deterministic eviction                             |
| highlight cache               |              2 MiB estimated weight | code bytes + token/diagnostic estimates and deterministic eviction                                   |
| debug Markdown path facts     |                        2,048 events | oldest event is dropped and the dropped count makes incomplete evidence fail                         |
| debug terminal resize         |         columns/rows each `1..1000` | protocol validation fails on invalid values                                                          |
| evaluation resize settlement  |    50 ms after each resize response | aligns protocol fact collection with the current controller coalescing window                        |

Every enforced parser/TUI resource limit has deterministic `limit - 1`, `limit`, and `limit + 1` or equivalent entry/weight-retention coverage. Temporal cadence uses fake timers and asserts pending-latest, invocation count, immediate finalization, and stale-generation behavior instead of treating delay as a size threshold. The tests avoid wall-clock performance assertions.

### Standalone build and evaluation runner fixes

Two acceptance blockers were fixed without adding a second runtime path:

1. `applyScenarioSetup()` now creates the selected scenario `cwd` even when `setup: []`. Setup file operations still pass through the existing workspace-containment resolver. This fixed real cases that used an empty setup list with `/tmp/neko-agent-tui-markdown-eval`.
2. The Bun standalone build plugin now resolves exact package `imports` entries from the importing package's owning `package.json`, selecting `bun`, `node`, `import`, then `default` conditional targets and accepting only package-relative `./...` targets. This fixed `vfile`'s `#minurl` import, whose unresolved compiled form previously failed as `ReferenceError: isUrl is not defined`.

The protocol runner waits 50 ms after each successful `terminal.resize` response. This is runner-side UI settlement for a generally useful resize control, not an evaluation-specific runtime success flag. It aligns fact collection with the controller's current 50 ms latest-only resize window; a future asynchronous settled-generation acknowledgement remains preferable to increasing timing sleeps.

## Runtime responsiveness follow-up

A later runtime regression exposed three coupled symptoms: provider-token redraw bursts caused visible fluctuation, turn time/input appeared frozen during execution, and native-bottom-follow behavior prevented reading earlier output. The canonical path remains unchanged; the fix narrows ownership and redraw cadence:

- `TerminalMarkdownController` now coalesces every non-final source update at 50 ms and keeps only the latest pending source. A final update cancels pending work and immediately finalizes the same session.
- `AgentStore` preserves the first `startTime` across repeated `running` updates and confirmation/resume, then clears it on `idle` or `error`; `useTimer` returns to zero only when no turn start exists.
- `UIStore` defines `scrollOffset` as rows above the live bottom and preserves a positive reading offset as the content limit grows. `ChatView` owns a measured, clipped viewport and PageUp/PageDown navigation instead of continuously expanding native terminal scrollback.
- `InputEditor` remains active during an Agent run. Only explicit modal states disable it, so a follow-up prompt can be queued while output streams.

Regression coverage uses fake timers and Ink/store fixtures for source coalescing, immediate finalization, timer continuity, running input submission, viewport clipping, scroll direction, and reading-anchor preservation. The focused test lane, CLI bundle, Agent extension/Webview compile, key-free Agent evaluation harness, and scenario dry-run passed. The dry-run validates scenario/protocol structure only; this follow-up did not rerun a credentialed real-provider case or a manual terminal-emulator smoke, so terminal-specific residual flicker remains an explicit risk.

## Verification evidence

### Focused and package tests

```bash
pnpm exec vitest --run \
  packages/neko-agent/packages/cli-tui/src/components/Markdown/*.test.tsx \
  packages/neko-agent/packages/cli-tui/src/markdown/__tests__/*.test.ts \
  packages/neko-agent/packages/cli-tui/src/core/__tests__/tui-markdown-locale.test.ts \
  packages/neko-agent/packages/cli-tui/src/core/debug-automation/__tests__/*.test.ts \
  packages/neko-agent/packages/cli-tui/src/core/debug-automation/__tests__/*.test.tsx \
  scripts/agent-eval/scenario-runtime.test.mjs \
  scripts/agent-eval/protocol-smoke.test.mjs
# 16 files passed, 102 tests passed

pnpm --filter @neko/markdown test:run
# 4 files passed, 28 tests passed

pnpm --filter @neko/cli test:run
# No test files found, exiting with code 0

pnpm --filter @neko/cli build
# success

pnpm --filter @neko/cli build:exe
# Built packages/neko-agent/neko as a Mach-O arm64 executable
```

`@neko/cli test:run` did not discover tests under its package-local Vitest root/include configuration and is not counted as executed CLI behavior evidence. The root focused Vitest command above is the actual 102-test CLI/debug/evaluation-runner evidence. The standalone executable was acceptance-tested and the pre-existing tracked binary was restored afterward, so no generated binary diff is retained.

A package-wide strict TypeScript check was also attempted:

```bash
pnpm exec tsc --noEmit -p packages/neko-agent/packages/cli-tui/tsconfig.json
```

It remains blocked by existing errors in adjacent Agent, AI SDK, platform, test-utils, market-command, and hook-test files. No reported error was in the new Markdown controller/projector/layout/debug-automation files. The focused tests and CLI bundle provide the scoped compilation evidence; the repository-wide type debt remains external risk.

### Key-free harness and real Agent/provider evidence

```bash
pnpm test:agent:eval
# 2 files passed, 31 tests passed
```

This proves the key-free manifest/runner/assertion harness only; it is not treated as real Agent behavior evidence.

The focused scenarios in `scripts/agent-eval/scenarios/tui-markdown-rendering.scenarios.json` were then run through TUI debug automation with provider/model `nekoapi-chat/gpt-5.5`:

| Case                                   | Result                                                      | Path evidence                                                                                                                               |
| -------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `mixed-gfm-unicode-resize`             | passed through source bundle and compiled standalone binary | 817 events, 0 dropped; required session/source/projection/layout/finalize events; layout widths `24, 48, 80, 96` for requested `96, 48, 24` |
| `incomplete-fence-table-streaming`     | passed                                                      | 778 events, 0 dropped; same canonical session through finalization                                                                          |
| `unsafe-terminal-controls-in-markdown` | passed                                                      | 475 events, 0 dropped; widths `28, 72, 80`; runtime errors empty                                                                            |

Compiled-binary result: `/tmp/tui-markdown-compiled-eval.json`. Additional case results: `/tmp/incomplete-fence-table-streaming.json` and `/tmp/unsafe-terminal-controls-in-markdown.json`.

The runs emitted the existing StageGuardian warning that Apply was entered without Draft/Plan and Node's existing `DEP0190` shell-spawn deprecation warning. Neither entered `runtimeErrors`, and all deterministic scenario assertions passed.

### OpenSpec and repository gates

Passed:

```bash
pnpm check:openspec
# 72 passed, 0 failed

openspec validate normalize-agent-tui-markdown-rendering --strict
openspec validate migrate-agent-webview-to-normalized-markdown --strict
# both passed
```

The following gates were run and remain blocked by repository findings outside this change's bounded files:

- `pnpm check:agent-boundaries`: existing compatibility exceptions expired on 2026-07-04 (`agent-turn-bridge-host-adapter`, `agent-runner-vscode-event-compat`, `skill-file-service-watcher-adapter`, `agent-core-command-bridge`, `puppet-face-tool-bridge`). Log: `/tmp/neko-gate-agent-boundaries.log`.
- `pnpm check:legacy-debt`: existing repository legacy-debt findings; the removed TUI regex/final-only path is not reported as `delete-now`. Log: `/tmp/neko-gate-legacy-debt.log`.
- `pnpm check:unused`: existing unused files/dependencies/exports and duplicate exports, including `scripts/vscode-webview-warning-policy.test.mjs`, several shared package dependencies, Agent test use of unlisted `@neko/skills`, and existing duplicate export groups. Log: `/tmp/neko-gate-unused-final.log`.
- `pnpm check`: stops at the same existing `check:unused` findings before dependency checks. Log: `/tmp/neko-gate-check.log`.
- `pnpm check:deps`: existing `neko-content` cycles through `document/index.ts`, `read-image-tool.ts`, and `content-read-capability-provider.ts`. Log: `/tmp/neko-gate-deps.log`.

No unrelated repository finding was modified or hidden as part of this change.

## Quality review (2026-07-10)

### Findings

- **Blocking:** none found in the bounded TUI Markdown/shared-contract/evaluation/build changes.
- **Suggestion:** the Bun package-import resolver intentionally implements the exact conditional-import shape needed by the current dependency graph, not the complete Node `imports` pattern/array specification. If a future standalone dependency introduces wildcard or array targets, add focused resolver coverage before extending the resolver rather than silently falling through.
- **Suggestion:** the runner's 50 ms resize settlement matches the current 50 ms controller window and previously passed compiled-binary evaluation, but it remains a timing boundary with no extra margin. Replace the delay with a deterministic settled-generation acknowledgment/fact before adding slower asynchronous resize work rather than increasing arbitrary sleeps.

### Risk level and five-layer review

Risk is **L3** because the change replaces an AI assistant rendering path, adds shared semantic contracts, changes TUI debug automation facts, and affects standalone packaging.

- **Responsibility:** `@neko/markdown` owns source, typed normalized semantics, diagnostics, identity, and streaming stability. `TerminalMarkdownController` owns one terminal session lifecycle, async generations, resolution/highlight state, and bounded derived caches. Pure projector/layout modules own terminal presentation. Ink only mounts/disposes the controller and displays encoded lines. The script runner owns evaluation orchestration and settlement.
- **Dependency:** dependency direction is `@neko/cli` → `@neko/markdown`; the shared package does not import CLI, React, Ink, Webview, Extension, or Agent internals. Terminal-only metrics/layout/highlighter lifecycle remain package-local after an explicit shared-capability audit. Webview is not used as a fallback.
- **Interface:** normalized nodes/annotations/resolution snapshots and path-event facts are typed and host-neutral or TUI-generic. Invalid ranges, session association, append-only violations, unsupported debug methods/assertions, unsafe controls, and unknown snapshot targets fail visibly.
- **Extension:** resource resolution and whole-block highlighting are injected ports with per-controller lifecycle. A second host requiring terminal metrics/layout/highlighter lifecycle is the documented extraction gate; no speculative repository-wide terminal DSL or syntax runtime was added.
- **Testing:** shared contracts/parser/streaming, pure projection/layout/security, async cancellation/staleness, cache/resource boundaries, Ink runtime fixtures, legacy poison gates, debug protocol, key-free harness, real provider cases, and compiled standalone execution are covered. Existing repository-wide type/dependency/debt failures remain explicitly recorded.

### Architecture answers

1. **Does it fit the existing architecture?** Yes. Host-neutral semantic ownership stays in `@neko/markdown`; terminal behavior stays in `cli-tui`; React/Ink is a thin host adapter; debug/evaluation behavior uses the existing script-driven TUI automation path.
2. **How is coupling reduced?** Streaming and final messages no longer switch renderer/parser paths; parser IO is separated from contextual resolution; theme/capability/encoding are downstream of semantic projection; resolver/highlighter/policy lifecycle is injected and controller-local.
3. **Is it extensible and testable?** Yes within the current product boundary. Exhaustive typed nodes, pure projection/layout, deterministic cache keys, injectable external enhancement ports, explicit generations, and path-level facts permit focused tests without creating speculative cross-host runtime abstractions.

## Remaining bounded risk and Webview follow-up

- The package-wide strict TypeScript and repository-wide quality gates cannot be green until unrelated existing debt is resolved; scoped tests/build/evaluation are green.
- `@neko/cli test:run` now discovers 55 files / 371 tests instead of exiting with no tests. The focused Markdown lane is green (9 files / 56 tests), while the package-wide run still has 20 failures across 4 files from concurrent localization, experiment, and Skill-catalog work; those failures are not treated as Markdown regressions.
- Bun exact package-import support and the runner's timing-based resize settlement have the extension conditions described in the quality-review suggestions.
- The Agent Webview still owns direct `react-markdown`/remark presentation. `webview-audit.md` records the entry points and dependency surface, and linked change `migrate-agent-webview-to-normalized-markdown` contains proposal, design, capability spec, tasks, dependency cleanup, shared-fixture requirements, Extension Development Host acceptance, and a legacy-parser poison removal gate.
- Cross-host semantic unification therefore remains not Accepted in `docs/architecture/adr-unified-markdown-resource-rendering.md`. This TUI change must not be archived merely because its own acceptance evidence is complete; the linked Webview implementation/removal gate remains outstanding.

## Compact reference presentation follow-up

The TUI now renders selected path references compactly in both the active editor and historical user messages through one package-local `ReferenceAwareText` projection. The editor and conversation store continue to own the complete authored string; presentation never rewrites the prompt.

Focused verification:

```text
pnpm --dir packages/neko-agent exec vitest --run --root ../.. \
  packages/cli-tui/src/components/Input/input-editor.test.ts \
  packages/cli-tui/src/components/shared/reference-presentation.test.ts \
  packages/cli-tui/src/components/ChatView/MessageItem.reference.test.tsx \
  packages/cli-tui/src/components/ChatView/ChatView.runtime.test.tsx
# 4 files / 18 tests passed
```

The package-wide CLI test command still reports 20 pre-existing failures across experiment, localization/status snapshots, Skill catalog identity, and one assistant-streaming whitespace assertion; the focused reference lane is green. The CLI TypeScript project check is also blocked by existing cross-package strict errors and reports no error in the compact-reference files.
