## ADDED Requirements

### Requirement: Dashboard delegates embody character to Agent-owned feedback session
Dashboard SHALL delegate `embody-character` to an Agent-owned Embody Character feedback session that treats the user as embodying the character and the Agent as a project-aware knowledge feedback assistant. The action MUST NOT start a Character Dialogue roleplay session and MUST NOT route through the ordinary creative Agent message pipeline.

#### Scenario: Embody character starts feedback session
- **WHEN** Dashboard action handling receives `embody-character` for a valid character ref
- **THEN** the owning source or host adapter invokes `neko.agent.embodyCharacter` with entity ref, optional scope refs, and optional prompt so the Agent Extension starts an isolated Embody Character feedback session

#### Scenario: Embody character does not create dialogue tab
- **WHEN** the Agent command bridge handles `neko.agent.embodyCharacter`
- **THEN** it creates an `embody-character` feedback session and does not create a `character-dialogue` roleplay tab

#### Scenario: Dashboard does not own mode permissions
- **WHEN** Dashboard delegates `embody-character`
- **THEN** Dashboard sends only the typed action request and entity refs, while Agent Extension/runtime owns capability policy, evidence hydration, transcript lifecycle, and mode-boundary feedback
