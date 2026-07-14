# Findings

## Review result

- Risk level: **L3**. The change modifies the AI workflow boundary, shared Skill contracts, native tool registration/schema, local package persistence, discovery/registry projection, Extension/TUI composition, and script-driven Agent evaluation.
- Open blocking findings: **none** after the fixes below.
- The implemented boundary matches the repository architecture: portable author data belongs to `SKILL.md`, optional Neko author metadata belongs to `agents/neko.yaml`, and source/path/trust/enablement/editability/actions/compatibility remain Host/Registry facts.
- `skill-creator`-style draft/review/apply guidance remains authoring methodology only. Native `CreateSkill`, general file capabilities, and manual file editing can all produce the same canonical package; no Skill-specific approval, persisted draft, review artifact, or apply gate was added.

## Five-layer analysis

### Responsibility

- `@neko/shared` owns portable DTOs, diagnostics, and tool schema contracts.
- Portable `SKILL.md` and optional `agents/neko.yaml` have separate parsers, serializers, and validators.
- The shared Agent Skill file runtime owns canonical root resolution, containment checks, atomic directory commit, scan/rescan, duplication/deletion, and explicit legacy migration.
- Registry/catalog projection owns Host-derived facts; existing lifecycle code remains the owner of enablement and activation.
- Extension and TUI surfaces delegate to the shared runtime rather than implementing package rules independently.

### Dependency

- Layer 0 contracts do not depend on Node, VSCode, React, or feature packages.
- Agent filesystem behavior remains behind injected filesystem/path contracts; Extension supplies local adapters and watchers.
- Webview receives projections and user-facing guidance only; it does not access Node or VSCode APIs.
- Other feature packages are not imported to resolve Skill package format or Host facts.

### Interface

- `CreateSkillInput` accepts only target, complete portable definition, optional contained resources, and optional Neko overlay.
- `additionalProperties: false` plus strict nested readers reject unknown or Host-owned fields such as `approval`, `trusted`, or `enabled` instead of silently discarding them.
- `CreateSkillResult` reports the committed package and diagnostics; it does not report or imply activation/authorization success.
- Portable validity, overlay validity, Host compatibility, and first-party quality remain distinct conclusions.
- Explicit migration failure codes are migration-scoped (`migration-source-*`, `migration-data-unmappable`) rather than appearing as an implicit normal-loading compatibility route.

### Extension

- Other hosts may preserve/add `agents/<host>.yaml` without changing portable parsing.
- Future Neko overlay versions require explicit parsers; unknown versions fail visibly.
- Native creation, general file creation, and manual editing converge through the same `.agents/skills` discovery/runtime path.
- The root resolver remains a small local-product abstraction and does not introduce a remote package manager or generalized virtual filesystem.

### Testing

- Contract/parser tests cover portable identity, optional metadata, overlay versions, support-file containment, directory identity, and validation-dimension separation.
- Runtime tests cover canonical roots, no root `manifest.json`, poisoned `.neko/skills`, traversal/absolute/dot path rejection, reserved paths, parent/child structural collisions, conflicts, atomic cleanup, concurrent commits, duplication, and no activation side effects.
- Loader/registry/catalog/Extension/TUI tests prove Host projection and shared runtime delegation.
- Script-driven evaluation supplies canonical-path and forbidden-fallback evidence for real `CreateSkill` execution and typed failures.

## Blocking findings resolved during review

