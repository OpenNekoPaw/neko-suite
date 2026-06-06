## Why

Character Dialogue and Embody Character currently rely on profile-time script context hydration. The recent fix loads more complete script context, but long projects still need turn-scoped evidence selection so character sessions know the relevant project facts without stuffing entire scripts into every prompt.

This change introduces an Agent-owned Character Evidence Loader that uses entity/search results as location signals, then loads bounded project evidence for the current role session turn while preserving no-tool character isolation.

## What Changes

- Add a `character-evidence-loading` capability for turn-scoped, project-scoped character evidence bundles.
- Add host-agnostic Agent runtime contracts for evidence requests, bundles, source refs, relevance scores, and token/character budgets.
- Add an Extension-host loader implementation that consumes Dashboard creative entity detail, entity projections, Story occurrence/script indexes, and project search location results.
- Update Character Dialogue and Embody Character controllers to request fresh relevant evidence before launch and/or before each user turn.
- Keep character responders no-tool: evidence is loaded by host/controller ports and injected as prompt context; the roleplay/feedback LLM does not receive file, search, skill, or creative authoring tools.
- Add tests for long scripts, late-scene knowledge, stale/missing evidence fallback, path safety, budget trimming, and ordinary Agent context isolation.

## Capabilities

### New Capabilities
- `character-evidence-loading`: Agent-owned loading of bounded, relevant character evidence from project entity/search/story sources for Character Dialogue, Embody Character, and Skill-composed validation.

### Modified Capabilities

None.

## Impact

- `packages/neko-agent/packages/agent/src/runtime`: new host-agnostic evidence loader contracts and pure ranking/budget helpers.
- `packages/neko-agent/packages/extension/src`: VSCode/Dashboard/Story backed loader implementation and controller integration.
- `packages/neko-agent/packages/extension/src/chat`: Character Dialogue and Embody Character session launch/turn evidence injection.
- `packages/neko-entity`: no ownership transfer; may expose or reuse existing occurrence/profile projections only.
- `packages/neko-search`: no contract change; project search remains a locator for `ProjectSearchItem` results, not an evidence text owner.
- Tests: targeted runtime, extension, and role-session regression tests.
