# ADR: Canvas Generic Container & Card Abstraction

- **Status**: Accepted / Implemented
- **Date**: 2026-05-11
- **Scope**: neko-canvas webview (`packages/neko-canvas/packages/webview/`); future `@neko/shared` promotion path documented in §5.3
- **Refines**: `adr-canvas-block-container.md` (Block + Container primitive architecture)
- **Related**: `adr-canvas-preview-boundary.md` (preview roles & runtime URL boundary), `canvas-agent-integration.md` (agent tool surface)
- **OpenSpec Change**: `canvas-generic-container-card`

---

## 1. Context

### 1.0 Implementation Status

Implemented on 2026-05-11 in the Canvas webview through OpenSpec change
`canvas-generic-container-card`. The implementation keeps the new card and action
contracts webview-local and does not change `.nkc`, protobuf, or extension-host
message contracts.

Implemented outcomes:

- Child-node slots render through `NodeCard` and `NodeCardPolicy` rather than the
  previous monolithic `ChildNodeCard` branch in `blockRendererRegistry.tsx`.
- Card previews use `CardPreviewSource` render forms and `PreviewSourceDescriptor`
  resolution, including a role-matched safe variant fast path for inline shot
  previews.
- Card actions and Scene/Gallery/Table container actions dispatch through typed
  descriptor IDs and dispatcher registries.
- Scene preset action blocks were removed; legacy `button` blocks in
  `blockRendererRegistry.tsx` are now render-only and no longer import canvas
  stores, VSCode API access, or container action dispatchers.
- `ContainerActionBar` derives child nodes from `node + allNodes` internally, so
  external callers do not inject child-node lists.

Verification completed:

- `pnpm --dir packages/neko-canvas/packages/webview exec tsc --noEmit`
- `pnpm --dir packages/neko-canvas/packages/webview test`
- `pnpm --dir packages/neko-canvas/packages/webview build`

### 1.1 Current Architecture

Before this ADR was implemented, neko-canvas had two parallel abstractions for
composable nodes:

- **ContainerPolicy** — constrains which children a container accepts, how children are deleted, and the layout mode. Five built-in policies: `scene`, `gallery`, `table`, `artboard`, `group`. Well-factored: policies are declarative, registered in a central registry (`containerPolicies.ts:8`), and evaluated at runtime by `canContainerAcceptChild()`.
- **ChildNodeCard** — renders child nodes inside a container's content area. A single monolithic component (`blockRendererRegistry.tsx:245`) with `if/else` branches for every node type, mixing rendering logic for media (image/video/audio), shot (generation history), and fallback (icon).

The container-side abstraction is policy-driven; adding a new container type means registering a new policy. The card-side abstraction is **not** factored; adding a new node type requires modifying `ChildNodeCard`, `resolveChildDisplayTitle`, `getMediaTypeIcon`, `getChildInlinePreview`, and `getChildAssetPath`.

### 1.2 The Insight

> **Container = Generic Container + Constraint Policy**
> **Card = Generic Card + Constraint Policy**

Scene, gallery, table, artboard, and group are all the same generic container with different constraints. Similarly, media card, shot card, annotation card, and text card are all the same generic card with different constraints.

### 1.3 Problems with Previous Card Rendering

| Problem | Symptom |
|---------|---------|
| **Monolithic dispatch** | `ChildNodeCard` uses `if (child.type === 'media')` branches — grows linearly with node types |
| **No extension point** | Adding a new node type requires modifying 5+ helper functions in `blockRendererRegistry.tsx` |
| **Mixed concerns** | Title resolution, preview source description, action handling, badge logic all in one file |
| **Inconsistent preview** | Audio shows waveform, video shows frame+play, image shows thumbnail — but shot, annotation, text have no structured preview strategy |
| **No card-level actions** | Only "remove" action exists; no extensible action slot for "generate", "open preview", "edit" per card type |
| **Preview contract gap** | Existing `PreviewSourceDescriptor` (`preview/types.ts:8`) already carries `AssetIdentityCapability` + `CanvasPreviewRole` + `variants`, but `ChildNodeCard` doesn't use it — instead it reinvents ad-hoc asset resolution |

---

## 2. Design: Two-Layer Abstraction

### 2.1 Generic Container (already exists, minor gaps)

```
GenericContainer
├── Capabilities: childIds, layout, acceptedChildren, deleteBehavior
├── Constraint Layer: ContainerPolicy (registered, declarative)
├── Layout Layer: CSS grid/sequence/table/manual (driven by policy.layoutMode)
├── Action Layer: ContainerActionDescriptor[] (currently hardcoded per preset)
└── Child Rendering: delegates to NodeCard system
```

**Gap**: Container-specific actions (scene: assign/layout/generate; gallery: generate; table: add row/col) are hardcoded in `NodeContentDispatcher` (`NodeContentDispatcher.tsx:67`) and preset `createContent` (`canvasPresetRegistry.ts:203`). These should be **declarative** in the preset definition and rendered by a generic action bar.

### 2.2 Generic Card (NodeCard)

```
NodeCard
├── Preview Slot: resolves preview from PreviewSourceDescriptor (async, via hook)
├── Metadata Slot: title + subtitle + badges (sync, pure)
├── Action Slot: typed actions with dispatcher registry
└── Constraint Layer: NodeCardPolicy (registered per nodeType)
```

### 2.3 NodeCardPolicy Interface

**Design principles**:

1. Policy produces **pure view models** — no runtime URLs, no React elements, no side effects
2. Preview source reuses the existing `PreviewSourceDescriptor` contract from the webview preview system
3. Actions use **enumerated condition predicates**, not function references, for serializability
4. Runtime resource resolution lives in slot components via hooks

