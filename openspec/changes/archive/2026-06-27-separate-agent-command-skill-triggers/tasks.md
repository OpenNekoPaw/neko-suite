## 1. Shared Contracts And Parsing

- [x] 1.1 Add trigger-aware catalog/input types in `agent-types` for command entries, Skill invocation entries, and trigger prefixes.
- [x] 1.2 Add shared parser/normalizer helpers that parse `/command`, `$skill`, and `@mention` without Webview/runtime imports.
- [x] 1.3 Add `agent-types` tests for namespace conflicts, unknown trigger tokens, argument extraction, and token-boundary behavior.
- [x] 1.4 Update Webview protocol contracts to carry explicit Skill invocation messages or trigger-typed invocation payloads.

## 2. Runtime And Extension Dispatch

- [x] 2.1 Add a Skill invocation runtime entry that resolves enabled Skills by canonical Skill name/id and calls the existing Skill application path.
- [x] 2.2 Route Webview `$skill` messages in Extension without reusing builtin slash command dispatch.
- [x] 2.3 Preserve builtin `/` command dispatch and plugin slash command dispatch, with tests proving they do not hit Skill invocation.
- [x] 2.4 Add fail-visible diagnostics for unknown `$skill`, disabled Skill, failed lazy load, invalid Skill activation, and namespace conflicts.
- [x] 2.5 Add path-level tests proving `$skill args` reaches Skill injection and legacy slash-backed Skill paths do not produce canonical success.

## 3. Webview Input Experience

- [x] 3.1 Split the current slash command catalog into command catalog and Skill invocation catalog projections.
- [x] 3.2 Add `$` menu state, filtering, keyboard navigation, selection, and argument preservation to `InputArea` without duplicating menu rendering logic unnecessarily.
- [x] 3.3 Ensure `/` menu excludes ordinary Skills by default while retaining builtin/plugin/command-artifact entries.
- [x] 3.4 Update help output, empty-state tips, source labels, and English/Chinese i18n to explain `/` commands, `$` Skills, and `@` references separately.
- [x] 3.5 Add focused Webview tests for `/`, `$`, and `@` menu exclusivity, filtering, selection, send behavior, and command/Skill conflict handling.

## 4. CLI/TUI Parity

- [x] 4.1 Audit existing CLI/TUI slash command parsing and catalog construction for reusable shared helpers.
- [x] 4.2 Add `$skill` discovery and dispatch parity in CLI/TUI where slash commands are currently supported.
- [x] 4.3 Add CLI/TUI tests for `$skill` invocation, slash command preservation, unknown Skill diagnostics, and conflict resolution.

## 5. Legacy Slash-Skill Migration

- [x] 5.1 Classify existing Skill `command` usage into ordinary Skill aliases versus intentional command artifacts.
- [x] 5.2 Convert ordinary Skill slash exposure to `$` catalog projection and keep any retained `/skill` alias explicitly marked as migration-only.
- [x] 5.3 Update command-backed prompt artifacts so they remain in `/` as command artifacts and are not presented as ordinary Skill invocation.
- [x] 5.4 Add tests proving newly registered ordinary Skills appear under `$` and do not automatically create `/skill` entries.

## 6. Documentation And Validation

- [x] 6.1 Update `packages/neko-agent/README.md` or package docs to document `/`, `$`, `@`, `/skills`, and legacy alias behavior.
- [x] 6.2 Run focused tests for `agent-types`, Agent command/Skill runtime, Extension message routing, Webview input, and CLI/TUI changes.
- [x] 6.3 Run `pnpm check:openspec` and relevant package type/test checks.
- [x] 6.4 Run VS Code Webview runtime smoke with `vscode-extension-debugger` for the input trigger UI; record any residual risk if the environment cannot run it.
- [x] 6.5 Perform Neko quality self-review for architecture boundaries, over-defense, legacy alias handling, and path-level validation evidence.
