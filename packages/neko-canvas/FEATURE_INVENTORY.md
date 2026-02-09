# Neko Canvas - Feature Inventory

> Comprehensive feature list for the neko-canvas webview package
>
> Generated: 2024
>
> Legend: ✅ Implemented | 🔧 Partial | ❌ Not implemented

---

## 📊 Summary Statistics

- **Total Components**: 27 files
- **Total Hooks**: 6 custom hooks
- **Total Stores**: 3 Zustand stores
- **Node Types**: 3 (Annotation, Storyboard, Media)
- **i18n Languages**: 2 (English, Chinese)
- **Keyboard Shortcuts**: 10+

---

## 1. Canvas Core

### Viewport Management
| Feature | Status | Location | Notes |
|---------|--------|----------|-------|
| Infinite pan/zoom canvas | ✅ | `InfiniteCanvas.tsx`, `useViewportTransform` | Mouse drag + wheel zoom |
| Grid background | ✅ | `CanvasGrid.tsx` | Major/minor grid lines |
| Viewport state persistence | ✅ | `canvasStore.ts` | Pan/zoom saved in canvas data |
| Pan with middle mouse | ✅ | `useViewportTransform` | Middle-click drag |
| Zoom with mouse wheel | ✅ | `useViewportTransform` | Scroll to zoom |
| Zoom limits (5%-1600%) | ✅ | `useViewportTransform` | MIN_ZOOM=0.05, MAX_ZOOM=16 |
| Zoom to fit content | ✅ | `CanvasApp.tsx` | Calculates bounds and fits |
| Reset viewport | ✅ | `canvasStore.ts` | Reset to origin (0,0) zoom 1 |
| Viewport culling | ✅ | `useViewportCulling` | Only renders visible nodes |
| Coordinate conversion | ✅ | `useCanvasCoordinates` | Screen ↔ Canvas coords |

### Canvas Interaction
| Feature | Status | Location | Notes |
|---------|--------|----------|-------|
| Canvas click to deselect | ✅ | `CanvasApp.tsx` | Clear selection on background click |
| Right-click context menu | ✅ | `ContextMenu.tsx` | Canvas + node menus |
| Drag & drop from VSCode | ✅ | `CanvasApp.tsx` | File drop support with overlay |
| Empty state hint | ✅ | `CanvasApp.tsx` | Shows when no nodes |
| Loading state | ✅ | `CanvasApp.tsx` | "Loading canvas..." |
| Drag-over visual feedback | ✅ | `CanvasApp.tsx` | Blue overlay with hint |

---

## 2. Node System

### Node Types
| Type | Status | Component | Features |
|------|--------|-----------|----------|
| Annotation (Text) | ✅ | `AnnotationNode.tsx` | Rich text editing, markdown support |
| Storyboard (Scene) | ✅ | `StoryboardNode.tsx` | Title + description, scene planning |
| Media (Image/Video/Audio) | ✅ | `MediaNode.tsx` | Inline playback, thumbnail view |
| Artboard | 🔧 | `ArtboardNode.tsx` | File exists but not integrated |
| Group | ❌ | - | Not implemented |

### Node Operations
| Feature | Status | Location | Notes |
|---------|--------|----------|-------|
| Add node (Text) | ✅ | `CanvasApp.tsx` | Toolbar + context menu |
| Add node (Scene) | ✅ | `CanvasApp.tsx` | Toolbar + context menu |
| Add node (Media) | ✅ | `CanvasApp.tsx` | File picker via extension |
| Delete node | ✅ | `canvasStore.ts` | Delete key + context menu |
| Duplicate node | ✅ | `clipboardStore.ts` | Cmd+D, with offset |
| Move node (drag) | ✅ | `useNodeDrag` | Drag with mouse |
| Resize node | ❌ | - | Not implemented |
| Rotate node | ❌ | - | Not implemented |
| Lock/unlock node | ✅ | `PropertyPanel.tsx` | Prevents dragging |
| Node z-index | ✅ | `canvasStore.ts` | Stored in node.zIndex |
| Bring to front | 🔧 | - | Data structure exists, UI missing |
| Send to back | 🔧 | - | Data structure exists, UI missing |

