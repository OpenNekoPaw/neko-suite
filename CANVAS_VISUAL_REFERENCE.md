# Neko Canvas - Visual Architecture & Quick Reference

## 1. Node Type Hierarchy

```
CanvasNodeBase (interface)
├── id: string
├── type: CanvasNodeType (discriminator)
├── position: { x, y }
├── size: { width, height }
├── zIndex: number
├── locked?: boolean
└── ports?: PortDefinition[]

    ↓ Implementations ↓

MediaCanvasNode
├── type: 'media'
└── data: { assetPath, thumbnailPath, mediaType, duration }

StoryboardCanvasNode
├── type: 'storyboard'
└── data: { title, description, duration, color }

AnnotationCanvasNode
├── type: 'annotation'
└── data: { content, style }

GroupCanvasNode
├── type: 'group'
└── data: { childIds, label, color }

[Extended Types - Webview Only]

TextCanvasNode
├── type: 'text'
└── data: { content, format, style }

ArtboardCanvasNode
├── type: 'artboard'
└── data: { name, description, backgroundColor, preset }
```

---

## 2. Component Rendering Pipeline

```
┌─────────────────────────────────────────────────────────────┐
│ InfiniteCanvas (main container)                             │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ CanvasGrid (background)                              │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ CanvasViewport (transform layer)                     │  │
│  ├──────────────────────────────────────────────────────┤  │
│  │                                                       │  │
│  │  ┌────────────────────────────────────────────────┐ │  │
│  │  │ ConnectionLayer (lines between nodes)         │ │  │
│  │  └────────────────────────────────────────────────┘ │  │
│  │                                                       │  │
│  │  ┌────────────────────────────────────────────────┐ │  │
│  │  │ Node Layer (rendered via renderNode())        │ │  │
│  │  ├────────────────────────────────────────────────┤ │  │
│  │  │                                                 │ │  │
│  │  │  visibleNodes.map(node => renderNode(node))   │ │  │
│  │  │                                                 │ │  │
│  │  │  ┌──────────────────────────────────────────┐ │ │  │
│  │  │  │ renderNode() - Type Discrimination      │ │ │  │
│  │  │  ├──────────────────────────────────────────┤ │ │  │
│  │  │  │                                           │ │ │  │
│  │  │  │ switch (node.type) {                     │ │ │  │
│  │  │  │   case 'media':                          │ │ │  │
│  │  │  │     return <MediaNode />                 │ │ │  │
│  │  │  │   case 'storyboard':                     │ │ │  │
│  │  │  │     return <StoryboardNode />            │ │ │  │
│  │  │  │   case 'annotation':                     │ │ │  │
│  │  │  │     return <AnnotationNode />            │ │ │  │
│  │  │  │   case 'group':                          │ │ │  │
│  │  │  │     return <div> (simple container)      │ │ │  │
│  │  │  │ }                                         │ │ │  │
│  │  │  │                                           │ │ │  │
│  │  │  └──────────────────────────────────────────┘ │ │  │
│  │  │                                                 │ │  │
│  │  │  ┌──────────────────────────────────────────┐ │ │  │
│  │  │  │ Each Node Component                      │ │ │  │
│  │  │  ├──────────────────────────────────────────┤ │ │  │
│  │  │  │                                           │ │ │  │
│  │  │  │ <BaseNode node={node} {...props}>       │ │ │  │
│  │  │  │   <div>{/* Node-specific content */}</div>│ │ │  │
│  │  │  │ </BaseNode>                              │ │ │  │
│  │  │  │                                           │ │ │  │
│  │  │  └──────────────────────────────────────────┘ │ │  │
│  │  │                                                 │ │  │
│  │  └────────────────────────────────────────────────┘ │  │
│  │                                                       │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ Canvas Info Overlay (stats)                          │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. BaseNode Internal Structure

```
<BaseNode>
  ├─ Outer Container (positioned absolutely)
  │  ├─ position: { x, y }
  │  ├─ size: { width, height }
  │  ├─ zIndex: node.zIndex
  │  └─ cursor: grab | grabbing | not-allowed
  │
  ├─ Inner Frame (border, bg, shadow)
  │  ├─ border: 2px solid
  │  ├─ borderColor: selected ? var(--node-selected) : var(--node-border)
  │  ├─ backgroundColor: var(--node-bg)
  │  └─ shadow: lg | 2xl (when dragging)
  │
  ├─ {children} (node-specific content)
  │  └─ Rendered by MediaNode, StoryboardNode, etc.
  │
  ├─ Port Layer (if hasPorts)
  │  ├─ Grouped by position (top, right, bottom, left)
  │  ├─ Distributed evenly on each side
  │  ├─ Color by dataType (image, video, audio, text, any)
  │  ├─ Input ports: hollow circle (inner dot)
  │  └─ Output ports: solid circle
  │
  ├─ Legacy Anchor Layer (if !hasPorts && isSelected)
  │  ├─ top anchor
  │  ├─ right anchor
  │  ├─ bottom anchor
  │  └─ left anchor
  │
  └─ Lock Indicator (if node.locked)
     └─ 🔒 emoji (top-right)