1. **Support-file containment**: `SKILL.md` references such as `../outside.md`, `/outside.md`, Windows absolute paths, and dot-segment paths now fail before filesystem probing; valid contained references remain supported.
2. **Resource structural collisions**: creation now rejects parent/child resource conflicts such as `assets` together with `assets/icon.svg`, returning `skill-resource-path-conflict` / `invalid-resource-path`.
3. **Debug stdout reservation ordering**: multiple debug servers use a module-level console reservation stack, so closing a non-active server cannot restore stdout while another server still owns the NDJSON channel.
4. **Pending-handler drain on input failure**: input `error` detaches listeners but waits for the current handler to settle before console restoration and server resolution, preventing late logs from corrupting stdout protocol frames.
5. **Strict native creation boundary**: `CreateSkill` rejects unknown top-level and nested fields, including Host-owned `approval`, `skill.trusted`, and `neko.enabled`, without invoking the provider/runtime.
6. **Debt-classification clarity**: renamed the debug protocol request-id hint and migration failure codes so this change introduces no unclassified `fallback`/`legacy` production surface. Explicit migration declarations remain classified as boundary canonicalization.

# Verification

## Focused automated checks

All commands were run from `/Users/feng/Git/neko-suite` unless a package directory is shown.

```bash
pnpm --filter @neko/shared exec vitest run \
  src/types/__tests__/skill-sdd-metadata.test.ts \
  --reporter=dot
```

- Result: **1 file, 42 tests passed**.
- Log: `/tmp/adopt-portable-final-shared.log`.

```bash
pnpm --dir packages/neko-agent exec vitest run \
  packages/agent/src/skill/__tests__/portable-skill.test.ts \
  packages/agent/src/skill/__tests__/skill-file-projector.test.ts \
  packages/agent/src/skill/__tests__/skill-file-runtime.test.ts \
  packages/agent/src/skill/__tests__/skill-loader-manifest.test.ts \
  packages/agent/src/skill/__tests__/skill-host-projection.test.ts \
  packages/agent/src/skill/__tests__/legacy-skill-migration.test.ts \
  packages/agent/src/skill/__tests__/skill-meta-provider.test.ts \
  packages/agent/src/skill/__tests__/skill-registry-lazy.test.ts \
  packages/agent/src/skill/__tests__/skill-registry-populator.test.ts \
  packages/agent/src/skill/__tests__/skill-registry.test.ts \
  packages/agent/src/skill/__tests__/skill-runtime-bootstrap.test.ts \
  packages/agent/src/skill/__tests__/skill-prompt-content-boundary.test.ts \
  packages/agent/src/tools/__tests__/schema-validator.test.ts \
  packages/agent/src/tools/core/__tests__/meta-tools.test.ts \
  --reporter=dot
```

- Result: **14 files, 166 tests passed**.
- Log: `/tmp/adopt-portable-final-agent.log`.

```bash
pnpm --dir packages/neko-agent exec vitest run \
  packages/extension/src/commands/__tests__/skillCatalogActions.test.ts \
  packages/extension/src/services/__tests__/skillCatalogProvider.test.ts \
  --reporter=dot
```

- Result: **2 files, 15 tests passed**.
- Log: `/tmp/adopt-portable-final-extension.log`.

```bash
pnpm --dir packages/neko-agent exec vitest run \
  packages/cli-tui/src/core/__tests__/skill-lifecycle-session.test.ts \
  packages/cli-tui/src/core/__tests__/tui-session-skills.test.ts \
  packages/cli-tui/src/core/debug-automation/__tests__/app-port.test.ts \
  packages/cli-tui/src/core/debug-automation/__tests__/boundary.test.ts \
  packages/cli-tui/src/core/debug-automation/__tests__/protocol.test.ts \
  packages/cli-tui/src/core/debug-automation/__tests__/session-manager.test.tsx \
  packages/cli-tui/src/core/debug-automation/__tests__/stdio.test.ts \
  --reporter=dot
```

- Result: **6 discovered files, 20 tests passed**.
- Log: `/tmp/adopt-portable-final-tui.log`.

Final review regressions were also rerun after the last naming/boundary fixes:

```bash
pnpm --dir packages/neko-agent exec vitest run \
  packages/cli-tui/src/core/debug-automation/__tests__/protocol.test.ts \
  packages/cli-tui/src/core/debug-automation/__tests__/stdio.test.ts \
  --reporter=dot

pnpm --dir packages/neko-agent exec vitest run \
  packages/agent/src/skill/__tests__/legacy-skill-migration.test.ts \
  packages/agent/src/skill/__tests__/portable-skill.test.ts \
  --reporter=dot
```

- Results: **2 files / 7 tests passed** and **2 files / 23 tests passed**.
- Logs: `/tmp/adopt-portable-final-protocol-regression.log`, `/tmp/adopt-portable-final-migration-agent.log`.

A previously completed Webview-focused run remains valid because the final review fixes did not modify Webview behavior:

- Result: **4 files, 105 tests passed**.
- Log: `/tmp/adopt-portable-webview-focused.log`.
- No VS Code Extension Development Host visual smoke was required: this change does not alter Webview layout, interaction, focus, media, CSP, or Extension/Webview message behavior. A browser-only run was not substituted for VS Code runtime evidence.

## Agent evaluation

```bash
pnpm test:agent:eval
```

- Result: **2 files, 31 tests passed**.
- This is the key-free harness gate, not real Agent behavior acceptance.
- Log: `/tmp/adopt-portable-final-agent-eval.log`.

### Explicit `$skill-creator` activation regression

The reported `Unknown skill: $skill-creator` failure was traced to builtin registration rather than `$` parsing or namespace routing:

- `$skill-creator` was already parsed as a Skill invocation.
- `ConversationSkillRuntime` already resolved explicit invocations by canonical Skill name.
- Extension and TUI already consumed `getBuiltinSkills()`.
- The missing contract was that `skill-creator` was absent from `packages/neko-skills/src/builtins/builtin-definitions.ts`.

The fix adds `skill-creator` as a builtin system Skill with localized catalog/content and no `command` alias. It is therefore invoked through `$skill-creator`, not `/skill-creator`. Its content preserves the accepted architecture boundary: it is authoring guidance, not the owner of file access, permissions, activation, trust, or a mandatory draft/review/apply/approval lifecycle. It also states that root `manifest.json` is outside the portable Skill contract.

Regression evidence:

```bash
pnpm --filter @neko/skills test
```

- Result: **30 files, 287 tests passed**.
- Log: `/tmp/skill-creator-skills-test.log`.
- Coverage includes builtin registration, localized prompt parity, absence of a slash-command alias, portable package guidance, and the non-mandatory authoring-stage boundary.

```bash
cd packages/neko-agent
pnpm exec vitest --run \
  packages/cli-tui/src/core/__tests__/slash-commands.test.ts \
  packages/cli-tui/src/core/__tests__/tui-session-skills.test.ts \
  packages/agent/src/skill/__tests__/skill-prompt-content-boundary.test.ts \
  --reporter=dot
```

- Result: **3 files, 14 tests passed**.
- Log: `/tmp/skill-creator-focused-agent-test.log`.
- The focused route test uses the real builtin list, resolves canonical `skill-creator`, proves `getSkillByCommand` is not used, and records lifecycle activation for `skill-creator`.
- After tightening the test helper from generic records to `Partial<Skill>`, the route-only rerun passed **1 file, 11 tests**, and CLI TypeScript diagnostics no longer reference `slash-commands.test.ts`.

The Agent evaluation manifest adds `explicit-system-skill-creator`, and the harness dry-run plus `pnpm test:agent:eval` cover its `skill-active` assertion. Current captures are `/tmp/skill-creator-explicit-dry-run.log` and `/tmp/skill-creator-agent-eval-harness.log`. The first real run correctly failed against the stale checked-out CLI executable, demonstrating that the old binary did not contain the new builtin. After rebuilding with:

```bash
pnpm --filter @neko/cli build:exe
```

the real focused evaluation passed with:

```text
providerId: nekoapi-chat
modelId: gpt-5.5
skillName: skill-creator
slot: domainSkill
status: active
```