**Type layer boundary**: In Phase 1, all new types (`NodeCardPolicy`, `CardPreviewSource`, etc.) live in the **webview layer** (`neko-canvas/packages/webview/`). `PreviewSourceDescriptor` is already a webview-local type (`preview/types.ts:8`), not `@neko/shared`. See §5.3 for future promotion path.

```typescript
// ---- Policy layer (pure, sync, testable, webview-local) ----

interface NodeCardPolicy {
  readonly nodeType: CanvasNodeType;

  // Preview — describes WHAT to show using the existing preview contract.
  // Consumed by CardPreviewSlot which handles async resolution.
  resolvePreviewSource(node: CanvasNode): CardPreviewSource;

  // Metadata — pure data extraction
  resolveTitle(node: CanvasNode, parent?: CanvasNode): string;
  resolveSubtitle?(node: CanvasNode): string | undefined;
  resolveBadges?(node: CanvasNode): readonly CardBadge[];

  // Actions — typed action descriptors (no callbacks)
  resolveActions?(node: CanvasNode, parent?: CanvasNode): readonly CardActionDescriptor[];
}
```

### 2.4 CardPreviewSource — Discriminated Union with Existing Preview Contract

**Key design**: `CardPreviewSource` is a **discriminated union** on `renderForm`. Each variant only carries fields relevant to its render form — invalid combinations are statically rejected.

The `renderForm` field selects one of a **fixed set of visual renderers**. The semantic meaning of the content is carried by `CanvasPreviewRole` (already 14 roles defined in `canvas-layered.ts:186`). New node types map to existing render forms — they don't add new ones.

`PreviewSourceDescriptor` (from `preview/types.ts:8`) is a webview-local type. Phase 1 references it directly; see §5.3 for future `@neko/shared` promotion path.

**Inline data URLs (e.g., shot generation history)**: Rather than a separate `inlineDataUrl` field, inline content is represented as a `PreviewSourceDescriptor` with a role-matched `variants[].sourcePath` set to the data URL. This is consistent with how `canvasPresetRegistry.ts` already constructs preview sources for safe URLs, and avoids a type contradiction where `asset-thumbnail` is required to have `source` but shots have no external asset.

```typescript
// Fixed set of visual render forms. New node types pick one of these;
// they do NOT add new forms. Semantic meaning lives in CanvasPreviewRole.
type CardPreviewRenderForm =
  | 'asset-thumbnail'    // image/video poster — resolves via PreviewResolver
  | 'media-poster'       // video/model with play overlay
  | 'waveform'           // audio compact waveform visualization
  | 'text'               // text excerpt
  | 'icon'               // fallback icon
  | 'none';              // hidden

// ---- Discriminated union — each variant carries only valid fields ----

interface AssetPreviewSource {
  readonly renderForm: 'asset-thumbnail';
  readonly aspectRatio: '3/2' | '16/9' | '1/1';
  readonly source: PreviewSourceDescriptor;      // required — may contain inline variants
}

interface MediaPosterPreviewSource {
  readonly renderForm: 'media-poster';
  readonly aspectRatio: '3/2' | '16/9' | '1/1';
  readonly source: PreviewSourceDescriptor;      // required
}

interface WaveformPreviewSource {
  readonly renderForm: 'waveform';
  readonly waveformStyle?: 'bars' | 'line';
}

interface TextPreviewSource {
  readonly renderForm: 'text';
  readonly textExcerpt: string;                  // required
}

interface IconPreviewSource {
  readonly renderForm: 'icon';
  readonly icon: string;                         // required
}

interface NonePreviewSource {
  readonly renderForm: 'none';
}

type CardPreviewSource =
  | AssetPreviewSource
  | MediaPosterPreviewSource
  | WaveformPreviewSource
  | TextPreviewSource
  | IconPreviewSource
  | NonePreviewSource;
```

**How shot preview works** — inline data URL via `PreviewSourceDescriptor.variants`:

```typescript
// In shotCardPolicy.resolvePreviewSource():
const selectedCandidate = findSelectedCandidate(node);
const source: PreviewSourceDescriptor = {
  id: `shot-preview:${node.id}`,
  role: 'generation-candidate',
  variants: selectedCandidate ? [{
    id: selectedCandidate.id,
    role: 'generation-candidate',
    sourcePath: selectedCandidate.dataUrl,    // inline data URL lives here
    selected: true,
  }] : [],
};
return { renderForm: 'asset-thumbnail', aspectRatio: '3/2', source };
```

`CardPreviewSlot` resolves this the same way as any other `PreviewSourceDescriptor` — it checks the role-matched safe `variants[].sourcePath` first (fast path for inline URLs), then falls back to `WebviewPreviewResolver` for external assets.

**Mapping table — how each node type maps to existing constructs**:

| Node type | renderForm | CanvasPreviewRole | Source construction |
|-----------|-----------|-------------------|---------------------|
| media (image) | `asset-thumbnail` | `image` | `asset: { path: thumbnailPath ?? assetPath, mediaType: 'image' }` |
| media (video) | `media-poster` | `video-poster` | `asset: { path: thumbnailPath ?? assetPath, mediaType: 'video' }` |
| media (audio) | `waveform` | `audio-waveform` | — (no source needed) |
| shot | `asset-thumbnail` | `generation-candidate` | `variants: [{ sourcePath: selected.dataUrl }]` |
| model | `media-poster` | `model-screenshot` | `asset: { path: screenshotPath }` |
| panoramic | `asset-thumbnail` | `panorama-fov-crop` | `asset: { path: assetPath }` |
| annotation | `text` | `text` | — |
| text | `text` | `text` | — |
| fallback | `icon` | `fallback` | — |

This means adding `model` or `panoramic-image` cards requires **zero changes to `CardPreviewSlot`** — they reuse existing render forms. The `CanvasPreviewRole` already covers these semantics.