```

---

## 4. Port System (Dual Mode)

```
┌─────────────────────────────────────────────────────────┐
│ Port Resolution Logic                                   │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  const ports = node.ports ?? getDefaultPorts(node.type) │
│                                                          │
│  ┌──────────────────────────────────────────────────┐  │
│  │ Priority:                                        │  │
│  │ 1. Explicit node.ports (if defined & non-empty) │  │
│  │ 2. Default ports for node.type                  │  │
│  │ 3. Empty array (no ports)                       │  │
│  └──────────────────────────────────────────────────┘  │
│                                                          │
│  ┌──────────────────────────────────────────────────┐  │
│  │ Rendering:                                       │  │
│  │ if (hasPorts) {                                 │  │
│  │   render typed input/output ports               │  │
│  │ } else if (isSelected) {                        │  │
│  │   render legacy 4-direction anchors             │  │
│  │ }                                                │  │
│  └──────────────────────────────────────────────────┘  │
│                                                          │
└─────────────────────────────────────────────────────────┘

Default Ports by Type:

┌─────────────────────────────────────────────────────────┐
│ MediaNode                                               │
├─────────────────────────────────────────────────────────┤
│ Output: right side (green)                              │
│ DataType: any                                           │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ StoryboardNode                                          │
├─────────────────────────────────────────────────────────┤
│ Input: left side (blue)                                 │
│ Output: right side (green)                              │
│ DataType: any                                           │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ AnnotationNode                                          │
├─────────────────────────────────────────────────────────┤
│ No ports (uses legacy anchors)                          │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ GroupNode                                               │
├─────────────────────────────────────────────────────────┤
│ Input: left side (blue)                                 │
│ Output: right side (green)                              │
│ DataType: any                                           │
└─────────────────────────────────────────────────────────┘
```

---

## 5. Port Positioning Algorithm

```
For each side (top, right, bottom, left):
  1. Count ports on this side: totalOnSide
  2. Calculate spacing: 100 / (totalOnSide + 1)
  3. For each port at index i:
     position = spacing * (i + 1) %

Example: 3 ports on right side
  spacing = 100 / (3 + 1) = 25%
  port[0] = 25%
  port[1] = 50%
  port[2] = 75%

Visual:
  ┌─────────────────┐
  │                 ●  port[0] @ 25%
  │                 │
  │                 ●  port[1] @ 50%
  │                 │
  │                 ●  port[2] @ 75%
  └─────────────────┘
```

---

## 6. Type Discrimination Flow

```
┌─────────────────────────────────────────────────────────┐
│ Input: CanvasNode (union type)                          │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  CanvasNode =                                           │
│    | MediaCanvasNode                                    │
│    | StoryboardCanvasNode                               │
│    | AnnotationCanvasNode                               │
│    | GroupCanvasNode                                    │
│                                                          │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│ Discriminator: node.type (string literal)               │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  Type Guards:                                           │
│  - isMediaNode(node): node is MediaCanvasNode           │
│  - isStoryboardNode(node): node is StoryboardCanvasNode │
│  - isAnnotationNode(node): node is AnnotationCanvasNode │
│  - isGroupNode(node): node is GroupCanvasNode           │
│                                                          │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│ renderNode() Switch Statement                           │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  switch (node.type) {                                   │
│    case 'media':      → <MediaNode />                   │
│    case 'storyboard': → <StoryboardNode />              │
│    case 'annotation': → <AnnotationNode />              │
│    case 'group':      → <div> (container)               │
│    default:           → null                            │
│  }                                                       │
│                                                          │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│ Output: React.ReactNode (typed component)               │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  TypeScript knows:                                      │
│  - node is MediaCanvasNode                              │
│  - node.data has assetPath, mediaType, etc.             │
│  - IDE provides autocomplete                            │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

---

## 7. Connection Validation Flow

