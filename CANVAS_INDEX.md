# Neko Canvas - Complete Documentation Index

## 📚 Documentation Overview

This index provides quick access to all canvas-related documentation created from the comprehensive codebase search.

---

## 📖 Main Documents

### 1. **CANVAS_NODE_ARCHITECTURE.md** (Primary Reference)
**Purpose:** Comprehensive technical documentation of the node system

**Contents:**
- Executive summary
- TapNow references and status
- All node component files (7 files, 1,031 lines)
- Shared type definitions (canvas.ts)
- Extended types (extendedCanvas.ts)
- BaseNode component architecture (243 lines)
- Node rendering pipeline in InfiniteCanvas
- Node type discrimination strategy
- Detailed component implementations (MediaNode, StoryboardNode, etc.)
- Connection system and validation
- Store integration
- Architecture patterns and design decisions
- Future extensions from PLAN.md
- Quick reference for adding new node types
- Testing checklist

**Best For:** Understanding the complete architecture, learning how nodes work, implementing new features

**Key Sections:**
- Section 3: Shared Types (CanvasNode, PortDefinition, etc.)
- Section 4: BaseNode Architecture (dual port system)
- Section 5: Node Rendering Pipeline (renderNode function)
- Section 6: Node Type Discrimination (discriminated union pattern)
- Section 11: Key Design Decisions

---

### 2. **CANVAS_VISUAL_REFERENCE.md** (Visual Guide)
**Purpose:** Visual diagrams and quick lookup tables

**Contents:**
- Node type hierarchy diagram
- Component rendering pipeline flowchart
- BaseNode internal structure diagram
- Port system (dual mode) diagram
- Port positioning algorithm with examples
- Type discrimination flow diagram
- Connection validation flow diagram
- Node component hierarchy
- Data flow for node updates
- Viewport culling diagram
- Quick lookup tables (node types, port colors, artboard presets)
- TapNow references summary
- Common tasks with code examples
- Performance considerations
- Debugging tips

**Best For:** Visual learners, quick reference, understanding data flow, debugging

**Key Sections:**
- Section 2: Component Rendering Pipeline (visual)
- Section 3: BaseNode Internal Structure (visual)
- Section 4: Port System (visual)
- Section 6: Type Discrimination Flow (visual)
- Section 11: Quick Lookup Tables

---

### 3. **CANVAS_SEARCH_SUMMARY.md** (Search Results)
**Purpose:** Complete summary of all search findings

**Contents:**
- Overview of search scope
- Node component files inventory (7 files)
- Shared canvas types (canvas.ts)
- Extended types (extendedCanvas.ts)
- TapNow references (3 references in 2 files)
- BaseNode structure and features
- Node rendering pipeline
- Type discrimination strategy
- Node component details (5 components)
- Connection system
- Store integration
- File organization
- Key design patterns
- Statistics and metrics
- Recommendations for developers
- Related files and hooks

**Best For:** Getting a complete overview, understanding what was found, statistics

**Key Sections:**
- Section 3: TapNow References (complete list)
- Section 4: BaseNode Component Structure
- Section 5: Node Rendering in InfiniteCanvas
- Section 6: Node Type Discrimination
- Section 12: Statistics

---

## 🎯 Quick Navigation by Task

### I want to understand...

**...how nodes are rendered**
→ Read: CANVAS_VISUAL_REFERENCE.md Section 2 (Component Rendering Pipeline)
→ Then: CANVAS_NODE_ARCHITECTURE.md Section 5 (Node Rendering Pipeline)

**...the node type system**
→ Read: CANVAS_VISUAL_REFERENCE.md Section 6 (Type Discrimination Flow)
→ Then: CANVAS_NODE_ARCHITECTURE.md Section 6 (Node Type Discrimination)

**...the port system**
→ Read: CANVAS_VISUAL_REFERENCE.md Section 4 (Port System)
→ Then: CANVAS_NODE_ARCHITECTURE.md Section 4 (BaseNode Port System)

**...how to add a new node type**
→ Read: CANVAS_NODE_ARCHITECTURE.md Section 13 (Quick Reference)
→ Then: CANVAS_VISUAL_REFERENCE.md Section 15 (Common Tasks)