### 2.5 Metadata & Badges

```typescript
interface CardBadge {
  readonly label: string;
  readonly tone: 'info' | 'success' | 'warning' | 'error';
}
```

### 2.6 Card Actions — Typed IDs with Declarative Conditions

`enabledWhen` is an enumerated condition predicate, not a function. This keeps descriptors serializable and future-proof for `@neko/shared` or preset metadata.

```typescript
type NodeCardActionId =
  | 'remove'
  | 'generate'
  | 'open-media-preview'     // for asset-based nodes (media) — sends openMediaPreview to extension
  | 'open-content-overlay'   // for inline-preview nodes (shot) — opens content overlay in webview
  | 'edit'
  | 'duplicate'
  | 'open-in-editor';

// Enumerated conditions — evaluated by ActionConditionEvaluator, not the policy
type ActionCondition =
  | 'always'
  | 'has-selection'
  | 'has-preview'
  | 'not-generating'
  | 'has-asset';

interface CardActionDescriptor {
  readonly id: NodeCardActionId;
  readonly label: string;
  readonly icon?: string;
  readonly position: 'top-right' | 'bottom' | 'overlay-center';
  readonly visibleWhen: 'always' | 'hover';
  readonly danger?: boolean;
  readonly confirm?: string;
  readonly enabledWhen?: ActionCondition;
}
```

### 2.7 ActionCondition — Unified Evaluation Context

`ActionCondition` is shared between card actions and container actions but evaluated differently depending on scope. A single `evaluateActionCondition` function receives context and condition, returns boolean.

The `has-preview` condition uses the **resolved `CardPreviewSource`** (available from the policy) rather than only checking `node.preview?.thumbnailVariantId`, which would miss shot inline previews, variant-based previews, and text excerpts.

```typescript
interface ActionConditionContext {
  node: CanvasNode;
  parentNode?: CanvasNode;
  childNodes?: readonly CanvasNode[];     // populated for container actions
  selection: { nodeIds: string[] };
  previewSource?: CardPreviewSource;      // available from policy.resolvePreviewSource()
}

function evaluateActionCondition(
  condition: ActionCondition,
  ctx: ActionConditionContext,
): boolean {
  switch (condition) {
    case 'always':
      return true;
    case 'has-selection':
      return ctx.selection.nodeIds.length > 0;
    case 'has-preview':
      return hasRenderablePreview(ctx);
    case 'not-generating': {
      // Card scope: node's own status. Container scope: no child is generating.
      const targets = ctx.childNodes ?? [ctx.node];
      return targets.every((n) => {
        const status = (n.data as Record<string, unknown>)['generationStatus'];
        return status !== 'generating';
      });
    }
    case 'has-asset': {
      const data = ctx.node.data as Record<string, unknown>;
      return typeof data['assetPath'] === 'string' && data['assetPath'] !== '';
    }
  }
}

function hasRenderablePreview(ctx: ActionConditionContext): boolean {
  // If we have the resolved preview source from the policy, use it directly
  if (ctx.previewSource) {
    const form = ctx.previewSource.renderForm;
    if (form === 'none' || form === 'icon') return false;
    if (form === 'text') return (ctx.previewSource as TextPreviewSource).textExcerpt !== '';
    if (form === 'waveform') return true;
    // asset-thumbnail / media-poster: check source has content
    const assetSource = ctx.previewSource as AssetPreviewSource | MediaPosterPreviewSource;
    return (assetSource.source.variants?.length ?? 0) > 0
        || assetSource.source.asset?.path !== undefined;
  }
  // Fallback: check node.preview (container scope for children without previewSource)
  if (ctx.childNodes) {
    return ctx.childNodes.some((n) => n.preview?.thumbnailVariantId !== undefined
      || (n.preview?.capabilities ?? []).some((c) => c.kind === 'preview'));
  }
  return ctx.node.preview?.thumbnailVariantId !== undefined;
}
```

**Key design**: The same `ActionCondition` enum works for both card and container actions. The `childNodes` field is `undefined` for card-level evaluation (check the single node) and populated for container-level evaluation (check all children). The `previewSource` field is provided by the card component (which already called `policy.resolvePreviewSource()`), enabling accurate preview detection without duplicating resolution logic.

### 2.8 NodeCardPolicy Registry

```typescript
type NodeCardPolicyRegistry = Partial<Record<CanvasNodeType, NodeCardPolicy>>;

function createBuiltInNodeCardPolicyRegistry(): NodeCardPolicyRegistry {
  return {
    media: mediaCardPolicy,
    shot: shotCardPolicy,
    annotation: annotationCardPolicy,
    text: textCardPolicy,
    scene: sceneCardPolicy,
    gallery: galleryCardPolicy,
    // unknown types fall through to fallbackCardPolicy
  };
}
```

### 2.9 Built-in Card Policies

#### media

| Dimension | Value |
|-----------|-------|
| renderForm | `asset-thumbnail` (image) / `media-poster` (video) / `waveform` (audio) |
| Preview source | `PreviewSourceDescriptor` with `asset: { path: thumbnailPath ?? assetPath, mediaType }`, role: `image` / `video-poster` / `audio-waveform` |
| Aspect ratio | image: `3/2`, video: `3/2`, audio: N/A |
| Title | `extractBasename(data.assetPath)` or `"Empty {mediaType}"` |
| Subtitle | `data.mediaType` |
| Badge | — |
| Actions | `remove` (hover, danger), `open-media-preview` (overlay-center, hover, enabledWhen: `has-asset`) |

#### shot