The evaluated prompt requested guidance only; the Agent returned the portable package structure and validation advice without creating or modifying files.

Focused real Agent cases ran through TUI debug automation with:

```text
providerId: nekoapi-chat
modelId: gpt-5.5
```

Reports:

- `/tmp/native-create-project-skill-real.json`
- `/tmp/native-create-rejects-invalid-skill.json`
- `/tmp/native-create-rejects-resource-traversal.json`
- `/tmp/native-create-rejects-existing-target.json`

Evidence:

- The model called native `CreateSkill`; it did not substitute general file writes for the evaluated path.
- Success committed `SKILL.md` and `references/checklist.md` under `.agents/skills/eval-native-create-project-skill`.
- Root `manifest.json` was absent from the canonical package.
- Poisoned `.neko/skills` files remained present and unchanged, proving no normal fallback/migration path participated.
- `skillActivations` and `runtimeErrors` were empty.
- Failure cases returned `invalid-skill`, `invalid-resource-path`, and `skill-already-exists`, with post-checks proving no escaped/partial/overwritten package.

The real evaluation also emitted a StageGuardian diagnostic:

```text
[stage-out-of-order] Entered Apply without visiting Draft / Plan first
```

This is a generic planner/guardian contract false positive for a direct native capability request. It must **not** be fixed by adding a Skill-specific draft/review/apply/approval gate, because that would violate the accepted creation boundary. The cases exited successfully, all configured assertions/post-checks passed, and `runtimeErrors` remained empty.

An Ink error-boundary stack was observed in the concurrent TUI environment, but each affected case exited with code 0, assertions passed, and `runtimeErrors: []`. It is treated as parallel TUI/Markdown infrastructure noise rather than evidence of a portable Skill path failure.

## Webview `$` Skill selection regression

The reported Webview symptom was not caused by a missing builtin after `skill-creator` registration. The active-conversation composer had two competing paths: menu selection first inserted `$<skill> ` and then immediately called a direct Skill invocation callback; that callback cleared the composer before forwarding the invocation to the Host. Entry/tabless composition did not inject the callback, which explains why the failure was specific to the active conversation path.

The canonical interaction is now:

```text
select Skill from `$` menu
  -> insert `$<skill> ` into the composer
  -> user may continue editing arguments
  -> send
  -> useChatActions parses and invokes the Skill
```

The Webview-only `onSkillInvocation` / `handleSkillInvocation` path and its duplicate argument extractor were removed. Menu selection is now a pure composer edit; send-time routing remains owned by `useChatActions`. This also unifies mouse selection, keyboard selection, and manually typed `$skill-name` input.

Focused regression commands on July 11, 2026:

```bash
cd packages/neko-agent/packages/webview
pnpm exec vitest run \
  src/components/ChatView/InputArea/InputArea.test.tsx \
  src/hooks/__tests__/useSlashCommands.test.ts \
  src/hooks/__tests__/useChatActions.test.ts \
  --reporter=dot
```

- Result: **3 files, 63 tests passed**.
- The InputArea regression proves mouse selection preserves `$quality-review ` in the composer and asserts that `invokeSkill` is not called.
- The existing `useChatActions` regression proves sending `$quality-review changed files` invokes `quality-review` with `changed files` and does not persist a normal chat message.

```bash
cd packages/neko-agent/packages/webview
pnpm exec vitest run \
  src/components/ChatView/InputArea/SlashCommandMenu.test.tsx \
  src/components/ChatView/InputArea/__tests__/slash-command-catalog.test.ts \
  --reporter=dot
pnpm exec tsc --noEmit -p tsconfig.json
```

- Result: **2 files, 15 tests passed**; Webview TypeScript completed without diagnostics.

The complete Webview test suite also passed after the final regression assertion:

```bash
cd packages/neko-agent/packages/webview
pnpm test -- --reporter=dot
```

- Result: **80 files, 695 tests passed**.

```bash
cd packages/neko-agent
pnpm compile
```