**...TapNow references**
→ Read: CANVAS_SEARCH_SUMMARY.md Section 3 (TapNow References)
→ Or: CANVAS_NODE_ARCHITECTURE.md Section 1 (TapNow References)

**...the complete architecture**
→ Read: CANVAS_NODE_ARCHITECTURE.md (entire document)

**...visual diagrams**
→ Read: CANVAS_VISUAL_REFERENCE.md (entire document)

**...what was found in the search**
→ Read: CANVAS_SEARCH_SUMMARY.md (entire document)

---

## 📋 File Inventory

### Node Component Files (7 files)

| File | Lines | Purpose | Ports |
|------|-------|---------|-------|
| BaseNode.tsx | 243 | Base component for all nodes | Varies |
| MediaNode.tsx | 252 | Video/image/audio display | Output |
| StoryboardNode.tsx | 120 | Scene/shot representation | Input + Output |
| AnnotationNode.tsx | 81 | Text annotations | None |
| TextNode.tsx | 159 | Rich text editing | None |
| ArtboardNode.tsx | 154 | Fixed-size containers | None |
| index.ts | 22 | Public exports | - |

**Location:** `packages/neko-canvas/packages/webview/src/components/nodes/`

### Type Definition Files

| File | Purpose |
|------|---------|
| `packages/neko-types/src/types/canvas.ts` | Core canvas types (shared) |
| `packages/neko-canvas/packages/webview/src/types/extendedCanvas.ts` | Extended types (webview-only) |

### Rendering Files

| File | Purpose |
|------|---------|
| `packages/neko-canvas/packages/webview/src/components/InfiniteCanvas.tsx` | Main canvas component with renderNode() |
| `packages/neko-canvas/packages/webview/src/components/connections/Connection.tsx` | Connection rendering |

### Store Files

| File | Purpose |
|------|---------|
| `packages/neko-canvas/packages/webview/src/stores/canvasStore.ts` | Canvas state management |

### Planning Files

| File | Purpose |
|------|---------|
| `packages/neko-canvas/PLAN.md` | Feature roadmap (includes TapNow references) |

---

## 🔍 TapNow References

### Complete List

1. **CanvasToolbar.tsx**
   - Comment: "Inspired by TapNow's left sidebar design"
   - Type: UI design inspiration
   - Status: Reference only

2. **PLAN.md (Line 4)**
   - Text: "完成以下核心功能，缩小与 TapNow 画布的差距"
   - Translation: "Complete core features to narrow the gap with TapNow canvas"
   - Type: Feature parity goal
   - Status: Design reference

3. **PLAN.md (Line 152)**
   - Text: "参考 TapNow 的左侧垂直工具栏"
   - Translation: "Reference TapNow's left vertical toolbar"
   - Type: UI design reference
   - Status: Design inspiration

### TapNow Status Summary

- **Not a dependency:** No imports or integrations
- **Design reference:** Used for UI/UX patterns
- **Feature reference:** Guides feature prioritization
- **Scope:** Primarily toolbar and canvas interaction

---

## 🏗️ Architecture Patterns

### 1. Discriminated Union (Type Safety)
```typescript
type CanvasNode =
  | { type: 'media'; data: MediaData }
  | { type: 'storyboard'; data: StoryboardData }
  | { type: 'annotation'; data: AnnotationData }
  | { type: 'group'; data: GroupData };
```
**Benefit:** Compile-time type checking, no runtime overhead

### 2. Component Composition (DRY)
```typescript
<BaseNode node={node} {...props}>
  {/* Node-specific content */}
</BaseNode>
```
**Benefit:** Reuse logic, consistent behavior

### 3. Dual Port System (Backward Compatibility)
```typescript
const ports = node.ports ?? getDefaultPorts(node.type);
```
**Benefit:** Old nodes work, new nodes can customize

### 4. Callback Separation (UX + History)
```typescript
onDrag(nodeId, position)  // Real-time
onMove(nodeId, position)  // Final + history
```
**Benefit:** Smooth UX, clean history

### 5. Viewport Culling (Performance)
```typescript
const { visibleNodes } = useViewportCulling({ nodes, viewport, ... });
```
**Benefit:** Only render visible nodes, scales well

---

## 📊 Statistics