| Dimension | Value |
|-----------|-------|
| renderForm | `asset-thumbnail` |
| Preview source | `PreviewSourceDescriptor` with `role: 'generation-candidate'`, `variants: [{ sourcePath: selected.dataUrl }]` |
| Aspect ratio | `3/2` |
| Title | `"Shot {data.shotNumber}"` |
| Subtitle | `data.visualDescription` (truncated 40 chars) |
| Badge | generation status (`idle` / `generating` / `done`) |
| Actions | `remove` (hover, danger), `generate` (bottom, hover, enabledWhen: `not-generating`), `open-content-overlay` (overlay-center, hover, enabledWhen: `has-preview`) |

#### annotation / text

| Dimension | Value |
|-----------|-------|
| renderForm | `text` |
| Text excerpt | First 60 chars of `data.content` |
| Title | First 30 chars of `data.content` or `"Annotation"` / `"Text"` |
| Actions | `remove` (hover, danger) |

#### Fallback (unknown types)

| Dimension | Value |
|-----------|-------|
| renderForm | `icon` |
| Icon | `📄` |
| Title | `capitalize(node.type)` |
| Actions | `remove` (hover) |

### 2.10 Container Action Descriptors

Replace hardcoded scene actions in `NodeContentDispatcher` with declarative descriptors. Same `ActionCondition` predicates as card actions, evaluated with `childNodes` populated.

```typescript
type ContainerActionId =
  | 'assign-selected-children'
  | 'auto-layout'
  | 'batch-generate'
  | 'add-row'
  | 'add-column'
  | 'remove-row'
  | 'remove-column';

interface ContainerActionDescriptor {
  readonly id: ContainerActionId;
  readonly label: string;
  readonly icon?: string;
  readonly visibleWhen: 'always' | 'selected' | 'has-children' | 'empty';
  readonly danger?: boolean;
  readonly confirm?: string;
  readonly enabledWhen?: ActionCondition;
}

// ---- Dispatcher registry — see §3.5 for ContainerActionContext and full implementation ----

type ContainerActionHandler = (ctx: ContainerActionContext) => void;
type ContainerActionDispatcher = Record<ContainerActionId, ContainerActionHandler>;
```

Preset declarations:

```typescript
// scene.basic
createActions: () => [
  { id: 'assign-selected-children', label: 'preset.scene.assignSelected', visibleWhen: 'selected' },
  { id: 'auto-layout', label: 'preset.scene.autoLayout', visibleWhen: 'has-children' },
  { id: 'batch-generate', label: 'preset.scene.batchGenerate', visibleWhen: 'has-children', enabledWhen: 'not-generating' },
],

// gallery.basic
createActions: () => [
  { id: 'batch-generate', label: 'preset.gallery.generateAll', visibleWhen: 'has-children', enabledWhen: 'not-generating' },
],

// table.basic
createActions: () => [
  { id: 'add-row', label: 'preset.table.addRow', visibleWhen: 'always' },
  { id: 'add-column', label: 'preset.table.addColumn', visibleWhen: 'always' },
],
```

---

## 3. Component Architecture

### 3.1 Rendering Pipeline

```
ContainerRenderer (existing, child slot rendering role unchanged)
  ├── action bar rendering (new, Phase 3: from ContainerActionDescriptor[])
  └── childSlot rendering (existing)
       └── NodeCard (new generic component)
            ├── resolves policy from NodeCardPolicyRegistry
            ├── calls policy.resolvePreviewSource() → CardPreviewSlot (async resolution via hook)
            ├── calls policy.resolveTitle/Subtitle/Badges() → CardMetadataSlot (sync)
            ├── calls policy.resolveActions() → CardActionSlot (typed dispatch)
            └── renders 3 slots in standard layout

CardPreviewSlot (new, owns async resolution)
  ├── renderForm='asset-thumbnail' → useResolvedPreview(source) → <img> with aspect-ratio
  ├── renderForm='media-poster'    → useResolvedPreview(source) → <img> + play overlay
  ├── renderForm='waveform'        → compact waveform bars + play button (no async)
  ├── renderForm='text'            → truncated text preview (no async)
  ├── renderForm='icon'            → centered icon with bg (no async)
  └── renderForm='none'            → hidden

CardMetadataSlot (new, pure)
  └── title (truncated) + subtitle + badges row

CardActionSlot (new, typed dispatch)
  └── hover-visible buttons → evaluateActionCondition(condition, ctx) → onAction(nodeId, actionId)
```

### 3.2 NodeCard Component

```typescript
interface NodeCardProps {
  node: CanvasNode;
  parentNode?: CanvasNode;
  policyRegistry: NodeCardPolicyRegistry;
  onSelect?: (id: string, multi: boolean) => void;
  onAction?: (nodeId: string, actionId: NodeCardActionId) => void;
}

function NodeCard({ node, parentNode, policyRegistry, onSelect, onAction }: NodeCardProps) {
  const policy = policyRegistry[node.type] ?? fallbackCardPolicy;

  // Pure, sync — safe to call in render
  const previewSource = policy.resolvePreviewSource(node);
  const title = policy.resolveTitle(node, parentNode);
  const subtitle = policy.resolveSubtitle?.(node);
  const badges = policy.resolveBadges?.(node) ?? [];
  const actions = policy.resolveActions?.(node, parentNode) ?? [];

  return (
    <div className="group relative">
      <button onClick={...}>
        {/* Async resolution happens inside CardPreviewSlot via hooks */}
        <CardPreviewSlot source={previewSource} title={title} />
        <CardMetadataSlot title={title} subtitle={subtitle} badges={badges} />
      </button>
      <CardActionSlot
        actions={actions}
        nodeId={node.id}
        previewSource={previewSource}
        onAction={onAction}
      />
    </div>
  );
}
```

### 3.3 CardPreviewSlot — Async Resolution Boundary

