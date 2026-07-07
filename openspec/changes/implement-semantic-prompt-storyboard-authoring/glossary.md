# Glossary

## Semantic Prompt Document

Canvas-owned prompt authority for a storyboard prompt block. It contains prompt text, semantic spans, durable references, field projections, suggestions, diagnostics, and alignment state. It is not a plain string and not an Agent-only artifact.

## Prompt Block

A typed prompt document slot on a shot, such as `imagePromptDocument`, `videoPromptDocument`, or `voicePromptDocument`.

## Image Prompt Document

Optional prompt block used when a shot needs reference-image preparation, keyframe generation, image repair, cleanup, outpaint/inpaint, coloring, or style normalization. A shot with directly usable reference media does not need an image prompt.

## Video Prompt Document

Core prompt block for video generation or video editing. It describes temporal change: action, motion, camera movement, rhythm, duration relationship, continuity, and first/last-frame intent.

## Voice Prompt Document

Optional prompt block for dialogue, voice, emotion, speaker, narration, or audio generation/editing. It can bind to dialogue text, speaker/entity refs, or voice capability inputs.

## Reference Media

Durable media refs attached to a shot. The core path supports image refs. Video refs and audio refs are capability-driven extensions and must not become always-visible primary columns unless the active capability supports them.

## Field Projection

A review value derived from semantic prompt spans, prompt documents, reference media, or parameters. It exists to make prompt-first content reviewable; it is not the primary source of truth unless explicitly bound to a semantic prompt span or Canvas field descriptor.

## Scene Storyboard Table

A scene-scoped review projection over shots. Its primary columns are shot number, reference media, image prompt, video prompt, duration, dialogue, current state, and next action.

## Next Creative State

The Canvas-visible state that answers what the shot needs next. It is not provider progress. It includes a label, severity, blocker, target area, next action id, and optional task/result refs or diagnostics.

## Action Intent

A typed request emitted by Canvas when the user clicks a next-action button. Agent interprets the intent, checks Canvas/model capabilities, requests approval if needed, creates async tasks, and writes back structured results.

## Agent Async Task

Agent-owned execution record for provider-consuming or long-running work such as reference processing, image generation, video generation, audio generation, review, and retry. Progress, logs, queue position, and provider metadata live here, not in the Canvas storyboard table.

## Result Ref

A durable reference to generated or accepted media/result data. Canvas may persist result refs after validating writeback, but must not use runtime preview URIs, blob URLs, temp paths, cache paths, or provider runtime handles as durable identity.

## Prompt Alignment

The sync relationship between prompt text/spans and projected fields. Example states include in-sync, prompt-overridden, fields-changed, conflict, unbound, and suggestion-pending.

## Legacy Generation Prompt

Existing plain `generationPrompt` data on shot nodes. In this change it is migration/import input or derived display only; it is not the canonical storyboard prompt authority.
