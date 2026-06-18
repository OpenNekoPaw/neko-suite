# Webview Foundation Duplication Audit

Date: 2026-06-18

This audit records the duplicate Webview foundation surfaces that the change must migrate or explicitly retain as thin package/domain facades. It is based on `rg` over production Webview source, excluding `dist`, tests, and fixtures.

## Summary

| Area | Shared owner | Current duplicate packages | Decision |
| --- | --- | --- | --- |
| i18n bootstrap | `@neko/shared/i18n/webview` | Agent, Audio, Canvas, Cut, Dashboard, Live, Market, Model, Preview, Puppet, Sketch, Story, Tools | Add `createWebviewI18n`; migrate package `i18n/index.ts` while preserving existing `i18nService`, `t`, `setLocale`, `getLocale`, and package-specific `detectLocale` exports. |
| logger setup | `@neko/shared/logger` | Audio, Canvas, Cut, Market, Preview, Story, Tools use local `ConsoleLogger`; Agent and Model already use `createLoggerRegistry`. | Keep package-local logger modules only as thin registry facades; direct `new ConsoleLogger(...)` in Webview packages should disappear except inside shared logger implementation/tests. |
| ErrorBoundary | `@neko/ui/error-boundary` | Agent, Canvas, Cut, Market, Model, Preview, Story | Add shared React ErrorBoundary with injected logger/fallback/reset behavior; migrate packages to thin wrappers or direct primitive. Model may keep error-handler integration as wrapper callback. |
| production `console.*` | package logger facade | Market ErrorBoundary, Live AvatarViewer | Replace direct production logging with package logger calls; guardrail should fail new direct Webview `console.*`. |
| stream lifecycle | `@neko/neko-client` | Preview, Canvas, Cut, Live, Model, Puppet, Audio, Tools | Add lifecycle controller/helper that owns scheduler/client creation and deterministic disposal. Migrate matching A/V paths; retain domain-specific rendering/playback policy local. |
| generic media time formatting | `@neko/neko-client` | Audio, Tools, Agent media preview, Cut generic preview/speed/timeline utilities, Canvas narrative preview runtime, Live recording elapsed | Reuse/extend `formatTime` variants for ordinary media labels. Keep subtitle, bar/beat, export ETA, chat relative time, task duration, localized prose local. |
| keyboard/focus | `@neko/ui/keyboard` | Agent local `useWebviewKeyboardReporting`; Sketch local `utils/editable-target.ts` | Replace Agent implementation with a delegating wrapper. Delete Sketch editable-target copy after callers use shared helper. |

## Package Findings

### Agent

- i18n: `packages/neko-agent/packages/webview/src/i18n/index.ts` repeats `new I18nService(detectWebviewLocale())`, local `registerAll`, `t`, `setLocale`, `getLocale`, and `detectLocale`.
- logger: `packages/neko-agent/packages/webview/src/utils/logger.ts` already uses `createLoggerRegistry('NekoAgent', LogLevel.Warn)`.
- ErrorBoundary: `components/ErrorBoundary.tsx` has local class, logger call, fallback UI, and reset.
- time: `MediaPreview/AudioCard.tsx` and `MediaPreview/VideoCard.tsx` define ordinary `M:SS` duration formatters. Chat timestamps, task durations, and content-block duration ranges are domain-specific and remain local.
- keyboard/focus: `hooks/useWebviewKeyboardReporting.ts` duplicates `@neko/ui/keyboard/focused-webview` behavior and local editable-target detection.

### Audio

- i18n: `src/i18n/index.ts` repeats service construction, bundle registration, `t`, `setLocale`, and `getLocale`.
- logger: `src/utils/logger.ts` creates a local `ConsoleLogger('NekoAudio')`.
- stream lifecycle: `hooks/useAudioPlayback.ts` owns `AudioStreamClient` creation/disposal and fade-out behavior. Audio-only playback policy remains package-owned; stream client lifecycle can use shared factories/controllers where semantics match.
- time: `components/TransportBar.tsx` and `components/RecordingPanel.tsx` define ordinary `M:SS` labels. `utils/beatGrid.ts` bar/beat formatting is domain-specific and remains local.

### Canvas