**NodeCardPolicy never touches runtime URLs**. Policy outputs `CardPreviewSource` (discriminated union). `CardPreviewSlot` resolves runtime URLs via `useResolvedPreview` hook wrapping `WebviewPreviewResolver`.

For inline content (e.g., shot generation history data URLs), variants are checked for a role-matched, safe URL before hitting the async resolver. This reuses the same `getStableSafeUrl` pattern from `PreviewRendererRegistry.tsx:509`:

```typescript
function CardPreviewSlot({ source, title }: { source: CardPreviewSource; title: string }) {
  // Only asset-based render forms need resolution
  const previewDescriptor =
    source.renderForm === 'asset-thumbnail' || source.renderForm === 'media-poster'
      ? source.source
      : undefined;

  // Fast path: find a role-matched variant with a safe URL
  // Mirrors getStableSafeUrl() from PreviewRendererRegistry.tsx:509
  const stableUrl = useMemo(() => {
    if (!previewDescriptor) return undefined;
    const variant = previewDescriptor.variants?.find((v) => v.role === previewDescriptor.role);
    const url = variant?.sourcePath;
    return url && isSafeWebviewUrl(url) ? url : undefined;
  }, [previewDescriptor]);

  // Async fallback: only invoked when no stable inline URL is available
  const resolvedUrl = useResolvedPreview(stableUrl ? undefined : previewDescriptor);
  const displayUrl = stableUrl ?? resolvedUrl;

  switch (source.renderForm) {
    case 'asset-thumbnail':
      return displayUrl
        ? <img src={displayUrl} style={{ aspectRatio: source.aspectRatio }} />
        : <IconPlaceholder icon="🖼" aspectRatio={source.aspectRatio} />;
    case 'media-poster':
      return <PosterWithPlayOverlay url={displayUrl} aspectRatio={source.aspectRatio} />;
    case 'waveform':
      return <AudioWaveformPreview style={source.waveformStyle} />;
    case 'text':
      return <TextExcerptPreview text={source.textExcerpt} />;
    case 'icon':
      return <IconPlaceholder icon={source.icon} />;
    case 'none':
      return null;
  }
}
```

Because `renderForm` is a fixed closed set (6 values), new node types do NOT add new switch branches — they reuse existing forms. A `model` card uses `media-poster` with role `model-screenshot`; a `panoramic-image` card uses `asset-thumbnail` with role `panorama-fov-crop`. The semantic differentiation happens in `CanvasPreviewRole`, which the `PreviewResolver` already routes correctly.

### 3.4 Action Dispatch — Seven Categories with Existing Protocols

Node card actions fall into categories with distinct dispatch targets. All use **existing APIs**:

| Category | Action IDs | Dispatch target | Current API reference | Failure |
|----------|-----------|----------------|----------------------|---------|
| **Container relationship** | `remove` | canvasStore | `removeChildFromContainer(parentId, childId)` | Confirm dialog (gallery: delete-subtree warning) |
| **Generation** | `generate` | canvasStore | `openGenerationPanel(nodeId, parentNodeId)` | Disabled via `enabledWhen: 'not-generating'` |
| **Asset preview** | `open-media-preview` | Extension host | `postMessage({ type: 'openMediaPreview' })` (`canvasEditorProvider.ts:828`) | No-op if no assetPath |
| **Inline preview** | `open-content-overlay` | canvasStore | `openContentOverlay(nodeId)` (webview-local) | No-op if no preview content |
| **Selection** | `edit` | canvasStore | `selectNodes([nodeId])` | Always succeeds |
| **Clipboard** | `duplicate` | Webview-local (3 stores) | `handleDuplicate` flow (`useClipboard.ts:81-103`) | Always succeeds |
| **Document open** | `open-in-editor` | Extension host | `postMessage({ type: 'openDocument' })` (`canvasEditorProvider.ts:1799`) | No-op if path missing |

The dispatcher registry maps each `NodeCardActionId` to its handler:

```typescript
interface NodeCardActionContext {
  nodeId: string;
  node: CanvasNode;
  parentNodeId?: string;
  canvasStore: CanvasStore;
  historyStore: HistoryStore;
  clipboardStore: ClipboardStore;
  postMessage: (msg: unknown) => void;
}

type NodeCardActionHandler = (ctx: NodeCardActionContext) => void;

// Exhaustive — compiler enforces all IDs are mapped
const NODE_CARD_ACTION_DISPATCHER: Record<NodeCardActionId, NodeCardActionHandler> = {
  'remove': (ctx) => {
    if (ctx.parentNodeId) {
      ctx.canvasStore.getState().removeChildFromContainer(ctx.parentNodeId, ctx.nodeId);
    }
  },

  'generate': (ctx) => {
    ctx.canvasStore.getState().openGenerationPanel(ctx.nodeId, ctx.parentNodeId);
  },

  'open-media-preview': (ctx) => {
    // For asset-based nodes (media). Uses existing protocol (canvasEditorProvider.ts:828).
    const data = ctx.node.data as Record<string, unknown>;
    const assetPath = data['assetPath'];
    if (typeof assetPath === 'string') {
      ctx.postMessage({ type: 'openMediaPreview', assetPath, mediaType: data['mediaType'] });
    }
  },

  'open-content-overlay': (ctx) => {
    // For inline-preview nodes (shot). Opens content overlay in webview.
    // Shot previews come from generationHistory variants, not assetPath —
    // so openMediaPreview would be a no-op. Content overlay shows the node's
    // full content panel instead.
    ctx.canvasStore.getState().openContentOverlay(ctx.nodeId);
  },

  'edit': (ctx) => {
    ctx.canvasStore.getState().selectNodes([ctx.nodeId]);
  },

  'duplicate': (ctx) => {
    // Replicates the full handleDuplicate flow from useClipboard.ts:81-103.
    // This spans three stores because the operation is: clone → push history → write canvas → select.
    const canvasData = ctx.canvasStore.getState().canvasData;
    if (!canvasData) return;

    const result = ctx.clipboardStore.getState().duplicate(
      [ctx.nodeId], canvasData.nodes, canvasData.connections,
    );
    if (!result) return;

    // Push undo checkpoint before mutating
    ctx.historyStore.getState().pushState(canvasData);

    // Append cloned nodes/connections to canvas
    ctx.canvasStore.getState().setCanvasData({
      ...canvasData,
      nodes: [...canvasData.nodes, ...result.nodes],
      connections: [...canvasData.connections, ...result.connections],
    });

    // Select the duplicated nodes
    ctx.canvasStore.getState().selectNodes(result.nodes.map((n) => n.id));
  },

  'open-in-editor': (ctx) => {
    // Uses existing protocol (canvasEditorProvider.ts:1799).
    const data = ctx.node.data as Record<string, unknown>;
    const docPath = data['assetPath'] ?? data['docPath'];
    if (typeof docPath === 'string') {
      ctx.postMessage({ type: 'openDocument', docPath });
    }
  },
};
```

