# ADR: Canvas Node Redesign — Block + Container Primitive Architecture

- **Status**: Proposed
- **Date**: 2026-05-08
- **Scope**: neko-canvas, @neko/shared (neko-types), neko-agent
- **Refines**: `adr-canvas-preview-boundary.md` (asset type inventory), `adr-capability-protocol.md` (agent tool surface)
- **Related**: `adr-asset-federation.md` (asset identity), `agent-unified-workflow.md` (agent orchestration)
- **OpenSpec Change**: `openspec/changes/canvas-block-container-architecture`

---

## 1. Context

neko-canvas models its content as 13 hardcoded node types via a closed `CanvasNodeType` union (`packages/neko-types/src/types/canvas.ts`). Each type carries a monolithic `data: {...}` bag and a monolithic React component (101-512 lines each). This architecture creates five structural problems:

### Problem 1: Type Explosion

Adding a new asset type (e.g., panoramic image, interactive video, 3D model viewer) requires touching **7 locations**:

| Touch point | File |
|-------------|------|
| Union member | `canvas.ts` — `CanvasNodeType` |
| Data interface | `canvas.ts` — new `*CanvasNode` interface |
| Factory case | `nodeFactory.ts` — `buildCanvasNode()` switch |
| Renderer component | `nodes/*Node.tsx` — new 100-400 line component |
| Descriptor entry | `nodeTypeDescriptor.ts` — registry row |
| Property panel | `PropertyPanel.tsx` — new branch |
| Agent tool enum | `agentCapabilityProvider.ts` — `canvas_create_node` type list |

### Problem 2: No Composability

ShotNode (`ShotNode.tsx`, 437 lines) manually assembles: image area + status indicator + 3 selects (shotScale/movement/angle) + number input (duration) + tag arrays (characters/emotions) + multiline text (dialogue/voiceOver) + collapsible section. Every other node wanting similar composite content must duplicate this pattern from scratch. There is no shared "image block" or "tag set block" to reuse.

### Problem 3: Single-Layer Containers

Two incompatible container mechanisms exist:

| Container | Child reference | Parent reference | Layout | Accepts |
|-----------|----------------|------------------|--------|---------|
| Scene | `data.shotIds[]` | `shot.data.sceneGroupId` | Grid (auto) | Shot only |
| Group | `data.childIds[]` | (none) | None | Any type |

Neither supports nesting (container inside container) or heterogeneous children (Scene cannot contain a MediaNode as reference material alongside Shots).

### Problem 4: Agent Composite Creation Cost

Creating "1 scene + 3 shots" via agent tools requires:

```
canvas_create_node('scene', ...)          → sceneId
canvas_create_node('shot', ...)           → shotId1
canvas_create_node('shot', ...)           → shotId2
canvas_create_node('shot', ...)           → shotId3
canvas_update_node(sceneId, {shotIds: [shotId1, shotId2, shotId3]})
canvas_update_node(shotId1, {sceneGroupId: sceneId})
canvas_update_node(shotId2, {sceneGroupId: sceneId})
canvas_update_node(shotId3, {sceneGroupId: sceneId})
```

8 tool calls with no transactional guarantee. The webview's `deriveSuccessorNode()` (one-click "+" button, `canvasStore.ts:1054`) is not exposed to the agent.

### Problem 5: Controls Are Not Declarative

`InlineControls.tsx` provides reusable `InlineSelect`, `InlineInput`, `InlineTextarea` — but each node component uses them imperatively with hardcoded field bindings. There is no data-driven way to declare "this node has a select bound to field X with options Y".

---

## 2. Decision

Introduce a **Block + Container** primitive layer underneath the existing 13 node types. Existing types become **preset templates** that expand into Container + Blocks combinations. This is a layered abstraction with incremental migration — not a rewrite.

### Core Principles

1. **Blocks are content atoms** — the smallest renderable unit inside a node (image, text, select, tag set)
2. **Containers compose blocks** — recursive sections with layout (vertical/horizontal/grid/free)
3. **Presets are named templates** — "shot" preset expands to a specific Container + Blocks tree
4. **`data` bag remains authoritative** — blocks reference data fields via `bindField`, not duplicate state
5. **Dual-path rendering** — nodes with `content` render via BlockRenderer; nodes without fall back to legacy components
6. **Zero breakage** — existing .nkc files, agent tools, and rendering all continue working unchanged

---

## 3. Type Hierarchy

### 3.1 Block Primitive Base

```typescript
// @neko/shared — canvas-blocks.ts (new file)

type BlockType =
  // Asset blocks (7)
  | 'image' | 'video' | 'audio'
  | 'model-2d' | 'model-3d'
  | 'document' | 'attachment'
  // Data blocks (5)
  | 'text' | 'table' | 'list' | 'key-value' | 'tag-set'
  // Control blocks (6)
  | 'select' | 'input' | 'button' | 'slider' | 'toggle' | 'status';

interface BlockBase {
  id: string;
  type: BlockType;
  visible?: boolean;     // default true
  locked?: boolean;      // inherits from node if unset
}
```

### 3.2 Asset Blocks

```typescript
interface ImageBlock extends BlockBase {
  type: 'image';
  data: {
    src: string;                // asset path or data URL
    thumbnailSrc?: string;
    panoramic?: boolean;        // equirectangular projection
    alt?: string;
    objectFit?: 'cover' | 'contain' | 'fill';
    /** Generation-aware: bind to generationHistory for candidate browsing */
    generationHistoryField?: string;
  };
}

interface VideoBlock extends BlockBase {
  type: 'video';
  data: {
    src: string;
    thumbnailSrc?: string;
    panoramic?: boolean;
    interactive?: boolean;      // branching video
    duration?: number;
    autoPreview?: boolean;      // hover-to-play (per adr-canvas-preview-boundary)
  };
}

interface AudioBlock extends BlockBase {
  type: 'audio';
  data: {
    src: string;
    duration?: number;
    waveformData?: number[];    // pre-computed for display
  };
}

interface Model2DBlock extends BlockBase {
  type: 'model-2d';
  data: {
    src: string;                // .moc3 / .psd / .svg
    thumbnailSrc?: string;
    format: 'inp' | 'psd' | 'svg';
  };
}

interface Model3DBlock extends BlockBase {
  type: 'model-3d';
  data: {
    src: string;                // .glb / .fbx / .obj / .usdz
    thumbnailSrc?: string;
    format: 'glb' | 'fbx' | 'obj' | 'usdz';
    turntableVideoSrc?: string; // pre-rendered turntable (per preview boundary)
  };
}

interface DocumentBlock extends BlockBase {
  type: 'document';
  data: {
    src: string;
    docType: 'pdf' | 'docx' | 'epub' | 'cbz';
    title?: string;
    thumbnailData?: string;     // base64
    pageCount?: number;
  };
}

interface AttachmentBlock extends BlockBase {
  type: 'attachment';
  data: {
    src: string;
    fileName: string;
    fileSize?: number;
    mimeType?: string;
    /** neko-suite native file subtype */
    nkType?: 'nkc' | 'nkcut' | 'nks' | 'nkm' | 'nkpup' | 'nkst' | 'nkplan';
  };
}
```

### 3.3 Data Blocks

```typescript
interface TextBlock extends BlockBase {
  type: 'text';
  data: {
    content: string;
    format: 'plain' | 'rich' | 'markdown';
    placeholder?: string;
    maxLines?: number;          // line-clamp for compact display
    editable?: boolean;         // default true when node is selected
    bindField?: string;         // key in node.data to sync
  };
}

interface TableBlock extends BlockBase {
  type: 'table';
  data: {
    columns: { key: string; label: string; width?: number }[];
    rows: Record<string, string | number | boolean>[];
    editable?: boolean;
    bindField?: string;
  };
}

interface ListBlock extends BlockBase {
  type: 'list';
  data: {
    style: 'ordered' | 'unordered' | 'checklist';
    items: { id: string; content: string; checked?: boolean }[];
    editable?: boolean;
    bindField?: string;
  };
}

interface KeyValueBlock extends BlockBase {
  type: 'key-value';
  data: {
    entries: {
      key: string;
      label: string;
      value: string | number;
      editable?: boolean;
      bindField?: string;       // each entry can bind independently
    }[];
    layout: 'vertical' | 'horizontal' | 'grid';
  };
}

interface TagSetBlock extends BlockBase {
  type: 'tag-set';
  data: {
    label?: string;             // e.g. "角色:", "情绪:"
    tags: { id: string; value: string; color?: string }[];
    editable?: boolean;
    maxVisible?: number;        // show "+N" overflow
    bindField?: string;
  };
}
```

### 3.4 Control Blocks

Generalize what ShotNode does with `InlineSelect`/`InlineInput` into data-driven declarations. Reuse existing `InlineControls.tsx` components as renderers.

```typescript
interface SelectBlock extends BlockBase {
  type: 'select';
  data: {
    options: { value: string; label: string }[];
    label?: string;
    width?: number;
    bindField: string;          // required: key in node.data
  };
}

interface InputBlock extends BlockBase {
  type: 'input';
  data: {
    inputType: 'text' | 'number';
    placeholder?: string;
    min?: number;
    max?: number;
    step?: number;
    label?: string;
    suffix?: string;            // e.g. "s" for seconds
    width?: number;
    bindField: string;
  };
}

interface ButtonBlock extends BlockBase {
  type: 'button';
  data: {
    label: string;
    icon?: string;
    action: string;             // action identifier dispatched to store
    variant?: 'primary' | 'secondary' | 'ghost';
    disabled?: boolean;
  };
}

interface SliderBlock extends BlockBase {
  type: 'slider';
  data: {
    min: number;
    max: number;
    step?: number;
    label?: string;
    bindField: string;
  };
}

interface ToggleBlock extends BlockBase {
  type: 'toggle';
  data: {
    label: string;
    bindField: string;
  };
}

interface StatusBlock extends BlockBase {
  type: 'status';
  data: {
    statusMap: Record<string, { label: string; color: string }>;
    bindField: string;
  };
}
```

### 3.5 Block Union

