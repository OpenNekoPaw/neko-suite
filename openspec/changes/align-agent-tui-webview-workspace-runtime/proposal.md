## Why

Neko Agent now exposes both VS Code Webview and terminal TUI surfaces, but several workspace-scoped Agent behaviors are still assembled differently per surface. The result is that the same workspace can observe different effective config, Skill catalog, task recovery, command behavior, cache lifecycle, and conversation identity depending on whether the user opens Webview or TUI.

This needs to be fixed before more Agent capabilities are added, because each new provider, Skill, command, task, or context feature currently risks being wired into one surface and missed by the other.

## What Changes

- Introduce a shared workspace runtime surface contract for Agent Webview and TUI.
- Route TUI interactive and resume sessions through the canonical TUI session/runtime path instead of the old readline interactive runner.
- Normalize conversation identity so both Webview and TUI use workspace-scoped canonical conversation ids for interactive sessions and resume requests.
- Define one effective Agent workspace config snapshot consumed by both Webview and TUI, including explicit policy for user-global vs workspace-local scalar values.
- Align Skill and command discovery so both surfaces see the same user/workspace `.neko/skills` and `.neko/commands` catalog, with host-local commands kept as explicit surface effects.
- Classify Agent task persistence and recovery as either workspace-shared or host-private, then make both surfaces follow that classification visibly.
- Align project resource-cache lifecycle for TUI and Webview, including quota/GC expectations for project cache roots.
- Keep host differences explicit: Webview may own VS Code messages, Webview projection, and extension-private resources; TUI may own terminal presentation and headless validation lanes.
- **BREAKING**: The old readline interactive resume path stops being a successful default interactive path. Old `cli-*` conversation records are not loaded by the TUI resume path; resume accepts only canonical workspace-scoped conversation ids.

## Capabilities

### New Capabilities
- `agent-workspace-runtime-surface`: Defines the cross-surface contract for using one workspace-scoped Agent runtime configuration, session identity, Skill/command catalog, task scope, and context assembly across TUI and Webview.

### Modified Capabilities
- `agent-config-snapshot-lifecycle`: Extend effective config snapshot behavior so TUI and Webview consume the same user/workspace policy instead of independently reading scalar config.
- `agent-content-access-cache`: Align TUI project resource-cache lifecycle with Webview/Extension cache ownership, quota, and GC rules.
- `agent-command-skill-trigger-boundary`: Require slash commands, command artifacts, and explicit Skill triggers to resolve through shared catalog/runtime contracts with host-local effects separated by surface.
- `legacy-fallback-surface-elimination`: Treat the readline interactive CLI resume path and exported legacy interactive runner as removable legacy surfaces once the TUI path is canonical.

## Impact

- Affected packages:
  - `packages/neko-agent/packages/cli-tui`
  - `packages/neko-agent/packages/extension`
  - `packages/neko-agent/packages/platform`
  - `packages/neko-agent/packages/agent`
  - shared config, storage, resource-cache, and command/Skill contracts under `packages/neko-types` when needed
- Affected runtime paths:
  - TUI app/session bootstrap, resume, and headless runner separation
  - Webview `ConversationBridge`, settings/config handlers, Skill/command handlers, task handlers, and content-access runtime adapters
  - Agent runtime session factory/assembly, project memory/context injection, command catalog, Skill file runtime, and task manager storage classification
- Compatibility:
  - Canonical file-backed conversations remain readable.
  - Old `cli-*` conversation records are intentionally not read, migrated, rewritten, or deleted by this change.
  - Existing project/user config files remain user-authored TOML.
  - Existing `.neko/skills`, `.neko/commands`, and `~/.neko` directories become canonical shared inputs where classified.
  - Old readline interactive behavior is not preserved as a default success path.
