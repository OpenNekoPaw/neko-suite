## Context

`standardize-webview-vscode-bridge` removed the most urgent Webview transport duplication and added guardrails for legacy bridge fallback. The remaining audit findings are broader Webview foundation duplication:

- i18n bootstrap is repeated across almost every Webview as `new I18nService(detectWebviewLocale())`, local `registerAll`, and repeated `t` / `setLocale` wrappers.
- ErrorBoundary implementations are duplicated across Agent, Canvas, Cut, Market, Model, Preview, and Story; Market still logs with `console.error`.
- Webview logger setup varies between `createLoggerRegistry` and package-local `ConsoleLogger` root singletons; Live still has production `console.error`.
- Engine media stream lifecycle repeats `FrameScheduler`, `H264StreamClient`, `AudioStreamClient`, reconnect, dispose, and error handling across Preview, Cut, Canvas, Live, Model, Puppet, Audio, and Tools.
- Time formatting helpers repeat even though `@neko/neko-client` already exports `formatTime` and `formatTimePrecise`.
- Keyboard/focus handling is partially unified in `@neko/ui/keyboard`, but Agent still owns an older reporter and Sketch still has a local editable-target helper.

This change is L2 Webview + L0/L2 shared foundation work. It must not move domain business rules, durable project data, Engine authority, or Extension-owned resource authorization into shared UI helpers.

### Five-layer analysis

| Layer | Analysis |
| --- | --- |
| Responsibility | `@neko/shared` owns host-agnostic i18n, logger, and error contracts. `@neko/ui` owns React/DOM ErrorBoundary and keyboard/focus primitives. `@neko/neko-client` owns media stream clients, lifecycle helpers, and media time formatting. Feature Webviews own domain copy, local message unions, editor state, and package-specific UI composition. |
| Dependency | Shared helpers must not import feature packages or Extension implementations. React-dependent primitives live in `@neko/ui`; DOM-only helpers may live in shared subpaths. Stream lifecycle helpers may depend on `@neko/neko-client` clients but not on Webview components or Extension Host code. |
| Interface | Interfaces should be small and adapter-based: bundle maps for i18n, package name/log level for logger, render slots for ErrorBoundary, stream descriptors/callbacks for media lifecycle, formatting options for time labels, and reporter ports for keyboard/focus. |
| Extension | New Webviews should bootstrap i18n/logger/ErrorBoundary/keyboard with one shared factory or primitive and add domain-specific bundles/copy only. New Engine stream players should compose a lifecycle controller instead of hand-rolling H264/audio/scheduler cleanup. |
| Testing | Shared unit tests cover factory output, locale changes, logger child naming, ErrorBoundary logging/retry rendering, stream controller disposal/reconnect/error cases, time formatting variants, and keyboard/focus behavior. Package focused tests confirm migrated entry points retain current labels/messages and no production `console.*` or duplicate foundation patterns remain. |

## Goals / Non-Goals

**Goals:**

- Add a reusable `createWebviewI18n`-style helper that registers locale bundle maps and exposes the service plus `t`, `setLocale`, and `getLocale`-style adapters where packages need them.
- Standardize package Webview logger setup on a shared registry/factory pattern and remove production direct `console.*` logging from affected Webviews.
- Provide a shared React ErrorBoundary primitive or factory that logs through `ILogger`, supports fallback content/retry, and can be wrapped by package-specific UI when needed.
- Extract a common Engine A/V stream lifecycle abstraction that centralizes scheduler/client creation, reconnect, cleanup, and error callback semantics without owning editor-specific playback policy.
- Migrate generic media display time formatting to `@neko/neko-client` helpers or extend those helpers where existing generic variants are missing.
- Replace remaining local keyboard/focus reporters and editable-target helpers with `@neko/ui/keyboard`.
- Add practical guardrails for the most repeatable violations: production direct `console.*`, local `acquireVsCodeApi` already handled by bridge checks, local editable-target helpers, and repeated i18n/logger bootstrap patterns where static checks are reliable.

**Non-Goals:**

- Move domain-specific translation keys or copy into shared packages.
- Force subtitle timecode, musical bar/beat display, task duration, relative chat timestamps, export ETA, or other domain-specific time labels into one formatter.
- Replace all media player UI components with one visual component.
- Change Engine stream protocols, codecs, descriptors, or server-side reconnect behavior.
- Change Webview/Extension message payload semantics except where a package-local helper is removed after all callers migrate.

## Decisions

1. **Create shared Webview i18n bootstrap, not a global i18n singleton.**
   - Each Webview keeps its own `I18nService` instance and bundle ownership.
   - A shared helper should accept locale bundle maps and optional namespace/default locale, register all bundles, and return a small adapter.
   - Alternative considered: one global cross-package Webview i18n registry. Rejected because independent Webviews load separate bundles and should not couple package keys.

2. **Use `createLoggerRegistry` as the canonical package logger pattern.**
   - Existing package-local root logger modules can remain only as thin facades that call a shared factory.
   - Production components should call package loggers, not `console.*`.
   - Alternative considered: allow each package to create `new ConsoleLogger(...)`. Rejected because this repeats setup, makes test injection inconsistent, and already caused direct console usage.

