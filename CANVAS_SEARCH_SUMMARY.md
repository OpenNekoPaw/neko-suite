# Neko Canvas - Complete Search Results Summary

## Overview

This document summarizes the comprehensive search of the neko-suite codebase for:
1. All node component files
2. Shared canvas types
3. TapNow references
4. BaseNode structure
5. Node rendering in InfiniteCanvas
6. Node type discrimination

---

## Search Results

### 1. Node Component Files Found

**Directory:** `packages/neko-canvas/packages/webview/src/components/nodes/`

| File | Lines | Purpose |
|------|-------|---------|
| `BaseNode.tsx` | 243 | Base component for all nodes |
| `MediaNode.tsx` | 252 | Video/image/audio display |
| `StoryboardNode.tsx` | 120 | Scene/shot representation |
| `AnnotationNode.tsx` | 81 | Text annotations |
| `TextNode.tsx` | 159 | Rich text editing |
| `ArtboardNode.tsx` | 154 | Fixed-size containers |
| `index.ts` | 22 | Public exports |

**Total:** 7 files, 1,031 lines of code

---

### 2. Shared Canvas Types

**Location:** `packages/neko-types/src/types/canvas.ts`

#### Core Type Definitions

```typescript
// Node type discriminator
export type CanvasNodeType = 'media' | 'storyboard' | 'annotation' | 'group';

// Base interface
export interface CanvasNodeBase {
  id: string;
  type: CanvasNodeType;
  position: { x: number; y: number };
  size: { width: number; height: number };
  zIndex: number;
  locked?: boolean;
  ports?: PortDefinition[];
}

// Port system (NEW)
export interface PortDefinition {
  id: string;
  type: 'input' | 'output';
  position: ConnectionAnchor;
  dataType?: PortDataType;
  label?: string;
  maxConnections?: number;
}

export type PortDataType = 'image' | 'video' | 'audio' | 'text' | 'any';

// Node implementations
export interface MediaCanvasNode extends CanvasNodeBase { type: 'media'; data: {...} }
export interface StoryboardCanvasNode extends CanvasNodeBase { type: 'storyboard'; data: {...} }
export interface AnnotationCanvasNode extends CanvasNodeBase { type: 'annotation'; data: {...} }
export interface GroupCanvasNode extends CanvasNodeBase { type: 'group'; data: {...} }

// Union type
export type CanvasNode = MediaCanvasNode | StoryboardCanvasNode | AnnotationCanvasNode | GroupCanvasNode;

// Type guards
export function isMediaNode(node: CanvasNode): node is MediaCanvasNode
export function isStoryboardNode(node: CanvasNode): node is StoryboardCanvasNode
export function isAnnotationNode(node: CanvasNode): node is AnnotationCanvasNode
export function isGroupNode(node: CanvasNode): node is GroupCanvasNode

// Port helpers
export function getDefaultPorts(nodeType: CanvasNodeType): PortDefinition[]
export function arePortTypesCompatible(sourceType?: PortDataType, targetType?: PortDataType): boolean
```

#### Extended Types (Webview-specific)

**Location:** `packages/neko-canvas/packages/webview/src/types/extendedCanvas.ts`

```typescript
export type ExtendedNodeType = 'media' | 'storyboard' | 'annotation' | 'group' | 'text' | 'artboard';

export interface TextCanvasNode extends Omit<CanvasNodeBase, 'type'> {
  type: 'text';
  data: { content: string; format?: 'plain' | 'markdown'; style?: TextNodeStyle };
}

export interface ArtboardCanvasNode extends Omit<CanvasNodeBase, 'type'> {
  type: 'artboard';
  data: { name: string; description?: string; backgroundColor?: string; preset?: ArtboardPreset };
}

export type ExtendedCanvasNode = BaseCanvasNode | TextCanvasNode | ArtboardCanvasNode;
```

---

### 3. TapNow References

#### Files Mentioning TapNow

1. **`packages/neko-canvas/packages/webview/src/components/toolbar/CanvasToolbar.tsx`**
   - Comment: "Inspired by TapNow's left sidebar design"
   - Context: UI toolbar design inspiration
   - Type: Design reference