- Result: Extension and production Webview bundles completed successfully.

Extension Development Host acceptance used the `vscode-extension-debugger` Skill against VS Code CDP port `9222`, not a browser/Vite substitute:

1. Rebuilt the Extension and Webview, then reloaded the Extension Development Host.
2. Entered an active Agent conversation and filtered the `$` menu with `$skill-cre`.
3. Confirmed the real menu contained the builtin `$skill-creator`.
4. Clicked the menu item and waited for asynchronous Host/UI work.
5. Observed `textarea.value === "$skill-creator "`, zero remaining menu items, zero conversation messages, and no activation text.
6. Instrumented the Webview-to-Host `postMessage` boundary for a repeated selection and observed an empty capture (`[]`), proving selection did not invoke the Host.

```bash
pnpm smoke:webview:targets
```

- Result: passed; two VS Code page targets and two Webview targets were observed, including `extensionId=neko.neko-agent`.
- Console observation contained only VS Code's known benign `Unrecognized feature: 'local-network-access'` warning.

No new real Agent evaluation was required for this regression because the model-driven runtime, builtin registration, and send-time `useChatActions -> invokeSkill` path were unchanged; the change removes a premature Webview-only selection path. The existing `explicit-system-skill-creator` evaluation above remains the Agent-runtime evidence, while the new unit and Extension Development Host checks cover the changed UI boundary.

## Configuration-root and portable-Skill-root separation

The path contract was re-audited on July 11, 2026 after clarifying that Neko user and workspace configuration live under `.neko`. The implementation already resolved configuration through the shared `@neko/shared` configuration path helpers, so no production path migration was required. The documented and tested namespaces are now explicit:

```text
Neko user configuration root       ${HOME}/.neko
Neko workspace configuration root  <workspace>/.neko
Portable personal Skill root       ${HOME}/.agents/skills
Portable project Skill root        <workspace>/.agents/skills
```

The canonical configuration files remain `${HOME}/.neko/config.toml` and `<workspace>/.neko/config.toml`. The existence of a Neko configuration root does not make `.neko/skills` a normal discovery source; that legacy subdirectory remains migration-only.

Focused contract verification:

```bash
pnpm exec vitest run \
  packages/neko-types/src/config/config-reader.test.ts \
  packages/neko-agent/packages/agent/src/skill/__tests__/skill-file-runtime.test.ts \
  --reporter=dot
```

- Result: **2 files, 48 tests passed**.
- The shared configuration tests assert exact user/workspace `.neko` roots and `config.toml` paths.
- The Skill runtime tests assert `.agents/skills` discovery/create/watch roots, `.neko/commands` separation, and poisoned `.neko/skills` exclusion.

```bash
openspec validate adopt-portable-agent-skills --type change --strict --no-interactive
```

- Result: `Change 'adopt-portable-agent-skills' is valid`.

A package TypeScript check was also attempted:

```bash
pnpm exec tsc --noEmit -p packages/neko-agent/packages/agent/tsconfig.json
```

- Result: non-zero because of existing/concurrent test-fixture and contract errors across unrelated Agent surfaces.
- No diagnostic referenced the configuration path test, `config-reader.ts`, `agent-skill-layout.ts`, or `skill-file-runtime.ts`.

## TypeScript and repository gates

The final package TypeScript checks were run for Agent, Extension, CLI TUI, and Webview:

```bash
pnpm exec tsc --noEmit -p packages/neko-agent/packages/agent/tsconfig.json
pnpm exec tsc --noEmit -p packages/neko-agent/packages/extension/tsconfig.json
pnpm exec tsc --noEmit -p packages/neko-agent/packages/cli-tui/tsconfig.json
pnpm exec tsc --noEmit -p packages/neko-agent/packages/webview/tsconfig.json
```

