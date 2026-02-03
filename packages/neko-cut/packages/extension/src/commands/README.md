# commands/

VSCode 命令注册模块，提供所有扩展命令。

## 职责

注册和实现扩展的 VSCode 命令。

## 结构

```
commands/
├── index.ts              # 命令注册入口
├── timeline-commands.ts  # 时间线相关命令
└── ai-commands.ts        # AI 相关命令
```

## 接口

| 导出 | 类型 | 用途 |
|------|------|------|
| `registerCommands()` | 函数 | 注册所有命令 |

## 依赖

```
→ editor/video/       # 编辑器操作
→ views/              # 大纲视图
→ @neko/platform   # 工具注册表
← extension.ts        # 命令注册
```

## 命令列表

| 命令 | 用途 |
|------|------|
| `neko.newProject` | 新建项目 |
| `neko.addToTimeline` | 添加媒体到时间线 |
| `neko.openInEditor` | 在编辑器中打开 |
| `neko.openAIAssistant` | 打开 AI 助手 |
| `neko.selectElement` | 选择元素 |
| `neko.showExportPanel` | 显示导出面板 |