2. **`packages/neko-canvas/PLAN.md`**
   - Line 4: "完成以下核心功能，缩小与 TapNow 画布的差距"
     - Translation: "Complete core features to narrow the gap with TapNow canvas"
   - Line 152: "参考 TapNow 的左侧垂直工具栏"
     - Translation: "Reference TapNow's left vertical toolbar"
   - Context: Feature parity goals and UI design inspiration
   - Type: Design reference and feature roadmap

#### TapNow Status

- **Not a dependency:** TapNow is not imported or integrated
- **Design inspiration:** Used as reference for UI/UX patterns
- **Feature reference:** Guides feature prioritization (ports, undo/redo, copy/paste)
- **Scope:** Primarily UI toolbar and canvas interaction patterns

---

### 4. BaseNode Component Structure

**File:** `packages/neko-canvas/packages/webview/src/components/nodes/BaseNode.tsx` (243 lines)

#### Purpose
Provides the common frame for all node types with:
- Selection management
- Drag-to-move functionality
- Port/anchor point rendering
- Lock indicator
- Z-index layering

#### Props Interface
```typescript
export interface BaseNodeProps {
  node: CanvasNode;
  viewport: CanvasViewport;
  isSelected: boolean;
  onSelect?: (nodeId: string, multi: boolean) => void;
  onDrag?: (nodeId: string, position: { x: number; y: number }) => void;
  onMove?: (nodeId: string, position: { x: number; y: number }) => void;
  onConnectionStart?: (nodeId: string, anchor: string, e: React.MouseEvent) => void;
  children: ReactNode;
  className?: string;
}
```

#### Key Features

**1. Dual Port System**
```typescript
const ports = node.ports ?? getDefaultPorts(node.type);
const hasPorts = ports.length > 0;

// If ports defined: render typed input/output ports
// Otherwise: render legacy 4-direction anchors (backward compatible)
```

