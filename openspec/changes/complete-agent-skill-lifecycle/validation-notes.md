## Validation Notes

Date: 2026-07-05

Completed:

- `./node_modules/.bin/vitest run packages/neko-agent/packages/agent/src/skill/__tests__/skill-lifecycle-runtime.test.ts packages/neko-agent/packages/agent/src/skill/__tests__/conversation-skill-runtime.test.ts packages/neko-agent/packages/agent/src/skill/__tests__/skill-service.test.ts packages/neko-agent/packages/agent/src/skill/__tests__/skill-meta-provider.test.ts packages/neko-agent/packages/agent/src/skill/__tests__/skill-conflict-resolver.test.ts packages/neko-agent/packages/agent/src/runtime/__tests__/agent-turn-runtime.test.ts packages/neko-agent/packages/agent/src/runtime/__tests__/agent-runner-port.test.ts packages/neko-agent/packages/agent/src/runtime/__tests__/agent-runtime-manager.test.ts packages/neko-agent/packages/agent/src/runtime/__tests__/agent-session-runner.test.ts` — 9 files / 148 tests passed.
- `./node_modules/.bin/vitest run packages/neko-agent/packages/agent/src/session/__tests__/agent-session.test.ts -t "keeps lifecycle ToolGuard restricted"` — 1 regression test passed after proving the red failure first.
- `../../node_modules/.bin/vitest run --config vitest.config.ts packages/extension/src/chat/__tests__/chatWebviewMessageRouter.test.ts packages/extension/src/chat/handlers/__tests__/skillHandler.test.ts packages/extension/src/chat/handlers/__tests__/slashCommandHandler.test.ts packages/cli-tui/src/hooks/__tests__/useSlashCommands.test.ts packages/cli-tui/src/core/__tests__/slash-commands.test.ts packages/cli-tui/src/core/__tests__/runtime-bootstrap.test.ts` from `packages/neko-agent` — 6 files / 100 tests passed.
- `../../../../node_modules/.bin/vitest run --config vitest.config.ts src/ai/agentRunner.test.ts` from `packages/neko-agent/packages/extension` — 1 file / 44 tests passed.
- `../../../../node_modules/.bin/vitest run --config vitest.config.ts src/hooks/__tests__/useSlashCommands.test.ts src/hooks/__tests__/useChatActions.test.ts src/components/hooks/__tests__/useVSCode.test.ts src/presenters/__tests__/skill-presenter.test.ts` from `packages/neko-agent/packages/webview` — 4 files / 55 tests passed.
- `./node_modules/.bin/tsc --noEmit -p packages/neko-agent/packages/extension/tsconfig.json` passed.
- `./node_modules/.bin/tsc --noEmit -p packages/neko-agent/packages/webview/tsconfig.json` passed.
- `node scripts/check-legacy-debt-surfaces.mjs` passed after the deprecated resolver bridge comments were classified as current bridge surfaces.

Implementation review notes:

- Agent provider turns now call `applySkillLifecycleProjection` directly. `AgentSession.applySkillLifecycleProjection` writes lifecycle prompt sections, permission allow rules, ToolGuard state, and ToolSet activation from the projection snapshot without constructing a synthetic `lifecycle-projection` `SkillInjection`.
- `ConversationSkillRuntime` no longer stores `_activeSkills`; `getActiveSkill` is only a compatibility projection derived from lifecycle records.
- `referenceSkill` is read-only guidance for prompt/indicator projection and is excluded from effective executable tool-policy restrictions.
- `ISkillConflictResolver`, `SkillConflict`, `SkillConflictResolver`, and `createSkillConflictResolver` remain as deprecated string-list compatibility bridges. Lifecycle activation uses `resolveSkillLifecycleActivationConflict`.

Blocked or residual:

- `pnpm check`, `pnpm test -- --run`, `pnpm check:legacy-debt`, and `pnpm smoke:webview:targets` all failed before running their underlying scripts because pnpm rejected ignored build scripts for `@fission-ai/openspec`, `@vscode/vsce-sign`, `core-js`, `es5-ext`, multiple `esbuild` versions, `keytar`, `sharp`, and `tesseract.js`. The command asks for `pnpm approve-builds`.
- Direct `node scripts/smoke-vscode-targets.mjs --skill vscode-extension-debugger --require-webview` failed because no VS Code debugger target was listening on `127.0.0.1:9222`.
- Full `./node_modules/.bin/tsc --noEmit -p packages/neko-agent/packages/agent/tsconfig.json` still fails on existing test fixture type errors outside this lifecycle slice. Filtering the output for touched lifecycle/turn/session/conflict files shows no remaining errors after the fixes in this change.
- Full `packages/neko-agent/packages/agent/src/session/__tests__/agent-session.test.ts` still has existing failures outside the new lifecycle regression, including the pre-existing lazy ToolSet activation assertion and several stage tracking / audit expectations. The new lifecycle ToolGuard regression passes in isolation.
