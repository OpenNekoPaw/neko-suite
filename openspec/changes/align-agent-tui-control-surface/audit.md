## Current TUI Command Path Audit

Task: 1.1

Scope: `packages/neko-agent/packages/cli-tui`

## Existing Paths

Ink TUI:

- `src/hooks/useSlashCommands.ts`
  - owns `/exit`, `/quit`, `/clear`, `/model`, `/skill`, `/status`,
    `/plan`, `/auto`, and `/ask` before delegating to the CLI adapter.
  - owns `$skill` invocation handling before prompt submission.
  - uses React/Zustand stores directly for output, config, status, and Skill
    lifecycle state.
- `src/adapters/slash-adapter.ts`
  - adapts Ink calls to `src/core/slash-commands.ts`.
  - currently passes only config, Skill service, Tool registry, and config
    update callbacks.
- `src/components/Input/InputEditor.tsx`
  - opens suggestions only for `/`.
  - suggestions are slash-command-only and do not cover `$` or `@`.

Non-Ink interactive CLI:

- `src/core/runner.ts`
  - owns special cases for `/plan`, `/auto`, `/ask`, `/model`, `/clear`, and
    `/compact` before calling `handleSlashCommand`.
  - handles `$skill` invocation in the readline loop.
  - constructs `SlashCommandContext` for `/resume`, `/history`, `/media`, and
    `/market`.

Shared CLI command handler:

- `src/core/slash-commands.ts`
  - handles `/config`, `/resume`, `/history`, `/media`, `/market`, command
    artifacts, and `$skill`.
  - delegates remaining builtins to `@neko/agent` command handlers.
  - does not own Ink-only picker behavior or runner `/compact` behavior.

Command catalog:

- `src/core/slash-command-catalog.ts`
  - derives suggestions from `@neko/agent` CLI command catalog.
  - current shared catalog includes `/compact`, `/plan`, `/status`, `/clear`,
    `/config`, `/resume`, `/skills`, `/commands`, and `/tools`.
  - legacy Ink command behavior also exposes `/model`, `/auto`, `/ask`, and
    `/skill`, so the TUI menu and router must include terminal-local command
    entries until the upstream shared catalog is expanded.

## Gaps Confirmed

- Shared Agent controls are split between Ink hook, readline runner, and
  `slash-commands.ts`.
- `/compact` is a runner-only special case and unavailable through the Ink
  command router path.
- `/status` output differs between Ink TUI and shared CLI command handlers and
  does not include context diagnostics through a typed TUI port.
- `/model` is Ink/readline local and is not registered as a CLI builtin in the
  shared command catalog.
- `$skill` exists, but `$` suggestions are not surfaced in `InputEditor`.
- `@` reference suggestions are absent.
- Queue, timeline, and artifact reference commands are not yet represented in
  the TUI control surface.

## Reuse Decision

Introduce a package-local `tui-command-router` in `cli-tui`.

Reason: both current callers are inside `cli-tui` and differ only by host
projection (Ink stores/selection menus vs readline console). A package-local
router keeps React and console dependencies out of the core command semantics
while avoiding premature extraction into `@neko/agent`.

Extraction condition: move host-agnostic helpers into `@neko/agent` only when
Webview or another package consumes the same command facade.
