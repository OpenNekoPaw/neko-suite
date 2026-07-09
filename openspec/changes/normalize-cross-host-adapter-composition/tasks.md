## 1. Contract and Boundary Audit

- [x] 1.1 Audit current direct host API usage in Agent, Cut, Canvas, Audio, Sketch, Model, Preview, Desktop, Extension, and TUI packages.
- [x] 1.2 Classify each usage as VSCode transport adapter, Electron adapter, Node adapter, package facade, or legacy host coupling.
- [x] 1.3 Define the first migration scope for Agent host runtime and record any approved temporary shims with owner, replacement, validation, and removal condition.
- [x] 1.4 Add or update architecture boundary tests proving `@neko/host` remains primitive and does not import Agent, Workbench, Webview, React, VSCode, Electron, or Node implementations.
- [x] 1.5 Add Workbench/feature descriptor tests for host capability rejection, unsupported host rejection, and missing adapter diagnostics.

## 2. Agent Host Runtime Contract

- [x] 2.1 Add the host-neutral Agent host runtime adapter type and lifecycle contract in the chosen Agent contract package.
- [x] 2.2 Add a compatibility message-builder facade that preserves the existing Agent Webview message builder surface while delegating transport to the injected adapter.
- [x] 2.3 Add tests for send, subscribe, dispose, getState, setState, runtime scoping, and host diagnostic propagation.
- [x] 2.4 Add route coverage helpers that classify each `WebviewToExtensionMessage` as implemented, intentionally unsupported, or host-inapplicable.
- [x] 2.5 Poison the legacy direct `VSCodeMessages` transport path in new Agent host runtime tests to prove the injected adapter path is hit.

## 3. VSCode Adapter Implementation

- [x] 3.1 Implement the VSCode Agent host runtime adapter by wrapping `@neko/shared/vscode` Webview transport.
- [x] 3.2 Connect the VSCode adapter to existing Extension ChatProvider/router behavior without changing VSCode user-visible Agent behavior.
- [x] 3.3 Add VSCode route coverage tests for config, conversations, tasks, skills, file/search, plugin/capability, keyboard/focus, and diagnostics routes.
- [x] 3.4 Verify VSCode adapter state handling still maps to Webview `getState`/`setState` and does not persist durable project data.
- [x] 3.5 Run focused Agent Webview and Extension tests for the VSCode adapter slice.

## 4. Electron Adapter Implementation

- [x] 4.1 Replace Desktop's global Agent VSCode shim path with a scoped Electron Agent host runtime channel for migrated Agent surfaces.
- [x] 4.2 Add runtime identity to Desktop preload/main/renderer Agent message flow and reject unknown runtime ids with diagnostics.
- [x] 4.3 Implement Desktop Agent config/settings routes through platform `ConfigManager` with safe diagnostics for missing, empty, invalid, or unreadable config.
- [x] 4.4 Implement Desktop Agent conversation/tab route group using the same Agent runtime/conversation contracts used by other hosts.
- [x] 4.5 Implement Desktop Agent task/queue route group or mark each missing route intentionally unsupported with route coverage diagnostics.
- [x] 4.6 Implement Desktop Agent skills/commands route group or mark each missing route intentionally unsupported with route coverage diagnostics.
- [x] 4.7 Implement Desktop Agent file/search/plugin/capability route groups in host-authorized slices.
- [x] 4.8 Add Electron adapter tests proving unrelated package roots do not receive Agent host messages.
- [x] 4.9 Add Desktop smoke coverage for Agent config load and at least one non-config route after migration.

## 5. Agent Webview Migration

- [x] 5.1 Introduce an Agent host runtime provider/context at the Webview root.
- [x] 5.2 Migrate `ConversationController` to the injected Agent host facade.
- [x] 5.3 Migrate `ChatWorkspace`, tab manager, AccountBar, onboarding, input area, task actions, media preview actions, and rich content action dispatch to the injected facade.
- [x] 5.4 Update Agent Webview tests to mock the injected host runtime adapter instead of direct `VSCodeMessages` imports.
- [x] 5.5 Keep any temporary `VSCodeMessages` export as a thin compatibility facade only and document its removal criteria.

## 6. Node/TUI Adapter Verification

- [x] 6.1 Confirm TUI continues to use `createNodeHostAdapter`, Node content access runtime, Platform config, task storage, skills, commands, and Agent runtime directly.
- [x] 6.2 Add tests proving TUI does not depend on Agent Webview host runtime transport for config, conversations, tasks, skills, or content access.
- [x] 6.3 Add coverage for Node host path variables, workspace `.neko` policy, transparent cache, resource projection, and project artifact writes.
- [x] 6.4 Verify TUI headless behavior reports host diagnostics instead of silently falling back to VSCode/Webview behavior.

## 7. Shared Resource, File, and Foundation Integration

- [x] 7.1 Route Desktop project file reads/writes through host-authorized project file IO contracts for migrated package editor surfaces.
- [x] 7.2 Route Desktop Resource Explorer thumbnails and media projections through shared content access/resource cache services.
- [x] 7.3 Verify VSCode resource projection remains Extension-owned while using shared content access semantics.
- [x] 7.4 Add shared Webview foundation context wiring for Agent and migrated package roots: locale, theme tokens, logger, diagnostics, keyboard/focus, and resource projection.
- [x] 7.5 Add tests proving package UI does not create duplicate foundation runtimes when host context is available.