### Node Selection
| Feature | Status | Location | Notes |
|---------|--------|----------|-------|
| Single select | ✅ | `canvasStore.ts` | Click node |
| Multi-select (Cmd+click) | ✅ | `canvasStore.ts` | Add to selection |
| Select all (Cmd+A) | ✅ | `CanvasApp.tsx` | Keyboard shortcut |
| Clear selection (Esc) | ✅ | `CanvasApp.tsx` | Escape key |
| Box selection | ❌ | - | Not implemented |
| Selection outline | ✅ | `BaseNode.tsx` | Blue border when selected |
| Multi-node drag | 🔧 | `useNodeDrag` | Only drags one node at a time |

### Node Editing
| Feature | Status | Location | Notes |
|---------|--------|----------|-------|
| Inline text editing | ✅ | `EditableText.tsx` | Double-click to edit |
| Property panel editing | ✅ | `PropertyPanel.tsx` | Right panel with inputs |
| Update node data | ✅ | `canvasStore.ts` | updateNodeData() |
| Update node position | ✅ | `canvasStore.ts` | moveNode() |
| Update node size | 🔧 | `canvasStore.ts` | updateNode() exists, no UI |

---

## 3. Connection System

### Connection Types
| Feature | Status | Location | Notes |
|---------|--------|----------|-------|
| Port-based connections | ✅ | `Connection.tsx` | Typed input/output ports |
| Legacy anchor connections | ✅ | `Connection.tsx` | 4-direction anchors (fallback) |
| Default connection | ✅ | `Connection.tsx` | Gray color |
| Sequence connection | 🔧 | `Connection.tsx` | Color defined, not used |
| Reference connection | 🔧 | `Connection.tsx` | Color defined, not used |

### Connection Operations
| Feature | Status | Location | Notes |
|---------|--------|----------|-------|
| Create connection (drag) | ✅ | `useConnectionDrag` | Drag from port/anchor |
| Delete connection | ✅ | `canvasStore.ts` | Select + Delete key |
| Select connection | ✅ | `Connection.tsx` | Click to select |
| Connection validation | ✅ | `canvasStore.ts` | Port type compatibility |
| Prevent self-connection | ✅ | `canvasStore.ts` | Source ≠ target check |
| Prevent duplicate | ✅ | `canvasStore.ts` | Checks existing connections |
| Max connections per port | ✅ | `canvasStore.ts` | Respects port.maxConnections |
| Connection preview | ✅ | `useConnectionDrag` | Mouse-follow line while dragging |
| Cancel connection (Esc) | ✅ | `CanvasApp.tsx` | Escape key |

### Port System
| Feature | Status | Location | Notes |
|---------|--------|----------|-------|
| Input ports | ✅ | `BaseNode.tsx` | Blue color |
| Output ports | ✅ | `BaseNode.tsx` | Green color |
| Port data types | ✅ | `Connection.tsx` | image/video/audio/text/any |
| Port type colors | ✅ | `Connection.tsx` | Color-coded by data type |
| Port compatibility check | ✅ | `canvasStore.ts` | arePortTypesCompatible() |
| Default ports by node type | ✅ | `@neko/shared` | getDefaultPorts() |
| Custom port definitions | ✅ | `BaseNode.tsx` | node.ports override |
| Port positioning | ✅ | `BaseNode.tsx` | Auto-spaced on each side |

### Connection Rendering
| Feature | Status | Location | Notes |
|---------|--------|----------|-------|
| Bezier curve | ✅ | `Connection.tsx` | Smooth curves |
| Directional arrows | ✅ | `Connection.tsx` | SVG markers |
| Animated flow effect | ✅ | `Connection.tsx` | Dotted line animation |
| Hover highlight | ✅ | `index.css` | Opacity change on hover |
| Selection highlight | ✅ | `Connection.tsx` | Thicker stroke when selected |
| Connection layer | ✅ | `ConnectionLayer.tsx` | Separate SVG layer |

---

## 4. Interaction

### Mouse Interaction
| Feature | Status | Location | Notes |
|---------|--------|----------|-------|
| Left-click select | ✅ | `BaseNode.tsx` | Single select |
| Cmd+click multi-select | ✅ | `canvasStore.ts` | Add to selection |
| Middle-click pan | ✅ | `useViewportTransform` | Pan canvas |
| Right-click context menu | ✅ | `ContextMenu.tsx` | Canvas/node menus |
| Scroll wheel zoom | ✅ | `useViewportTransform` | Zoom in/out |
| Drag node | ✅ | `useNodeDrag` | Move nodes |
| Drag connection | ✅ | `useConnectionDrag` | Create connections |
| Double-click edit | ✅ | `EditableText.tsx` | Edit text inline |