```
User drags from port A to port B
        ↓
onConnectionStart(nodeId, portId)
        ↓
startDragConnection() hook
        ↓
User releases mouse
        ↓
onConnectionComplete(sourceNodeId, sourcePortId, targetNodeId, targetPortId)
        ↓
┌─────────────────────────────────────────────────────────┐
│ canvasStore.validateConnection()                        │
├─────────────────────────────────────────────────────────┤
│                                                          │
│ 1. Get source node & port                               │
│    sourcePorts = sourceNode.ports ?? getDefaultPorts()  │
│    sourcePort = sourcePorts.find(p => p.id === portId)  │
│                                                          │
│ 2. Get target node & port                               │
│    targetPorts = targetNode.ports ?? getDefaultPorts()  │
│    targetPort = targetPorts.find(p => p.id === portId)  │
│                                                          │
│ 3. Validate:                                            │
│    ✓ sourcePort.type === 'output'                       │
│    ✓ targetPort.type === 'input'                        │
│    ✓ arePortTypesCompatible(sourcePort.dataType,       │
│                             targetPort.dataType)        │
│    ✓ targetPort has < maxConnections                    │
│                                                          │
│ 4. If valid:                                            │
│    addConnection({                                      │
│      sourceId, sourcePort,                              │
│      targetId, targetPort,                              │
│      ...                                                 │
│    })                                                    │
│                                                          │
└─────────────────────────────────────────────────────────┘
        ↓
Connection added to canvas
```

---

## 8. Node Component Hierarchy

```
BaseNode (243 lines)
├─ Handles: selection, dragging, ports/anchors, lock
├─ Props: node, viewport, isSelected, onSelect, onDrag, onMove, onConnectionStart
└─ Children: node-specific content

    ↓ Extends ↓

MediaNode (252 lines)
├─ Displays: video/image/audio with inline playback
├─ Features: thumbnail + player modes, duration badge
└─ Data: assetPath, mediaType, duration

StoryboardNode (120 lines)
├─ Displays: scene/shot with metadata
├─ Features: editable title/description, color-coded header
└─ Data: title, description, duration, color

AnnotationNode (81 lines)
├─ Displays: text annotation/note
├─ Features: yellow header, inline editing
└─ Data: content, style

TextNode (159 lines)
├─ Displays: rich text with formatting
├─ Features: double-click to edit, keyboard shortcuts
└─ Data: content, format, style

ArtboardNode (154 lines)
├─ Displays: fixed-size container
├─ Features: preset sizes, grid background, crosshairs
└─ Data: name, preset, backgroundColor
```

---

## 9. Data Flow: Node Update

```
User Action (e.g., drag node)
        ↓
BaseNode.onMouseDown
        ↓
useNodeDrag hook
        ↓
┌─────────────────────────────────────────────────────────┐
│ During drag (mousemove)                                 │
├─────────────────────────────────────────────────────────┤
│                                                          │
│ onDrag(nodeId, { x, y })                                │
│        ↓                                                 │
│ canvasStore.moveNode(nodeId, { x, y })                  │
│        ↓                                                 │
│ Update store state (real-time)                          │
│        ↓                                                 │
│ Re-render node at new position                          │
│        ↓                                                 │
│ Smooth visual feedback                                  │
│                                                          │
└─────────────────────────────────────────────────────────┘
        ↓
┌─────────────────────────────────────────────────────────┐
│ On drag end (mouseup)                                   │
├─────────────────────────────────────────────────────────┤
│                                                          │
│ onMove(nodeId, { x, y })                                │
│        ↓                                                 │
│ canvasStore.updateNode(nodeId, { position })            │
│        ↓                                                 │
│ historyStore.pushState(canvasData)                       │
│        ↓                                                 │
│ Record in undo/redo stack                               │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

---

## 10. Viewport Culling

```
┌─────────────────────────────────────────────────────────┐
│ useViewportCulling Hook                                 │
├─────────────────────────────────────────────────────────┤
│                                                          │
│ Input:                                                  │
│  - nodes: CanvasNode[]                                  │
│  - viewport: { pan, zoom }                              │
│  - containerSize: { width, height }                     │
│  - enabled: boolean                                     │
│                                                          │
│ Process:                                                │
│  1. Calculate visible bounds in canvas coordinates      │
│  2. Filter nodes: node.position + node.size within      │
│     visible bounds (with padding)                       │
│  3. Return: { visibleNodes, culledCount, totalCount }   │
│                                                          │
│ Output:                                                 │
│  - visibleNodes: CanvasNode[] (only visible)            │
│  - culledCount: number (not rendered)                   │
│  - totalCount: number (all nodes)                       │
│                                                          │
└─────────────────────────────────────────────────────────┘
        ↓
Only visibleNodes are rendered to DOM
        ↓