**Design notes**:
- **`duplicate`** intentionally inlines the 3-store flow (`clipboardStore` → `historyStore` → `canvasStore` → select) rather than calling a single method. This matches `useClipboard.ts:81-103` exactly. If a future refactor consolidates this into a single store method, the dispatcher entry simplifies to a one-liner.
- **`open-media-preview` vs `open-content-overlay`**: Split from the original single `open-preview` because the dispatch targets differ. Media nodes send `openMediaPreview` to the extension host (which opens a preview panel via `canvasEditorProvider.ts:828`). Shot nodes open a content overlay in the webview — their preview comes from `generationHistory` variants, not an external asset path, so `openMediaPreview` would be a no-op.

### 3.5 Container Action Dispatch

Container actions need richer context than node card actions. Several actions require selection state (`assign-selected-children`), child node list (`batch-generate`), or extension messaging (`batch-generate` sends to agent):

```typescript
interface ContainerActionContext {
  containerId: string;
  node: CanvasNode;
  childNodes: readonly CanvasNode[];
  selection: { nodeIds: string[] };
  canvasStore: CanvasStore;
  postMessage: (msg: unknown) => void;
}

type ContainerActionHandler = (ctx: ContainerActionContext) => void;

// Exhaustive — compiler enforces all IDs are mapped.
// Each handler mirrors existing CanvasApp.tsx callbacks.
const CONTAINER_ACTION_DISPATCHER: Record<ContainerActionId, ContainerActionHandler> = {
  'assign-selected-children': (ctx) => {
    // Mirrors handleAssignSelectedShotsToScene (CanvasApp.tsx:555-563)
    const allNodes = ctx.canvasStore.getState().canvasData?.nodes ?? [];
    const shotIds = ctx.selection.nodeIds.filter((id) =>
      allNodes.find((n) => n.id === id)?.type === 'shot',
    );
    if (shotIds.length > 0) {
      ctx.canvasStore.getState().assignShotsToScene(ctx.containerId, shotIds, true);
    }
  },

  'auto-layout': (ctx) => {
    // Mirrors handleAutoLayoutSceneShots (CanvasApp.tsx:566-570)
    ctx.canvasStore.getState().autoLayoutSceneShots(ctx.containerId);
  },

  'batch-generate': (ctx) => {
    // Mirrors handleBatchGenerateSceneShots (CanvasApp.tsx:573-585)
    if (ctx.childNodes.length === 0) return;
    ctx.postMessage({
      type: 'sendToAgent',
      nodeIds: ctx.childNodes.map((node) => node.id),
      action: 'batch',
    });
  },

  'add-row': (ctx) => {
    const current = (ctx.node.data as Record<string, unknown>)['rowCount'] as number ?? 1;
    ctx.canvasStore.getState().updateNodeData(ctx.containerId, { rowCount: current + 1 });
  },

  'add-column': (ctx) => {
    const current = (ctx.node.data as Record<string, unknown>)['columnCount'] as number ?? 1;
    ctx.canvasStore.getState().updateNodeData(ctx.containerId, { columnCount: current + 1 });
  },

  'remove-row': (ctx) => {
    const current = (ctx.node.data as Record<string, unknown>)['rowCount'] as number ?? 1;
    if (current > 1) {
      ctx.canvasStore.getState().updateNodeData(ctx.containerId, { rowCount: current - 1 });
    }
  },

  'remove-column': (ctx) => {
    const current = (ctx.node.data as Record<string, unknown>)['columnCount'] as number ?? 1;
    if (current > 1) {
      ctx.canvasStore.getState().updateNodeData(ctx.containerId, { columnCount: current - 1 });
    }
  },
};
```

---

## 4. Relationship to Existing ADRs

### 4.1 Refines `adr-canvas-block-container.md`

That ADR defines the structural primitives (Block, Section, ChildSlot, ContainerCapability). This ADR defines the **visual policy layer** on top: how child nodes render inside those childSlots. The Block+Container ADR created the structure; this ADR standardizes the content.

### 4.2 Consistent with `adr-canvas-preview-boundary.md`

`CardPreviewSource` asset variants carry a `PreviewSourceDescriptor` — the same contract used by `PreviewSurface` and `WebviewPreviewResolver`. `AssetIdentityCapability` carries `path`, `mediaType`, `assetId`, `uri`, `sourceHash`. `CanvasPreviewRole` drives resolver routing. No runtime URLs leak into the policy layer.

Shot inline data URLs are stored in role-matched `variants[].sourcePath` within the `PreviewSourceDescriptor`, consistent with how the existing preview system handles safe URLs. The `CardPreviewSlot` checks this fast path before invoking the async resolver.

