# tools/

时间线工具桥接模块，连接 AI 工具和 Webview 操作（仅 UI-only/渲染/导出）。

> 说明：timeline **数据类工具**已在 Extension（`TimelineToolExecutor`）执行并写回 `.jvi`，以获得 VSCode 原生 Undo/Redo；Webview 仅保留 UI-only（如渲染/缩略图/导出）路径。

## 职责

将 Platform 的 AI 工具调用桥接到 Webview 的时间线操作（仅 UI-only/渲染/导出）。

## 结构

```
tools/
├── index.ts              # 模块导出
└── timeline-bridge.ts    # 时间线工具桥接
```

## 接口

| 导出 | 类型 | 用途 |
|------|------|------|
| `TimelineBridge` | 类 | 工具桥接器 |
| `registerTimelineTools()` | 函数 | 注册时间线工具 |
| `TIMELINE_TOOL_NAMES` | 常量 | 工具名称列表 |
| `TIMELINE_TOOL_CONFIGS` | 常量 | 工具配置 |

## 依赖

```
→ @neko/platform   # 工具注册表
→ editor/video/       # Webview 操作
← bootstrap/          # 工具注册
```

## 工作流程

```
Agent 调用工具
    ↓
分流：
  - Extension 执行（TimelineToolExecutor）→ 写回 .jvi → 返回结果
  - Webview 执行（TimelineBridge）→ postMessage → 返回结果
```
