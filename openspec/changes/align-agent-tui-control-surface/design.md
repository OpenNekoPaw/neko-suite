## Context

`neko-agent` has two frontend surfaces for the same Agent runtime:

- Webview is a GUI surface. It renders buttons, dropdowns, chips, queue panels,
  task cards, media previews, rich content, and image/video/audio thumbnails.
- TUI/CLI is a terminal surface. It should expose the same Agent control
  semantics through commands, keyboard shortcuts, selection menus, streamed text,
  and stable references, without rendering media or owning GUI-only state.

The current TUI already reuses `@neko/agent` and `@neko/platform`, initializes
runtime planes through `createAgentSessionWithRuntime`, handles `/` commands,
supports plan/ask/auto modes, loads Skills, and displays basic streaming output.
However, compared with the Webview composer and handlers, the TUI control surface
is incomplete:

- mode/model/media parameter controls are split across status bar, `/model`,
  `/media`, keyboard shortcuts, and runner-specific special cases;
- Ink input has `/` suggestions but lacks `$` Skill and `@` reference
  suggestions;
- context compaction exists in the non-Ink interactive runner but is not a
  coherent TUI control family;
- running-turn input is disabled, so compatible text cannot enter the
  authoritative message queue;
- `messageQueued` is ignored by the TUI event adapter;
- streaming projection is still based on "last assistant message" instead of
  the ordered turn/timeline/work-item facts now used by Webview;
- media/artifact output is summarized as generated file counts rather than
  stable `ResourceRef` / asset / relative-path references.

The design must keep the local product boundary: this is a VS Code client plus
local Agent/runtime process, not a remote orchestration service. It should avoid
new broad UI frameworks, daemon state, or cloud-scale queue abstractions.

### Five-layer analysis

Responsibility:

- Agent runtime remains the source of truth for execution mode, turn lifecycle,
  queue items, context compression, Skill lifecycle, tasks, work items,
  artifacts, and model dispatch.
- TUI owns terminal input, shortcut handling, command routing, terminal
  selection menus, compact status display, and reference-only formatting.
- Webview owns GUI rendering and media previews. TUI must not import or reuse
  Webview React components.
- Platform remains provider/model/media adapter glue; TUI only selects and
  displays model identities through existing config/runtime contracts.

Dependency:

- `cli-tui` may depend on `@neko/agent`, `@neko/platform`, `@neko/shared`, and
  `@neko-agent/types`, as it already does.
- Webview and Extension packages are not implementation dependencies for TUI.
- New shared helpers, if needed, should be host-agnostic and live in
  `agent`, `agent-types`, or shared packages only when both Webview and TUI
  consume them.
- No Rust, Protobuf, Engine media stream, or VS Code Webview API dependency is
  introduced for TUI behavior.

Interface:

- Commands should target typed runtime actions such as mode selection, model
  selection, queue mutation, context compaction, task cancellation, and artifact
  lookup rather than parsing rendered text.
- TUI projection should consume existing queue/timeline/work-item/artifact DTOs
  or narrow terminal-facing projectors, not raw provider events or Webview URI
  payloads.
- Resource output should use stable references: `ResourceRef`, asset id, task id,
  relative path, media kind, dimensions/duration when available, and suggested
  commands. It must not persist or display Webview URI, blob URL, or temp/cache
  path as durable identity.

Extension:

- Adding a new TUI command should register in one command catalog and route to a
  typed handler with tests.
- Adding a new timeline/work-item kind should require a formatter/projector case
  and a fail-visible diagnostic for unknown required kinds.
- GUI-specific affordances can remain Webview-only while the underlying action is
  also reachable through TUI commands.

Testing:

- Command routing can be tested with fake session/runtime ports and Zustand
  stores.
- Prefix suggestions can be tested with Ink component tests.
- Queue behavior should be tested with item-aware runtime queue fixtures.
- Timeline and reference formatting should be covered with DTO fixtures, not
  real providers or real media rendering.
- CLI smoke can validate terminal entry paths. A Webview functional scenario is not
  required unless this change edits Webview code.

## Goals / Non-Goals

**Goals:**

- Align TUI with the same Agent control semantics as Webview for:
  - mode/session/model/media/parameter configuration;
  - `/`, `$`, and `@` prompt affordances;
  - direct status and compaction commands;
  - send, Esc cancellation, and item-aware queue controls;
  - streaming turn order, tool/task/media/error output, and artifact references.
