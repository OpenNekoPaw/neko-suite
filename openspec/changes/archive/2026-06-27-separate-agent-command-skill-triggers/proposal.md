## Why

`neko-agent` currently mixes builtin commands, plugin commands, skill activation, and command-backed skill prompts under the same `/` entry. This makes the user-facing mental model blurry and leaves runtime routing to infer whether a slash token controls the session or injects a Skill.

The change separates the entry contract: `/` controls Agent, host, and plugin commands; `$` explicitly activates Skills; natural language remains available for implicit Skill matching.

## What Changes

- Introduce `$<skill-name> [args]` as the canonical explicit Skill invocation syntax for Agent Webview and CLI/TUI input surfaces.
- Keep `/` for builtin Agent commands, host/UI commands, plugin slash commands, and command artifacts that are intentionally authored as slash commands.
- Keep `/skills` as the Skill management command for browsing, active-state inspection, and clearing active Skills.
- Add shared trigger/catalog contract so Webview, Extension, CLI/TUI, and tests can distinguish command entries from Skill invocation entries without importing runtime modules into UI packages.
- Route `$skill` activation through the existing Skill injection path, preserving `SkillInjectionCoordinator` as the authority for prompt sections, permission allow rules, tool guards, and ToolSet activation.
- **BREAKING (prelaunch internal UI/protocol contract):** ordinary Skills will no longer be exposed as default `/skill` entries once `$skill` is available. Existing slash-backed Skill aliases may remain temporarily only as an explicit migration/diagnostic path.
- Update user-facing help, i18n, diagnostics, and tests so `/`, `$`, and `@` each have a distinct meaning.

## Capabilities

### New Capabilities

- `agent-command-skill-trigger-boundary`: Defines the observable behavior for `/` commands, `$` Skill invocation, `@` context references, routing, compatibility, and failure diagnostics.

### Modified Capabilities

None.

## Impact

- `packages/neko-agent/packages/agent-types/src/*`: shared trigger/catalog/message contracts and parser helpers.
- `packages/neko-agent/packages/agent/src/commands/*` and `packages/neko-agent/packages/agent/src/skill/*`: command/Skill dispatch boundary, canonical Skill invocation path, and legacy slash-skill diagnostics.
- `packages/neko-agent/packages/extension/src/chat/*`: Webview message routing and host effects for explicit Skill invocation.
- `packages/neko-agent/packages/webview/src/components/ChatView/InputArea/*`, `hooks/useSlashCommands.ts`, presenters, i18n, and tests: `$` menu, help text, filtering, keyboard behavior, and command/Skill catalog split.
- `packages/neko-agent/packages/cli-tui/src/*`: TUI command/Skill popup and dispatch parity where current CLI support exists.
- `docs/architecture/adr-agent-command-skill-trigger-boundary.md`: stable ADR for the trigger boundary.
- Focused Vitest contract tests plus VS Code Webview runtime smoke for input/menu/dispatch behavior.