### Keyboard Shortcuts
| Shortcut | Action | Status | Location |
|----------|--------|--------|----------|
| Delete / Backspace | Delete selected | ✅ | `CanvasApp.tsx` |
| Escape | Cancel / Deselect | ✅ | `CanvasApp.tsx` |
| Cmd+A | Select all | ✅ | `CanvasApp.tsx` |
| Cmd+Z | Undo | ✅ | `CanvasApp.tsx` |
| Cmd+Shift+Z | Redo | ✅ | `CanvasApp.tsx` |
| Cmd+C | Copy | ✅ | `CanvasApp.tsx` |
| Cmd+X | Cut | ✅ | `CanvasApp.tsx` |
| Cmd+V | Paste | ✅ | `CanvasApp.tsx` |
| Cmd+D | Duplicate | ✅ | `CanvasApp.tsx` |
| Arrow keys | Move selection | ❌ | - |
| Shift+drag | Constrain movement | ❌ | - |
| Space+drag | Pan canvas | ❌ | - |

### Context Menu
| Menu Item | Context | Status | Location |
|-----------|---------|--------|----------|
| Add Text | Canvas | ✅ | `ContextMenu.tsx` |
| Add Scene | Canvas | ✅ | `ContextMenu.tsx` |
| Add Image | Canvas | ✅ | `ContextMenu.tsx` |
| Add Video | Canvas | ✅ | `ContextMenu.tsx` |
| Add Audio | Canvas | ✅ | `ContextMenu.tsx` |
| Copy | Node | ✅ | `ContextMenu.tsx` |
| Cut | Node | ✅ | `ContextMenu.tsx` |
| Paste | Canvas | ✅ | `ContextMenu.tsx` |
| Duplicate | Node | ✅ | `ContextMenu.tsx` |
| Delete | Node | ✅ | `ContextMenu.tsx` |
| Select All | Canvas | ✅ | `ContextMenu.tsx` |
| Fit Content | Canvas | ✅ | `ContextMenu.tsx` |
| Reset View | Canvas | ✅ | `ContextMenu.tsx` |
| Undo | Both | ✅ | `ContextMenu.tsx` |
| Redo | Both | ✅ | `ContextMenu.tsx` |
| Lock/Unlock | Node | 🔧 | Menu items exist, not wired |
| Bring to Front | Node | 🔧 | Menu items exist, not wired |
| Send to Back | Node | 🔧 | Menu items exist, not wired |

---

## 5. UI Components

### Toolbar
| Component | Status | Location | Features |
|-----------|--------|----------|----------|
| Left toolbar | ✅ | `CanvasToolbar.tsx` | Vertical tool panel |
| Add Text button | ✅ | `CanvasToolbar.tsx` | Creates annotation node |
| Add Scene button | ✅ | `CanvasToolbar.tsx` | Creates storyboard node |
| Add Media dropdown | ✅ | `CanvasToolbar.tsx` | Image/Video/Audio picker |
| Undo button | ✅ | `CanvasToolbar.tsx` | With disabled state |
| Redo button | ✅ | `CanvasToolbar.tsx` | With disabled state |
| Layer panel toggle | ✅ | `CanvasToolbar.tsx` | Toggle button (panel not impl) |

### Panels
| Component | Status | Location | Features |
|-----------|--------|----------|----------|
| Property panel | ✅ | `PropertyPanel.tsx` | Right panel, node properties |
| Layer panel | 🔧 | `LayerPanel.tsx` | File exists, not integrated |
| Transform section | ✅ | `PropertyPanel.tsx` | Position, size display |
| Content section | ✅ | `PropertyPanel.tsx` | Node-specific fields |
| Actions section | ✅ | `PropertyPanel.tsx` | Lock, delete buttons |
| Multi-selection view | ✅ | `PropertyPanel.tsx` | Shows count when multi-selected |
| No selection view | ✅ | `PropertyPanel.tsx` | Placeholder message |

### Controls
| Component | Status | Location | Features |
|-----------|--------|----------|----------|
| Zoom controls | ✅ | `ZoomControls.tsx` | +/- buttons, percentage |
| Zoom presets | ✅ | `ZoomControls.tsx` | Dropdown: 25%, 50%, 100%, etc. |
| Fit content button | ✅ | `ZoomControls.tsx` | Auto-fit all nodes |
| Reset viewport button | ✅ | `ZoomControls.tsx` | Reset to origin |
| MiniMap | ✅ | `MiniMap.tsx` | Bird's eye view with viewport rect |
| MiniMap navigation | ✅ | `MiniMap.tsx` | Click/drag to pan |

