## Why

`embody-character` currently behaves like an ordinary Agent conversation with a hidden context payload. That gives the user a mode label, but it still allows creative skills such as `creation-persona` and write/generation tools to activate, which violates the product meaning of "代入角色": the user plays the character and the Agent only provides project-scoped character knowledge feedback.

This change makes Embody Character a first-class isolated feedback session that reuses the Character Dialogue session architecture while applying a different capability policy.

## What Changes

- Add a dedicated Embody Character session/runtime path instead of routing `neko.agent.embodyCharacter` through ordinary Agent message handling.
- Reuse the Character Dialogue shell architecture: profile assembly, tab/session projection, explicit message routing, exit lifecycle, transcript capture, and Webview header behavior.
- Add a read-only character feedback capability policy:
  - blocks `ActivateSkill`, `DeactivateSkill`, creative persona skills, write tools, media-generation tools, task mutation, entity mutation, and shell/file-write capabilities;
  - allows host-side profile/evidence hydration through narrow read-only ports;
  - gives the responder projected evidence rather than a general creative tool registry.
- Update Dashboard delegation so `embody-character` starts an Agent-owned Embody Character feedback session, not an ordinary Agent workflow and not a Character Dialogue roleplay session.
- Replace hidden-context-only Webview behavior with an Embody Character session projection that owns active/exited state and exit routing.
- Add tests proving Embody Character cannot activate `creation-persona` or other creative skills even when the user's message requests a creative action.
- Preserve the actor relationship:
  - Character Dialogue: Agent plays character, user tests.
  - Embody Character: user plays character, Agent gives role-knowledge and boundary feedback.
  - Character Validation/Improvement: Skill workflows that compose primitives.

## Capabilities

### New Capabilities

- `embody-character-runtime`: Defines the dedicated Embody Character session, read-only feedback capability policy, evidence projection, transcript behavior, and user-facing response semantics.

### Modified Capabilities

- `agent-runtime-boundaries`: Require character-role mode capability policy to be enforced by Extension/runtime/controller ports rather than by Webview UI or prompt text alone.
- `dashboard-creative-entity-management`: Update `embody-character` delegation from an ordinary Agent workflow to an Agent-owned isolated feedback session.

## Impact

- Shared contracts: conversation kind/session projection types, Webview protocol messages, tab state normalization, and command request DTO tests.
- Agent runtime: new `EmbodyCharacterSession`, feedback responder input/result contracts, evidence projection helpers, capability policy tests, and optional shared role-session primitives extracted from Character Dialogue.
- Agent extension: new `EmbodyCharacterController`, command routing, message router dispatch, exit handling, evidence/profile assembler ports, and tests.
- Agent Webview: Embody Character header/session rendering, active/exited state, input controls, and hidden context removal.
- Dashboard/entity sources: no action id change, but delegation semantics must start the isolated Embody Character session.
- Docs/OpenSpec/ADR: update role workflow documentation to state that Embody Character is isolated and read-only, not ordinary creative chat.
