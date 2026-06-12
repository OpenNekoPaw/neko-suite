## Context

Neko already has the right primitives: `PathResolver` understands relative paths, variable paths, remote URLs, and absolute paths; resource cache and local resource access separate durable identity from Webview projection; engine file access separates registered local files from runtime tokens. The failure pattern is that different packages enter those primitives with different context:

- Canvas Preview can display images through resource projection while audio/video playback sends `cases/...`, `/cases/...`, or `${WORKSPACE}/...` to engine without the same owning Canvas context.
- `EngineClient` can expand path variables when configured, but it does not know which workspace should anchor a plain relative path.
- Cut and Audio already normalize absolute paths to portable project paths on save, but their base directory semantics can diverge from workspace-root semantics.
- Preview, Agent, Story, and Assets have local resolver helpers, but some helpers choose the first VSCode workspace instead of the document-owning workspace.

The architecture should keep `PathResolver` as the L0 path utility while adding a shared host-side media path context contract around it. That keeps Webviews free of filesystem authority, keeps Extension Host as the VSCode/workspace boundary, and keeps engine/neko-client from guessing document roots.

## Goals / Non-Goals

**Goals:**

- Define one cross-package contract for workspace-relative media paths.
- Make `cases/1080P.mp4` mean "relative to the owning document's workspace root" for workspace-scoped documents.
- Keep durable project data portable: write plain workspace-relative paths when possible, variable paths for configured external roots, and document-relative paths only as compatibility/fallback.
- Require host layers to resolve and authorize media paths before Webview projection, engine registration, probe, playback, export, or indexing.
- Preserve legacy read compatibility for document-relative paths, `${WORKSPACE}` / `${PROJECT}` paths, absolute paths, and slash-prefixed portable paths that are not real files.
- Support VSCode multi-root workspaces deterministically.

**Non-Goals:**

- Do not make Webviews resolve filesystem paths or import VSCode APIs.
- Do not make `neko-engine` infer workspace roots from string paths.
- Do not migrate every existing project file in place.
- Do not replace stable resource refs, document archive refs, engine tokens, or resource cache manifests.
- Do not require all packages to persist `${WORKSPACE}/...` for new local project media.

## Decisions

### D1: Persist plain workspace-relative paths by default

New durable project paths inside the owning workspace should be stored as `cases/a.mp4`, not `${WORKSPACE}/cases/a.mp4`.

Rationale: plain relative paths are shorter, portable, and already supported by `PathResolver.resolveSource(src, projectDir)` when the correct `projectDir` is supplied. `${WORKSPACE}` remains useful at API/message boundaries where context might be lost, but it should not become noise in every saved document.

Alternative considered: always persist `${WORKSPACE}/...`. This would make root intent explicit but would increase churn, create ambiguity in multi-root windows unless the owning workspace is also serialized, and still require a resolver context.

### D2: Resolve with an explicit `MediaPathResolutionContext`

Add a shared host-side contract around `PathResolver`:

```text
MediaPathResolutionContext
  sourceDocumentUri?
  owningWorkspaceRoot?
  workspaceRoots[]
  documentDir?
  pathVariables
  allowedRoots
```

The resolver should produce typed outcomes:

```text
durableRef -> existingLocalFile | remoteUrl | unresolved | unauthorized
```

Rationale: the hard part is not string expansion, it is choosing the correct root and authorization policy. A context object makes ownership explicit and testable.

Alternative considered: teach `EngineClient` to resolve all relative paths. This would couple a low-level client to VSCode/document ownership and would still not help Webview projection or save-time contraction.

### D3: Use deterministic multi-root precedence

When a path is unqualified or uses `${WORKSPACE}`/`${PROJECT}`, resolution order should be:

1. Owning workspace root for the source document.
2. Other open workspace roots in VSCode order.
3. The source document directory as legacy fallback.
4. Configured media-library variables and explicit non-workspace path variables.

