## Evaluation Scope

- Change/feature: Flat direct `neko image|video|audio` shell commands.
- Decision and owning suite: `excluded` from real Agent Evaluation; deterministic TUI CLI path tests own this behavior.
- Why real Evaluation is not required: The new canonical path explicitly bypasses AgentSession, prompt composition, Skill selection, Tool routing and TUI Agent event projection. No Agent runtime, prompt, Skill, capability provider, model-selection, queue or continuation contract is changed.
- Canonical path and forbidden fallback: `Commander media command -> direct media orchestrator -> Platform MediaGenerationService -> Media Task -> Host delivery`; default prompt dispatch, AgentSession, chat model and Agent Tools are forbidden.

## Cases

- Excluded: provider-backed Agent scenario because it would test a path that the feature forbids.
- Deterministic coverage: all three media kinds, target-category model resolution, explicit model mismatch, terminal wait, failed Task, missing stable result and CLI routing with poisoned Ink/Agent TUI rendering.
- Missing observability: None for command routing and no-Agent/no-fallback. Real provider output quality and credentials remain external smoke concerns.

## Verification

- Key-free validation: focused Vitest direct orchestration, architecture and CLI action cases.
- Real cases and reports: Not run; no Agent behavior is part of the canonical path.
- Blocked or unexecuted cases: Provider-backed image/video/audio generation requires configured credentials and potentially incurs external cost.

## Interpretation

- Result: deterministic tests prove the direct handler and media runtime port are selected while the interactive Agent TUI path is poisoned.
- Confirmed failures vs attribution hypotheses: missing/wrong-category model and failed/cancelled/unstable Task results are deterministic direct-command failures; provider-specific runtime failures require a credentialed smoke run for attribution.

## Residual Risk

- The concrete external provider submission and real generated-output download have not been exercised with paid provider credentials in this change.