```typescript
type Block =
  | ImageBlock | VideoBlock | AudioBlock
  | Model2DBlock | Model3DBlock | DocumentBlock | AttachmentBlock
  | TextBlock | TableBlock | ListBlock | KeyValueBlock | TagSetBlock
  | SelectBlock | InputBlock | ButtonBlock | SliderBlock | ToggleBlock | StatusBlock;
```

Implementation note (2026-05-08): the Phase 0/1 shared contract names this render-level
primitive set `CanvasBlockKind` rather than mirroring every conceptual `BlockType` above one
for one. Domain atoms such as image, video, tag set, table, gallery, storyboard row, and
generation candidate are assembled from `CanvasBlockKind` plus `FieldBinding`, collection,
projection, preview, and delegate capabilities. This keeps the renderer registry small while
preserving the ADR's capability-composition model.

### 3.6 Container Section

```typescript
type ContainerLayout = 'vertical' | 'horizontal' | 'grid' | 'free';

interface ContainerSection {
  id: string;
  label?: string;               // rendered as section header
  layout: ContainerLayout;
  children: (Block | ContainerSection)[];
  /** Grid config (only when layout='grid') */
  gridConfig?: {
    columns: number;            // or 'auto' for auto-fill
    gap?: number;
  };
  /** Collapsible toggle (like ShotNode's dialogue section) */
  collapsible?: boolean;
  collapsed?: boolean;
  /** Only render when the node is selected */
  showWhenSelected?: boolean;
  /** CSS class for custom styling */
  className?: string;
}
```

### 3.7 Extended CanvasNodeBase

All new fields are optional — zero breakage on existing nodes:

```typescript
interface CanvasNodeBase {
  // === Existing (unchanged) ===
  id: string;
  type: CanvasNodeType;
  position: { x: number; y: number };
  size: { width: number; height: number };
  zIndex: number;
  rotation?: number;
  locked?: boolean;
  ports?: PortDefinition[];

  // === NEW: Block+Container layer ===

  /** Root content definition. Present → block-based rendering.
   *  Absent → legacy monolithic component rendering. */
  content?: ContainerSection;

  /** Unified parent container ID.
   *  Replaces shot.data.sceneGroupId (bidirectional scene reference). */
  parentId?: string;

  /** Unified child node IDs.
   *  Replaces scene.data.shotIds and group.data.childIds. */
  childIds?: string[];

  /** Preset template name. Populated when node was created from a preset.
   *  Enables preset-specific behaviors (derive menu, property panel, generation). */
  preset?: string;

  // === Existing (unchanged) ===
  /** Legacy type-specific data bag. Remains authoritative for data state.
   *  Control/data blocks reference keys here via bindField. */
  data?: Record<string, unknown>;
}
```

### 3.8 CanvasNodeType Evolution

Transition from closed union to extensible string with well-known values:

```typescript
/** Well-known built-in types (backward compatible) */
type BuiltInNodeType =
  | 'media' | 'storyboard' | 'annotation' | 'group'
  | 'text' | 'artboard'
  | 'shot' | 'scene' | 'gallery'
  | 'script' | 'document' | 'model' | 'canvas-embed';

/** Extensible: built-in + custom types registered at runtime */
type CanvasNodeType = BuiltInNodeType | (string & {});
```

New types (e.g. `'panoramic-image'`, `'interactive-video'`, `'3d-viewer'`) can be registered without modifying the union. The NodeTypeDescriptorRegistry already uses `Record<CanvasNodeType, NodeTypeDescriptor>`, which naturally accepts new string keys.

---

## 4. Preset Templates

Each of the 13 existing types maps to a named preset. A preset is a factory function that produces `{ content: ContainerSection, data: Record<string, unknown>, ports?: PortDefinition[], size: {width, height} }`.

### 4.1 ShotNode Preset (reference example)

Current ShotNode (437 lines) decomposes to:

```
shot-preset
├── Section("header", horizontal)
│   ├── StatusBlock(bindField="generationStatus", statusMap={idle/pending/generating/done/error})
│   ├── SelectBlock(bindField="shotScale", options=SHOT_SCALES)
│   ├── SelectBlock(bindField="cameraMovement", options=CAMERA_MOVEMENTS)
│   ├── SelectBlock(bindField="cameraAngle", options=CAMERA_ANGLES)
│   └── InputBlock(bindField="duration", type=number, suffix="s")
│
├── Section("image", vertical)
│   └── ImageBlock(generationHistoryField="generationHistory")
│
├── Section("meta", vertical)
│   ├── TextBlock(bindField="visualDescription", editable, maxLines=2)
│   ├── TagSetBlock(label="角色", bindField="characters", maxVisible=3)
│   └── TagSetBlock(label="情绪", bindField="emotion", maxVisible=4)
│
└── Section("detail", vertical, collapsible, showWhenSelected)
    ├── TextBlock(bindField="dialogue", editable, placeholder="台词...")
    ├── TextBlock(bindField="voiceOver", editable, placeholder="旁白...")
    └── InputBlock(bindField="soundCue", placeholder="音效提示...")
```

Data bag (unchanged from current `ShotCanvasNode.data`):
```typescript
{
  shotNumber: number,
  sceneGroupId?: string,       // → migrates to node.parentId
  duration: number,
  visualDescription: string,
  characters: ShotCharacter[],
  shotScale: ShotScale,
  cameraMovement?: CameraMovement,
  cameraAngle?: CameraAngle,
  emotion: string[],
  generationStatus: ShotGenerationStatus,
  generationHistory: GeneratedImageVersion[],
  dialogue?: string,
  voiceOver?: string,
  soundCue?: string,
  // ... remaining fields
}
```

### 4.2 SceneGroupNode Preset

```
scene-preset
├── Section("header", horizontal)
│   ├── InputBlock(bindField="sceneNumber", type=number)
│   ├── TextBlock(bindField="sceneTitle", editable)
│   ├── InputBlock(bindField="location", placeholder="场景地点")
│   └── SelectBlock(bindField="timeOfDay", options=TIME_OF_DAY)
│
├── Section("shots", grid, gridConfig={columns: auto, gap: 6})
│   └── (child nodes rendered as thumbnails via childIds)
│
└── Section("actions", horizontal, showWhenSelected)
    ├── ButtonBlock(label="收编选中镜头", action="assignSelectedShots")
    ├── ButtonBlock(label="自动排列", action="autoLayoutShots")
    └── ButtonBlock(label="批量生图", action="batchGenerateShots", variant=primary)
```

Container relationship: `node.childIds` replaces `data.shotIds`. Shots reference `node.parentId` instead of `data.sceneGroupId`.

### 4.3 MediaNode Preset (demonstrates extensibility)

```
media-preset
├── Section("preview", vertical)
│   └── ImageBlock | VideoBlock | AudioBlock   // chosen by mediaType
│
└── Section("info", vertical, showWhenSelected)
    └── KeyValueBlock([
          { key: "path", label: "路径", bindField: "assetPath" },
          { key: "type", label: "类型", bindField: "mediaType" },
          { key: "duration", label: "时长", bindField: "duration", suffix: "s" },
        ])
```

### 4.4 GalleryNode Preset

```
gallery-preset
├── Section("header", horizontal)
│   ├── SelectBlock(bindField="preset", options=GALLERY_PRESETS)
│   └── TextBlock(bindField="characterName", editable)
│
└── Section("cells", grid, gridConfig={columns: from preset})
    └── (GalleryCell[] rendered as ImageBlock array with per-cell generation)
```

### 4.5 New Asset Type Presets (enabled by block system)

Adding a panoramic image node requires **only a preset definition** — no new component, no union change:

```
panoramic-image-preset
└── Section("preview", vertical)
    └── ImageBlock(panoramic=true, objectFit="cover")
```

Adding an interactive video node:
```
interactive-video-preset
├── Section("preview", vertical)
│   └── VideoBlock(interactive=true)
│
└── Section("branches", vertical, collapsible)
    └── ListBlock(style="ordered", bindField="branches")
```

Adding a 3D model viewer:
```
model-3d-preset
├── Section("preview", vertical)
│   └── Model3DBlock(format from data)
│
└── Section("info", vertical, showWhenSelected)
    └── KeyValueBlock([format, vertices, textures, animations])
```

### 4.6 Remaining Presets (brief)

| Preset | Structure |
|--------|-----------|
| `text` | Container(vertical) { TextBlock(rich/markdown, editable) } |
| `annotation` | Container(vertical) { TextBlock(plain, editable) } |
| `storyboard` | Container(vertical) { TextBlock(title) + TextBlock(description) + StatusBlock(color) } |
| `artboard` | Container(vertical) { ButtonBlock(export PNG) + ButtonBlock(export SVG) } |
| `group` | Container(free) { child nodes via childIds } |
| `script` | Container(vertical) { TextBlock(title) + ListBlock(scenes TOC) + ButtonBlock(open) } |
| `document` | Container(vertical) { DocumentBlock + ButtonBlock(open) } |
| `model` | Container(vertical) { KeyValueBlock(name/type/version) + StatusBlock(installed) } |
| `canvas-embed` | Container(vertical) { ImageBlock(thumbnail) + ButtonBlock(open) } |

---

## 5. Rendering Architecture

### 5.1 BlockRendererRegistry

Parallels the existing `NodeRendererRegistry` pattern at the block level:

```typescript
// New: blockRendererRegistry.ts
type BlockRendererFn = (block: Block, ctx: BlockRenderContext) => React.ReactNode;

interface BlockRenderContext {
  nodeId: string;
  nodeData: Record<string, unknown>;    // the authoritative data bag
  isSelected: boolean;
  isLocked: boolean;
  onUpdateData: (field: string, value: unknown) => void;
  onAction: (action: string, payload?: unknown) => void;
}

const BLOCK_RENDERERS: Record<BlockType, BlockRendererFn> = {
  'select':  (block, ctx) => <InlineSelect ... />,   // reuses InlineControls.tsx
  'input':   (block, ctx) => <InlineInput ... />,     // reuses InlineControls.tsx
  'text':    (block, ctx) => <EditableText ... />,    // reuses existing component
  'image':   (block, ctx) => <ImageBlockRenderer ... />,
  'status':  (block, ctx) => <StatusBadgeRenderer ... />,
  'tag-set': (block, ctx) => <TagSetRenderer ... />,
  // ... 18 renderers total
};
```