Only existing local files may become engine/playback inputs.

Rationale: the owning document is the strongest signal, but old documents may have been saved relative to the document directory. Other open roots are compatibility candidates, not canonical ownership.

Alternative considered: use the first VSCode workspace globally. This is the current drift source and fails when a Canvas or Story file belongs to a different root.

### D4: Separate durable source refs, display URLs, and playable paths

Packages should keep three concepts separate:

- Durable source ref: persisted path/resource/document identity.
- Display URL: Webview-safe URI, blob URL, or safe inline URL for rendering.
- Playable/access path: existing local file path, engine file token, or media session descriptor for probe/play/export.

Rationale: image display can succeed through a preview URL while video playback fails because the playable source was not resolved. Naming and protocol separation make this class of bug visible.

Alternative considered: reuse `previewUrl` as playback input. This breaks engine playback, persistence, and content security boundaries.

### D5: Engine-facing calls receive resolved inputs only

Before `neko-client` or engine receives a media source, the host layer must either register the existing local file through file access or pass a validated local path during compatibility migration. Unresolved relative strings and unexpanded variables are invalid at this boundary.

Rationale: engine is the execution authority, not the VSCode workspace resolver. It should validate local files and tokens, not guess project roots.

Alternative considered: keep accepting raw strings everywhere for compatibility. This preserves the current failure mode and makes tests unable to assert which layer owns resolution.

### D6: Phased adoption starts with broken playback chains

Implementation should start with packages that directly touch playback/probe:

1. Canvas Preview and inline media playback.
2. `neko-client`/engine file-access guardrails.
3. `neko-preview` document/media preview.
4. `neko-assets` path variable/contract commands.
5. Cut and Audio project save/load/playback paths.
6. Story storyboard media transfer and preview.

Rationale: this fixes user-visible playback first while keeping the contract reusable for later model/puppet/sketch asset paths.

## Risks / Trade-offs

- Multi-root ambiguity -> Prefer owning workspace root, log diagnostics for multiple existing matches, and avoid silently rewriting persisted paths to a different root.
- Legacy document-relative files -> Keep document-directory fallback for reading, but save back to workspace-relative form only when the existing file is inside the owning workspace.
- External media libraries -> Use configured variables through `neko-assets.contractPath`; if no variable exists, preserve document-relative fallback or report that the media should be imported/linked.
- Security drift -> All Webview projections still go through local resource access; all engine calls still go through file existence and allowed-root checks.
- API churn -> Introduce the resolution context as a small shared contract and adapter helpers rather than adding package-specific resolver signatures everywhere.

## Migration Plan

1. Add shared types and resolver helpers in a layer that can be used by Extension Host code without importing React or VSCode in L0.
2. Wire Canvas Preview and inline playback to produce diagnostics for unresolved paths instead of silently passing raw strings to engine.
3. Update `neko-client` tests so unresolved relative and variable paths cannot reach engine-bound file access in supported host flows.
4. Update Preview, Assets, Cut, Audio, and Story to use the same context when resolving media source refs.
5. Keep reading existing files without forcing migration. When saving touched documents, normalize only paths that can be resolved to existing files.

Rollback is straightforward because durable file formats remain compatible. Reverting implementation should not require data migration; at worst newly saved workspace-relative paths are already supported by the existing resolver when the correct base directory is supplied.

## Open Questions

- Should the shared resolver live in `@neko/shared` as pure path planning plus host adapters, or in a VSCode-only package that wraps `PathResolver`? The preferred split is pure planning in shared, VSCode root discovery in host packages.
- Should `${WORKSPACE}` be interpreted as owning workspace only, or as a candidate set? For compatibility this design treats it as a candidate set at read time but recommends owning workspace for canonical write/read decisions.
- Should cross-root media without a configured variable be allowed as document-relative fallback, or require explicit media-library registration? The initial migration can allow fallback while surfacing diagnostics.
