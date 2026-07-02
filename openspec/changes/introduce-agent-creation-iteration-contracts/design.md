# Superseded Design: Agent Creation Iteration Contracts

> Superseded by `normalize-agent-native-creation-boundary` (2026-07-02).
> This design is intentionally frozen. Do not implement it.

## Rejected Direction

The previous design introduced broad creation/iteration/event DTOs as a new canonical creative process model. That direction is rejected for this prelaunch cleanup because it creates another boundary that can own lifecycle, stage, iteration, validation, approval, and state.

## Accepted Direction

Agent-native creation is not a new class, store, session DTO, scheduler, or package. It means the existing Agent session/turn loop, validator feedback, approval gates, artifact services, and capability lifecycle own creative lifecycle decisions.

Only narrow contracts are acceptable unless a concrete boundary needs more:

- `AgentLegacyCreationTrace` for quarantined legacy ids.
- `AgentPromptChainObservation` for recording Skill guidance adoption, skip, reorder, checkpoint, and completion.
- Typed validator diagnostics returned to the Agent after output is produced.
- Typed capability lifecycle results for side-effecting domain operations.

## Replacement

Use `openspec/changes/normalize-agent-native-creation-boundary/design.md` as the active design source.
