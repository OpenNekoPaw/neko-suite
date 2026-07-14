## Evaluation Scope

- Change/feature: Distinguish model-facing SubAgent tools and identities from asynchronous Task identities.
- Decision and owning suite: `excluded` for real TUI SubAgent collection because the TUI host does not inject `SubAgentRuntimeCoordinator`; `update` `skill.image/generate-image` and `agent-runtime.workflow-controller/task-continuation` for media no-fallback behavior.
- Why real Evaluation is required: Tool naming, schema, model routing, SubAgent workflow, and media task continuation can change real Agent behavior.
- Canonical path and forbidden fallback: `subagent -> subagent_output` for SubAgents; `GenerateImage -> task-result observation` for media Tasks. Legacy `task`/`task_output` and cross-registry lookup are forbidden.

## Cases

- Excluded from indexed real cases: background SubAgent spawn and result collection; deterministic Agent runtime tests prove the contract, while the canonical real Evaluation host does not expose this product capability.
- Updated: image generation and task continuation assert canonical media delivery and absence of SubAgent tools.
- Evidence and coverage: Tool-call facts, process order, Task terminal facts, continuation, runtime errors, and terminal idle state.
- Missing observability: None identified for Tool names and Task continuation paths.

## Verification

- Key-free validation: `pnpm test:agent:eval` passed with 39 test files / 263 tests and 26 suites / 38 indexed cases after removing the host-inapplicable SubAgent case.
- Real cases and reports: `skill.image/generate-image`, run `image-no-subagent-20260714`; GenerateImage, image Task terminal, both SubAgent-tool absence gates, and terminal idle passed.
- Blocked or unexecuted cases: Real SubAgent collection is blocked because TUI session assembly does not inject `SubAgentRuntimeCoordinator`. The diagnostic run `subagent-contract-rebuilt-20260714` observed zero SubAgent tools after rebuilding the executable. The image case overall outcome remained `case-fail` because the current builtin image Skill fingerprint differs from the suite target fingerprint; this is independent of the routing gates.

## Interpretation

- Result and quality comparison: Media Task/SubAgent separation hard gates passed; no subjective quality stage applies.
- Confirmed failures vs attribution hypotheses: The captured DeepSeek failure is confirmed as media Task ID routing into the SubAgent output tool.

## Residual Risk

- DeepSeek-specific adherence remains unverified because the configured real TUI model was `nekoapi-chat/gpt-5.5`, while the reported failure used `deepseek-v4-flash` in the VS Code host.
- Real SubAgent collection remains unverified because the canonical Evaluation TUI does not expose that capability.
- The image Skill target fingerprint drift prevents a fully passing indexed case even though all routing assertions passed.
- Repository `pnpm check`, `pnpm check:unused`, and `pnpm check:legacy-debt` were executed but remain red on pre-existing dirty-worktree findings outside this change. Focused tests and `git diff --check` passed.