## 8. Guardrails and Legacy Cleanup

- [x] 8.1 Add guardrails that block new direct `window.vscodeApi`, `acquireVsCodeApi`, Electron IPC, Node fs/path, or unscoped global host shim usage in production host-neutral Webview code.
- [x] 8.2 Add approved exception paths for VSCode transport adapters, Electron preload/bridge adapters, Node/TUI host adapters, and documented migration shims.
- [x] 8.3 Remove or quarantine Desktop global VSCode shim usage for migrated Agent runtime roots.
- [x] 8.4 Remove empty-success placeholders for Desktop Agent routes and replace them with implemented handlers or explicit unsupported diagnostics.
- [x] 8.5 Update architecture docs or package boundary docs with the cross-host adapter ownership rule.

## 9. Validation

- [x] 9.1 Run focused unit tests for `@neko/host`, Workbench Core, Agent types/runtime, Agent Webview, VSCode Extension, TUI, and Desktop adapter slices touched by the implementation.
- [x] 9.2 Run `pnpm --filter neko-desktop test`, Desktop typecheck, Desktop build, and Desktop smoke after Electron adapter changes.
- [x] 9.3 Run Agent Webview build and focused tests after Agent facade migration.
- [x] 9.4 Run VSCode Extension Development Host or `vscode-extension-debugger` validation for VSCode Webview-sensitive behavior changed by the adapter migration.
- [x] 9.5 Run TUI focused tests and at least one TUI smoke path that exercises config, skills, content access, and an Agent interaction.
- [x] 9.6 Run repository quality checks appropriate to the final change scope, including `pnpm check` or documented narrower substitutes.
- [x] 9.7 Record residual risks for any route groups intentionally left unsupported in Desktop or any temporary shim retained after migration.

### Validation Notes

- 9.1 passed through focused Vitest slices for `@neko/host`, Workbench Core, Agent host runtime contracts, VSCode resource projection, Desktop adapter/runtime, Agent Webview, VSCode Extension, and TUI Node adapter coverage.
- 9.2 direct Desktop validation passed: focused Desktop Vitest, `tsc -p packages/neko-desktop/tsconfig.json --noEmit`, `node packages/neko-desktop/scripts/build.mjs`, and `node packages/neko-desktop/scripts/smoke.mjs`. The exact `pnpm --filter neko-desktop test` entry was attempted but blocked before test execution by repository-level `ERR_PNPM_IGNORED_BUILDS`; the direct Desktop equivalents above are the recorded substitute.
- 9.3 passed through Agent Webview focused Vitest, `tsc -p tsconfig.json --noEmit`, and `vite build` from `packages/neko-agent/packages/webview`.
- 9.4 passed through `vscode-extension-debugger` against VSCode CDP port `9222`: the Extension Development Host exposed a `neko.neko-agent` Webview iframe target (`AI Assistant` / `neko.aiAssistant`), DOM snapshot showed the Neko Suite Agent UI, model selector, composer controls, slash/skill buttons, and console capture showed no adapter-migration errors. A page screenshot was captured at `/tmp/neko-agent-vscode-webview.png`.
- 9.5 passed with TUI focused tests from `packages/neko-agent`, built CLI smoke via `node dist/cli.js config show/providers -C /Users/feng/Git/neko-test`, and an offline bundled Node smoke that injected a mock LLM service into `runAgent` while exercising explicit `$media-to-video` skill activation, `@brief.md` content access, and Agent response collection. The raw source `tsx src/cli.tsx ...` path still exposes the existing `*.md?raw` dev-loader limitation, but the canonical bundled TUI path is validated.
- 9.6 passed through `openspec validate normalize-cross-host-adapter-composition --strict`, package-level typechecks for `neko-ui`, `neko-workbench-core`, and `agent-types`, plus the focused package tests/builds listed above. The broad `pnpm check` entry was attempted but blocked before execution by `ERR_PNPM_IGNORED_BUILDS`.

### Residual Risks

- Desktop retains a migration-only VSCode API compatibility shim for package roots that have not yet moved to scoped host runtimes. Migrated Agent roots are validated through `sendAgentRuntimeMessage` / `AgentHostRuntimeAdapter`; the shim removal condition is completion of the remaining package-root adapter migrations.
- Desktop Agent intentionally reports unsupported-route diagnostics for routes that are not yet backed by real Electron host services, including task/queue execution, skill invocation, project search/file reveal/open, plugin/capability handoff, SSO, drag-and-drop, SVG download, and real message execution.
- Desktop Agent conversation/config/tab routes are real runtime state, but they are not yet full parity with VSCode Agent execution. New routes must be classified in `DESKTOP_AGENT_HOST_ROUTE_SUPPORT` and covered by route diagnostics before use.
- Repository-level validation still depends on approving pnpm build scripts for native/tooling dependencies such as `esbuild`, `sharp`, `keytar`, and related packages.
- TUI raw `tsx src/cli.tsx ...` execution still needs a Node-compatible markdown content loading strategy for builtin skills. The canonical bundled TUI path is validated, but the dev entry remains a follow-up if raw source execution is required.