Control blocks read current value from `ctx.nodeData[block.data.bindField]` and write via `ctx.onUpdateData(block.data.bindField, newValue)`. This means the `data` bag remains the single source of truth — blocks are views into it.

### 5.2 ContainerRenderer

Recursive component that walks the `ContainerSection` tree:

```typescript
// New: ContainerRenderer.tsx
function ContainerRenderer({ section, ctx, depth }: Props) {
  const [collapsed, setCollapsed] = useState(section.collapsed ?? false);

  // Hide if showWhenSelected and not selected
  if (section.showWhenSelected && !ctx.isSelected) return null;

  // Layout class: flex-col | flex-row | grid | relative
  const layoutClass = LAYOUT_CLASSES[section.layout];

  return (
    <div className={layoutClass} style={gridStyle(section)}>
      {section.label && <SectionHeader label={section.label} collapsible={section.collapsible} ... />}
      {!collapsed && section.children.map(child =>
        'type' in child && isBlockType(child.type)
          ? BLOCK_RENDERERS[child.type](child, ctx)
          : <ContainerRenderer section={child} ctx={ctx} depth={depth + 1} />
      )}
    </div>
  );
}
```

### 5.3 Dual-Path Rendering

The node dispatch path becomes:

```
InfiniteCanvas
  └─ for each visible node:
       └─ BaseNode (drag / resize / rotate / ports / derive-button)
            │
            ├─ node.content exists?
            │   YES → ContainerRenderer(node.content, { nodeData: node.data, ... })
            │   NO  → Legacy NodeRendererRegistry[node.type](node, ...)
            │
            └─ (both paths coexist during migration)
```

This is implemented by a single conditional in the node content area of `BaseNode.tsx`:

```typescript
{node.content
  ? <ContainerRenderer section={node.content} ctx={blockCtx} depth={0} />
  : <LegacyNodeContent node={node} ... />}
```

### 5.4 Performance Considerations

- `ContainerRenderer` is `React.memo`'d per section ID + data hash
- Block renderers are leaf components with no internal state (state lives in `node.data`)
- Depth limit: max 4 levels of nesting (configurable, prevents accidental recursion)
- Compared to current monolithic components (100-500 lines each), block renderers are simpler (20-60 lines each), so total component tree complexity is similar or lower

---

## 6. Unified Container System

The organization layer is a **generic container capability**, not a fixed set of
`Scene` / `Group` / `Artboard` branches. Scene, Group, and Artboard are the first
built-in container policies; future policies such as Board, Sequence, Folder, Layer,
Chapter, or Timeline Section can use the same capability when their children are
CanvasNodes.

```typescript
interface ContainerCapability {
  childIds: string[];
  policy: 'scene' | 'group' | 'artboard' | (string & {});
  layout: ContainerLayoutState;
  acceptedTypes?: CanvasNodeType[];
  acceptedPresets?: string[];
}
```

Rule of thumb: use the organization layer only when the child item needs independent
canvas identity: selection, drag, copy/paste, connections, generation, agent reference,
viewport culling, minimap visibility, or movement across containers. Rows, cells,
tags, table entries, and other node-internal items should stay in `node.data` and be
rendered by collection/content blocks unless they are explicitly promoted to CanvasNodes.

### 6.0 Layer Decoupling Invariants

The four canvas layers are orthogonal capabilities, not ownership levels:

| Layer | Owns | Must not own |
|-------|------|--------------|
| Spatial | `position`, `size`, `zIndex`, `rotation`, drag/resize/culling | node content, parent/child membership, graph edges |
| Content | `content`, blocks, collections, projections, preview, field bindings | canvas coordinates, container membership, stored connections |
| Organization | `parentId`, `container.childIds`, container policy, child order/layout intent | child business data, node-internal rows/cells/tags, connections |
| Relationship | top-level `connections`, ports, endpoints, graph semantics | containment, coordinates, internal UI layout |

They interact only through small contracts:

| Boundary | Contract |
|----------|----------|
| Spatial ↔ Organization | IDs and store actions; container movement translates children by delta, but does not change their coordinate system |
| Content ↔ Organization | `ChildNodeSlot` / `NodePreviewDescriptor`; content displays child summaries but does not own child nodes |
| Content ↔ Relationship | `blockId` / `fieldPath` endpoint references; blocks can be targets, but connections stay top-level |
| Organization ↔ Relationship | connection scope classification (`internal` / `boundary` / `external`); containment does not imply graph edges |

Hard invariants:

1. `node.position` is always canvas-world absolute.
2. `content` does not participate in canvas coordinates, minimap bounds, or viewport culling.
3. `container.childIds` contains only direct child CanvasNodes.
4. `parentId` and `container.childIds` must be bidirectionally consistent.
5. `CanvasData.connections` is the only persistence owner of graph edges.
6. Connection endpoints may reference node, port, block, or field IDs, but they never change containment.
7. Rows, cells, tags, and entries are content collections by default, not CanvasNodes.

### 6.1 Replacing Ad-Hoc Containment

Current state: two incompatible containment mechanisms (`scene.data.shotIds` + `shot.data.sceneGroupId` vs `group.data.childIds`).

New state: unified `parentId` / `childIds` on `CanvasNodeBase`:

```
Before:
  SceneGroupNode.data.shotIds = ['shot-1', 'shot-2']
  ShotNode.data.sceneGroupId = 'scene-1'
  GroupNode.data.childIds = ['node-a', 'node-b']

After:
  SceneGroupNode.childIds = ['shot-1', 'shot-2']
  ShotNode.parentId = 'scene-1'
  GroupNode.childIds = ['node-a', 'node-b']
  NodeA.parentId = 'group-1'
```

In the long-term shape, `childIds` belongs to `node.container.childIds`; `parentId`
remains on the child node for fast upward traversal and compatibility with flat
canvas queries. The Phase 0/1 migration may keep top-level `childIds` as a transitional
alias, but store reads should go through helpers such as `getContainerChildIds(node)`
and `getNodeParentId(node)`.

### 6.2 Recursive Nesting

With unified `parentId`/`childIds`, containers can nest other containers:

```
Scene (container, grid layout)
  ├── Shot (container, vertical)
  ├── Shot (container, vertical)
  ├── Group (container, free)        ← NEW: reference material group inside scene
  │   ├── MediaNode (image ref)
  │   └── AnnotationNode (notes)
  └── Shot (container, vertical)
```

### 6.3 Heterogeneous Children

Scenes are no longer limited to shots. Any node can be a child of any container. The constraint "scene only contains shots" becomes a **preset convention**, not a type system restriction:

- `scene` preset's derive menu offers: shot, gallery, annotation, media
- `group` preset's derive menu offers: all types
- Layout engine handles mixed-type children via size-based grid placement

The policy defines defaults, not the storage model:

| Policy | Organization intent | Default layout | Typical accepted children | Default delete behavior |
|--------|---------------------|----------------|---------------------------|-------------------------|
| `scene` | Semantic storyboard container | `sequence` / `grid` | shot, media, annotation, gallery | Ask: delete subtree or release children |
| `group` | Spatial grouping / temporary cluster | `free` | any CanvasNode | Release children |
| `artboard` | Bounded export / preview frame | `absolute` / `bounded` | visual nodes | Ask: delete subtree or release children |

Other policy names are valid if registered. A container policy owns behavior such as
accepted child presets, auto-layout defaults, delete semantics, derive targets, and
batch actions. It does not own child node data.

### 6.4 Collections, Projections, and Promotion

Not every organized structure is a container. The design separates three shapes:

| Shape | Owns CanvasNodes? | Persistence | Examples |
|-------|-------------------|-------------|----------|
| Container | Yes | `parentId` + `container.childIds` | Scene shots, Group members, Artboard contents |
| Collection | No | `node.data` array/object + `FieldBinding` | Table rows, Gallery cells, tags, key-value entries |
| Projection | No | References/query + bindings to existing nodes/data | Storyboard table view, asset matrix, generation planning view |

Tables should default to collection blocks. A table row becomes a CanvasNode only when
it needs independent canvas identity. Gallery cells should default to an internal
collection because a character sheet is usually one semantic asset. A cell can be
promoted into a MediaNode, Shot reference node, or Asset node when it needs independent
dragging, linking, generation lineage, or agent reference.

Storyboard tables should normally be projection views over Scene/Shot nodes rather than
separate owners of shot data. Row reorder updates the owning scene container order;
cell edits write through `FieldBinding` paths into the referenced ShotNode data.
Planning-only tables may start as pure collections and later promote rows into
Scene/Shot nodes through an explicit user or agent action.

### 6.5 Store Actions

New/modified actions in `canvasStore.ts`:

```typescript
// Replaces assignShotsToScene / detachShotFromScene / groupNodes / ungroupNodes
addChildToContainer(containerId: string, childId: string, index?: number): void
removeChildFromContainer(containerId: string, childId: string): void
moveChildInContainer(containerId: string, childId: string, newIndex: number): void

// New: atomic composite creation
createComposite(
  containerPreset: string,
  containerData: Record<string, unknown>,
  children: Array<{ preset: string; data: Record<string, unknown> }>,
  position: { x: number; y: number },
  autoLayout?: boolean,
): string   // returns container node ID
```

Backward compatibility: existing `assignShotsToScene()` / `groupNodes()` delegate to the new actions internally.

---

## 7. Agent API Additions

### 7.1 `canvas_derive_node`

Exposes the existing `deriveSuccessorNode()` webview logic (currently `canvasStore.ts:1054`) as an agent tool:

```typescript
{
  name: 'canvas_derive_node',
  description: 'Create a successor node auto-positioned to the right of a source node, with auto-connection.',
  parameters: {
    type: 'object',
    properties: {
      sourceNodeId: { type: 'string', description: 'Source node to derive from' },
      targetType: { type: 'string', description: 'Node type or preset (default: same as source)' },
      data: { type: 'object', description: 'Override data for the new node' },
    },
    required: ['sourceNodeId'],
  },
}
// Returns: { success, data: { nodeId, connectionId } }
```

