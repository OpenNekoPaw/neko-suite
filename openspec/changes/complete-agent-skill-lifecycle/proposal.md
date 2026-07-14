## Why

> **Superseded stage-persona scope (2026-07-15):** `retire-idc-and-align-agent-creative-planning` removes IDC stage personas and creation-stage lifetime. This change remains authoritative only for normal user/Agent-activated domain and reference Skill lifecycle records; stage-owned persona records must not be restored.

`neko-agent` currently has a single active Skill injection slot, while adjacent code already hints at multi-Skill state, conflict resolution, IDC stage personas, and turn-level context projection. This gap makes Skill cleanup and composition fragile: prompt sections, permission allow rules, ToolGuard state, ToolSet activation, and Webview indicators can drift when a conversation needs multiple Skill roles or when a Skill should expire automatically.

## What Changes

- Introduce a typed Skill lifecycle model that stores active Skill records per conversation instead of treating prompt/tool mutation as the canonical state.
- Replace the single active injection owner with request-time projection: every Agent turn composes prompt sections and tool policy from active lifecycle records.
- Add lifecycle slots for `domainSkill`, `stagePersona`, `referenceSkill`, `ephemeralSkill`, and `workflowSkill`, with explicit ownership, lifetime, deactivation policy, and conflict rules.
- Allow automatic dynamic injection and cancellation only through runtime-owned lifecycle decisions:
  - user or Agent explicit activation;
  - IDC stage enter/exit;
  - turn-scoped or inactivity expiry;
  - workflow/run completion;
  - explicit user or Agent deactivation when the record is clearable.
- Preserve the Agent-first Skill selection boundary: natural-language messages still do not trigger Extension/Webview keyword routing or candidate chips.
- Add fail-visible diagnostics for unknown lifecycle slots, conflicting Skills, locked deactivation, stale records, unsupported merge modes, and legacy single-slot injection paths.
- **BREAKING** for unreleased internal runtime contracts: replace implicit single active Skill state exposed by runtime internals with lifecycle snapshots and projections. Existing user/project Skill files are not changed.

## Capabilities

### New Capabilities

- `agent-skill-lifecycle-projection`: Active Skill lifecycle records, request-time prompt/tool projection, deactivation policy, expiry, and conflict handling.

### Modified Capabilities

- `agent-skill-candidate-routing`: Preserve Agent-owned natural-language activation while allowing runtime-owned lifecycle expiry and explicit activation/deactivation diagnostics.
- `agent-command-skill-trigger-boundary`: Update explicit `$skill`, `invokeSkill`, and `DeactivateSkill` behavior to target lifecycle records and scoped slots.

## Impact

- Affected packages:
  - `packages/neko-agent/packages/agent`: Skill lifecycle contracts, runtime projection, prompt modules, meta tools, Skill provider, Agent turn assembly, tests.
  - `packages/neko-agent/packages/extension`: host adapter bridge, Webview message routing, active Skill projection, diagnostics.
  - `packages/neko-agent/packages/webview`: active Skill indicator UI and clear actions for multiple scoped records.
  - `packages/neko-agent/packages/cli-tui`: Skill status, activation, deactivation, and scoped lifecycle controls.
  - `packages/neko-types`: shared lifecycle DTOs and diagnostics if they cross package boundaries.
- No Rust engine or Protobuf changes are expected.
- No Skill file format migration is required. Optional future Skill manifest fields may describe lifecycle preferences, but this change can default existing Skills to `domainSkill` / `until-cleared`.
- Validation must cover path-level activation, deactivation, request projection, conflict handling, expiry, Webview runtime messaging, and legacy single-slot rejection.