- Keep the terminal presentation command-first and reference-only.
- Consolidate duplicated command handling between Ink TUI and non-Ink
  interactive CLI where they operate on the same runtime contract.
- Fail visibly for unsupported commands, stale queue ids, unknown timeline kinds,
  invalid model identities, unsupported parameters, and missing runtime ports.

**Non-Goals:**

- Do not render images, video, audio, Webview cards, thumbnails, or GUI controls
  in TUI.
- Do not port Webview components, CSS, or DOM behavior into TUI.
- Do not redesign Agent runtime, provider adapters, Skill injection, or message
  queue semantics.
- Do not persist pending message queue items across process restart.
- Do not introduce a generic cross-package terminal UI framework.
- Do not add cloud/server orchestration, multi-user queue state, or a daemon.

## Decisions

### 1. Treat TUI as a command/control projection, not a GUI parity target

TUI will expose the same Agent controls through slash commands, keyboard
shortcuts, terminal menus, status text, and streamed reference summaries. Webview
can expose the same actions through buttons, dropdowns, cards, and previews.

Example mapping:

| Agent control | Webview shape | TUI shape |
| --- | --- | --- |
| Select mode | segmented/dropdown composer control | `/mode agent|image|video|audio`, Shift+Tab for execution mode |
| Select model | grouped model dropdown | `/model list`, `/model set <provider>/<model>` |
| Set parameters | chips/dropdowns/sliders | `/param set reasoning deep`, `/param set video.duration 8` |
| Manage queue | queue panel buttons | `/queue list|promote|cancel|edit` |
| View artifact | preview card | reference summary and `/artifact show/open/send` |

Rationale: The user experience differs by surface, but runtime state and
diagnostics should be consistent.

Rejected alternative: copy Webview controls into Ink. Ink cannot render or manage
the same media/DOM affordances, and duplicating GUI patterns would increase
coupling without improving terminal workflows.

### 2. Introduce one TUI control command router

Create or consolidate a command router for Ink TUI and non-Ink interactive CLI
for shared Agent controls:

- `/mode`
- `/model`
- `/media`
- `/param`
- `/compact`
- `/queue`
- `/task`
- `/artifact`
- `/skill`
- existing `/plan`, `/ask`, `/auto`, `/clear`, `/status`, `/history`,
  `/resume`, `/market`, and command artifacts

The router should dispatch to typed handlers with explicit dependencies
provided by the host hook/runner: session, config store, skill service, tool
registry, queue access, task manager, artifact/reference index, and formatter
ports where available.

Rationale: Today command behavior is split between `useSlashCommands`,
`slash-commands.ts`, and non-Ink runner special cases. One router reduces
semantic drift between TUI variants and makes tests direct.

Rejected alternative: keep patching special cases in each runner. That would
keep `/compact`, `/model`, `/skill`, and future `/queue` behavior inconsistent
across Ink and non-Ink entry points.

### 3. Prefix-aware terminal input suggestions

Extend `InputEditor` to support trigger-specific suggestions:

- `/`: commands and command artifacts;
- `$`: enabled Skills;
- `@`: files and terminal-safe context references.

The suggestion menu should remain text-only: label, type/source, optional short
description, and path/id. Selecting an `@` entry inserts a textual reference or
adds a terminal-owned selected reference record; it does not create image
previews or Webview context chips.

Rationale: The trigger namespace contract already exists. TUI should help users
discover it without changing prefix semantics.

Rejected alternative: use only manual typing for `$` and `@`. That preserves
functionality but leaves TUI behind Webview on discoverability and increases
mistyped references.

### 4. Make status and compaction direct TUI controls

Use `/status` as the canonical terminal command for expanded active state,
including context token estimates and compression state when available. Use
`/compact` as the canonical terminal command for context compaction.

Status output should include current estimated token count when the runtime port
is available, compression state/result, and any diagnostic when context count or
compression is unsupported by the current session. Compaction output should show
the original token count, compressed token count, and compression ratio when
available.

Rationale: Context state is a core Agent control, but the TUI should keep
frequent controls shallow and memorable. `/status` already answers "what is the
session state?", and `/compact` already describes the action.

Rejected alternative: introduce a nested context command family. That groups
context operations neatly, but adds a namespace for two high-frequency actions
that are better served by direct commands in a terminal workflow.

