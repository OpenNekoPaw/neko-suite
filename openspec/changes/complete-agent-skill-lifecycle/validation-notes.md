## Validation Notes

Date: 2026-06-28

Completed:

- `openspec validate complete-agent-skill-lifecycle --strict`
- `git diff --check` for the touched lifecycle files.

Implementation review notes:

- Agent turn assembly does pass lifecycle projection into the turn runtime, and `agent-turn-runtime.ts` blocks on lifecycle projection diagnostics before provider execution.
- The current provider path still folds `projection.promptSections` and `projection.toolPolicy` into a synthetic single `lifecycle-projection` payload and writes it through `agentRunner.applySkillInjection` / `SkillInjectionCoordinator`. This is a migration bridge, not the final direct prompt-section/tool-policy writer.
- `ConversationSkillRuntime._activeSkills` remains a compatibility projection alongside lifecycle records. It must not become a lifecycle authority; follow-up cleanup is tracked in `tasks.md`.
- `referenceSkill` currently participates in the same conservative restricted-tool intersection as other slots. The desired slot-specific policy is unresolved and tracked as follow-up work.
- The legacy string-list `ISkillConflictResolver` API still exists beside the lifecycle conflict resolver. New lifecycle code uses `resolveSkillLifecycleActivationConflict`; old APIs are documented as a temporary shim.

Blocked:

- Targeted Vitest suites were attempted with:
  - `pnpm --config.minimumReleaseAge=0 exec vitest run packages/neko-agent/packages/cli-tui/src/hooks/__tests__/useSlashCommands.test.tsx packages/neko-agent/packages/cli-tui/src/__tests__/tui-feature-audit.test.tsx packages/neko-agent/packages/cli-tui/src/core/__tests__/runtime-bootstrap.test.ts --runInBand`
  - `pnpm --config.minimum-release-age=0 exec vitest --version`
  - `node node_modules/.pnpm/vitest@4.1.2_.../node_modules/vitest/vitest.mjs run packages/neko-agent/packages/cli-tui/src/hooks/__tests__/useSlashCommands.test.tsx packages/neko-agent/packages/cli-tui/src/__tests__/tui-feature-audit.test.tsx packages/neko-agent/packages/cli-tui/src/core/__tests__/runtime-bootstrap.test.ts packages/neko-agent/packages/cli-tui/src/core/__tests__/slash-commands.test.ts`
  - `node node_modules/.pnpm/typescript@5.9.3/node_modules/typescript/bin/tsc --noEmit -p packages/neko-agent/packages/cli-tui/tsconfig.json`
- The command failed before Vitest started because pnpm's supply-chain lockfile policy rejected `prettier@3.9.1`, published within the active minimum release age window.
- Direct Vitest startup from `.pnpm` reached Vite transform, but failed before loading tests because the incomplete install is missing esbuild's optional platform package `@esbuild/darwin-arm64`.
- Direct TypeScript startup from `.pnpm` could not resolve workspace package aliases, React/Ink/Vitest/Node types, or other dependencies because the failed install did not create the normal workspace `node_modules` layout.
- The repository root still has no installed `node_modules/.bin/vitest` or `tsc` after the failed dependency check, so targeted tests and package type checks could not be completed without first resolving the pnpm policy/install issue.

Remaining validation tasks in `tasks.md` stay unchecked until the dependency policy allows the test runner and quality scripts to execute.