3. **Put React ErrorBoundary primitives in `@neko/ui`, with logging contracts from `@neko/shared`.**
   - `@neko/shared` remains React-free.
   - The shared boundary should provide common catch/log/retry behavior and allow package-specific title/body/actions or fallback component props.
   - Alternative considered: keep one ErrorBoundary per package. Rejected because the implementations differ mostly in styling/copy, while logging and lifecycle are duplicated.

4. **Add stream lifecycle helpers in `@neko/neko-client` as controllers/hooks-adjacent primitives, not feature UI.**
   - Core lifecycle should own client/scheduler creation, reconnect/dispose ordering, and status/error callbacks.
   - Feature Webviews still own canvas rendering, controls, stream descriptor requests, volume policy, playback state, and domain-specific fallback UI.
   - Alternative considered: one universal `EngineStreamPlayer` React component. Rejected because Preview, Cut, Canvas, Live, Model, Puppet, Audio, and Tools need different UI and stream policies.

5. **Treat time formatting as layered.**
   - Generic media `M:SS`, `H:MM:SS`, and precise variants belong in `@neko/neko-client`.
   - Domain-specific formatters stay local when they encode subtitle formats, musical tempo/bar-beat, export ETA wording, task/agent relative time, or localized prose.
   - Alternative considered: replace all `formatTime` functions by name. Rejected because same names currently represent different semantics.

6. **Adopt `@neko/ui/keyboard` as the only Webview keyboard/focus primitive.**
   - Package-local wrappers may remain only when they add domain policy on top of shared keyboard/focus primitives.
   - Local copies of editable-target detection should be deleted after callers migrate.
   - Alternative considered: keep Agent/Sketch local implementations. Rejected because the shared primitive already covers editable target, focus reporting, keyboard focus messages, and dispatcher basics.

7. **Use staged migration with high-value guardrails.**
   - First add shared helpers and tests, then migrate simplest packages, then heavier stream players, then delete old wrappers.
   - Guardrails should start with low false-positive checks: production direct `console.*`, local `window.acquireVsCodeApi` already covered, package-local `isEditableTarget` copies, and known i18n/logger bootstrap patterns.
   - Alternative considered: one broad duplicate-code detector. Rejected because it would create noisy findings for legitimate domain-specific code.

## Risks / Trade-offs

- [Risk] Shared helpers become too generic and hard to use. -> Mitigation: keep contracts adapter-based and migrate real packages during the change to prove ergonomics.
- [Risk] Stream lifecycle abstraction hides domain playback differences. -> Mitigation: shared controller owns lifecycle only; UI, playback policy, descriptors, and domain fallback remain in owning packages.
- [Risk] Time formatter migration changes visible labels. -> Mitigation: snapshot current generic labels before migration and keep domain-specific formatters local when semantics differ.
- [Risk] ErrorBoundary fallback UI becomes visually inconsistent or too bland. -> Mitigation: share lifecycle/logging and accessible recovery actions while allowing package fallback slots/classes.
- [Risk] Static guardrails block legitimate code or tests. -> Mitigation: scope to production Webview source, add explicit test/story exclusions, and document any approved exception with owner/removal condition.
- [Risk] Large multi-package migration conflicts with parallel work. -> Mitigation: migrate in small groups with focused tests and avoid touching unrelated domain logic.

## Migration Plan

1. Add shared i18n bootstrap, logger facade helper, ErrorBoundary primitive, media time formatting extensions, keyboard/focus adoption tests, and stream lifecycle controller tests.
2. Migrate low-risk packages first:
   - i18n/logger/ErrorBoundary: Dashboard, Market, Story, Preview.
   - time formatting: Preview/Canvas already mostly canonical; migrate Tools/Agent/Audio/Cut only for generic media labels.
   - keyboard/focus: Agent reporter and Sketch editable-target helper.
3. Migrate stream lifecycle in stages:
   - Preview video/audio/panorama,
   - Canvas inline media and narrative preview runtime,
   - Cut PreviewPanel,
   - Live/Model/Puppet/Tools where lifecycle patterns match.
4. Delete obsolete local helpers once all production callers move.
5. Add or extend guardrails and quality checks.
6. Run focused package tests, shared tests, dependency/boundary checks, `pnpm check:webview-boundaries`, `pnpm check:quality` or documented equivalent, and `pnpm smoke:webview:runtime` for representative migrated runtime paths.

## Rollback Strategy

Rollback is package-local for most migrations: a package can temporarily restore its local facade while shared helpers remain available. Stream lifecycle rollback should be per player/editor to avoid disrupting unrelated Webviews. No project file or durable data migration is expected.

## Open Questions

- Should React ErrorBoundary live in `@neko/ui` root exports or a narrower `@neko/ui/error-boundary` subpath?
- Should stream lifecycle helpers be pure classes/controllers only, or should `@neko/neko-client` expose optional React hooks from a browser-only subpath?
- Which production `console.*` usages outside Webview source should become part of a broader quality gate later?