### Status Bar
| Feature | Status | Location | Notes |
|---------|--------|----------|-------|
| Zoom percentage | ✅ | `CanvasApp.tsx` | Bottom bar |
| Pan coordinates | ✅ | `CanvasApp.tsx` | (x, y) display |
| Selection count | ✅ | `CanvasApp.tsx` | "N selected" |
| Connection status | ✅ | `CanvasApp.tsx` | "Connecting..." indicator |
| Property panel toggle | ✅ | `CanvasApp.tsx` | Right-side button |

### Title Bar
| Feature | Status | Location | Notes |
|---------|--------|----------|-------|
| Canvas name | ✅ | `CanvasApp.tsx` | Displays canvas.name |
| Node count badge | ✅ | `CanvasApp.tsx` | Shows total nodes |
| Canvas icon | ✅ | `CanvasApp.tsx` | Grid icon |

---

## 6. Data Management

### State Management
| Store | Status | Location | Purpose |
|-------|--------|----------|---------|
| canvasStore | ✅ | `stores/canvasStore.ts` | Main canvas state (nodes, connections, viewport) |
| clipboardStore | ✅ | `stores/clipboardStore.ts` | Copy/paste operations |
| historyStore | ✅ | `stores/historyStore.ts` | Undo/redo stack |

### Undo/Redo
| Feature | Status | Location | Notes |
|---------|--------|----------|-------|
| Undo stack | ✅ | `historyStore.ts` | Max 50 entries |
| Redo stack | ✅ | `historyStore.ts` | Cleared on new action |
| Snapshot-based history | ✅ | `historyStore.ts` | Serializes canvas data |
| Viewport preservation | ✅ | `historyStore.ts` | Viewport not undoable |
| History recording | ✅ | `canvasStore.ts` | Auto-records before mutations |
| Drag optimization | ✅ | `canvasStore.ts` | Only records on drag-end |
| Duplicate detection | ✅ | `historyStore.ts` | Skips identical states |

### Clipboard
| Feature | Status | Location | Notes |
|---------|--------|----------|-------|
| Copy nodes | ✅ | `clipboardStore.ts` | Cmd+C |
| Cut nodes | ✅ | `clipboardStore.ts` | Cmd+X |
| Paste nodes | ✅ | `clipboardStore.ts` | Cmd+V with offset |
| Duplicate nodes | ✅ | `clipboardStore.ts` | Cmd+D with smaller offset |
| ID remapping | ✅ | `clipboardStore.ts` | Generates new IDs on paste |
| Connection preservation | ✅ | `clipboardStore.ts` | Copies inter-connections |
| Position offset | ✅ | `clipboardStore.ts` | 30px for paste, 20px for duplicate |
| Deep clone | ✅ | `clipboardStore.ts` | structuredClone() |

### Save/Load
| Feature | Status | Location | Notes |
|---------|--------|----------|-------|
| Auto-save to extension | ✅ | `CanvasApp.tsx` | Debounced 300ms |
| Load from extension | ✅ | `CanvasApp.tsx` | On 'update' message |
| Change detection | ✅ | `CanvasApp.tsx` | JSON comparison |
| Default canvas data | ✅ | `CanvasApp.tsx` | Empty canvas template |
| Version field | ✅ | `@neko/shared` | version: '1.0' |

---

## 7. Media Support

### Media Types
| Type | Status | Component | Features |
|------|--------|-----------|----------|
| Image | ✅ | `ImageViewer.tsx` | Display with zoom/pan |
| Video | ✅ | `VideoPlayer.tsx` | Inline playback controls |
| Audio | ✅ | `AudioPlayer.tsx` | Waveform + controls |
| Thumbnail | ✅ | `MediaNode.tsx` | Thumbnail view mode |

### Media Operations
| Feature | Status | Location | Notes |
|---------|--------|----------|-------|
| Add via file picker | ✅ | `CanvasApp.tsx` | Extension integration |
| Add via drag & drop | ✅ | `CanvasApp.tsx` | From VSCode explorer |
| Media type detection | ✅ | `CanvasApp.tsx` | By file extension |
| URI resolution | ✅ | Extension | webview.asWebviewUri() |
| Thumbnail/player toggle | ✅ | `MediaNode.tsx` | Click to expand |
| Duration display | ✅ | `MediaNode.tsx` | For video/audio |
| File name display | ✅ | `MediaNode.tsx` | Extracted from path |