### 4.3 Consistent with existing `NodePreviewDescriptor`

The shared type layer (`canvas-layered.ts:232`) defines `NodePreviewDescriptor` with `title`, `subtitle`, `role`, `badges`, `thumbnailVariantId`, `capabilities`. `NodeCardPolicy` mirrors this shape on the metadata side. On the preview side, `CardPreviewSource` adds the card-specific `renderForm` selection while delegating asset resolution to the existing `PreviewSourceDescriptor` + `PreviewResolver` pipeline.

---

## 5. Scope Boundaries

### 5.1 What This ADR Changes

- **Card rendering**: `ChildNodeCard` → `NodeCard` + `NodeCardPolicy` registry
- **Container actions**: Hardcoded dispatch → declarative `ContainerActionDescriptor`
- **Action dispatch**: Typed `ContainerActionId` / `NodeCardActionId` + dispatcher registry (exhaustive, compiler-checked)
- **Container action bar**: `ContainerRenderer` gains an action bar renderer (Phase 3)

### 5.2 What This ADR Does NOT Change

- **`CanvasNodeType` union**: Remains closed. Adding a new node type still requires modifying the shared type definition, factory, and agent tool surface. This ADR eliminates the need to modify `NodeCard`, `CardPreviewSlot`, and `ContainerRenderer` for new types, but does not introduce plugin-extensible node types. That belongs in `adr-canvas-block-container.md` Phase 3 (open node type registry).
- **Container policy system**: Already well-factored. No changes needed.
- **Block renderer registry**: Unchanged. Blocks inside sections still use the existing `BlockRendererRegistry` dispatch.
- **ContainerRenderer child slot rendering**: Unchanged. Only the action bar rendering is new.
- **Node-level rendering**: `BaseNode`, `NodeShell` are unchanged. `NodeContentDispatcher` loses hardcoded action dispatch.
- **`CardPreviewSlot` switch arms**: Fixed at 6 render forms. New node types reuse existing forms. Adding a genuinely new visual form (e.g., `3d-viewport`) would require a new arm, but this is expected to be rare (~1 per year) vs. new node types (~several per quarter).
- **postMessage protocols**: All action dispatchers use existing message types (`openMediaPreview`, `openDocument`, `preview:delegateAction`). No new extension-side handlers needed in Phase 1-2.

### 5.3 Type Layer Boundary

All new types in this ADR (`NodeCardPolicy`, `CardPreviewSource`, `CardActionDescriptor`, etc.) live in the **webview layer** in Phase 1. `PreviewSourceDescriptor` is a webview-local type (`preview/types.ts:8`), not `@neko/shared`.

**Future promotion path**: If `NodeCardPolicy` needs to be shared across packages (e.g., for agent tool surface generation), a separate PR would:
1. Extract the serializable subset (`CardActionDescriptor`, `CardBadge`, `ActionCondition`, `NodeCardActionId`, `ContainerActionId`) into `@neko/shared`
2. Replace `PreviewSourceDescriptor` in `CardPreviewSource` with `AssetIdentityCapability` + `CanvasPreviewRole` (both already in `@neko/shared`)
3. Leave the `CardPreviewSlot` component, `useResolvedPreview` hook, and dispatcher implementations in the webview layer

---

## 6. Migration Plan

### Phase 1 — Extract NodeCardPolicy interface + registry (~1 day)

**Files**: New `nodeCardPolicy.ts` (types + built-in policies), modify `blockRendererRegistry.tsx`

1. Define `NodeCardPolicy`, `CardPreviewSource` (discriminated union), `CardActionDescriptor`, `CardBadge`, `NodeCardActionId`, `ActionCondition`, `ActionConditionContext`, `evaluateActionCondition` in `nodeCardPolicy.ts`
2. Implement built-in policies: `mediaCardPolicy`, `shotCardPolicy`, `annotationCardPolicy`, `textCardPolicy`, `fallbackCardPolicy`
3. Shot policy constructs `PreviewSourceDescriptor` with role-matched `variants[].sourcePath` for inline data URLs
4. Each policy is a pure object with pure functions — independently unit-testable
5. `ChildNodeCard` delegates to policy registry for data, keeps rendering unchanged
6. All types webview-local — no `@neko/shared` changes
7. **Zero visual change** — purely structural refactor

### Phase 2 — Generic NodeCard + slot components (~1 day)

**Files**: New `NodeCard.tsx`, `CardPreviewSlot.tsx`, `CardMetadataSlot.tsx`, `CardActionSlot.tsx`

1. Implement `NodeCard` as the single generic card component
2. `CardPreviewSlot` resolves `PreviewSourceDescriptor` via `useResolvedPreview` hook, with role-matched safe `variants[].sourcePath` fast path
3. `CardActionSlot` evaluates `enabledWhen` via `evaluateActionCondition` (receives `previewSource` from parent), dispatches typed `NodeCardActionId` via `NODE_CARD_ACTION_DISPATCHER` (exhaustive record)
4. Replace `ChildNodeCard` + `ChildAudioPreview` + `ChildVideoPreview` with `NodeCard`
5. Wire `onAction` through `ContainerRenderer` → `NodeContentDispatcher` → dispatcher
6. Dispatcher uses existing APIs: `removeChildFromContainer`, `openGenerationPanel`, `openContentOverlay`, `selectNodes`, `clipboardStore.duplicate`, `historyStore.pushState`, `setCanvasData`, `postMessage({ type: 'openMediaPreview' })`, `postMessage({ type: 'openDocument' })`

### Phase 3 — Container action declarative registration (~0.5 day)

**Files**: Modify `canvasPresetRegistry.ts`, `ContainerRenderer.tsx`, `NodeContentDispatcher.tsx`

