# tools/

Extension-side AI tool definitions for neko-agent.

> Timeline **data tools** execute in Extension (`TimelineToolExecutor`) and write back to `.jvi` for native Undo/Redo; only UI-only operations (render/thumbnail/export) route to Webview.

## Structure

```
tools/
├── index.ts              # Module exports
└── extensionTools.ts     # Tool definitions (timeline query, media effects, shader management)
```

## Key Exports

| Export                   | Type     | Purpose                                           |
| ------------------------ | -------- | ------------------------------------------------- |
| `createExtensionTools()` | Function | Create tool definitions for Platform ToolRegistry |

## Dependencies

```
→ @neko/platform   # Tool registry types
→ ../chat/         # ChatViewProvider for webview bridge
← bootstrap/       # Tool registration at activation
```
