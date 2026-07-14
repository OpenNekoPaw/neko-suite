## Why

> **Superseded scope (2026-07-14):** Skill 与 execution-mode 的显式触发边界继续有效；IDC workflow start/resume、stage entry、stage persona 和相关 UI/CLI/TUI 成功路径由 [`retire-idc-and-align-agent-creative-planning`](../retire-idc-and-align-agent-creative-planning/) 删除。后续实现不得完成、恢复或重新暴露 IDC trigger，只保留必要的 retired-path diagnostic 和 poison coverage。

Agent capabilities currently activate through several host/runtime side paths: natural-language Skill discovery can pre-activate a Skill, ordinary Agent turns can auto-start IDC runs, and stage persona records can appear before the user sees an explicit trigger. This makes the Agent feel unpredictable and violates the intended Agent-first boundary where capability changes should be user-visible or initiated by the Agent through tools.

## What Changes

- Introduce a unified Agent capability trigger boundary for Skill activation, IDC workflow start/stage entry, execution-mode changes, and Plan/Approval/Auto mode changes.
- Require every initial capability activation to be caused by one of two sources:
  - user explicit action, such as `$skill`, a UI command, a mode selector, or a workflow start/resume command;
  - Agent autonomous tool call, such as `ActivateSkill` or a new typed workflow/mode trigger tool.
- Stop default host/runtime activation:
  - natural-language messages SHALL NOT pre-activate Skills;
  - ordinary Agent turns SHALL NOT auto-start IDC runs;
  - session creation SHALL NOT activate IDC stage personas;
  - Plan Mode SHALL NOT be enabled unless user-selected or Agent-requested through a visible gate.
- Keep runtime-owned follow-up transitions only inside an already active lifecycle:
  - once IDC has been explicitly started, runtime may advance stages and expire stage records;
  - once a Skill lifecycle record exists, runtime may renew, expire, or deactivate it according to policy.
- Add observable activation events and diagnostics so Webview/Extension can show who triggered a capability and why.
- **BREAKING** for unreleased internal Agent behavior: remove implicit natural-language Skill auto-activation and implicit IDC run start from normal Agent turns. Existing conversations may need to explicitly restart or resume IDC workflows.

## Capabilities

### New Capabilities

- `agent-capability-trigger-boundary`: Defines the canonical trigger contract, activation sources, observable activation records, and fail-closed rules for hidden/default activation.

### Modified Capabilities

- `agent-skill-candidate-routing`: Natural-language Skill matching may inform Agent context but SHALL NOT create Skill lifecycle records or send Skill injection messages.
- `agent-mode-configuration`: Execution mode changes SHALL be explicit user choices or Agent-requested visible changes, not hidden defaults.
- `agent-command-skill-trigger-boundary`: Existing `$skill`, Slash, Webview `invokeSkill`, `ActivateSkill`, and `DeactivateSkill` entry points SHALL route through the unified trigger boundary.

## Impact

- Affected packages:
  - `packages/neko-agent/packages/agent`: runtime/session config projection, AgentSession IDC start, ReAct loop stage planner entry, meta tools, lifecycle records, tests.
  - `packages/neko-agent/packages/extension`: message turn handler, Skill handler, Agent turn bridge, settings/mode routing, visible activation messages.
  - `packages/neko-agent/packages/webview`: mode controls, workflow/Skill activation UI, lifecycle indicators, activation event rendering.
  - `packages/neko-agent/packages/cli-tui`: explicit Skill/workflow/mode command handling.
  - `packages/neko-types`: shared activation intent/result/event DTOs if they cross package boundaries.
- No Rust engine or Protobuf changes are expected.
- No durable user project files are migrated. Persisted IDC runtime state should be resumed only through an explicit restore/resume action or visible diagnostic.
