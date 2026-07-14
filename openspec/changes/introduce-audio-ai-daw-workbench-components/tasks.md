## 1. Component Contract And State Foundation

- [x] 1.1 Audit existing `neko-audio` components, hooks, stores, and `@neko/ui` primitives for reusable toolbar, right dock, property row, context menu, focus, icon, and workbench patterns.
- [x] 1.2 Define package-local typed UI contracts for selected audio target, selected region, active timeline tool mode, inspector scope, AI operation review item, and workbench action availability.
- [x] 1.3 Add shared audio action descriptors for selection actions so toolbar, context menu, selection action bar, shortcuts, and AI panel can route through one canonical availability/handler model.
- [x] 1.4 Add store selectors and tests for selection target resolution, invalid/stale target diagnostics, action availability, and mode gating.

## 2. Timeline Workbench Entry Points

- [x] 2.1 Implement `TimelineToolModeBar` with select, split, trim, fade, gain, marker, and automation modes, including visible active state and fail-visible unknown-mode handling.
- [x] 2.2 Wire timeline pointer/keyboard behavior to the active tool mode without breaking existing clip drag, trim, resize, seek, and keyboard focus behavior.
- [x] 2.3 Implement `SelectionActionBar` for selected clips and regions, routing split, trim, fade, gain, denoise, normalize, silence cleanup, and send-to-AI actions through canonical handlers.
- [x] 2.4 Implement `AddSourceStrip` for empty projects and track footer entry points, reusing `project:addSource`, recording panel open, add-track operation, VS Code-selected file import where available, and AI generate entry.
- [x] 2.5 Add component and store tests covering empty project entry points, selected clip actions, no-selection disabled states, and unknown tool diagnostics.

## 3. Right Dock Task Stack

- [x] 3.1 Update `SidePanel` and side panel item contracts so basic mode exposes AI, Inspector, Presets, Recording, and Export while professional mode adds Effects and Markers/Regions.
- [x] 3.2 Implement `AudioInspectorPanel` for clip, track, marker/region, and master scopes using typed audio operations and existing `@neko/ui` composition primitives where appropriate.
- [x] 3.3 Implement `EffectsMiniRack` for track/master effect chains with compact rows, supported/planned-only/unsupported states, and canonical effect operation routing.
- [x] 3.4 Implement `MarkersRegionsPanel` with marker/region list, navigation, create/update/remove actions, and consistency with the timeline marker lane.
- [x] 3.5 Add tests for mode-gated panel visibility, inspector scope projection, effect support diagnostics, and marker/region operations.

## 4. AI Operation And Review Workflow

- [x] 4.1 Implement `AudioAiOperationPanel` with quick actions, natural-language input, operation status rows, target labels, cancel/retry affordances where supported, and affected id display.
- [x] 4.2 Wire AI quick actions to existing audio commands or Agent audio project tool paths without adding a Webview-owned project mutation path.
- [x] 4.3 Implement `AiResultCompare` states for previewable, apply-only, unsupported, failed, and stale-result cases.
- [x] 4.4 Ensure AI operation highlights and review actions use stable track, element, effect, marker, or operation ids and reject Webview URI/blob/temp/cache identities as durable refs.
- [x] 4.5 Add tests for AI quick action lifecycle, failed/unsupported operations, affected-id highlights, A/B preview availability, and apply-only labeling.

## 5. Mixer, Master, Loudness, And Export Readiness

- [x] 5.1 Extend the compact bottom mixer or master strip with `MasterLoudnessStrip` placement for peak, LUFS, clipping, and export-readiness state.
- [x] 5.2 Wire loudness analysis entry and result projection through existing `audio:analyze` and store state without implying readiness before analysis exists.
- [x] 5.3 Align Export panel summary with master/loudness diagnostics so export readiness is visible from both the mixer/master area and Export task panel.
- [x] 5.4 Add tests for available, pending, unavailable, and clipping/target loudness diagnostics.

## 6. Layout, Styling, Accessibility, And I18n

- [x] 6.1 Apply responsive layout rules so new controls fit inside VS Code Webview widths, right dock resizing, light/dark/high-contrast themes, and compact editor heights without overlap.
- [x] 6.2 Add keyboard and focus handling for timeline tools, selection actions, right dock tabs, AI input, and inspector fields so text inputs do not steal transport shortcuts.
- [x] 6.3 Add English and Chinese i18n strings for all new labels, tooltips, statuses, diagnostics, and panel titles.
- [x] 6.4 Update `packages/neko-audio/README.md` or domain docs to describe the lightweight AI DAW component model and explicit non-goals.

## 7. Validation

- [x] 7.1 Run focused `neko-audio` Webview tests for stores, timeline components, right dock panels, AI operation panel, effects mini rack, markers/regions, and master/loudness strip.
- [x] 7.2 Run focused Extension tests if any command or message routing changes are required.
- [x] 7.3 Run `pnpm --filter @neko/neko-audio test` or the repository's equivalent focused package test command and record the exact command.
- [x] 7.4 Run `pnpm check` or document why a narrower validation set is sufficient for this UI-focused change.
- [x] 7.5 Run a real VS Code Webview functional scenario with `vscode-extension-debugger` evidence for opening a `.nka`, switching basic/professional modes, selecting a clip, using the selection action bar, resizing the right dock, typing in the AI panel, and verifying theme/focus behavior.
- [x] 7.6 Run `openspec validate introduce-audio-ai-daw-workbench-components --type change --strict`.
