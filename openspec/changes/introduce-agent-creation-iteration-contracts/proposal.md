# Superseded: Agent Creation Iteration Contracts

> Superseded by `normalize-agent-native-creation-boundary` (2026-07-02).
> This change is intentionally frozen. Do not resume it directly.

## Why This Is Frozen

This proposal attempted to introduce broad `AgentCreation`, `CreationIteration`, and `CreationEvent` contracts. That direction is now rejected because it risks recreating a parallel Agent creation runtime under new names.

The accepted boundary is:

- Agent existing session/turn/capability runtime owns lifecycle, stage, feedback, validation, approval, state, artifact provenance, and capability invocation.
- IDC is only a creation profile.
- Skill provides prompt-chain guidance, output standards, tool boundaries, and validator hints.
- Workflow only means prompt-chain guidance, not a runtime, DAG, scheduler, node executor, or state machine.

## Replacement

Use `openspec/changes/normalize-agent-native-creation-boundary/` for any further cleanup work.