Performance improvement for large canvases
```

---

## 11. Quick Lookup: Node Types

| Type | Component | Ports | Features | Data |
|------|-----------|-------|----------|------|
| `media` | MediaNode | Output (right) | Playback, thumbnails | assetPath, mediaType, duration |
| `storyboard` | StoryboardNode | Input + Output | Editable metadata | title, description, color |
| `annotation` | AnnotationNode | None (legacy) | Text notes | content, style |
| `group` | div | Input + Output | Container | childIds, label |
| `text` | TextNode | None | Rich text editing | content, format, style |
| `artboard` | ArtboardNode | None | Fixed-size container | name, preset, backgroundColor |

---

## 12. Quick Lookup: Port Colors

| Data Type | Color | Hex |
|-----------|-------|-----|
| `image` | Amber | #f59e0b |
| `video` | Violet | #8b5cf6 |
| `audio` | Pink | #ec4899 |
| `text` | Cyan | #06b6d4 |
| `any` | Gray | #6b7280 |
| Input (default) | Blue | #3b82f6 |
| Output (default) | Green | #22c55e |

---

## 13. Quick Lookup: Artboard Presets

| Preset | Dimensions | Aspect Ratio | Use Case |
|--------|-----------|--------------|----------|
| `custom` | 800×600 | Custom | User-defined |
| `1080p` | 1920×1080 | 16:9 | HD video |
| `4k` | 3840×2160 | 16:9 | 4K video |
| `instagram` | 1080×1080 | 1:1 | Instagram posts |
| `story` | 1080×1920 | 9:16 | Stories/reels |
| `youtube` | 1280×720 | 16:9 | YouTube thumbnails |

---

## 14. TapNow References Summary

| Reference | Location | Context |
|-----------|----------|---------|
| "Inspired by TapNow's left sidebar design" | CanvasToolbar.tsx | UI toolbar inspiration |
| "缩小与 TapNow 画布的差距" | PLAN.md | Feature parity goal |
| "参考 TapNow 的左侧垂直工具栏" | PLAN.md | Toolbar layout reference |

**Status:** TapNow is a **design reference**, not a dependency or integration point.

---

## 15. Common Tasks

### Task: Render a node
```typescript
// In renderNode() helper
case 'media':
  return (
    <MediaNode
      key={node.id}
      node={node as MediaCanvasNode}
      viewport={viewport}
      isSelected={isSelected}
      onSelect={onSelect}
      onDrag={onDrag}
      onMove={onMove}
      onConnectionStart={onConnectionStart}
    />
  );
```

### Task: Check node type
```typescript
// Use type guard
if (isMediaNode(node)) {
  const path = node.data.assetPath;
}

// Or discriminator
switch (node.type) {
  case 'media':
    // node is MediaCanvasNode
    break;
}
```

### Task: Get node ports
```typescript
const ports = node.ports ?? getDefaultPorts(node.type);
const hasInputPort = ports.some(p => p.type === 'input');
```

### Task: Validate connection
```typescript
const compatible = arePortTypesCompatible(
  sourcePort.dataType,
  targetPort.dataType
);
```

### Task: Create new node
```typescript
const newNode: MediaCanvasNode = {
  id: generateId(),
  type: 'media',
  position: { x: 100, y: 100 },
  size: { width: 200, height: 150 },
  zIndex: 1,
  data: {
    assetPath: 'path/to/video.mp4',
    mediaType: 'video',
  },
};
```

---

## 16. Performance Considerations

| Optimization | Mechanism | Benefit |
|--------------|-----------|---------|
| Viewport Culling | useViewportCulling hook | Only render visible nodes |
| Type Discrimination | String literal switch | O(1) lookup, no instanceof |
| Port Caching | Memoized getDefaultPorts | Avoid recalculation |
| Callback Separation | onDrag vs onMove | Smooth UX + clean history |
| Component Composition | BaseNode wrapper | Reuse logic, DRY |

---

## 17. Debugging Tips

### Check node type
```typescript
console.log('Node type:', node.type);
console.log('Is media?', isMediaNode(node));
```

### Check ports
```typescript
const ports = node.ports ?? getDefaultPorts(node.type);
console.log('Ports:', ports);
console.log('Has ports?', ports.length > 0);
```

### Check selection
```typescript
console.log('Selected?', selectedNodeIds.includes(node.id));
```

### Check position
```typescript
console.log('Position:', node.position);
console.log('Size:', node.size);
console.log('ZIndex:', node.zIndex);
```

### Check lock state
```typescript
console.log('Locked?', node.locked);
```

---

**Document Version:** 1.0
**Last Updated:** 2024-02-10
**Scope:** Visual Architecture & Quick Reference