### Supported Formats
| Format | Type | Status | Notes |
|--------|------|--------|-------|
| PNG, JPG, JPEG, GIF, WEBP, BMP, SVG | Image | ✅ | Via MEDIA_EXTENSIONS |
| MP4, MOV, AVI, MKV, WEBM, M4V | Video | ✅ | Via MEDIA_EXTENSIONS |
| MP3, WAV, OGG, M4A, AAC, FLAC | Audio | ✅ | Via MEDIA_EXTENSIONS |

---

## 8. Theming & i18n

### Theme System
| Feature | Status | Location | Notes |
|---------|--------|----------|-------|
| VSCode theme integration | ✅ | `index.css` | CSS variables from VSCode |
| Canvas colors | ✅ | `index.css` | --canvas-bg, --canvas-grid |
| Node colors | ✅ | `index.css` | --node-bg, --node-border |
| Control colors | ✅ | `index.css` | --control-bg, --button-bg |
| Status bar colors | ✅ | `index.css` | --statusbar-bg/fg |
| Title bar colors | ✅ | `index.css` | --titlebar-bg/fg |
| Connection colors | ✅ | `index.css` | Data type colors |
| Scrollbar styling | ✅ | `index.css` | Matches VSCode |
| Focus ring | ✅ | `index.css` | Blue outline |
| Dark mode | ✅ | `index.css` | Follows VSCode theme |
| Light mode | ✅ | `index.css` | Follows VSCode theme |

### Internationalization
| Feature | Status | Location | Notes |
|---------|--------|----------|-------|
| English (en) | ✅ | `i18n/index.ts` | Full translation |
| Chinese (zh-CN) | ✅ | `i18n/index.ts` | Full translation |
| Locale detection | ✅ | `i18n/index.ts` | From VSCode or browser |
| Dynamic locale switching | ✅ | `CanvasApp.tsx` | Via 'setLocale' message |
| Parameter substitution | ✅ | `i18n/index.ts` | {0}, {1} placeholders |
| Fallback to English | ✅ | `i18n/index.ts` | If key not found |

### i18n Coverage
| Category | Keys | Status |
|----------|------|--------|
| Toolbar | 8 | ✅ |
| Empty state | 2 | ✅ |
| Status bar | 4 | ✅ |
| Context menu | 16 | ✅ |
| Nodes | 8 | ✅ |
| Property panel | 10 | ✅ |
| Loading | 1 | ✅ |
| Canvas | 1 | ✅ |
| **Total** | **50** | ✅ |

---

## 9. Extension Integration

### VSCode Communication
| Message Type | Direction | Status | Purpose |
|--------------|-----------|--------|---------|
| ready | Webview → Extension | ✅ | Signal webview loaded |
| update | Extension → Webview | ✅ | Load canvas data |
| save | Webview → Extension | ✅ | Save canvas data |
| keyboardAction | Extension → Webview | ✅ | Forward keyboard shortcuts |
| setLocale | Extension → Webview | ✅ | Set UI language |
| pickMedia | Webview → Extension | ✅ | Open file picker |
| addMedia | Extension → Webview | ✅ | Add media node |
| resolveDroppedFiles | Webview → Extension | ✅ | Resolve file URIs |
| dropMedia | Extension → Webview | ✅ | Add dropped media |

### VSCode Integration
| Feature | Status | Location | Notes |
|---------|--------|----------|-------|
| acquireVsCodeApi | ✅ | `CanvasApp.tsx` | VSCode API access |
| postMessage | ✅ | `CanvasApp.tsx` | Bidirectional messaging |
| Keyboard shortcuts | ✅ | Extension | Forwarded to webview |
| File picker | ✅ | Extension | Native file dialog |
| URI resolution | ✅ | Extension | webview.asWebviewUri() |
| Drag & drop | ✅ | `CanvasApp.tsx` | File drop from explorer |
| Dev mode fallback | ✅ | `CanvasApp.tsx` | Works without VSCode |

---

## 10. Performance & Optimization

### Rendering Optimization
| Feature | Status | Location | Notes |
|---------|--------|----------|-------|
| Viewport culling | ✅ | `useViewportCulling` | Only renders visible nodes |
| Culling buffer | ✅ | `useViewportCulling` | 200px buffer around viewport |
| Culling stats | ✅ | `useViewportCulling` | Returns culledCount, totalCount |
| React.memo | 🔧 | Various | Some components memoized |
| useCallback | ✅ | Various | Extensive use |
| useMemo | ✅ | Various | For expensive calculations |

