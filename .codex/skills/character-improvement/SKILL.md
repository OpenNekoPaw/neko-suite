---
name: character-improvement
description: Propose character setting improvements from project evidence. Use when a user wants suggested profile, speech, relationship, or knowledge-boundary improvements without adding a core Dashboard action or directly mutating entity facts.
license: MIT
compatibility: Neko Suite character role primitive ports.
metadata:
  author: neko-suite
  version: "0.1.0"
---

# Character Improvement

Use this Skill to improve a character setting from evidence while keeping authors in control.

## Boundaries

- Do not import Dashboard Webview modules.
- Do not write entity facts, metadata, relationships, or story files directly.
- Do not treat inferred personality, voice, or relationship notes as confirmed facts.
- Do not create a Character Dialogue tab unless the user explicitly asks for interactive dialogue.
- Suggestions must remain `authority: "suggested"` and require user confirmation before apply.

## Primitive Ports

Compose the Agent-owned `CharacterRoleSkillPrimitivePorts`:

- `assembleProfile` to read the current profile snapshot.
- `collectEvidence` to gather project-scoped relationships, occurrences, and script context.
- `loadEvidence` to request bounded turn-scoped `CharacterEvidenceBundle` records for specific gaps, scenes, relationships, or knowledge-boundary questions.
- `runHeadlessDialogueProbe` only when improvement needs voice or stability evidence.
- `evaluateTranscript` to turn probe evidence into structured findings.
- `saveArtifact` to store optional evidence under `.neko/character-tests/`.
- `applySuggestionWithConfirmation` to route accepted suggestions through entity-owned apply commands.

## Workflow

1. Assemble the target profile.
2. Collect coarse evidence from the current project.
3. Use `loadEvidence` for targeted source-backed context before drafting improvements; treat entity/search results as locators, not prompt-ready evidence owners.
4. Identify gaps in identity, motivations, voice, relationships, scene knowledge, and representation hints.
5. Draft suggested improvements with source references and confidence.
6. Separate confirmed project facts from inferred improvements.
7. Ask for user confirmation before applying any suggested change.

## Output Shape

Return a focused improvement proposal:

- Current strengths
- Missing or weak areas
- Evidence-backed suggestions
- Risks or contradictions
- Confirmation-gated apply candidates
