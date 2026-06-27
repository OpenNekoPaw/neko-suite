## 1. Contracts and Runtime

- [x] 1.1 Remove shared Skill candidate DTOs from `@neko/shared` and `@neko-agent/types`.
- [x] 1.2 Remove Agent candidate router/capability-card files and exports.
- [x] 1.3 Remove conversation-scoped candidate state and candidate Webview presenter messages.
- [x] 1.4 Keep `discover()` / `discoverAndApply()` as no-activation compatibility shells that do not route natural language.

## 2. Agent Context

- [x] 2.1 Remove `skillCandidateHints` from `GetContext`.
- [x] 2.2 Preserve registered Skill catalog metadata in `GetContext`.
- [x] 2.3 Preserve `ActivateSkill` / `DeactivateSkill` provider paths.

## 3. Extension and Webview

- [x] 3.1 Remove Extension pre-turn candidate resolution.
- [x] 3.2 Remove `SkillHandler.resolveSkillCandidates` and `sendSkillCandidates`.
- [x] 3.3 Remove Webview `skillCandidates` protocol handling, state, CSS, i18n, and chips UI.
- [x] 3.4 Preserve explicit `$skill` / `invokeSkill` activation.

## 4. Documentation

- [x] 4.1 Replace candidate routing ADR with Agent Skill catalog activation boundary ADR.
- [x] 4.2 Update command/Skill trigger boundary ADR.
- [x] 4.3 Update package README and Skill authoring docs for Agent-readable metadata.
- [x] 4.4 Update OpenSpec proposal/design/spec/tasks to match the pivot.

## 5. Validation

- [x] 5.1 Run focused Agent Skill/meta-tool tests.
- [x] 5.2 Run focused Extension chat/Skill handler tests.
- [x] 5.3 Run focused Webview handler/InputArea/ChatWorkspace tests.
- [x] 5.4 Run `pnpm --filter neko-agent run compile`.
- [x] 5.5 Run `pnpm check:agent-boundaries`.
- [x] 5.6 Run OpenSpec status validation.
