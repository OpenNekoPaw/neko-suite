# Neko Canvas - Node Architecture & TapNow Reference

## Executive Summary

This document provides a complete overview of the **Neko Canvas** node system, including:
- All node component files and their structure
- Shared type definitions for canvas nodes
- TapNow references in the codebase
- BaseNode component architecture
- Node rendering pipeline in InfiniteCanvas
- Node type discrimination and factory patterns

---

## 1. TapNow References

### Location & Context

**Files mentioning TapNow:**
1. `/packages/neko-canvas/packages/webview/src/components/toolbar/CanvasToolbar.tsx`
   - Comment: "Inspired by TapNow's left sidebar design"
   - Context: UI toolbar design inspiration

2. `/packages/neko-canvas/PLAN.md`
   - Multiple references to "缩小与 TapNow 画布的差距" (narrow the gap with TapNow canvas)
   - References to "参考 TapNow 的左侧垂直工具栏" (reference TapNow's left vertical toolbar)

### TapNow as Design Reference

TapNow is used as a **design inspiration** for:
- Left sidebar vertical toolbar layout
- Canvas UI/UX patterns
- Feature parity goals (ports, undo/redo, copy/paste)

**Not a direct dependency** - just architectural inspiration.

---

## 2. Node Component Files

### Directory Structure

```
packages/neko-canvas/packages/webview/src/components/nodes/
├── index.ts                    # Public exports
├── BaseNode.tsx               # Base component (all nodes inherit)
├── MediaNode.tsx              # Media asset nodes (video/image/audio)
├── StoryboardNode.tsx         # Storyboard/scene nodes
├── AnnotationNode.tsx         # Text annotation nodes
├── TextNode.tsx               # Rich text nodes (extended type)
└── ArtboardNode.tsx           # Artboard/canvas nodes (extended type)
```

### File Inventory

| File | Type | Purpose | Lines |
|------|------|---------|-------|
| `BaseNode.tsx` | Component | Base frame for all nodes, handles selection, dragging, ports/anchors | 243 |
| `MediaNode.tsx` | Component | Displays video/image/audio with inline playback | 252 |
| `StoryboardNode.tsx` | Component | Scene/shot representation with title, description, duration | 120 |
| `AnnotationNode.tsx` | Component | Text annotations with inline editing | 81 |
| `TextNode.tsx` | Component | Rich text with formatting support | 159 |
| `ArtboardNode.tsx` | Component | Fixed-size container for independent editing/export | 154 |
| `index.ts` | Export | Public API for all node components | 22 |

---

## 3. Shared Type Definitions

### Location
`packages/neko-types/src/types/canvas.ts`

### Core Types

#### Node Type Discriminator
```typescript
export type CanvasNodeType = 'media' | 'storyboard' | 'annotation' | 'group';
```

#### Base Node Interface
```typescript
export interface CanvasNodeBase {
  id: string;                    // Unique identifier
  type: CanvasNodeType;          // Type discriminator
  position: { x: number; y: number };
  size: { width: number; height: number };
  zIndex: number;
  locked?: boolean;              // Prevent editing
  ports?: PortDefinition[];      // Optional port definitions
}
```

#### Port System (NEW)
```typescript
export interface PortDefinition {
  id: string;                    // Unique within node
  type: 'input' | 'output';      // Direction
  position: ConnectionAnchor;    // 'top' | 'right' | 'bottom' | 'left'
  dataType?: PortDataType;       // 'image' | 'video' | 'audio' | 'text' | 'any'
  label?: string;                // Display label
  maxConnections?: number;       // Default: 1 for input, Infinity for output
}

export type PortDataType = 'image' | 'video' | 'audio' | 'text' | 'any';
```

#### Node Type Implementations

**MediaCanvasNode**
```typescript
export interface MediaCanvasNode extends CanvasNodeBase {
  type: 'media';
  data: {
    assetPath: string;           // Relative path to media file
    thumbnailPath?: string;      // Thumbnail image path
    mediaType?: 'video' | 'image' | 'audio';
    duration?: number;           // Seconds (video/audio)
  };
}
```

**StoryboardCanvasNode**
```typescript
export interface StoryboardCanvasNode extends CanvasNodeBase {
  type: 'storyboard';
  data: {
    title: string;
    description?: string;
    duration?: number;           // Estimated seconds
    color?: string;              // Hex color for grouping
  };
}
```

**AnnotationCanvasNode**
```typescript
export interface AnnotationCanvasNode extends CanvasNodeBase {
  type: 'annotation';
  data: {
    content: string;
    style?: {
      fontSize?: number;
      color?: string;
      backgroundColor?: string;
    };
  };
}
```

**GroupCanvasNode**
```typescript
export interface GroupCanvasNode extends CanvasNodeBase {
  type: 'group';
  data: {
    childIds: string[];          // Child node IDs
    label?: string;
    color?: string;              // Hex color
  };
}
```

#### Union Type
```typescript
export type CanvasNode =
  | MediaCanvasNode
  | StoryboardCanvasNode
  | AnnotationCanvasNode
  | GroupCanvasNode;
```

#### Type Guards
```typescript
export function isMediaNode(node: CanvasNode): node is MediaCanvasNode
export function isStoryboardNode(node: CanvasNode): node is StoryboardCanvasNode
export function isAnnotationNode(node: CanvasNode): node is AnnotationCanvasNode
export function isGroupNode(node: CanvasNode): node is GroupCanvasNode
```

### Extended Types

**Location:** `packages/neko-canvas/packages/webview/src/types/extendedCanvas.ts`

Extended node types (webview-specific):

```typescript
export type ExtendedNodeType =
  | 'media' | 'storyboard' | 'annotation' | 'group'
  | 'text'      // Rich text node
  | 'artboard'; // Artboard/canvas node

export interface TextCanvasNode extends Omit<CanvasNodeBase, 'type'> {
  type: 'text';
  data: {
    content: string;
    format?: 'plain' | 'markdown';
    style?: TextNodeStyle;
  };
}

export interface ArtboardCanvasNode extends Omit<CanvasNodeBase, 'type'> {
  type: 'artboard';
  data: {
    name: string;
    description?: string;
    backgroundColor?: string;
    showBorder?: boolean;
    preset?: ArtboardPreset;  // '1080p' | '4k' | 'instagram' | 'story' | 'youtube'
  };
}

export type ExtendedCanvasNode =
  | BaseCanvasNode
  | TextCanvasNode
  | ArtboardCanvasNode;
```

### Default Ports

```typescript
// Media nodes: output only
export const MEDIA_NODE_PORTS: PortDefinition[] = [
  { id: 'out', type: 'output', position: 'right', dataType: 'any', label: 'Output' },
];

// Storyboard nodes: input + output
export const STORYBOARD_NODE_PORTS: PortDefinition[] = [
  { id: 'in', type: 'input', position: 'left', dataType: 'any', label: 'Input' },
  { id: 'out', type: 'output', position: 'right', dataType: 'any', label: 'Output' },
];

// Annotation nodes: no ports (uses legacy anchors)
export const ANNOTATION_NODE_PORTS: PortDefinition[] = [];

// Group nodes: input + output
export const GROUP_NODE_PORTS: PortDefinition[] = [
  { id: 'in', type: 'input', position: 'left', dataType: 'any', label: 'Input' },
  { id: 'out', type: 'output', position: 'right', dataType: 'any', label: 'Output' },
];

export function getDefaultPorts(nodeType: CanvasNodeType): PortDefinition[]
export function arePortTypesCompatible(sourceType?: PortDataType, targetType?: PortDataType): boolean
```

---

## 4. BaseNode Component Architecture

### Location
`packages/neko-canvas/packages/webview/src/components/nodes/BaseNode.tsx`

### Purpose
Provides the **common frame** for all node types:
- Selection state management
- Drag-to-move functionality
- Port/anchor point rendering
- Lock indicator
- Z-index layering

### Props Interface
```typescript
export interface BaseNodeProps {
  node: CanvasNode;
  viewport: CanvasViewport;
  isSelected: boolean;
  onSelect?: (nodeId: string, multi: boolean) => void;
  onDrag?: (nodeId: string, position: { x: number; y: number }) => void;  // Real-time
  onMove?: (nodeId: string, position: { x: number; y: number }) => void;  // Final
  onConnectionStart?: (nodeId: string, anchor: string, e: React.MouseEvent) => void;
  children: ReactNode;
  className?: string;
}
```

### Key Features

#### 1. Port System (Dual Mode)
```typescript
// Resolve ports: explicit node.ports > default ports for type > empty
const ports = node.ports ?? getDefaultPorts(node.type);
const hasPorts = ports.length > 0;
```

**Port Rendering:**
- If `node.ports` is defined and non-empty → render typed input/output ports
- Otherwise → fall back to legacy 4-direction anchor points (backward compatible)

#### 2. Port Styling
```typescript
const PORT_COLORS: Record<string, string> = {
  input: '#3b82f6',   // blue-500
  output: '#22c55e',  // green-500
};

const PORT_DATA_COLORS: Record<string, string> = {
  image: '#f59e0b',   // amber-500
  video: '#8b5cf6',   // violet-500
  audio: '#ec4899',   // pink-500
  text: '#06b6d4',    // cyan-500
  any: '#6b7280',     // gray-500
};
```

**Port Visual Indicators:**
- Input ports: hollow circle (inner dot)
- Output ports: solid circle
- Color by data type (if specified)
- Hover: scale up, increase opacity
- Selected node: ports always visible and scaled up

#### 3. Port Positioning
```typescript
// Multiple ports on same side are distributed evenly
const spacing = 100 / (totalOnSide + 1);
const percent = `${spacing * (index + 1)}%`;
```

#### 4. Dragging
Uses `useNodeDrag` hook:
- Real-time position updates via `onDrag` callback
- Final position + history via `onMove` callback on mouseup
- Respects `node.locked` state

#### 5. Selection
- Click to select (single)
- Shift/Cmd+Click for multi-select
- Visual feedback: border color changes

#### 6. Lock Indicator
- Shows 🔒 emoji when `node.locked === true`
- Prevents dragging and editing

### Rendering Structure
```
<div> (outer container - positioned absolutely)
  <div> (node frame - border, bg, shadow)
    {children}  ← Node-specific content
  </div>

  {/* Port-based connections (always visible) */}
  {hasPorts && ports.map(port => <div key={port.id} />)}

  {/* Legacy anchor points (only when selected, backward compat) */}
  {!hasPorts && isSelected && anchors.map(anchor => <div key={anchor} />)}

  {/* Lock indicator */}
  {node.locked && <div>🔒</div>}
</div>
```

---

## 5. Node Rendering Pipeline (InfiniteCanvas)

### Location
`packages/neko-canvas/packages/webview/src/components/InfiniteCanvas.tsx`

### Rendering Flow

```
InfiniteCanvas (main component)
  ↓
useViewportCulling (filter visible nodes)
  ↓
visibleNodes.map(node => renderNode(node, ...))
  ↓
renderNode() helper function (type discrimination)
  ├─ node.type === 'media' → <MediaNode />
  ├─ node.type === 'storyboard' → <StoryboardNode />
  ├─ node.type === 'annotation' → <AnnotationNode />
  ├─ node.type === 'group' → <div> (simple container)
  └─ default → null
```

### renderNode() Helper Function

```typescript
function renderNode(
  node: CanvasNode,
  viewport: ViewportType,
  isSelected: boolean,
  onSelect?: (nodeId: string, multi: boolean) => void,
  onDrag?: (nodeId: string, position: { x: number; y: number }) => void,
  onMove?: (nodeId: string, position: { x: number; y: number }) => void,
  onUpdateData?: (nodeId: string, data: Record<string, unknown>) => void,
  onConnectionStart?: (nodeId: string, anchor: string, e: React.MouseEvent) => void,
): React.ReactNode {
  const commonProps = {
    viewport,
    isSelected,
    onSelect,
    onDrag,
    onMove,
    onConnectionStart,
    onUpdateData,
  };

  switch (node.type) {
    case 'media':
      return <MediaNode key={node.id} node={node as MediaCanvasNode} {...commonProps} />;
    case 'storyboard':
      return <StoryboardNode key={node.id} node={node as StoryboardCanvasNode} {...commonProps} />;
    case 'annotation':
      return <AnnotationNode key={node.id} node={node as AnnotationCanvasNode} {...commonProps} />;
    case 'group':
      return <div key={node.id} className="..." style={{...}} />;
    default:
      return null;
  }
}
```

### Type Discrimination Strategy

**Discriminator:** `node.type` field (string literal)

**Advantages:**
- ✅ Simple and efficient
- ✅ Works with JSON serialization
- ✅ Backward compatible
- ✅ Extensible (add new types easily)

**Implementation Pattern:**
```typescript
// Type guard
export function isMediaNode(node: CanvasNode): node is MediaCanvasNode {
  return node.type === 'media';
}

// Usage in rendering
if (isMediaNode(node)) {
  // TypeScript knows node is MediaCanvasNode
  const { assetPath, mediaType } = node.data;
}
```

### Viewport Culling

```typescript
const { visibleNodes, culledCount, totalCount } = useViewportCulling({
  nodes,
  viewport,
  containerWidth: containerSize.width,
  containerHeight: containerSize.height,
  enabled: enableCulling,
});
```

**Purpose:** Only render nodes visible in current viewport
- Improves performance for large canvases
- Reduces DOM nodes
- Transparent to node components

---

## 6. Node Component Implementations

### MediaNode

**File:** `MediaNode.tsx` (252 lines)

**Purpose:** Display video, image, or audio assets with inline playback

**Features:**
- Dual view modes: thumbnail + player
- Click to expand to player view
- Media type badges (video/image/audio)
- Duration display for video/audio
- Inline VideoPlayer, AudioPlayer, ImageViewer components
- Supports zoom for images

**Data Structure:**
```typescript
data: {
  assetPath: string;
  thumbnailPath?: string;
  mediaType?: 'video' | 'image' | 'audio';
  duration?: number;
}
```

**Default Ports:** Output only (right side)

---

### StoryboardNode

**File:** `StoryboardNode.tsx` (120 lines)

**Purpose:** Represent scenes/shots with metadata

**Features:**
- Editable title and description
- Duration display
- Color-coded header for visual grouping
- Inline EditableText component
- Footer with storyboard label

**Data Structure:**
```typescript
data: {
  title: string;
  description?: string;
  duration?: number;
  color?: string;  // Hex color
}
```

**Default Ports:** Input (left) + Output (right)

---

### AnnotationNode

**File:** `AnnotationNode.tsx` (81 lines)

**Purpose:** Text annotations/notes on canvas

**Features:**
- Yellow header with note icon
- Editable content via EditableText
- Inline editing support
- Respects node.locked state

**Data Structure:**
```typescript
data: {
  content: string;
  style?: {
    fontSize?: number;
    color?: string;
    backgroundColor?: string;
  };
}
```

**Default Ports:** None (uses legacy 4-direction anchors)

---

### TextNode

**File:** `TextNode.tsx` (159 lines)

**Purpose:** Rich text with formatting support

**Features:**
- Double-click to edit
- Textarea for multi-line editing
- Keyboard shortcuts: Escape (cancel), Cmd+Enter (save)
- Supports text styling (font size, weight, color, alignment)
- Placeholder text when empty

**Data Structure:**
```typescript
data: {
  content: string;
  format?: 'plain' | 'markdown';
  style?: TextNodeStyle;
}
```

**Extended Type:** `TextCanvasNode` (webview-specific)

---

### ArtboardNode

**File:** `ArtboardNode.tsx` (154 lines)

**Purpose:** Fixed-size container for independent editing/export

**Features:**
- Preset sizes: 1080p, 4K, Instagram, Story, YouTube
- Grid background (optional)
- Center crosshairs
- Editable name and description
- Export button (TODO)
- Color-coded background

**Data Structure:**
```typescript
data: {
  name: string;
  description?: string;
  backgroundColor?: string;
  showBorder?: boolean;
  preset?: ArtboardPreset;  // 'custom' | '1080p' | '4k' | 'instagram' | 'story' | 'youtube'
}
```

**Extended Type:** `ArtboardCanvasNode` (webview-specific)

**Helper Function:**
```typescript
export function createArtboardData(
  preset: ArtboardPreset = 'custom',
  name?: string
): { data: ArtboardCanvasNode['data']; size: { width: number; height: number } }
```

---

## 7. Connection System

### Location
`packages/neko-canvas/packages/webview/src/components/connections/Connection.tsx`

### Connection Type
```typescript
export interface CanvasConnection {
  id: string;
  sourceId: string;
  sourceAnchor: ConnectionAnchor;
  targetId: string;
  targetAnchor: ConnectionAnchor;
  type?: ConnectionType;  // 'default' | 'sequence' | 'reference'
  label?: string;
  sourcePort?: string;    // Port-based (new)
  targetPort?: string;    // Port-based (new)
}
```

### Port-Based Connection Validation

**In canvasStore.ts:**
```typescript
const sourcePorts = sourceNode.ports ?? getDefaultPorts(sourceNode.type);
const targetPorts = targetNode.ports ?? getDefaultPorts(targetNode.type);

const sourcePort = sourcePorts.find((p: PortDefinition) => p.id === pendingConnectionSource.anchor);
const targetPort = targetPorts.find((p: PortDefinition) => p.id === anchor);

// Validation rules:
// 1. Only output → input
// 2. Type compatibility check (any matches all)
// 3. Input port max 1 connection
```

---

## 8. Store Integration

### Location
`packages/neko-canvas/packages/webview/src/stores/canvasStore.ts`

### Key Methods

```typescript
// Node operations
addNode(node: CanvasNode): void
removeNode(nodeId: string): void
updateNode(nodeId: string, updates: Partial<CanvasNode>): void
moveNode(nodeId: string, position: { x: number; y: number }): void
updateNodeData(nodeId: string, data: Record<string, unknown>): void

// Connection operations
addConnection(connection: CanvasConnection): void
removeConnection(connectionId: string): void
validateConnection(sourceNodeId: string, sourceAnchor: string, targetNodeId: string, targetAnchor: string): boolean

// Selection
selectNode(nodeId: string, multi: boolean): void
deselectAll(): void

// Viewport
setViewport(viewport: Partial<CanvasViewport>): void
```

### Port Validation in Store
```typescript
// Uses getDefaultPorts() and arePortTypesCompatible()
// Ensures only valid connections are created
```

---

## 9. Architecture Patterns

### 1. Type Discrimination (Discriminated Union)
```typescript
// Discriminator: node.type
type CanvasNode =
  | { type: 'media'; data: MediaData }
  | { type: 'storyboard'; data: StoryboardData }
  | { type: 'annotation'; data: AnnotationData }
  | { type: 'group'; data: GroupData };

// Type guard
function isMediaNode(node: CanvasNode): node is MediaCanvasNode {
  return node.type === 'media';
}

// Usage
if (isMediaNode(node)) {
  // TypeScript narrows type
  const path = node.data.assetPath;
}
```

### 2. Component Composition
```typescript
// All nodes wrap BaseNode
<BaseNode node={node} {...props}>
  <div>{/* Node-specific content */}</div>
</BaseNode>
```

### 3. Port System (Dual Mode)
```typescript
// Explicit ports > default ports > empty
const ports = node.ports ?? getDefaultPorts(node.type);
```

### 4. Callback Pattern
```typescript
// Real-time vs final updates
onDrag(nodeId, position)  // Every mousemove
onMove(nodeId, position)  // On mouseup (for history)
```

### 5. Viewport Culling
```typescript
// Only render visible nodes
useViewportCulling({ nodes, viewport, ... })
```

---

## 10. File Organization Summary

### Core Types (Shared)
```
packages/neko-types/src/types/canvas.ts
├── CanvasNodeType (discriminator)
├── CanvasNodeBase (base interface)
├── MediaCanvasNode
├── StoryboardCanvasNode
├── AnnotationCanvasNode
├── GroupCanvasNode
├── CanvasNode (union)
├── PortDefinition
├── CanvasConnection
├── Type guards (isMediaNode, etc.)
└── Port helpers (getDefaultPorts, arePortTypesCompatible)
```

### Extended Types (Webview)
```
packages/neko-canvas/packages/webview/src/types/extendedCanvas.ts
├── TextCanvasNode
├── ArtboardCanvasNode
├── ExtendedCanvasNode (union)
├── Type guards (isTextNode, isArtboardNode)
└── Presets (ARTBOARD_PRESETS, DEFAULT_TEXT_STYLE)
```

### Components (Webview)
```
packages/neko-canvas/packages/webview/src/components/nodes/
├── BaseNode.tsx (243 lines)
├── MediaNode.tsx (252 lines)
├── StoryboardNode.tsx (120 lines)
├── AnnotationNode.tsx (81 lines)
├── TextNode.tsx (159 lines)
├── ArtboardNode.tsx (154 lines)
└── index.ts (exports)
```

### Rendering
```
packages/neko-canvas/packages/webview/src/components/InfiniteCanvas.tsx
├── renderNode() helper (type discrimination)
├── Viewport culling integration
└── Connection layer integration
```

---

## 11. Key Design Decisions

### ✅ Discriminated Union for Type Safety
- **Why:** Compile-time type checking, no runtime overhead
- **How:** `node.type` field + type guards
- **Benefit:** Prevents invalid state, IDE autocomplete

### ✅ Dual Port System (Explicit + Default)
- **Why:** Backward compatibility + flexibility
- **How:** `node.ports ?? getDefaultPorts(node.type)`
- **Benefit:** Old nodes work, new nodes can customize

### ✅ Callback Separation (onDrag vs onMove)
- **Why:** Real-time UI updates vs history recording
- **How:** `onDrag` on mousemove, `onMove` on mouseup
- **Benefit:** Smooth UX + clean history

### ✅ Viewport Culling
- **Why:** Performance for large canvases
- **How:** Filter nodes before rendering
- **Benefit:** Transparent to components, scales well

### ✅ Component Composition (BaseNode wrapper)
- **Why:** DRY principle, consistent behavior
- **How:** All nodes inherit from BaseNode
- **Benefit:** Selection, dragging, ports work everywhere

---

## 12. Future Extensions

### Planned (from PLAN.md)

1. **Port System Enhancement**
   - ✅ Port definitions (done)
   - ⏳ Port-based connection validation
   - ⏳ Data type compatibility checking

2. **Undo/Redo System**
   - ⏳ historyStore.ts
   - ⏳ Command pattern implementation

3. **Copy/Paste System**
   - ⏳ clipboardStore.ts
   - ⏳ Node serialization

4. **UI Enhancements**
   - ⏳ Left sidebar toolbar
   - ⏳ Right property panel
   - ⏳ Enhanced context menu

---

## 13. Quick Reference

### Adding a New Node Type

1. **Define type in `canvas.ts`:**
   ```typescript
   export interface MyCanvasNode extends CanvasNodeBase {
     type: 'mytype';
     data: { /* ... */ };
   }
   ```

2. **Add to union:**
   ```typescript
   export type CanvasNode =
     | MediaCanvasNode
     | MyCanvasNode;  // ← Add here
   ```

3. **Add type guard:**
   ```typescript
   export function isMyNode(node: CanvasNode): node is MyCanvasNode {
     return node.type === 'mytype';
   }
   ```

4. **Add default ports (if needed):**
   ```typescript
   export const MY_NODE_PORTS: PortDefinition[] = [
     { id: 'in', type: 'input', position: 'left', dataType: 'any' },
     { id: 'out', type: 'output', position: 'right', dataType: 'any' },
   ];
   ```

5. **Create component:**
   ```typescript
   export function MyNode({ node, ...props }: MyNodeProps) {
     return (
       <BaseNode node={node} {...props}>
         {/* Content */}
       </BaseNode>
     );
   }
   ```

6. **Add to renderNode():**
   ```typescript
   case 'mytype':
     return <MyNode key={node.id} node={node as MyCanvasNode} {...commonProps} />;
   ```

7. **Export from index.ts:**
   ```typescript
   export { MyNode } from './MyNode';
   export type { MyNodeProps } from './MyNode';
   ```

---

## 14. Testing Checklist

- [ ] Node renders with correct type
- [ ] Selection works (single + multi)
- [ ] Dragging updates position
- [ ] Ports render correctly (if defined)
- [ ] Connections validate port types
- [ ] Lock state prevents editing
- [ ] Z-index layering works
- [ ] Viewport culling doesn't break rendering
- [ ] Type guards work correctly
- [ ] Serialization/deserialization preserves data

---

## Appendix: File Paths

```
packages/neko-types/src/types/canvas.ts
packages/neko-canvas/packages/webview/src/types/extendedCanvas.ts
packages/neko-canvas/packages/webview/src/components/nodes/BaseNode.tsx
packages/neko-canvas/packages/webview/src/components/nodes/MediaNode.tsx
packages/neko-canvas/packages/webview/src/components/nodes/StoryboardNode.tsx
packages/neko-canvas/packages/webview/src/components/nodes/AnnotationNode.tsx
packages/neko-canvas/packages/webview/src/components/nodes/TextNode.tsx
packages/neko-canvas/packages/webview/src/components/nodes/ArtboardNode.tsx
packages/neko-canvas/packages/webview/src/components/nodes/index.ts
packages/neko-canvas/packages/webview/src/components/InfiniteCanvas.tsx
packages/neko-canvas/packages/webview/src/components/connections/Connection.tsx
packages/neko-canvas/packages/webview/src/stores/canvasStore.ts
packages/neko-canvas/PLAN.md
```

---

**Document Version:** 1.0
**Last Updated:** 2024-02-10
**Scope:** Neko Canvas Node Architecture & TapNow References