1. Add `createActions()` to preset interface, define `ContainerActionId` + `ContainerActionDescriptor`
2. Implement `ContainerActionDispatcher` registry (exhaustive record mapping IDs to store actions)
3. Scene/gallery/table presets declare their actions
4. `ContainerRenderer` gains an action bar section rendering from descriptors
5. Remove hardcoded action switch from `NodeContentDispatcher`

### Phase 4 — Validation (~0.5 day)

1. Verify adding a new `NodeCardPolicy` for `model` type (using `renderForm: 'media-poster'`, role `model-screenshot`) requires zero changes to `NodeCard` / `CardPreviewSlot` / `ContainerRenderer`
2. Verify adding a new `ContainerActionDescriptor` to a preset requires zero changes to action dispatch logic (only a new entry in the dispatcher record if the `ContainerActionId` is new)
3. **Note**: Adding a truly new `CanvasNodeType` still requires shared type + factory changes — this is a known boundary, not a gap in this ADR

---

## 7. Decision

| Aspect | Decision |
|--------|----------|
| Card abstraction | `NodeCardPolicy` registry per nodeType, pure functions |
| Card rendering | Generic `NodeCard` with 3 slots (preview/metadata/actions) |
| Preview source | Discriminated union `CardPreviewSource` on `renderForm`; asset variants carry `PreviewSourceDescriptor`; inline URLs go in role-matched `variants[].sourcePath`; slot resolves runtime URL via hook |
| Preview render forms | Fixed closed set of 6: `asset-thumbnail`, `media-poster`, `waveform`, `text`, `icon`, `none`. Semantic meaning carried by `CanvasPreviewRole`. New node types reuse existing forms. |
| Action conditions | Enumerated `ActionCondition` predicates evaluated by `evaluateActionCondition(condition, ctx)`. Card scope: single node + `previewSource`. Container scope: all children. Not functions — serializable. |
| Action dispatch | Seven categories (container-relationship / generation / asset-preview / inline-preview / selection / clipboard / document-open) with explicit dispatch targets and context types. Node card: `NodeCardActionContext` (3 stores + postMessage). Container: `ContainerActionContext` (store + selection + childNodes + postMessage). All use existing APIs. Typed dispatcher registries — compiler enforces exhaustiveness. |
| Container actions | Declarative `ContainerActionDescriptor` with typed `ContainerActionId` |
| Type layer | Phase 1: all webview-local. Future: serializable subset promotable to `@neko/shared` (§5.3). |
| Migration | 4 phases, backward-compatible, zero visual regression per phase |
| Extension model | New card = register `NodeCardPolicy` + pick existing `renderForm`. New container action = add `ContainerActionDescriptor` to preset + add `ContainerActionId` if needed. No `NodeCard`/`CardPreviewSlot`/`ContainerRenderer` changes. New `CanvasNodeType` still requires shared type changes (out of scope). |

---

## 8. Verification Criteria

1. **Policy purity**: Every `NodeCardPolicy` method is a pure function — no side effects, no hooks, no runtime URL resolution. Independently unit-testable with plain `CanvasNode` fixtures
2. **Preview contract reuse**: `CardPreviewSource` asset variants carry `PreviewSourceDescriptor` containing `AssetIdentityCapability` + `CanvasPreviewRole` + `variants`. Shot inline data URLs live in `variants[].sourcePath` (role-matched, safe-URL-checked via `getStableSafeUrl` pattern from `PreviewRendererRegistry.tsx:509`) — no separate `inlineDataUrl` field, no type contradiction
3. **Discriminated union validity**: `CardPreviewSource` is a discriminated union on `renderForm`. Asset variants require `source: PreviewSourceDescriptor`; text requires `textExcerpt: string`; icon requires `icon: string`. Invalid combinations are compile-time errors
4. **Render form stability**: `CardPreviewSlot` switch has exactly 6 arms. Adding a new `NodeCardPolicy` does NOT add a new arm. Verify by adding `model` card policy using `renderForm: 'media-poster'`
5. **Action serializability**: `CardActionDescriptor` and `ContainerActionDescriptor` contain no function references. `enabledWhen` is an `ActionCondition` enum string. Descriptors can be serialized to JSON
6. **Action condition context**: `evaluateActionCondition` correctly differentiates card scope (single node + `previewSource`, `childNodes` undefined) from container scope (all children, `childNodes` populated). `has-preview` uses `CardPreviewSource` when available, falling back to `node.preview` capabilities
7. **Action dispatch uses existing APIs**: `NODE_CARD_ACTION_DISPATCHER` only references APIs that exist today: `removeChildFromContainer`, `openGenerationPanel`, `selectNodes`, `openContentOverlay`, `clipboardStore.duplicate` + `historyStore.pushState` + `setCanvasData` (3-store flow matching `useClipboard.ts:81-103`), `postMessage({ type: 'openMediaPreview' })` (`canvasEditorProvider.ts:828`), `postMessage({ type: 'openDocument' })` (`canvasEditorProvider.ts:1799`). `CONTAINER_ACTION_DISPATCHER` mirrors existing `CanvasApp.tsx` callbacks. No phantom store methods or undocumented message types
8. **Extensibility**: Adding a new card type (e.g., `model`) requires only a new `NodeCardPolicy` entry — no modification to `NodeCard`, `CardPreviewSlot`, or `ContainerRenderer`
9. **Consistency**: All child nodes inside all container types render through the same `NodeCard` component
10. **Container independence**: Container layout (grid/sequence/table) is orthogonal to card rendering — any card in any container
11. **All existing tests pass**: `pnpm --dir packages/neko-canvas/packages/webview exec tsc --noEmit`, `pnpm --dir packages/neko-canvas/packages/webview test`, and `pnpm --dir packages/neko-canvas/packages/webview build` — all passing