### 5. Enable running-turn text queue in TUI

When the Agent is running, TUI input should accept queue-compatible text sends
and call the same item-aware queue path used by Agent runtime. Incompatible
payloads, such as command execution, media mode sends, or attachments without a
queue contract, should return visible diagnostics.

Expose queue commands:

- `/queue list`
- `/queue promote <queueItemId>`
- `/queue cancel <queueItemId>`
- `/queue edit <queueItemId>`

Esc cancels the active run only; it does not clear queued items unless a future
explicit command does so.

Rationale: Webview and runtime already distinguish active cancellation from
pending prompt queue control. TUI should use the same mental model.

Rejected alternative: keep input disabled during active runs. That prevents the
runtime queue from being useful in TUI and makes terminal behavior diverge from
Webview.

### 6. Use timeline-aware terminal turn projection

TUI should project ordered turn/timeline/work-item facts into terminal lines
instead of mutating the last assistant message for every event.

Example:

```text
assistant: Reading the brief...
tool ReadDocument pending id=call_1 file=brief.pdf
tool ReadDocument ok id=call_1 pages=12 images=3
task video.generate queued id=task_7 parent=call_2
artifact image ref=resource:image:abc asset=asset_789 file=neko/generated/shot-01.png
assistant: Drafted the shot plan.
```

The projector may still render compact Markdown text for assistant content, but
structural events should keep their sequence and parent identity. Unknown
required kinds should emit a diagnostic rather than silently appending to the
bottom.

Rationale: Terminal output does not need cards, but it does need chronology and
causal anchors for tool failures, task progress, and generated assets.

Rejected alternative: retain last-message mutation and add a few special cases.
That repeats the historical Webview issue where tools, text, media, and errors
can reorder or lose their parent.

### 7. Format media/artifacts as stable references

TUI will not render images or media. It should display stable references and
next actions:

```text
Generated image
- ref: resource:image:abc123
- asset: asset_789
- file: neko/generated/shot-01.png
- size: 1024x1024
Commands:
  /artifact show asset_789
  /artifact open asset_789
  /artifact send canvas asset_789
```

The formatter must avoid Webview URIs, blob URLs, and temp/cache paths as
durable identity. Local paths should be workspace-relative or `${VAR}/path`
style when displayed as reusable references.

Rationale: Terminal users need inspectable, scriptable references rather than
visual previews.

Rejected alternative: print raw tool result JSON. It exposes implementation
details, can leak unsuitable URLs/paths, and is harder to act on.

## Risks / Trade-offs

- [Risk] TUI and Webview command semantics can drift again. -> Mitigation:
  consolidate command routing and add contract tests that assert both terminal
  commands and GUI actions call equivalent runtime actions where applicable.
- [Risk] Timeline projection becomes too verbose for terminal use. ->
  Mitigation: provide compact default lines with verbose expansion flags or
  commands for details.
- [Risk] Queueing while running can conflict with command input. -> Mitigation:
  only queue compatible text prompts; commands typed during a run either run if
  side-effect-free and safe or produce a visible "not queueable" diagnostic.
- [Risk] Model parameter commands may outpace provider capability metadata. ->
  Mitigation: validate through existing model/provider capability checks and
  fail visibly for unsupported parameters.
- [Risk] Reference summaries may accidentally expose runtime-local paths. ->
  Mitigation: format only stable refs, asset ids, and relative/env paths; add
  tests that poison Webview URI/blob/temp/cache values.

## Migration Plan

1. Add terminal control contracts and command-router tests.
2. Move existing Ink and non-Ink shared commands onto the router without
   changing user-visible behavior.
3. Add missing commands and prefix suggestions behind the same router.
4. Add queue state and running-turn queue handling.
5. Replace last-message-only structural output with timeline-aware terminal
   projection.
6. Add reference formatter and artifact/task commands.

Rollback strategy: because this change does not migrate durable project files,
rollback can remove the new router/projectors and restore previous TUI command
paths. Existing conversations, tasks, generated media, and user config remain
owned by their existing stores.

## Open Questions

- Should future context-only operations remain direct commands until there are
  enough operations to justify grouping?
- Should queued message edit in TUI reopen the input buffer in Ink, or print a
  copyable command/prompt in non-Ink interactive mode?
- Should `/artifact open` invoke VS Code when TUI is launched inside Extension
  context, or only print paths/commands in standalone CLI mode for this change?
