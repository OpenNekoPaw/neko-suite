## Why

Agent TUI already reuses the core Agent runtime, but its frontend control surface is behind the Webview composer: model/mode parameters, `$` and `@` prompts, context compaction, queued messages, timeline ordering, task progress, and media/artifact references are either missing, command-only in scattered paths, or projected from older event state.

This matters now because Agent Webview has moved toward canonical queue, timeline, Skill lifecycle, and composer configuration contracts. TUI should align to the same runtime semantics while keeping a terminal-native command and reference-only experience instead of copying GUI widgets or media rendering.

## What Changes

- Add a TUI-first Agent control surface contract for:
  - mode/session/model/media/parameter management through slash commands and terminal selection menus;
  - `/`, `$`, and `@` terminal prompt suggestions;
  - direct status and compact commands for context visibility and compaction;
  - running-turn send, Esc cancellation, and item-aware message queue commands;
  - timeline-aware streaming, tool, task, media, error, and artifact reference output;
  - reference-only media/artifact summaries for terminal output.
- Consolidate TUI command routing so Ink TUI and non-Ink interactive CLI do not keep separate special-case command paths for the same Agent controls.
- Keep GUI-only behavior GUI-only: Webview continues to render images, videos, audio, cards, chips, dropdowns, drag/drop, and visual task controls; TUI displays stable references, ids, relative paths, summaries, and follow-up commands.
- Keep existing Agent runtime, model configuration, Skill lifecycle, queue, and timeline facts as the source of truth. TUI does not introduce a parallel Agent business path.
- No Rust Engine, Protobuf, Webview CSP, durable project file, or cloud/distributed orchestration changes are included.

## Capabilities

### New Capabilities
- `agent-tui-control-surface`: Terminal-native Agent control, prompt suggestion, queue, context, timeline, task, and artifact-reference projection behavior for TUI/CLI surfaces.

### Modified Capabilities
- None.

## Impact

- Affected packages:
  - `packages/neko-agent/packages/cli-tui`: Ink components, TUI stores, slash command router, keyboard handling, terminal selection menus, reference formatters, and tests.
  - `packages/neko-agent/packages/agent`: only if a small host-agnostic control/projection helper or runtime port facade is needed; no new TUI-specific runtime policy.
  - `packages/neko-agent/packages/agent-types`: only if existing queue/timeline/artifact DTOs need terminal-facing projector types; no Webview-only DTO leakage.
- Affected user flows:
  - terminal mode/model/parameter management;
  - terminal slash/Skill/file reference prompts;
  - terminal context compression;
  - running-turn queued messages and cancellation;
  - terminal streaming/task/media/artifact output.
- Validation will focus on unit/contract tests for command routing, prompt suggestions, queue semantics, context compaction, timeline projection, and reference summaries. Webview runtime smoke is not required unless Webview code changes.