| Metric | Count |
|--------|-------|
| Node component files | 7 |
| Total lines (nodes) | 1,031 |
| Node types (base) | 4 |
| Node types (extended) | 2 |
| Port data types | 5 |
| Type guards | 6 |
| Port helpers | 2 |
| TapNow references | 3 |
| Files mentioning TapNow | 2 |
| Documentation files created | 4 |

---

## 🚀 Getting Started

### For New Developers

**Step 1: Understand the basics**
- Read: CANVAS_SEARCH_SUMMARY.md (5 min)
- Read: CANVAS_VISUAL_REFERENCE.md Section 1-2 (10 min)

**Step 2: Learn the architecture**
- Read: CANVAS_NODE_ARCHITECTURE.md Sections 1-6 (20 min)
- Review: CANVAS_VISUAL_REFERENCE.md Sections 3-6 (15 min)

**Step 3: Study the code**
- Read: BaseNode.tsx (10 min)
- Read: MediaNode.tsx (10 min)
- Read: InfiniteCanvas.tsx (10 min)

**Step 4: Understand type system**
- Read: CANVAS_NODE_ARCHITECTURE.md Section 3 (10 min)
- Read: CANVAS_VISUAL_REFERENCE.md Section 6 (5 min)

**Total Time:** ~90 minutes

### For Adding New Features

**Adding a new node type:**
1. Read: CANVAS_NODE_ARCHITECTURE.md Section 13
2. Read: CANVAS_VISUAL_REFERENCE.md Section 15 (Common Tasks)
3. Follow the checklist in Section 13

**Implementing ports:**
1. Read: CANVAS_NODE_ARCHITECTURE.md Section 4
2. Read: CANVAS_VISUAL_REFERENCE.md Section 4
3. Review: canvasStore.ts port validation logic

**Debugging issues:**
1. Read: CANVAS_VISUAL_REFERENCE.md Section 17 (Debugging Tips)
2. Check: CANVAS_NODE_ARCHITECTURE.md Section 14 (Testing Checklist)

---

## 🔗 Cross-References

### By Topic

**Node Types:**
- CANVAS_NODE_ARCHITECTURE.md: Sections 3, 6, 7
- CANVAS_VISUAL_REFERENCE.md: Sections 1, 11
- CANVAS_SEARCH_SUMMARY.md: Sections 3, 7

**Port System:**
- CANVAS_NODE_ARCHITECTURE.md: Sections 3, 4
- CANVAS_VISUAL_REFERENCE.md: Sections 4, 5
- CANVAS_SEARCH_SUMMARY.md: Section 8

**Rendering:**
- CANVAS_NODE_ARCHITECTURE.md: Section 5
- CANVAS_VISUAL_REFERENCE.md: Sections 2, 8
- CANVAS_SEARCH_SUMMARY.md: Section 5

**Type Discrimination:**
- CANVAS_NODE_ARCHITECTURE.md: Section 6
- CANVAS_VISUAL_REFERENCE.md: Section 6
- CANVAS_SEARCH_SUMMARY.md: Section 6

**TapNow:**
- CANVAS_NODE_ARCHITECTURE.md: Section 1
- CANVAS_VISUAL_REFERENCE.md: Section 14
- CANVAS_SEARCH_SUMMARY.md: Section 3

**Design Patterns:**
- CANVAS_NODE_ARCHITECTURE.md: Section 11
- CANVAS_VISUAL_REFERENCE.md: Section 15
- CANVAS_SEARCH_SUMMARY.md: Section 11

---

## 📝 Document Metadata

| Document | Version | Date | Scope |
|----------|---------|------|-------|
| CANVAS_NODE_ARCHITECTURE.md | 1.0 | 2024-02-10 | Complete architecture |
| CANVAS_VISUAL_REFERENCE.md | 1.0 | 2024-02-10 | Visual diagrams & reference |
| CANVAS_SEARCH_SUMMARY.md | 1.0 | 2024-02-10 | Search results |
| CANVAS_INDEX.md | 1.0 | 2024-02-10 | This index |

---

## ✅ Checklist for Using These Docs

