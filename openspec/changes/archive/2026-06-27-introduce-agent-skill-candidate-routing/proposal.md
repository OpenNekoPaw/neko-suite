## Why

`neko-agent` previously moved toward code-side Skill candidate routing and Webview candidate chips. The user clarified that this violates the Agent-first / prompt-first design: users should not manually pick code-generated candidates, and Extension/Webview keyword routing should not decide Skill activation before the main Agent reasons.

With the current large-context Agent, the correct boundary is to expose registered Skill catalog metadata through `GetContext`, let the Agent decide whether a Skill is needed, and keep `ActivateSkill` as the only Agent-owned activation gate.

## What Changes

- Remove code-side natural-language Skill candidate routing, candidate DTOs, candidate Webview messages, and candidate chips.
- Remove Extension pre-turn candidate resolution before `runAgentMessageTurnRuntime`.
- Keep explicit `$skill` / `invokeSkill` and Agent `ActivateSkill` activation paths.
- Keep Skill metadata (`description`, `domain`, `referencedSkills`, `mediaWorkflow.useCases`, `nonGoals`, `inputArtifacts`, `producedArtifacts`, `operations`) as Agent-readable catalog material.
- Update `GetContext` to expose registered Skill catalog metadata without candidate hints.
- Update ADR/package docs to describe Agent-autonomous Skill activation and user-added Skill metadata.
- **BREAKING (prelaunch internal Agent behavior):** natural-language Skill matching no longer returns Webview candidates or legacy discovery matches. Tests and flows must assert no pre-turn Skill injection and no candidate protocol.

## Capabilities

### New Capabilities

- `agent-skill-catalog-activation-boundary`: Defines Agent-owned Skill activation, Skill catalog metadata projection, and removal of code/UI candidate routing.

### Modified Capabilities

None.

## Impact

- `packages/neko-agent/packages/agent/src/skill/*`: remove candidate router/capability-card files and candidate runtime state; keep activation runtime.
- `packages/neko-agent/packages/agent/src/tools/core/meta-tools.ts`: keep registered Skill catalog metadata, remove `skillCandidateHints`.
- `packages/neko-agent/packages/extension/src/chat/*`: remove pre-turn candidate resolution and `sendSkillCandidates`.
- `packages/neko-agent/packages/webview/src/*`: remove `skillCandidates` protocol, state, i18n, CSS, and chips UI.
- `packages/neko-types/src/types/skill.ts` and `packages/neko-agent/packages/agent-types/src/*`: remove shared candidate DTOs, keep Skill metadata contracts.
- Documentation: replace candidate-router language with Agent-autonomous activation.
- Validation: focused Vitest/compile tests and Agent boundary checks.