### 7.2 `canvas_create_composite`

Atomic creation of container + children:

```typescript
{
  name: 'canvas_create_composite',
  description: 'Create a container node with child nodes in one atomic operation.',
  parameters: {
    type: 'object',
    properties: {
      preset: { type: 'string', description: 'Container preset (e.g. "scene")' },
      x: { type: 'number' },
      y: { type: 'number' },
      data: { type: 'object', description: 'Container data (e.g. {sceneTitle, sceneNumber})' },
      children: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            preset: { type: 'string', description: 'Child preset (e.g. "shot")' },
            data: { type: 'object' },
          },
          required: ['preset', 'data'],
        },
      },
      autoLayout: { type: 'boolean', description: 'Auto-arrange children in container grid' },
    },
    required: ['preset', 'x', 'y'],
  },
}
// Returns: { success, data: { containerId, childIds: string[] } }
```

Replaces the 8-call pattern with a single call.

### 7.3 `canvas_update_block`

Fine-grained block-level update:

```typescript
{
  name: 'canvas_update_block',
  description: 'Update a specific block within a node content tree.',
  parameters: {
    type: 'object',
    properties: {
      nodeId: { type: 'string' },
      blockId: { type: 'string', description: 'Block ID within node.content tree' },
      data: { type: 'object', description: 'Partial block data to merge' },
    },
    required: ['nodeId', 'blockId', 'data'],
  },
}
```

### 7.4 `canvas_extract_structured_content`

Extracts canvas content as structured data for AI consumption (canvas → agent direction):

```typescript
{
  name: 'canvas_extract_structured_content',
  description: 'Extract structured content from canvas nodes for AI processing.',
  parameters: {
    type: 'object',
    properties: {
      nodeIds: {
        type: 'array', items: { type: 'string' },
        description: 'Node IDs to extract (default: current selection)',
      },
      format: {
        type: 'string',
        enum: ['json', 'markdown', 'prompt'],
        description: 'json=structured data, markdown=narrative, prompt=generation template',
      },
      includeChildren: { type: 'boolean', description: 'Include container children recursively' },
    },
  },
}
// Returns: { success, data: { format, nodeIds, nodes, content } }
```

The response keeps the four layer boundaries visible: spatial fields stay on the node,
organization is reported through `parentId` and ordered `childIds`, content bindings are listed
as JSON Pointer paths into `node.data`, and preview output includes only stable descriptors. Runtime
preview URLs, blob URLs, engine tokens, active playback state, and hover/current time are omitted.

### 7.5 Existing Tools — No Changes Required

All current tools continue working because:
- `canvas_create_node(type, x, y, data)` — `data` bag is still the authoritative state
- `canvas_update_node(nodeId, data)` — merges into `data` bag as before
- `canvas_list_nodes` / `canvas_get_node` — return nodes with new optional fields
- `canvas_generate_image` / `canvas_generate_batch` — work on `data.generationStatus` as before

---

## 8. Serialization

### 8.1 .nkc Format v2.0

Version bump from `'1.0'` to `'2.0'`. The structure remains a flat JSON array:

```json
{
  "version": "2.0",
  "name": "My Canvas",
  "viewport": { "pan": { "x": 0, "y": 0 }, "zoom": 1 },
  "nodes": [
    {
      "id": "scene-1",
      "type": "scene",
      "preset": "scene.legacy",
      "position": { "x": 0, "y": 0 },
      "size": { "width": 600, "height": 400 },
      "zIndex": 10,
      "container": { "policy": "scene", "childIds": ["shot-1", "shot-2"] },
      "content": { "id": "root", "layout": "vertical", "children": [...] },
      "data": { "sceneTitle": "开场", "sceneNumber": 1, "timeOfDay": "清晨" }
    },
    {
      "id": "shot-1",
      "type": "shot",
      "preset": "shot.legacy",
      "position": { "x": 24, "y": 60 },
      "size": { "width": 220, "height": 320 },
      "zIndex": 20,
      "parentId": "scene-1",
      "content": { "id": "root", "layout": "vertical", "children": [...] },
      "data": {
        "shotNumber": 1,
        "shotScale": "MS",
        "generationStatus": "idle",
        "generationHistory": []
      }
    }
  ],
  "connections": [...]
}
```

Key invariant: **`data` bag remains the authoritative source of state**. Block `bindField` references are pointers into `data`, not copies. This means:
- Agent tools that write to `data` automatically reflect in block rendering
- Undo/redo snapshots capture `data` changes, blocks are derived views
- Existing .nkc files with only `data` (no `content`) render through legacy components

### 8.2 Migration

Following the `nkplan` migrator pattern (`packages/neko-types/src/nkplan/migrator.ts`):

```typescript
// New: canvas-migrator.ts in neko-types
const CANVAS_MIGRATIONS: CanvasMigrationStep[] = [
  {
    from: '1.0', to: '2.0',
    description: 'Unify containment references (shotIds/childIds/sceneGroupId → parentId/childIds)',
    apply(data: CanvasData) {
      for (const node of data.nodes) {
        if (node.type === 'scene' && node.data?.shotIds) {
          node.childIds = node.data.shotIds as string[];
          // keep data.shotIds for backward compat, remove in v3.0
        }
        if (node.type === 'shot' && node.data?.sceneGroupId) {
          node.parentId = node.data.sceneGroupId as string;
        }
        if (node.type === 'group' && node.data?.childIds) {
          node.childIds = node.data.childIds as string[];
        }
      }
      data.version = '2.0';
      return { data, warnings: [] };
    }
  }
];
```

The v1.0 → v2.0 migration is **purely structural** (unifies containment). It does **NOT** populate `content` on existing nodes. Legacy nodes continue rendering through their monolithic `*Node.tsx` components indefinitely until individually migrated.

### 8.3 Rollout Gates

Composable content is opt-in per registered preset. A node renders through the composable path only
when `node.content` exists. Legacy nodes created without a composable preset, and all existing files
loaded without `content`, keep the current renderer and `data` shape. This is the Phase 1 rollback
boundary: disabling composable preset creation stops new `content` nodes without affecting legacy
Canvas files.

Initial production presets are deliberately low-risk:

| Preset | Node type | Creation mode | Rollout role |
|--------|-----------|---------------|--------------|
| `annotation.basic` | `annotation` | composable | first snapshot-covered preset |
| `text.basic` | `text` | composable | second low-risk text surface |
| `*.legacy` | existing built-in node types | legacy | compatibility/default behavior |

Shot, Scene, Gallery, Media, Document, Model, and Script remain legacy by default until each has
parity evidence. Before switching a complex node type to composable creation, the migration PR must
define visual parity criteria:

- same visible fields and default values as the legacy component,
- same update path through `node.data`,
- same generation/runtime status behavior where applicable,
- same selection, drag, resize, connection, and property-panel affordances,
- no persisted preview runtime state,
- snapshot or visual coverage for representative selected/unselected states.

This ADR is implemented by OpenSpec change
`openspec/changes/canvas-block-container-architecture`. Preview-specific lifecycle and delegation
boundaries are refined in `docs/architecture/adr-canvas-preview-boundary.md`.

---

## 9. Cross-Cutting Concerns

### 9.1 Cross-Canvas Clipboard

Current: `clipboardStore.ts` uses Zustand in-memory state, isolated per webview instance.

Solution: Extension Host as clipboard intermediary.

```
Webview A                Extension Host              Webview B
─────────               ──────────────              ─────────
copy(nodes) ──────────→ workspaceState.set(         
                         'canvas.clipboard',         
                         serialized nodes)           
                                                     paste() request
                         workspaceState.get() ─────→ receive + cloneWithNewIds()
```

New message pair in webview-extension protocol:
- `clipboard:exportToHost` (webview → extension): serialized selected nodes + connections
- `clipboard:importFromHost` (extension → webview): serialized nodes for pasting

ID remapping uses the existing `cloneWithNewIds()` logic from `clipboardStore.ts`.

### 9.2 Canvas → Agent Structured Transfer

When the user selects nodes and invokes "Send to AI":
1. `canvas_get_structured_content` extracts content tree recursively
2. Format options:
   - `json`: raw node data + block content (for programmatic processing)
   - `markdown`: human-readable narrative (scene title → shot descriptions → dialogue)
   - `prompt`: generation-optimized template (for image/video generation prompts)
3. Extension host forwards to neko-agent via `neko.agent.insertContext` command

### 9.3 Property Panel Auto-Generation

With `content` present, PropertyPanel can enumerate blocks and render appropriate editors:
- Control blocks → their own renderers (already edit-capable)
- Data blocks → type-specific editors (text → textarea, table → grid editor)
- Asset blocks → file picker + thumbnail

Legacy nodes without `content` continue using the existing per-type property panel branches.

### 9.4 Undo/History

No change required. `historyStore.ts` snapshots entire `CanvasData`. Block content lives within nodes, so it's captured automatically. Block-level edits flow through `onUpdateData(field, value)` → `canvasStore.updateNodeData()` → history snapshot.

### 9.5 Viewport Culling

No change required. `viewportCulling.ts` operates on `node.position` and `node.size`. Block content does not affect culling boundaries.

### 9.6 Derive Button Enhancement

Current `DERIVE_NODE_TYPES` (BaseNode.tsx:107) is hardcoded to 4 types. With presets:
- Derive menu is driven by `preset.deriveTargets` config
- Each preset declares which types can be derived from it
- Example: `shot` preset → [shot, scene, gallery, annotation, media]
- Example: `scene` preset → [shot, scene, gallery]
- Agent `canvas_derive_node` uses the same target list

---

## 10. Implementation Phases

### Phase 0: Foundation Types (1 PR, ~2 days)

**Files**: `canvas.ts`, new `canvas-blocks.ts`