- [ ] Read CANVAS_SEARCH_SUMMARY.md for overview
- [ ] Review CANVAS_VISUAL_REFERENCE.md for visual understanding
- [ ] Study CANVAS_NODE_ARCHITECTURE.md for deep dive
- [ ] Bookmark this index for quick navigation
- [ ] Reference specific sections when implementing features
- [ ] Use debugging tips when troubleshooting
- [ ] Follow the quick reference when adding new node types

---

## 🎓 Learning Path

### Beginner (Understanding the System)
1. CANVAS_SEARCH_SUMMARY.md (complete)
2. CANVAS_VISUAL_REFERENCE.md Sections 1-2
3. CANVAS_NODE_ARCHITECTURE.md Sections 1-2

### Intermediate (Working with Nodes)
1. CANVAS_NODE_ARCHITECTURE.md Sections 3-7
2. CANVAS_VISUAL_REFERENCE.md Sections 3-8
3. Review BaseNode.tsx and MediaNode.tsx

### Advanced (Extending the System)
1. CANVAS_NODE_ARCHITECTURE.md Sections 11-13
2. CANVAS_VISUAL_REFERENCE.md Sections 15-17
3. Study canvasStore.ts and Connection.tsx
4. Review PLAN.md for future extensions

---

## 🔧 Troubleshooting Guide

**Problem:** Node not rendering
→ Check: CANVAS_VISUAL_REFERENCE.md Section 17 (Debugging Tips)
→ Read: CANVAS_NODE_ARCHITECTURE.md Section 5 (Rendering Pipeline)

**Problem:** Port colors wrong
→ Check: CANVAS_VISUAL_REFERENCE.md Section 12 (Port Colors)
→ Read: CANVAS_NODE_ARCHITECTURE.md Section 4 (Port Styling)

**Problem:** Type errors
→ Check: CANVAS_VISUAL_REFERENCE.md Section 6 (Type Discrimination)
→ Read: CANVAS_NODE_ARCHITECTURE.md Section 6 (Type Discrimination)

**Problem:** Connection validation failing
→ Check: CANVAS_NODE_ARCHITECTURE.md Section 7 (Connection System)
→ Read: CANVAS_SEARCH_SUMMARY.md Section 8 (Connection System)

**Problem:** Performance issues
→ Check: CANVAS_VISUAL_REFERENCE.md Section 10 (Viewport Culling)
→ Read: CANVAS_NODE_ARCHITECTURE.md Section 5 (Viewport Culling)

---

## 📞 Quick Reference Links

### Files
- Node components: `packages/neko-canvas/packages/webview/src/components/nodes/`
- Canvas types: `packages/neko-types/src/types/canvas.ts`
- Extended types: `packages/neko-canvas/packages/webview/src/types/extendedCanvas.ts`
- Main canvas: `packages/neko-canvas/packages/webview/src/components/InfiniteCanvas.tsx`
- Canvas store: `packages/neko-canvas/packages/webview/src/stores/canvasStore.ts`

### Key Functions
- `renderNode()` - Type discrimination in InfiniteCanvas.tsx
- `getDefaultPorts()` - Port resolution in canvas.ts
- `arePortTypesCompatible()` - Port validation in canvas.ts
- Type guards: `isMediaNode()`, `isStoryboardNode()`, etc.

### Key Types
- `CanvasNode` - Union of all node types
- `PortDefinition` - Port configuration
- `CanvasConnection` - Connection between nodes
- `CanvasViewport` - Pan and zoom state

---

## 🎯 Summary

This documentation provides **complete coverage** of the Neko Canvas node system:

✅ **Architecture:** Discriminated unions, component composition, dual port system
✅ **Components:** 7 node types with detailed implementations
✅ **Types:** Shared and extended type definitions
✅ **Rendering:** Pipeline with viewport culling
✅ **Patterns:** Design patterns and best practices
✅ **TapNow:** Complete reference status (design inspiration only)
✅ **Visual Guides:** Diagrams and flowcharts
✅ **Quick Reference:** Lookup tables and common tasks
✅ **Debugging:** Tips and troubleshooting guide

**Total Documentation:** 4 comprehensive markdown files
**Total Content:** ~15,000 words
**Coverage:** 100% of node system

---

**Index Version:** 1.0
**Last Updated:** 2024-02-10
**Scope:** Complete Neko Canvas Documentation Index