- i18n: `src/i18n/index.ts` repeats single-namespace bootstrap plus `t`/`setLocale`.
- logger: `src/utils/logger.ts` creates a local `ConsoleLogger('NekoCanvas')`.
- ErrorBoundary: `components/ErrorBoundary.tsx` has local class/fallback/reset.
- stream lifecycle: `components/media/InlineVideoPlayer.tsx`, `InlineAudioPlayer.tsx`, and `preview/narrativePreviewMediaRuntime.ts` create `FrameScheduler`, `H264StreamClient`, and `AudioStreamClient` directly.
- time: inline players already import `formatTime` from `@neko/neko-client`; narrative preview runtime has a local generic `formatTime`. Storyboard duration labels are content/domain presentation and should be reviewed before migrating.
- keyboard/focus: Canvas already imports `hasEditableActiveElement` and keyboard focus message helpers from `@neko/ui/keyboard`.

### Cut

- i18n: `src/i18n/index.ts` repeats service construction and `registerAll`.
- logger: `src/utils/logger.ts` creates a local `ConsoleLogger('NekoCut')`.
- ErrorBoundary: `components/ErrorBoundary/ErrorBoundary.tsx` owns local class, fallback slot, `onError`, and reset behavior.
- stream lifecycle: `components/PreviewPanel/PreviewPanel.tsx` creates scheduler/video/audio clients directly and owns preview volume/mute and stats policy.
- time: `utils/index.ts`, `utils/speed.ts`, and generic parts of `utils/timelineUtils.ts` overlap with media formatter helpers. Subtitle parser/editor/panel timecode and export ETA/prose are domain-specific and remain local.
- keyboard/focus: App and shortcuts already use shared keyboard helpers/messages in several paths; behavior must be verified after shared primitive adoption.

### Dashboard

- i18n: `src/i18n/index.ts` repeats `I18nService`, Webview locale detection, and local `registerAll`.
- logger/ErrorBoundary/stream/time/keyboard: no duplicate foundation implementation identified in current production Webview source.

### Live

- i18n: `src/i18n/index.ts` repeats single-namespace bootstrap and only exports `t`.
- production console: `components/AvatarViewer.tsx` uses `console.error` on VRM load failure.
- stream lifecycle: `App.tsx` directly owns `H264StreamClient` lifecycle for live compositor video.
- time: `components/TrackingPanel.tsx` has a local elapsed-recording formatter. This is generic elapsed display but uses millisecond input, so shared helper should expose a clear seconds/ms adapter before migration.

### Market

- i18n: `src/i18n/index.ts` repeats service construction and `registerAll`.
- logger: `src/utils/logger.ts` creates local `ConsoleLogger('NekoMarket')`.
- ErrorBoundary/console: `components/ErrorBoundary.tsx` has local class and direct `console.error`; this must be replaced with logger-backed shared behavior.

### Model

- i18n: `src/i18n/index.ts` repeats single-namespace bootstrap plus `t`/`setLocale`.
- logger: `src/platform/logger.ts` already uses `createLoggerRegistry('NekoModelWebview')`.
- ErrorBoundary: `components/ErrorBoundary.tsx` owns local fallback and delegates to `webviewErrorHandler`; keep only as thin wrapper/callback over shared boundary.
- stream lifecycle: `components/VideoViewport.tsx` directly owns `H264StreamClient` lifecycle and model-specific viewport rendering.
- keyboard/focus: message contracts include `keyboardFocus`, `webviewKeyboardFocus`, and `webviewKeyboardEditable`; existing behavior must be preserved.

### Preview

- i18n: `src/i18n/index.ts` repeats service construction and `registerAll`.
- logger: `src/utils/logger.ts` creates local `ConsoleLogger('NekoPreview')`.
- ErrorBoundary: `components/ErrorBoundary.tsx` has local class/fallback/reset.
- stream lifecycle: `video/VideoPlayer.tsx`, `audio/AudioPlayer.tsx`, and `panorama-video/main.tsx` create video/audio/scheduler clients directly and have reconnect/error/disposal logic.
- time: player controls already use `formatTime` from `@neko/neko-client` in the canonical path.

### Puppet

- i18n: `src/i18n/index.ts` repeats single-namespace bootstrap and `setLocale`.
- stream lifecycle: `animation/puppet-controller.ts` directly owns `H264StreamClient` lifecycle for puppet rendering. This path has domain-specific controller ownership and should be migrated only where the shared lifecycle controller does not obscure puppet animation policy.

### Sketch

- i18n: `src/i18n/index.ts` repeats single-namespace bootstrap plus `t`/`setLocale`.
- keyboard/focus: `utils/editable-target.ts` is a local editable-target copy; production callers mostly already import `@neko/ui/keyboard`, but `App.tsx` still imports shared helpers and the local file can be deleted once no imports remain.

### Story

- i18n: `src/i18n/index.ts` repeats single-namespace bootstrap plus `t`/`setLocale`.
- logger/ErrorBoundary: `components/ErrorBoundary.tsx` creates `new ConsoleLogger('ErrorBoundary')` locally and owns fallback/reset.
- time: no generic media formatter duplication identified in current production Webview source.