- Add all Block interfaces, ContainerSection, ContainerLayout to `@neko/shared`
- Add `content?`, `parentId?`, `childIds?`, `preset?` to CanvasNodeBase (all optional)
- Add canvas migrator infrastructure
- Add v1.0 → v2.0 migration (containment unification only)
- Transition `CanvasNodeType` to extensible string
- **Zero impact on existing behavior** — all new fields are optional

### Phase 1: Block Renderer Infrastructure (1 PR, ~3 days)

**Files**: new `blockRendererRegistry.ts`, new `ContainerRenderer.tsx`, `BaseNode.tsx`

- Create `BlockRendererRegistry` with 18 block renderers
- Wrap existing `InlineControls.tsx` components as block renderers (reuse, not replace)
- Create recursive `ContainerRenderer`
- Add dual-path conditional in BaseNode content area
- **Zero impact on existing nodes** — they have no `content` field

### Phase 2: Preset Template System (1 PR, ~2 days)

**Files**: new `presetTemplates.ts`, `nodeFactory.ts`

- Define preset templates for all 13 types
- Create `buildCanvasNodeFromPreset()` alongside existing `buildCanvasNode()`
- Toolbar "Add Node" optionally uses preset path for new nodes
- **Existing nodes remain as-is** — preset path is opt-in

### Phase 3: ShotNode Reference Migration (1 PR, ~4 days)

**Files**: `ShotNode.tsx`, preset template, tests

- Implement shot-preset template producing identical visual output
- New shots created via toolbar/derive use content-based rendering
- Existing shots on canvas continue legacy rendering
- **Validation**: pixel-diff testing between legacy and block-based ShotNode
- This is the hardest PR; establishes the pattern for all subsequent migrations

### Phase 4: SceneGroupNode + Recursive Nesting (1 PR, ~3 days)

**Files**: `SceneGroupNode.tsx`, `canvasStore.ts`, preset template

- Scene preset uses `parentId`/`childIds` instead of `data.shotIds`
- Enable recursive nesting: containers can hold other containers
- Scene accepts heterogeneous children (shots + media + annotations)
- New store actions: `addChildToContainer`, `removeChildFromContainer`, `createComposite`

### Phase 5: Remaining Type Migrations (2-3 PRs, ~5 days)

- **5a**: Simple nodes — text, annotation, storyboard, artboard
- **5b**: Asset nodes — media, document, model, canvas-embed
- **5c**: Complex nodes — gallery, group, script

### Phase 6: Agent API Additions (1 PR, ~2 days)

**Files**: `agentCapabilityProvider.ts`, `TOOL_NAMES` constants

- Add `canvas_derive_node`, `canvas_create_composite`, `canvas_update_block`, `canvas_get_structured_content`
- Move `deriveSuccessorNode` logic to shared utility
- Update `canvas_create_node` to accept preset names

### Phase 7: New Asset Types (1 PR per type, ~1 day each)

- Panoramic image: preset + ImageBlock(panoramic=true)
- Interactive video: preset + VideoBlock(interactive=true)
- 3D model viewer: preset + Model3DBlock
- Attachment / .nk files: preset + AttachmentBlock
- Each requires **only a preset definition** — no new component, no union change

### Phase 8: Cross-Canvas Clipboard (1 PR, ~2 days)

- Extension-host workspaceState clipboard
- New message pair in webview-extension protocol
- ID remapping via existing `cloneWithNewIds()`

### Phase 9: Legacy Cleanup (1 PR, optional, deferred)

- Remove monolithic `*Node.tsx` components once all types migrated
- Remove `buildCanvasNode()` switch statement
- Remove legacy `data.shotIds` / `data.childIds` / `data.sceneGroupId` fields

**Total estimate: ~9 PRs, ~25 engineering days**

---

## 11. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Performance regression from recursive block rendering | Medium | High | React.memo per section + block. Profile with 100+ node canvases. Block renderers are simpler (20-60 LOC) than monolithic components (100-500 LOC), so per-node overhead should be comparable or lower |
| Visual regression during ShotNode migration | High | Medium | Pixel-diff screenshot testing in CI. Phase 3 is dedicated to achieving visual parity before migrating other types |
| Agent tool backward compatibility | Low | High | All existing tools unchanged. New tools are purely additive. `data` bag remains authoritative |
| Serialization size increase from `content` | Medium | Low | `content` adds ~500-800 bytes per node. For 100 nodes = 50-80KB — negligible vs image data |
| v1.0 file migration edge cases | Low | Medium | Migration is conservative (containment unification only). Does not populate `content`. Legacy rendering handles unmigrated nodes indefinitely |
| Block `bindField` desync with data bag | Medium | Medium | Validation at preset expansion time: every `bindField` must exist in the data schema. Runtime warning if `data[bindField]` is undefined |
| Nesting depth explosion (free-form containers) | Low | Low | Hard limit of 4 nesting levels. UI prevents deeper nesting. Validation on save |

---

## 12. Alternatives Considered

### Alternative A: Full Rewrite

Replace all 13 types at once. Rejected because:
- Breaks all existing .nkc files simultaneously
- Requires rewriting all agent tools in one PR
- No incremental validation path
- ~3x larger initial effort

### Alternative B: Plugin-Based Node Types

External plugins register new types via a plugin API. Rejected for Phase 1 because:
- Adds API surface complexity without solving composability
- The core problem is internal composition, not external extensibility
- Can be layered on top of Block + Container in a future phase

### Alternative C: Canvas-Level Widget System

Interactive controls as standalone canvas entities. Rejected because:
- Shot's scale selector is semantically part of the shot, not an independent widget
- Canvas-level widgets serve a different use case (global toolbar, annotation tools)
- User confirmed: controls are node-internal editing elements

---

## 13. Design Addendum: Extensibility, Preview, Coordinates, Bindings, Connections, and Auto-Layout

This addendum records follow-up design decisions from the architecture review. It refines the
Block + Container model so it can scale to future asset formats, content presentation modes,
input controls, nested containers, graph connections, and agent-driven composite creation.

### 13.1 Extensibility Boundaries

The Block + Container layer should not simply move type explosion from `CanvasNodeType` to
`BlockType`. Long-term extensibility depends on separating four concerns:

| Concern | Authoritative layer | Extension mechanism |
|---------|---------------------|---------------------|
| Asset format and metadata | `neko-assets` / Rust media engine | Asset parser, probe metadata, MIME/type capabilities |
| In-node presentation | `neko-canvas` webview | Block renderer and layout renderer registry |
| Editable input fields | `@neko/shared` schema + webview editors | Field binding schema and editor registry |
| Graph semantics | Canvas connection model | Typed ports and connection endpoint resolver |

Adding a future format should normally require asset recognition, metadata extraction, preview
capability declaration, optional renderer registration, and optional preset definitions. It should
not require a new monolithic node component unless the format introduces genuinely new interaction
semantics.

### 13.2 Asset Format Strategy

The built-in asset blocks (`image`, `video`, `audio`, `model-2d`, `model-3d`, `document`,
`attachment`) are useful defaults, but they should be treated as built-in presets over a more
generic asset rendering capability.

Recommended future-compatible shape:

```typescript
interface AssetBlock extends BlockBase {
  type: 'asset';
  data: {
    kind:
      | 'image'
      | 'video'
      | 'audio'
      | 'model'
      | 'document'
      | 'attachment'
      | (string & {});
    assetId?: string;
    src?: string;
    mimeType?: string;
    format?: string;
    preview?: {
      thumbnailSrc?: string;
      posterSrc?: string;
      waveformData?: number[];
      turntableVideoSrc?: string;
    };
    capabilities?: string[];
  };
}
```

New formats such as EXR, PSD layers, Live2D, USDZ, Blender files, subtitle files, MIDI,
interactive video, or native `.nk*` project files should prefer `AssetBlock` + renderer registry
over expanding the core union every time. If no specialized renderer exists, the UI should fall
back to thumbnail cards or attachment/file cards. Heavy decoding, probing, transcoding, and
thumbnail generation remain outside the webview.

### 13.3 Preview Capability Composition

Preview must be modeled as composable capabilities over asset/content blocks, not as one-off
logic inside every node type. A node should not become an "image node", "video node",
"panorama node", or "model node" solely because it needs preview behavior. Instead, presets
compose asset identity, preview variants, playback, delegation, generation candidates, collection
preview, and node-summary preview as needed.

```typescript
type BlockCapability =
  | AssetIdentityCapability
  | PreviewCapability
  | PlaybackCapability
  | DelegateCapability
  | GenerationPreviewCapability
  | CollectionPreviewCapability
  | NodeSummaryCapability;

interface PreviewCapability {
  kind: 'preview';
  roles: PreviewRole[];
  preferredRole?: PreviewRole;
}

type PreviewRole =
  | 'thumbnail'
  | 'proxy'
  | 'poster'
  | 'waveform'
  | 'turntable'
  | 'rotation'
  | 'fov-crop'
  | 'clip';

interface PlaybackCapability {
  kind: 'playback';
  mode: 'inline' | 'hover' | 'selected';
  sourceRole: 'proxy' | 'poster' | 'clip';
  maxActive?: 1;
}

interface DelegateCapability {
  kind: 'delegate';
  command: string;
  label: string;
  when?: string;
}
```

Preview resolution is a pipeline:

```
AssetBlock / Preview-capable block
  → read declared capabilities
  → PreviewResolver requests PreviewVariant from extension host / engine
  → PreviewRendererRegistry chooses renderer by kind + role + mimeType
  → PreviewRuntime manages hover, playback, active instance, and cleanup
  → DelegateCapability opens specialized editor/viewer when needed
```

Storage boundary:

| Persisted in `.nkc` / `node.data` | Runtime only |
|-----------------------------------|--------------|
| `assetId`, `src`, `mimeType`, `format` | blob URLs, engine tokens, object URLs |
| selected generation candidate ID | current playback time |
| stable preview preference or saved default view | hover/active player state |
| semantic source metadata | WebGL/canvas player instances |