### State Optimization
| Feature | Status | Location | Notes |
|---------|--------|----------|-------|
| Debounced save | ✅ | `CanvasApp.tsx` | 300ms delay |
| Change detection | ✅ | `CanvasApp.tsx` | Prevents redundant saves |
| Drag optimization | ✅ | `canvasStore.ts` | History only on drag-end |
| Zustand selectors | 🔧 | Various | Could use more selective subscriptions |

---

## 11. Advanced Features

### Snapping & Alignment
| Feature | Status | Location | Notes |
|---------|--------|----------|-------|
| Snap to grid | 🔧 | `useSnap.ts` | Hook exists, not integrated |
| Snap to nodes | 🔧 | `useSnap.ts` | Hook exists, not integrated |
| Alignment guides | 🔧 | `AlignmentGuides.tsx` | Component exists, not integrated |

### Missing Features
| Feature | Status | Priority | Notes |
|---------|--------|----------|-------|
| Box selection | ❌ | High | Drag to select multiple nodes |
| Node resizing | ❌ | High | Drag handles on corners |
| Node rotation | ❌ | Medium | Rotate handle |
| Multi-node drag | ❌ | High | Drag all selected nodes |
| Arrow key movement | ❌ | Medium | Nudge selected nodes |
| Space+drag pan | ❌ | Low | Alternative pan method |
| Shift+drag constrain | ❌ | Low | Constrain to axis |
| Layer panel | ❌ | Medium | Z-order management |
| Bring to front/back | ❌ | Medium | Z-order actions |
| Group nodes | ❌ | Low | Group selection |
| Node templates | ❌ | Low | Reusable node configs |
| Export to image | ❌ | Low | Canvas screenshot |
| Search/filter nodes | ❌ | Low | Find nodes by name |

---

## 12. Code Quality

### Architecture
| Aspect | Status | Notes |
|--------|--------|-------|
| Component structure | ✅ | Well-organized by feature |
| Hook separation | ✅ | Custom hooks for reusable logic |
| Store separation | ✅ | 3 focused Zustand stores |
| Type safety | ✅ | Full TypeScript coverage |
| Shared types | ✅ | @neko/shared package |

### Best Practices
| Practice | Status | Notes |
|----------|--------|-------|
| React hooks rules | ✅ | Proper hook usage |
| Immutable updates | ✅ | Zustand best practices |
| Event cleanup | ✅ | useEffect cleanup functions |
| Ref usage | ✅ | Proper ref handling |
| Error boundaries | ❌ | Not implemented |
| Loading states | ✅ | Loading indicator |
| Empty states | ✅ | Empty canvas hint |

---

## 📝 Notes

### Strengths
1. **Solid foundation**: Core canvas, node, and connection systems are well-implemented
2. **Good UX**: Keyboard shortcuts, context menus, drag & drop all work smoothly
3. **VSCode integration**: Seamless communication with extension host
4. **Type safety**: Full TypeScript with shared types
5. **i18n ready**: English + Chinese translations
6. **Performance**: Viewport culling for large canvases
7. **Undo/redo**: Robust history system with 50-level stack

### Areas for Improvement
1. **Selection**: Box selection and multi-node drag missing
2. **Node manipulation**: No resize or rotate handles
3. **Layer management**: Layer panel exists but not integrated
4. **Alignment**: Snap and alignment guides not wired up
5. **Error handling**: No error boundaries
6. **Testing**: No test files found in scan

### Quick Wins
1. Wire up existing `AlignmentGuides.tsx` component
2. Enable `useSnap` hook in node dragging
3. Integrate `LayerPanel.tsx` component
4. Add box selection with drag rectangle
5. Implement multi-node drag (already have multi-select)
6. Add bring to front/send to back actions (data structure ready)

---

## 🎯 Recommended Next Steps

### Phase 1: Complete Core Features (High Priority)
- [ ] Box selection (drag rectangle)
- [ ] Multi-node drag
- [ ] Node resize handles
- [ ] Bring to front / Send to back

### Phase 2: Polish & UX (Medium Priority)
- [ ] Enable snap to grid
- [ ] Enable alignment guides
- [ ] Integrate layer panel
- [ ] Arrow key nudging
- [ ] Node rotation

### Phase 3: Advanced Features (Low Priority)
- [ ] Group nodes
- [ ] Export to image
- [ ] Node templates
- [ ] Search/filter
- [ ] Error boundaries
- [ ] Unit tests

---

**End of Feature Inventory**
