---
name: character-validation
description: Run automated character validation by composing Character Dialogue primitives. Use when a user wants one Agent to play a project character while another Agent probes knowledge boundaries, voice stability, relationships, and reliability, without exposing validation as a core Dashboard action.
license: MIT
compatibility: Neko Suite character role primitive ports.
metadata:
  author: neko-suite
  version: "0.1.0"
---

# Character Validation

Use this Skill for automated role validation:

- Character Dialogue: one Agent plays the character with no tools.
- Probe Agent: another Agent asks scoped validation questions and reviews the transcript.
- Result: a project-local report and suggestions that remain unconfirmed until the user approves them.

## Boundaries

- Do not import Dashboard Webview modules.
- Do not depend on Dashboard selected-row state; accept an explicit `CreativeEntityRef` or resolve one through Agent/extension ports.
- Do not mutate entity metadata, relationships, profile facts, or story files directly.
- Do not grant project-read, write, shell, media generation, or authoring tools to the character-playing responder.
- Suggestions must use the existing confirmation path before any entity-owned apply command runs.

## Primitive Ports

Compose the Agent-owned `CharacterRoleSkillPrimitivePorts`:

```ts
interface CharacterRoleSkillPrimitivePorts {
  assembleProfile(input): Promise<NpcProfileAssemblyResult>;
  collectEvidence(entityRef): Promise<CharacterRoleEvidenceSnapshot>;
  loadEvidence(request): Promise<CharacterEvidenceBundle>;
  runHeadlessDialogueProbe(input): Promise<NpcTranscriptArtifact>;
  evaluateTranscript(input): Promise<NpcEvaluationReport>;
  saveArtifact(input): Promise<NpcTranscriptArtifactSaveResult | null>;
  applySuggestionWithConfirmation(input): Promise<NpcSuggestionApplyResult>;
}
```

## Workflow

1. Assemble the profile for the target character.
2. Collect coarse project evidence with `collectEvidence`, then request turn-scoped `loadEvidence` bundles for probe topics that need script or late-scene context.
3. Build probe questions for identity, voice, known facts, unknown facts, relationship stability, and knowledge boundary leaks.
4. Run headless Character Dialogue probes with `toolPolicy: { kind: 'none' }`.
5. Keep loaded evidence in the probe turn prompt only; do not write it into ordinary Agent conversation history, global memory, or the live character responder's tool list.
6. Evaluate the transcript and save evidence under `.neko/character-tests/` when the save policy permits.
7. Present report findings first, then suggestions. Apply suggestions only through `applySuggestionWithConfirmation`.

## Output Shape

Return a concise validation report:

- Summary
- Scores
- Findings
- Evidence artifact path, if saved
- Suggested fixes requiring user confirmation
