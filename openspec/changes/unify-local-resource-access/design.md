## Context

VSCode Webviews can only load local resources that are explicitly listed in `localResourceRoots`, and every local file URL must be projected through `webview.asWebviewUri(...)`. Neko Suite currently implements that logic repeatedly in multiple extensions. Most providers authorize extension webview assets and workspace folders, but assets can also live in external `neko-assets` media libraries, extension storage, workspace `.neko/.cache`, market install directories, or system temp directories.

The recent document-thumbnail failure exposed this architecture gap: `ReadDocument` extracted EPUB/CBZ images under a system temp directory, the Agent Webview projected those files with `asWebviewUri`, and VSCode rejected them because the temp root was not authorized. The same failure mode can happen for any local media path outside the workspace.

The relevant constraints are:

- Webview code cannot access Node.js or VSCode APIs directly.
- Extension Host code must own local path resolution and Webview URI projection.
- `neko-assets` media libraries are the user-facing authority for external asset roots.
- Stored project data should keep portable references using path variables where possible.
- Random system temp paths should not become durable Webview resources.

Five-layer analysis:

- Responsibilities: `neko-assets` owns media-library configuration, a local resource access service owns authorization/projection, Webview providers only consume resolved URIs.
- Dependencies: shared contracts stay in L0/L1-compatible packages; VSCode-specific URI and Webview APIs remain in Extension Host packages.
- Interfaces: callers request roots and projected URIs through a narrow service instead of assembling roots or calling `asWebviewUri` directly.
- Extension: new root providers can be registered for media libraries, extension caches, generated caches, market installs, or feature-specific roots.
- Testing: root aggregation, path authorization, projection, fallback behavior, and migrated providers can be tested without spinning up full Webviews.

## Goals / Non-Goals

**Goals:**

- Provide one Extension Host service for local resource roots and Webview URI projection.
- Automatically authorize configured `neko-assets` media-library roots for Webviews that display local media.
- Keep previewable transient files in controlled cache locations such as `globalStorageUri` or workspace `.neko/.cache`.
- Preserve existing media-library variables and workspace-relative path resolution.
- Migrate high-risk Webview surfaces without changing stored project file formats.
- Make unauthorized path behavior explicit and testable.

**Non-Goals:**

- Replace `PathResolver` or change the media-library configuration format.
- Grant Webviews broad access to the user home directory, filesystem root, or system temp directory.
- Move every user-level `~/.neko` state file into the workspace.
- Convert all existing absolute paths in persisted project files in this change.
- Add a new binary transport or return media bytes/base64 through tool results.

## Decisions

### Decision 1: Centralize Webview local resource access in Extension Host

Create a `LocalResourceAccessService` with a VSCode implementation. It will provide:

- `getLocalResourceRoots(options?)`
- `configureWebview(webview, options?)`
- `toWebviewUri(webview, filePath, options?)`
- `isAuthorizedPath(filePath, options?)`

Callers should no longer directly combine `localResourceRoots` or project local media paths unless they are providing an adapter around legacy behavior.

Alternatives considered:

- Keep package-local helpers: lower initial cost, but keeps the current 401 class of bugs.
- Add roots manually to each provider: safer than today but still duplicates policy and makes media-library updates hard.

### Decision 2: Use provider-based root aggregation

The service will aggregate root providers:

- extension webview dist roots,
- current workspace folders,
- `neko-assets` media-library roots,
- extension-owned preview caches,
- workspace `.neko/.cache` generated media roots,
- optional feature-specific roots for project-adjacent media where needed.

Root providers should be small interfaces so packages can register roots without depending on concrete extensions.

Alternatives considered:

- One global root list: simple but difficult to scope and refresh.
- Dynamic root registration per file: precise but more complex for existing Webview lifecycle and multiple panels.

### Decision 3: `neko-assets` exposes media-library roots