Canvas content blocks may render lightweight previews only. DOM-native display is allowed for
static images, low-resolution video/audio proxies, GIFs, waveform images, and engine-issued
turntable/rotation clips. Real-time 3D rendering, spherical panorama interaction, HDR tone
mapping controls, timeline scrubbing, audio mixing, and heavy decoding/transcoding remain delegated
to neko-preview, neko-model, neko-cut, neko-puppet, or the Rust engine according to
`adr-canvas-preview-boundary.md`.

Examples:

| Preset / block | Capability composition |
|----------------|------------------------|
| Image asset | `AssetIdentity` + `Preview(thumbnail/proxy)` + `Delegate(open image/preview)` |
| Video asset | `AssetIdentity` + `Preview(poster)` + `Playback(proxy)` + `Delegate(neko-preview/neko-cut)` |
| Audio asset | `AssetIdentity` + `Preview(waveform)` + `Playback(proxy)` + `Delegate(neko-preview/neko-cut)` |
| Panorama asset | `AssetIdentity` + `Preview(proxy/fov-crop/rotation)` + `Delegate(neko-preview panoramic)` |
| 3D model | `AssetIdentity` + `Preview(screenshot/turntable)` + `Delegate(neko-model)` |
| Gallery | `CollectionPreview(cells)` + `GenerationPreview(candidates)` + optional cell promotion |
| Scene | `ContainerCapability(childIds)` + `ChildNodeSlot` + `NodeSummaryCapability(child thumbnails)` |

Asset preview and node preview are separate. `AssetPreview` renders media referenced by a block.
`NodeSummaryCapability` renders a compact summary of another CanvasNode for Scene slots, Group
outlines, minimap-like summaries, and Agent context. Containers should not fully render child nodes
twice; they should request `NodePreviewDescriptor` from a node-preview adapter.

```typescript
interface NodePreviewDescriptor {
  nodeId: string;
  title?: string;
  thumbnail?: PreviewVariant;
  excerpt?: string;
  badges?: string[];
  status?: string;
}
```

This keeps preview logic reusable across Shot images, Gallery cells, Media nodes, Document covers,
Model turntables, Scene child slots, and Agent context extraction without reintroducing monolithic
node-specific preview branches.

### 13.4 Content Presentation Extensibility

`ContainerLayout = 'vertical' | 'horizontal' | 'grid' | 'free'` is sufficient for the first
migration, but it should become registry-driven before advanced views are added.

```typescript
type BuiltInContainerLayout =
  | 'vertical'
  | 'horizontal'
  | 'grid'
  | 'free'
  | 'tabs'
  | 'split'
  | 'overlay'
  | 'timeline';

type ContainerLayout = BuiltInContainerLayout | (string & {});

type ContainerChild = Block | ContainerSection | ChildNodeSlot;

interface ContainerSection {
  id: string;
  label?: string;
  layout: ContainerLayout;
  children?: ContainerChild[];
  slots?: {
    header?: ContainerChild[];
    body?: ContainerChild[];
    footer?: ContainerChild[];
    overlay?: ContainerChild[];
  };
}
```

`slots` should be introduced when a node needs semantically distinct regions, such as a Shot card
with header/body/detail, a Scene with header/actions/children, or a media inspector with preview
and metadata. This keeps AI extraction and property panel generation from depending on anonymous
child index positions.

### 13.5 Input and Field Binding Strategy

The current `bindField: string` proposal is acceptable for simple scalar fields, but it is too weak
for nested data such as `gallery.cells[0].prompt`, style objects, candidate selection, structured
generation parameters, and future agent-editable schemas.

Recommended binding model:

```typescript
interface FieldBinding {
  /** JSON Pointer-style path into node.data, e.g. "/visualDescription" or "/cells/0/prompt". */
  path: string;
  valueType: 'string' | 'number' | 'boolean' | 'array' | 'object' | (string & {});
  required?: boolean;
  validator?: string;
}

interface BindableBlockData {
  bind?: FieldBinding;
}
```

Rules:

- `node.data` remains the authoritative state.
- Blocks read from and write to `FieldBinding.path`.
- Property panels and Agent tools should consume the same field schema.
- Preset expansion must validate that required bindings exist or provide defaults.
- Runtime should warn when a block references a missing binding path.

### 13.6 Coordinate Model: Canvas-Absolute as Authority

Canvas node positions should remain canvas-world absolute coordinates.

```typescript
interface CanvasNodeBase {
  id: string;
  position: { x: number; y: number }; // canvas-world absolute coordinate
  size: { width: number; height: number };
  parentId?: string;
  childIds?: string[];
}
```

Decision:

- `node.position` is always in canvas-world coordinates.
- `parentId` / `childIds` express organization, not a local coordinate system.
- Containers may store local layout hints, but those hints are not the authoritative node position.
- Moving a container can translate its child subtree by delta through a store action.
- Node-internal blocks use local layout, because blocks are not canvas nodes.

Rationale for creators:

- Infinite canvas users expect "I placed it here, so it stays here."
- Free placement, temporary clustering, cross-container movement, marquee selection, minimap,
  viewport culling, and connection rendering stay predictable.
- Scene and Group can organize nodes without making the whole canvas feel like nested UI layout.

Relative coordinates are still appropriate inside a node's `content` tree, Gallery cells, fixed
Artboard internals, and embedded canvas previews. They should not become the global authority for
ordinary canvas nodes unless a future feature explicitly introduces local sub-canvases.

### 13.7 Container-Bound Content, Nodes, and Connections

Container binding has three separate layers:

| Layer | Field | Meaning | Persistence owner |
|-------|-------|---------|-------------------|
| Content binding | `node.content` | Node-internal UI/block tree | The node itself |
| Node binding | `parentId` / `childIds` | Container membership and child order | Nodes on the flat canvas |
| Connection binding | top-level `connections` | Graph relationships between endpoints | `CanvasData.connections` |

These layers should reference each other but not embed each other.

Content rules:

- `content` belongs to the node and is deleted/copied with the node.
- `content` does not participate in canvas coordinates.
- Blocks bind to `node.data` through `FieldBinding`.
- Existing nodes without `content` continue rendering through legacy components.

Node membership rules:

- A node may have at most one `parentId`.
- A container's `childIds` list contains only direct children.
- `parentId` and `childIds` must remain bidirectionally consistent.
- Container cycles are invalid.
- Coordinates can help with auto-adoption, but membership is determined by explicit IDs.
- Deleting a container must choose between deleting the child subtree and releasing children.

Connection rules:

- Connections remain top-level canvas data and are not embedded inside container nodes.
- Connections do not determine containment.
- Container operations classify connections by relation to the container subtree.

```typescript
type ConnectionScope = 'internal' | 'boundary' | 'external';
```

| Operation | Internal connection | Boundary connection | External connection |
|-----------|---------------------|---------------------|---------------------|
| Move container | Keep | Keep | Unchanged |
| Copy container subtree | Copy and remap endpoint IDs | Do not copy by default, or preserve as external reference metadata | Do not copy |
| Delete container and children | Delete | Delete or warn | Unchanged |
| Delete container but release children | Keep | Keep | Unchanged |
| Collapse container | Hide or summarize | Route to container boundary | Unchanged |
| Export container | Include by default | Include optionally as external references | Exclude |

### 13.8 Connection Endpoint Evolution

Existing `CanvasConnection` can remain valid for the first migration:

```typescript
interface CanvasConnection {
  id: string;
  sourceId: string;
  sourceAnchor: ConnectionAnchor;
  targetId: string;
  targetAnchor: ConnectionAnchor;
  sourcePort?: string;
  targetPort?: string;
}
```

The Block + Container system should evolve toward endpoint objects when block-level or field-level
connections are needed:

```typescript
interface ConnectionEndpoint {
  nodeId: string;
  anchor?: ConnectionAnchor;
  portId?: string;
  blockId?: string;
  fieldPath?: string;
  role?: 'input' | 'output' | 'reference' | 'sequence' | 'control';
}

interface CanvasConnectionV2 {
  id: string;
  source: ConnectionEndpoint;
  target: ConnectionEndpoint;
  type?: 'default' | 'sequence' | 'reference' | 'data';
  dataType?: string;
  label?: string;
}
```

Connection endpoint resolution order:

1. If `blockId` is present, resolve the rendered block DOM rect.
2. Else if `portId` is present, resolve the typed node port.
3. Else resolve the node anchor from node bounds.

Collapsed or hidden containers:

- Internal connections may be hidden or summarized.
- Boundary connections should route to the nearest visible container boundary.
- Expanding the container restores the exact endpoint rendering.
- Collapsing a container changes only rendering, not stored connection data.

### 13.9 Child Node Slot

Scene and Group presets need an explicit way to display or place child nodes inside container
content. A plain `(Block | ContainerSection)[]` tree cannot express "render this container's
children here."

Recommended addition:

```typescript
interface ChildNodeSlot {
  id: string;
  type: 'child-node-slot';
  data: {
    source: 'childIds';
    renderMode: 'thumbnail' | 'embedded' | 'outline';
    acceptedPresets?: string[];
    acceptedTypes?: CanvasNodeType[];
    includeNested?: boolean;
  };
}
```

Rules:

- Child nodes remain normal canvas nodes in `CanvasData.nodes`.
- A slot controls how child nodes are presented inside a container's content.
- A child node should not be fully rendered twice at the same time.
- For Scene, a slot can render Shot thumbnails while the actual Shot nodes remain hidden from the
  top-level layer when managed by that Scene.
- For Group, a slot can render an outline or mini-map style summary without replacing free canvas
  placement.

### 13.10 Auto-Layout and Overlap Avoidance

Auto-layout is required. It should be split into three capabilities:

| Capability | Scope | Priority |
|------------|-------|----------|
| `findFreePosition` | New/derived node placement | P0 |
| `autoArrangeContainer` | Container children | P0/P1 |
| `autoLayoutGraph` | Whole graph cleanup and routing | P2 |

Derived node placement should avoid covering existing content. Current "place to the right with a
fixed gap" behavior should become:

```typescript
preferred = rightOf(sourceNode)
position = findNearestFreeSlot(preferred, newNodeSize, existingNodes, context)
```

Search policy:

1. Try the preferred position to the right of the source.
2. If occupied, scan downward in the same column.
3. If no slot is free, move to the next column to the right.
4. If deriving inside a container, prefer the container's next layout slot.
5. If the container is too small and expansion is allowed, expand it.
6. If no container slot is available, place the node at the nearest free canvas position.

Collision detection should consider visible canvas nodes, sibling nodes in the same container, and
container bounds when deriving inside a container. It should not consider node-internal blocks or
connection paths; connection paths should be handled by connection routing.

Container layout metadata:

```typescript
interface ContainerLayoutState {
  mode: 'free' | 'grid' | 'sequence' | 'stack';
  autoArrange?: boolean;
  gap?: number;
  padding?: number;
  childOrder?: string[];
  placements?: ContainerChildPlacement[];
}

interface ContainerChildPlacement {
  childId: string;
  order?: number;
  slot?: string;
  localRect?: { x: number; y: number; width: number; height: number };
  layoutLocked?: boolean;
  manualPositioned?: boolean;
}
```

Creator-facing defaults:

- Scene defaults to grid/sequence-like ordering for storyboard readability.
- Group defaults to free layout because it is often a temporary organization frame.
- Composite creation by Agent defaults to auto-arranged layout.
- Ordinary manual edits should not trigger unexpected global rearrangement.
- User-moved nodes can be marked as `manualPositioned` or `layoutLocked`.

This prevents derived nodes and agent-created children from covering existing work while preserving
the creator's spatial memory.

### 13.11 Implementation Impact

The implementation phases should be refined as follows:

1. Add foundation types, including `FieldBinding`, optional `AssetBlock`, preview capability
   contracts, `PreviewVariant`, and `ChildNodeSlot`.
2. Keep old `CanvasConnection` for Phase 0/1, but design endpoint resolution so `CanvasConnectionV2`
   can be introduced later without rewriting renderers.
3. Implement `findFreePosition` before exposing `canvas_derive_node` to agents.
4. Implement `autoArrangeContainer` before `canvas_create_composite`.
5. Add validation for container invariants: single parent, bidirectional child references, no cycles,
   no dangling child IDs, and connection endpoints that reference existing nodes/ports/blocks.
6. Keep `node.position` canvas-absolute throughout migration.

---

## 14. 中文补充：Canvas 目标设计

当前 Canvas 的目标设计应定义为：

> 面向创作者的无限画布工作图。节点使用画布绝对坐标保存；节点内部内容用
> Block + Container 描述；容器关系用 `parentId` / `container.childIds` 表达；连接线独立保存为图关系；
> 素材、展示、输入和 Agent 操作通过注册表扩展。

这不是单纯的节点组件重构，而是把 Canvas 拆成四层：

| 层级 | 职责 | 关键数据 | 组合设计要求 |
|------|------|----------|----------------|
| 空间层 | 节点在无限画布上的位置、大小、层级 | `position`、`size`、`zIndex` | 核心字段固定，只对拖拽/缩放/吸附等行为做轻量组合 |
| 内容层 | 节点内部如何展示和编辑 | `content`、`Block`、`ContainerSection`、`CollectionView`、`ProjectionView` | 强组合，节点 UI 由 block / section / collection / projection 组装 |
| 组织层 | 一个节点如何管理其他 CanvasNode | `parentId`、`container.childIds`、container policy | 强组合，但只管理 CanvasNode，不管理 row/cell/tag |
| 关系层 | 节点之间的引用、顺序、数据流、生成依赖 | `connections`、`ports`、endpoint | 强组合，连接端点可逐步扩展到 node / port / block / field |

四层是正交能力，不是四级嵌套。推荐把节点理解为：

```text
CanvasNode
= 固定空间身份
+ content 内容组合
+ optional container 组织能力
+ optional ports 关系能力
+ data 权威状态
```

其中内容层、组织层、关系层应优先使用组合设计；空间层保持稳定基础契约，避免把
`position` / `size` / `zIndex` 抽象成过度复杂的插件系统。

四层必须解耦，只通过 ID、binding、endpoint、policy 和 store action 协作：

| 边界 | 解耦规则 |
|------|----------|
| 空间层 ↔ 组织层 | `parentId` 不改变坐标系；`node.position` 始终是画布绝对坐标；移动容器通过 store action 按 delta 平移子树 |
| 内容层 ↔ 组织层 | `content` 只描述节点内部 UI；`container.childIds` 只描述直接子 CanvasNode；容器内容通过 `ChildNodeSlot` / `NodePreviewDescriptor` 展示子节点摘要 |
| 内容层 ↔ 关系层 | Block 可以提供 `blockId` / `fieldPath` 供 endpoint 引用，但连接线仍由 `CanvasData.connections` 持久化 |
| 组织层 ↔ 关系层 | 包含关系不是连接线；连接线也不决定 `parentId`；容器操作只按 internal / boundary / external 分类连接 |

实现上四层应对应独立 registry / controller：

```text
空间层：SpatialIndex / InteractionController
内容层：BlockRendererRegistry / PreviewRendererRegistry / FieldBindingResolver
组织层：ContainerPolicyRegistry / LayoutRegistry
关系层：EndpointResolver / ConnectionRouter
```

需要保持的硬不变量：

1. `node.position` 永远是 canvas-world absolute。
2. `content` 不参与画布坐标、minimap bounds 或 viewport culling。
3. `container.childIds` 只包含直接子 CanvasNode。
4. `parentId` 与 `container.childIds` 必须双向一致。
5. `connections` 独立保存在 `CanvasData.connections`。
6. connection endpoint 可以引用 node / port / block / field，但不改变归属关系。
7. row / cell / tag / entry 默认不是 CanvasNode，除非显式 promote。

### 14.1 核心目标模型

目标态应保持扁平画布图，不把节点、内容和连接线全部嵌入容器内部。

```typescript
interface CanvasData {
  nodes: CanvasNode[];
  connections: CanvasConnection[];
}

interface CanvasNode {
  id: string;
  type: CanvasNodeType;
  position: { x: number; y: number };
  size: { width: number; height: number };
  zIndex: number;

  content?: ContainerSection;
  parentId?: string;
  container?: ContainerCapability;
  preset?: string;
  data?: Record<string, unknown>;
}
```

三个关键字段分别解决不同问题：

- `content`：节点内部怎么显示和编辑。
- `parentId` / `container.childIds`：容器包含哪些节点，以及子节点顺序。
- `connections`：节点之间有什么语义关系。

三者可以互相引用，但不应互相嵌套保存。

### 14.2 坐标模型

普通画布节点应坚持使用画布绝对坐标作为权威坐标。

原因：

- 创作者使用无限画布时依赖空间记忆，素材放在哪里就应稳定留在哪里。
- Scene 或 Group 可以组织节点，但不应该让普通节点突然切换成复杂的父级局部坐标。
- 绝对坐标能保持拖拽、框选、缩放、minimap、viewport culling、连接线渲染和复制粘贴稳定。
- 与现有 `.nkc` 数据兼容，迁移成本最低。

相对坐标适合以下范围：

- Shot 卡片内部的图片、标签、输入框。
- Gallery 单元格。
- Artboard 内部布局。
- Canvas Embed 内部子画布或预览。

普通 Canvas 节点不建议整体改成 parent-local 坐标。容器可以保存局部布局提示，但最终仍通过 store action 计算并写回节点的画布绝对位置。

### 14.3 容器边界

容器不是所有数据的拥有者，而是组织关系和展示入口。组织层应抽象为通用
`ContainerCapability`，Scene、Group、Artboard 只是第一批内置 policy，不应把组织层封死成
三种类型。

```typescript
interface ContainerCapability {
  childIds: string[];
  policy: 'scene' | 'group' | 'artboard' | (string & {});
  layout: ContainerLayoutState;
  acceptedTypes?: CanvasNodeType[];
  acceptedPresets?: string[];
}
```

第一阶段可以只内置三种 policy：

| Policy | 组织意图 | 默认布局 | 典型子节点 | 默认删除语义 |
|--------|----------|----------|------------|--------------|
| `scene` | 语义分镜容器 | `sequence` / `grid` | shot、media、annotation、gallery | 询问删除子树或释放子节点 |
| `group` | 空间分组 / 临时聚合 | `free` | 任意 CanvasNode | 默认释放子节点 |
| `artboard` | 有边界的导出 / 预览区域 | `absolute` / `bounded` | visual nodes | 询问删除子树或释放子节点 |

架构上应开放 policy registry，未来 Board、Sequence、Folder、Layer、Chapter、
Timeline Section 等都可以复用同一套容器能力。policy 定义 accepted children、自动布局、
删除语义、派生目标和批量动作，但不拥有子节点的业务数据。

容器绑定分三类：

| 类型 | 保存位置 | 说明 |
|------|----------|------|
| 内容绑定 | `node.content` | 容器节点自己的标题、按钮、子节点槽位等内部 UI |
| 节点绑定 | `parentId` / `container.childIds` | 容器包含哪些直接子节点 |
| 连接绑定 | `CanvasData.connections` | 连接线仍属于画布级图结构 |

规则：

- 一个节点同一时间最多一个 `parentId`。
- 容器的 `container.childIds` 只包含直接子节点。
- `parentId` 与 `container.childIds` 必须双向一致。
- 禁止容器形成环。
- 坐标可以辅助吸附和自动收编，但权威归属来自显式 ID。
- 删除容器时必须明确是删除子树，还是释放子节点。

判断一个结构是否进入组织层，只看它管理的子项是否需要独立 CanvasNode 身份：

- 需要独立选择、拖拽、连线、复制、生成、被 Agent 引用、出现在 minimap 或参与 culling：
  使用 `parentId` + `container.childIds`。
- 只是 row、cell、tag、entry：留在内容层集合中。
- 只是从已有节点或数据派生出的查看/编辑界面：使用投影视图，不复制权威数据。

因此表格、画廊、分镜表要区分处理：