### Tools

- i18n: `src/i18n/index.ts` repeats service construction and `registerAll`.
- logger: `useAudioDiffPlayback.ts`, `useVideoDiffStreaming.ts`, `VideoFrameRenderer.tsx`, and `VideoDiffViewer.tsx` create local `ConsoleLogger` instances; `runtime/streamClientFactory.ts` is already a local factory seam for tests.
- stream lifecycle: media diff hooks own multiple audio/video stream clients and diff-specific pairing policy. Shared lifecycle helpers can be used for individual stream client creation/disposal, but pairing/render diff policy remains local.
- time: `MediaDiff/audio/audioUtils.ts`, `DiffControls.tsx`, and `VideoDiffViewer.tsx` define ordinary `M:SS` labels.

## Guardrail Targets

- Production Webview `console.log`, `console.error`, `console.warn`, `console.info`, and `console.debug` outside approved tests/dev diagnostics.
- Webview i18n bootstrap patterns: `new I18nService(detectWebviewLocale())`, local `registerAll(...)` bundle loops after migration.
- Webview logger bootstrap patterns: package-local `new ConsoleLogger(...)` outside shared logger implementation/tests and documented exceptions.
- Package-local editable-target helpers or imports of obsolete Agent keyboard reporter after migration.

## Retained Domain-Specific Surfaces

- Subtitle timecode parsing/formatting and subtitle editor input formatting in Cut.
- Audio bar/beat formatting in Audio.
- Export ETA/progress prose in Cut.
- Agent chat relative timestamps, task durations, and localized content summary prose.
- Feature-specific stream rendering, playback controls, preview policy, diff pairing, puppet animation policy, and model viewport policy.

## Stream Lifecycle Retained Exceptions

These exceptions are intentionally not compatibility fallbacks. They remain package-owned because their lifecycle semantics do not yet match the shared A/V stream helper introduced by this change.

| Package/path | Owner | Reason retained | Replacement / extraction condition | Validation |
| --- | --- | --- | --- | --- |
| `neko-audio/packages/webview/src/hooks/useAudioPlayback.ts` audio editor stream | Audio Webview | Audio editor owns single-file playback clock, editor store synchronization, volume/mute policy, and does not duplicate video scheduler/H.264 lifecycle. | Migrate to `EngineAvStreamLifecycle` only after audio editor playback tests cover stream replacement and after the helper exposes audio-only ergonomics without obscuring store-driven playback policy. | Audio focused tests cover transport/recording labels in this change; audio playback hook remains a documented audio-only exception. |
| `neko-live/packages/webview/src/App.tsx` live compositor stream | Live Webview | Single realtime Route-A video stream tied to live compositor scene creation/teardown and frame metadata bridging; no audio/scheduler lifecycle duplication beyond video client ownership. | Migrate when `EngineAvStreamLifecycle` supports Route-A render stream descriptors plus live compositor status/error policy without hiding scene ownership. | `rg "new H264StreamClient" packages/neko-live/packages/webview/src/App.tsx` remains the documented exception; no `AudioStreamClient`/`FrameScheduler` copy. |
| `neko-model/packages/webview/src/components/VideoViewport.tsx` Route-A viewport | Model Webview | Model viewport owns presentation queue, RAF/timer presentation policy, backpressure, route fallback, and `webviewErrorHandler` integration. | Extract only after a shared Route-A video-only lifecycle/presentation adapter exists; current A/V helper is intentionally lifecycle-only and does not own model presentation policy. | Model TypeScript checks and route fallback tests remain responsible for this path. |
| `neko-puppet/packages/webview/src/animation/puppet-controller.ts` H.264 preview | Puppet Webview | H.264 stream is optional and deliberately falls back to JSON preview on disconnect/error/end. That failover is domain controller policy, not generic A/V lifecycle. | Migrate when shared helper can expose fail-closed/fallback hooks without keeping a silent legacy JSON fallback inside the helper. | Puppet controller tests/preview validation must prove H.264 disconnect still enters JSON fallback. |
| `neko-tools/packages/webview/src/runtime/streamClientFactory.ts` media diff factory | Tools Webview | Tools diff owns paired A/B stream creation, independent audio/video comparison timing, and test-injected runtime factories. | Consider wrapping the factory with `EngineAvStreamLifecycle` per side only after diff hooks can model two independent lifecycle controllers without coupling A/B render policy. | Tools media diff hook tests and `runtime/streamClientFactory.ts` remain the documented factory seam. |