`neko-assets` will expose media-library roots through a stable command or capability provider, for example `neko.assets.getMediaLibraryRoots`. The local resource service will prefer that provider and fall back to reading workspace media-library settings only where necessary.

The returned roots are local filesystem roots after applying local overrides. They are used for authorization only; stored project references should still be contracted through media-library variables.

Alternatives considered:

- Parse `neko/settings.json` in every extension: duplicates logic and risks drift.
- Make every Webview provider depend directly on `neko-assets`: violates extension decoupling.

### Decision 4: Keep binary previews on disk and out of tool results

Tool results and inter-plugin messages will continue passing JSON references and metadata. Image/video/audio bytes are not embedded as base64 in chat history or Webview protocol messages. Previewable generated data must live in authorized cache roots.

Alternatives considered:

- Return binary/base64 directly to Webview: avoids filesystem roots but bloats messages, persistence, and memory.
- Serve files through an HTTP file server: can be useful later, but adds lifecycle and access-control surface beyond this change.

### Decision 5: Treat system temp as internal scratch only

System temp can remain acceptable for short-lived intermediate work that never reaches Webview display. Any file that must be shown in a Webview should be copied, generated, or extracted under an authorized cache root.

Alternatives considered:

- Authorize `os.tmpdir()`: broad and unstable; it can expose unrelated temporary files and still breaks if paths move.
- Store all caches in project `.neko`: good for project artifacts, but wrong for document previews and extension-private caches.

### Decision 6: Migrate incrementally by risk

Start with `neko-agent` because chat renders tool results from many sources. Then migrate shared media surfaces in `neko-canvas`, `neko-cut`, `neko-tools`, `neko-story`, `neko-model`, preview providers, and any surfaces that display external media-library files.

Alternatives considered:

- Big-bang migration across all packages: cleaner final state but higher regression risk.
- Agent-only fix: solves the recent issue but leaves the same failure class elsewhere.

## Risks / Trade-offs

- [Risk] Media-library roots can be large and authorize more files than a single preview needs. → Mitigation: authorize only configured roots, avoid home/root/temp, and preserve explicit root provider boundaries.
- [Risk] Webview roots are set at provider creation time, while media-library settings can change later. → Mitigation: expose a refresh event and update or recreate Webview options when roots change.
- [Risk] Some existing media references are absolute paths outside known roots. → Mitigation: return an explicit unresolved result and surface a clear warning/action to add the containing folder as a media library.
- [Risk] Multiple packages may need parallel migration. → Mitigation: introduce adapter helpers first, then migrate package by package with targeted tests.
- [Risk] Remote workspaces and non-file URI schemes need different handling. → Mitigation: keep this change focused on local file resources; remote sources remain pass-through URLs unless a provider handles them explicitly.

## Migration Plan

1. Add shared/local-resource contracts and VSCode Extension Host implementation.
2. Add `neko-assets` media-library root export and change notifications.
3. Replace Agent Webview local roots and local media projection with the unified service.
4. Move or route previewable Agent transient artifacts through `globalStorageUri` and workspace `.neko/.cache`.
5. Migrate Canvas, Cut, Tools diff providers, Story previews, Model previews, and media preview providers.
6. Add lint or search-based guardrails for direct `asWebviewUri(vscode.Uri.file(...))` and ad hoc `localResourceRoots` in new code.
7. Keep legacy direct projection as a temporary adapter where a package-specific migration is not yet complete.

Rollback strategy:

- The unified service can initially wrap existing roots and projection behavior.
- Each provider migration should be isolated so it can revert to prior local roots without changing persisted data.
- Cache location changes should preserve previous file references until the related session is refreshed.

## Open Questions

- Should the root export from `neko-assets` be a VSCode command, an Agent capability provider, or both?
- Should workspace `.neko/.cache` be authorized by default for all Webviews or only for media-capable Webviews?
- How should users be prompted when an absolute file path is outside all authorized roots?
- Should market install directories under `~/.neko` be authorized globally, or only for specific preview surfaces that consume installed assets?