- Combined log: `/tmp/adopt-portable-final-tsc.log`.
- Webview completed without diagnostics.
- Agent/Extension/CLI TUI reported existing or concurrent contract/fixture/strictness failures in other files, including test fixture drift, provider/media adapters, `understandingModels`, and CLI `rootDir`/strict-index issues.
- No diagnostic referenced the final review files: `types/tool.ts`, `schema-validator.ts`, `meta-tools.ts`, or `debug-automation/stdio.ts`.
- A focused CLI TSC rerun after the `$skill-creator` route-test helper fix produced no diagnostic for `packages/cli-tui/src/core/__tests__/slash-commands.test.ts`; the remaining CLI diagnostics are pre-existing or concurrent errors in unrelated Agent/provider/test-fixture surfaces. The capture is `/tmp/skill-creator-cli-tsc.log`.

Debt scanner:

```bash
node scripts/check-legacy-debt-surfaces.mjs --self-test
node scripts/check-legacy-debt-surfaces.mjs --json \
  > /tmp/adopt-portable-check-legacy-debt-final-after-comment.json
```

- Self-test: **12 cases passed**.
- The repository-wide JSON command still exits non-zero because unrelated production debt remains.
- Portable Skill and debug-automation surfaces introduced/modified by this change have **zero `delete-now`, `migrate-now`, or `needs-review` blocking occurrences**. Explicit legacy migration declarations are classified as `boundary-canonicalizer`.

Whitespace/diff validation:

```bash
git diff --check -- \
  openspec/changes/adopt-portable-agent-skills \
  packages/neko-agent/packages/agent/src/skill \
  packages/neko-agent/packages/agent/src/tools \
  packages/neko-agent/packages/cli-tui/src/core/debug-automation \
  packages/neko-types/src/types/skill.ts \
  packages/neko-types/src/types/tool.ts \
  scripts/check-legacy-debt-surfaces.mjs
```

- Result: passed.

The required repository-wide gates were attempted earlier and classified separately:

- `pnpm check:legacy-debt`: repository-wide failure from unrelated classified debt; this change's related blocking matches were resolved.
- `pnpm check:unused`: existing/concurrent Knip findings; no portable Skill public API was reported unused.
- `pnpm check`: blocked by the same `check:unused` findings.
- `pnpm test`: concurrent Markdown contract failures outside this change.
- `pnpm build`: concurrent `neko-markdown` unused-import failure outside this change.

Logs:

- `/tmp/adopt-portable-check-legacy-debt.log`
- `/tmp/adopt-portable-check-unused.log`
- `/tmp/adopt-portable-check.log`
- `/tmp/adopt-portable-test.log`
- `/tmp/adopt-portable-build.log`

# Residual Risk

1. **Post-commit rescan failure**: `SkillFileRuntime.createSkill()` atomically renames the complete temporary package before invalidating/rescanning. If a rare registry refresh infrastructure error occurs after the rename, the caller may receive an error even though the package exists. The implementation intentionally does not delete committed user data; a subsequent scan recovers registry state.
2. **POSIX empty-target rename race**: preflight conflict checks, rename conflict handling, and concurrent-creator tests cover realistic targets. On some POSIX filesystems, rename may replace an empty directory created in the narrow interval before commit. A normal competing Skill creator writes `SKILL.md`, making its target non-empty and non-replaceable. A cross-platform no-replace abstraction was not added because it would exceed this local product's justified complexity.
3. **Global workspace health**: repository-wide TypeScript/check/test/build gates remain red due to concurrent or pre-existing work outside this change. Focused tests, changed-file diagnostics, debt classification, and real path-level Agent evidence are green, but the branch should not be represented as globally green until those independent failures are resolved.
4. **Evaluation infrastructure noise**: the StageGuardian false positive and Ink stack remain observable in the real TUI evaluation environment. They did not affect exit status, assertions, post-checks, or runtime error facts, but should be addressed by the owning generic planner/TUI work rather than by weakening the portable Skill architecture.