**2. Port Styling**
- Input ports: Blue (#3b82f6), hollow circle
- Output ports: Green (#22c55e), solid circle
- Data type colors: image (amber), video (violet), audio (pink), text (cyan), any (gray)

**3. Port Positioning**
- Multiple ports on same side distributed evenly
- Spacing: `100 / (totalOnSide + 1)`
- Position: `spacing * (index + 1) %`

**4. Dragging**
- Real-time updates via `onDrag` callback
- Final position + history via `onMove` callback
- Respects `node.locked` state

**5. Selection**
- Click to select (single)
- Shift/Cmd+Click for multi-select
- Visual feedback: border color changes

**6. Lock Indicator**
- Shows 🔒 emoji when locked
- Prevents dragging and editing

#### Rendering Structure
```
<div> (outer container - positioned absolutely)
  <div> (node frame - border, bg, shadow)
    {children}
  </div>
  {/* Port layer (if hasPorts) */}
  {/* Legacy anchor layer (if !hasPorts && isSelected) */}
  {/* Lock indicator (if node.locked) */}
</div>
```

---

### 5. Node Rendering in InfiniteCanvas

**File:** `packages/neko-canvas/packages/webview/src/components/InfiniteCanvas.tsx` (265 lines)

#### Rendering Pipeline

```
InfiniteCanvas
  ↓
useViewportCulling (filter visible nodes)
  ↓
visibleNodes.map(node => renderNode(node, ...))
  ↓
renderNode() helper (type discrimination)
  ├─ 'media' → <MediaNode />
  ├─ 'storyboard' → <StoryboardNode />
  ├─ 'annotation' → <AnnotationNode />
  ├─ 'group' → <div> (simple container)
  └─ default → null
```

#### renderNode() Helper Function

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

#### Viewport Culling

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

### 6. Node Type Discrimination

#### Strategy: Discriminated Union

**Discriminator:** `node.type` field (string literal)

```typescript
export type CanvasNode =
  | { type: 'media'; data: MediaData }
  | { type: 'storyboard'; data: StoryboardData }
  | { type: 'annotation'; data: AnnotationData }
  | { type: 'group'; data: GroupData };
```

#### Type Guards

```typescript
export function isMediaNode(node: CanvasNode): node is MediaCanvasNode {
  return node.type === 'media';
}

export function isStoryboardNode(node: CanvasNode): node is StoryboardCanvasNode {
  return node.type === 'storyboard';
}

export function isAnnotationNode(node: CanvasNode): node is AnnotationCanvasNode {
  return node.type === 'annotation';
}

export function isGroupNode(node: CanvasNode): node is GroupCanvasNode {
  return node.type === 'group';
}
```

#### Usage Pattern

```typescript
// Type guard
if (isMediaNode(node)) {
  const path = node.data.assetPath;  // TypeScript knows type
}

// Switch statement
switch (node.type) {
  case 'media':
    // node is MediaCanvasNode
    break;
}

// Rendering
renderNode(node) {
  switch (node.type) {
    case 'media': return <MediaNode node={node as MediaCanvasNode} />;
    // ...
  }
}
```

#### Advantages

✅ Simple and efficient (O(1) lookup)
✅ Works with JSON serialization
✅ Backward compatible
✅ Extensible (add new types easily)
✅ Compile-time type safety
✅ No runtime overhead

---

## 7. Node Component Details

### MediaNode (252 lines)
- **Purpose:** Display video, image, or audio assets
- **Features:** Dual view modes (thumbnail + player), inline playback, duration badge
- **Ports:** Output only (right side)
- **Data:** assetPath, mediaType, duration

### StoryboardNode (120 lines)
- **Purpose:** Represent scenes/shots with metadata
- **Features:** Editable title/description, color-coded header, duration display
- **Ports:** Input (left) + Output (right)
- **Data:** title, description, duration, color

### AnnotationNode (81 lines)
- **Purpose:** Text annotations/notes on canvas
- **Features:** Yellow header, inline editing, respects lock state
- **Ports:** None (uses legacy anchors)
- **Data:** content, style

### TextNode (159 lines)
- **Purpose:** Rich text with formatting support
- **Features:** Double-click to edit, keyboard shortcuts, text styling
- **Ports:** None (extended type)
- **Data:** content, format, style

### ArtboardNode (154 lines)
- **Purpose:** Fixed-size container for independent editing/export
- **Features:** Preset sizes, grid background, center crosshairs, export button
- **Ports:** None (extended type)
- **Data:** name, preset, backgroundColor

---

## 8. Connection System

**File:** `packages/neko-canvas/packages/webview/src/components/connections/Connection.tsx`

### Connection Type
```typescript
export interface CanvasConnection {
  id: string;
  sourceId: string;
  sourceAnchor: ConnectionAnchor;
  targetId: string;
  targetAnchor: ConnectionAnchor;
  type?: ConnectionType;
  label?: string;
  sourcePort?: string;    // Port-based (new)
  targetPort?: string;    // Port-based (new)
}
```

### Port-Based Validation
```typescript
// In canvasStore.ts
const sourcePorts = sourceNode.ports ?? getDefaultPorts(sourceNode.type);
const targetPorts = targetNode.ports ?? getDefaultPorts(targetNode.type);

const sourcePort = sourcePorts.find((p: PortDefinition) => p.id === pendingConnectionSource.anchor);
const targetPort = targetPorts.find((p: PortDefinition) => p.id === anchor);

// Validation rules:
// 1. sourcePort.type === 'output'
// 2. targetPort.type === 'input'
// 3. arePortTypesCompatible(sourcePort.dataType, targetPort.dataType)
// 4. targetPort.maxConnections not exceeded
```

---

## 9. Store Integration

**File:** `packages/neko-canvas/packages/webview/src/stores/canvasStore.ts`

### Key Methods
```typescript
addNode(node: CanvasNode): void
removeNode(nodeId: string): void
updateNode(nodeId: string, updates: Partial<CanvasNode>): void
moveNode(nodeId: string, position: { x: number; y: number }): void
updateNodeData(nodeId: string, data: Record<string, unknown>): void

addConnection(connection: CanvasConnection): void
removeConnection(connectionId: string): void
validateConnection(...): boolean

selectNode(nodeId: string, multi: boolean): void
deselectAll(): void

setViewport(viewport: Partial<CanvasViewport>): void
```

---

## 10. File Organization

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
├── Type guards
└── Port helpers
```

### Extended Types (Webview)
```
packages/neko-canvas/packages/webview/src/types/extendedCanvas.ts
├── TextCanvasNode
├── ArtboardCanvasNode
├── ExtendedCanvasNode (union)
├── Type guards
└── Presets
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

## 11. Key Design Patterns

### 1. Discriminated Union
- **Pattern:** String literal discriminator + type guards
- **Benefit:** Compile-time type safety, no runtime overhead
- **Usage:** Node type discrimination

### 2. Component Composition
- **Pattern:** All nodes wrap BaseNode
- **Benefit:** DRY principle, consistent behavior
- **Usage:** Selection, dragging, ports work everywhere

### 3. Dual Port System
- **Pattern:** Explicit ports > default ports > empty
- **Benefit:** Backward compatibility + flexibility
- **Usage:** Port rendering in BaseNode

### 4. Callback Separation
- **Pattern:** onDrag (real-time) vs onMove (final)
- **Benefit:** Smooth UX + clean history
- **Usage:** Node dragging

### 5. Viewport Culling
- **Pattern:** Filter nodes before rendering
- **Benefit:** Performance for large canvases
- **Usage:** InfiniteCanvas rendering

---

## 12. Statistics

| Metric | Count |
|--------|-------|
| Node component files | 7 |
| Total lines of code (nodes) | 1,031 |
| Node types (base) | 4 |
| Node types (extended) | 2 |
| Port data types | 5 |
| Type guards | 6 |
| Port helpers | 2 |
| TapNow references | 3 |
| Files mentioning TapNow | 2 |

---

## 13. Recommendations

### For New Developers
1. Start with `CANVAS_NODE_ARCHITECTURE.md` for comprehensive overview
2. Read `CANVAS_VISUAL_REFERENCE.md` for visual diagrams
3. Study `BaseNode.tsx` to understand component structure
4. Review `InfiniteCanvas.tsx` to understand rendering pipeline
5. Check type definitions in `canvas.ts` for data structures

### For Adding New Node Types
1. Define interface in `canvas.ts` (or `extendedCanvas.ts` for webview-only)
2. Add to union type
3. Create type guard
4. Define default ports (if needed)
5. Create component wrapping BaseNode
6. Add to renderNode() switch statement
7. Export from index.ts

### For Debugging
1. Use type guards to check node type
2. Log `node.type` to verify discrimination
3. Check `node.ports` vs `getDefaultPorts(node.type)`
4. Verify port positions and colors
5. Check selection state and lock status

---

## 14. Related Files

### Hooks
- `useNodeDrag` - Node dragging logic
- `useViewportTransform` - Pan/zoom handling
- `useViewportCulling` - Visible node filtering
- `useConnectionDrag` - Connection drawing

### Components
- `CanvasGrid` - Background grid
- `CanvasViewport` - Transform layer
- `ConnectionLayer` - Connection rendering
- `Connection` - Individual connection

### Stores
- `canvasStore` - Canvas state management
- `historyStore` - Undo/redo (planned)
- `clipboardStore` - Copy/paste (planned)

---

## 15. Conclusion

The Neko Canvas node system is well-architected with:

✅ **Type Safety:** Discriminated unions with type guards
✅ **Extensibility:** Easy to add new node types
✅ **Performance:** Viewport culling for large canvases
✅ **Consistency:** BaseNode wrapper for common behavior
✅ **Flexibility:** Dual port system for backward compatibility
✅ **Design Reference:** TapNow inspiration for UI/UX

**TapNow Status:** Design reference only, not a dependency

---

**Document Version:** 1.0
**Last Updated:** 2024-02-10
**Scope:** Complete Search Results Summary