| 结构 | 默认归属 | 说明 |
|------|----------|------|
| 普通表格 | 内容层 Collection | row/cell 保存在 `node.data`，由 TableBlock / CollectionView 渲染 |
| 画廊 | 内容层 Collection | GalleryCell 通常是一个语义资产内部的候选位 |
| 分镜表 | 内容层 Projection | 行通常引用 ShotNode，编辑写回 ShotNode.data，排序写回 Scene 容器顺序 |
| Scene 镜头列表 | 组织层 Container | Shot 是独立 CanvasNode，Scene 用 `container.childIds` 管理顺序 |
| Group 成员 | 组织层 Container | 子项是可独立操作的 CanvasNode |
| Artboard 内容 | 组织层 Container | 子项是导出/预览范围内的 CanvasNode |

表格行、画廊 cell 或规划表 row 可以通过显式操作提升为 CanvasNode，例如
`GalleryCell -> MediaNode`、`PlanningRow -> ShotNode`。提升之后才进入组织层。

### 14.4 连接线目标设计

连接线应保持独立图结构，不嵌入容器。

短期保留现有模型：

```typescript
interface CanvasConnection {
  sourceId: string;
  targetId: string;
  sourceAnchor: ConnectionAnchor;
  targetAnchor: ConnectionAnchor;
  sourcePort?: string;
  targetPort?: string;
}
```

中长期演进到 endpoint 模型：

```typescript
interface ConnectionEndpoint {
  nodeId: string;
  portId?: string;
  blockId?: string;
  fieldPath?: string;
}
```

这样可以逐步支持节点级连接、port 级连接、block 级连接和字段级连接。

容器折叠时，连接数据不变，只改变渲染：

- 内部连接隐藏或汇总。
- 外部连向子节点的线临时吸附到容器边界。
- 展开后恢复真实 endpoint。

### 14.5 扩展性目标

未来扩展不应继续依赖固定枚举膨胀。

推荐策略：

- 素材格式通过 `AssetBlock + mimeType + capabilities` 扩展，而不是为每种格式新增 Block 类型。
- 展示形式通过 layout renderer registry 扩展，而不是只依赖 `vertical/grid/free`。
- 输入内容通过 `FieldBinding.path + valueType + validator` 扩展，而不是裸 `bindField: string`。
- 新节点类型优先通过 preset 组合已有 Block，而不是新增大型 React 节点组件。
- Agent 工具读写同一套 schema，避免 UI、Agent、属性面板各自维护字段规则。

### 14.6 预览能力目标

预览应作为内容层能力组合，而不是每个节点类型各自实现一套预览逻辑。节点或 Block
通过能力声明获得预览、播放、委托、候选浏览、集合缩略和节点摘要能力：

```text
AssetIdentityCapability     资产身份：assetId / src / mimeType / format
PreviewCapability           预览变体：thumbnail / proxy / poster / waveform / turntable
PlaybackCapability          播放：audio / video / clip
DelegateCapability          委托打开：neko-preview / neko-model / neko-cut / neko-puppet
GenerationPreviewCapability 生成候选：history / selected candidate
CollectionPreviewCapability 集合预览：gallery cells / table rows
NodeSummaryCapability       节点缩略摘要：Scene 内的 Shot preview
```

预览管线：

```text
AssetBlock / preview-capable block
  → 读取 capabilities
  → PreviewResolver 请求 PreviewVariant
  → PreviewRendererRegistry 选择 renderer
  → PreviewRuntime 管理 hover / active playback / cleanup
  → DelegateCapability 打开专业扩展
```

不同素材类型使用不同能力组合：

| 类型 | 节点内预览 | 动态能力 | 完整查看 / 编辑 |
|------|------------|----------|-----------------|
| 文本 | 摘要、markdown/rich preview、line clamp | 选中后编辑、展开详情 | 脚本 / 文档编辑器 |
| 图片 | thumbnail / proxy `<img>` | 候选切换、hover 提示 | VSCode image viewer / neko-preview |
| 音频 | waveform 图、duration badge | 单个 active 播放、波形游标 | neko-preview / neko-cut |
| 视频 | poster / keyframe | hover 或 selected 低清 proxy 播放 | neko-preview / neko-cut |
| 全景图 / 360 视频 | flat proxy、FOV crop、rotation clip | 预渲染旋转片段；不做球面交互 | neko-preview panoramic viewer |
| 3D 模型 | screenshot | engine 预渲染 turntable | neko-model |
| 2D 骨骼 / Live2D | static pose | 预渲染 animation clip | neko-puppet |
| 文档 | cover thumbnail、页数、类型 badge | 可选少量页预览 | document preview / editor |
| 未知附件 | icon、文件名、大小、mime | 无 | 系统或对应扩展打开 |

持久化边界：

- 可持久化：`assetId`、`src`、`mimeType`、`format`、选中的生成候选 ID、稳定的预览偏好或默认视角。
- 不持久化：blob URL、engine token、当前播放进度、hover 状态、active player、WebGL/canvas 实例。

Canvas 内容层只做轻量确认：`thumbnail -> hover/selected dynamic preview -> double-click delegate`。
实时 3D 渲染、球面全景交互、HDR tone mapping、视频时间线剪辑、音频混音、重型解码和转码都不属于
Canvas Webview，应由 engine 生成预览变体，或委托 `neko-preview` / `neko-model` / `neko-cut`
/ `neko-puppet`。

Asset preview 和 Node preview 也要分开：

- Asset preview：预览某个 Block 引用的素材，例如图片、音频、视频、模型、文档。
- Node preview：预览另一个 CanvasNode 的摘要，例如 Scene 内的 Shot 缩略图、Group outline、
  minimap 摘要、Agent 上下文摘要。

容器不应完整渲染子节点第二遍，而应通过 `NodeSummaryCapability` 获取轻量
`NodePreviewDescriptor`。这样 Shot 图片、Gallery cell、Media node、Document cover、Model
turntable、Scene child slot 和 Agent 内容提取可以复用同一套预览能力。

### 14.7 自动排列目标

自动排列是必要能力，尤其用于派生节点和 Agent 批量创建。

目标拆成三类：

| 能力 | 用途 | 优先级 |
|------|------|--------|
| `findFreePosition` | 派生节点时找最近空位，避免覆盖已有节点 | P0 |
| `autoArrangeContainer` | Scene / Composite 内部自动排子节点 | P0/P1 |
| `autoLayoutGraph` | 全局图整理和连接线优化 | P2 |

默认行为：

- 派生节点优先放在源节点右侧。
- 如果右侧被占用，向下或向右搜索最近空位。
- Agent 创建 composite 时默认自动排列。
- 普通手动编辑不触发意外全局重排。
- 用户手动移动过的节点可标记为 `manualPositioned` 或 `layoutLocked`。

这能避免新内容覆盖旧内容，同时保护创作者已经建立的空间布局。

### 14.8 目标态总结

Canvas 的目标态不是“更多节点类型”，而是：

> 扁平画布图 + 绝对坐标 + 可组合节点内容 + 显式容器关系 + 独立连接线 + 注册表扩展 + 自动布局辅助。

这套设计既符合现有架构，也能支持未来更多素材格式、更多展示方式、更多输入控件和 Agent 批量创作。

---

## Appendix A: Block ↔ Existing Component Mapping

| Block Type | Existing Component to Reuse | Notes |
|------------|----------------------------|-------|
| `select` | `InlineSelect` (InlineControls.tsx) | Wrap as block renderer |
| `input` | `InlineInput` (InlineControls.tsx) | Wrap as block renderer |
| `text` | `EditableText` (components/common/) | Add `bindField` support |
| `button` | New, but pattern from SceneGroupNode buttons | Action dispatch |
| `tag-set` | Character/emotion tags from ShotNode | Extract + generalize |
| `status` | Status badge from ShotNode header | Extract + generalize |
| `image` | Image area from ShotNode/MediaNode | Extract core, add panoramic |
| `video` | MediaNode playback state machine | Simplify for block scope |
| `audio` | MediaNode audio mode | Extract waveform display |
| `key-value` | ScriptNode scene list pattern | Generalize layout |
| `table` | New | Use Tailwind grid |
| `list` | New | Ordered/unordered/checklist |
| `slider` | New | Standard range input |
| `toggle` | New | Standard checkbox/switch |
| `document` | DocumentNode thumbnail pattern | Extract |
| `model-2d` | New | Thumbnail + format badge |
| `model-3d` | ModelNode info card pattern | Add turntable preview |
| `attachment` | New | File icon + size + download |

## Appendix B: Data Flow Diagram

```
User interaction
  │
  ├─ Click SelectBlock(bindField="shotScale")
  │   └─ InlineSelect onChange
  │       └─ ctx.onUpdateData("shotScale", "CU")
  │           └─ canvasStore.updateNodeData(nodeId, { shotScale: "CU" })
  │               ├─ node.data.shotScale = "CU"     ← authoritative state
  │               ├─ historyStore.pushState()         ← undo/redo
  │               └─ re-render: SelectBlock reads node.data.shotScale
  │
  ├─ Agent calls canvas_update_node(nodeId, { shotScale: "CU" })
  │   └─ postMessage → webview → canvasStore.updateNodeData (same path)
  │       └─ SelectBlock re-renders automatically
  │
  └─ Agent calls canvas_update_block(nodeId, "blk-scale", { ... })
      └─ resolves bindField → updateNodeData (same path)
```

## Appendix C: Container Nesting Example

```
Canvas
  ├── SceneContainer (grid layout)
  │   ├── ShotContainer (vertical)
  │   │   ├── ImageBlock (generated image)
  │   │   ├── SelectBlock (shotScale)
  │   │   └── TextBlock (description)
  │   ├── ShotContainer (vertical)
  │   │   └── ...
  │   ├── GroupContainer (horizontal)      ← heterogeneous child
  │   │   ├── MediaNode (reference photo)
  │   │   └── AnnotationNode (notes)
  │   └── ShotContainer (vertical)
  │       └── ...
  │
  ├── GalleryContainer (grid layout)
  │   ├── ImageBlock (cell 1: 正面)
  │   ├── ImageBlock (cell 2: 侧面)
  │   └── ImageBlock (cell 3: 背面)
  │
  └── Standalone AnnotationNode
      └── TextBlock (free notes)
```
