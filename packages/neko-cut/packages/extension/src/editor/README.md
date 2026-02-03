# editor/

编辑器模块，提供 VSCode 自定义编辑器实现。

## 职责

实现 .jvi 项目文件的自定义编辑器，管理 Webview 生命周期。

## 结构

```
editor/
├── video/                # 视频编辑器
│   ├── index.ts
│   ├── videoEditorProvider.ts  # 编辑器提供者
│   └── videoEditorModel.ts     # 编辑器数据模型
└── common/               # 公共逻辑
    ├── index.ts
    └── editorBase.ts     # 编辑器基类
```

## 接口

| 导出 | 类型 | 用途 |
|------|------|------|
| `VideoEditorProvider` | 类 | 自定义编辑器提供者 |
| `VideoEditorModel` | 类 | 编辑器数据模型 |

## 依赖

```
→ @uniedit/webview    # Webview UI
→ @uniedit/shared     # 项目类型
← extension.ts        # 编辑器注册
← commands/           # 命令操作
← tools/              # 工具桥接
```

## 注册

```typescript
// package.json
{
  "contributes": {
    "customEditors": [{
      "viewType": "uniedit.videoEditor",
      "displayName": "Video Editor",
      "selector": [{ "filenamePattern": "*.jvi" }]
    }]
  }
}
```

## 生命周期

```
openDocument → resolveCustomTextEditor → createWebview
   ↓
Webview ←→ Extension (postMessage)
   ↓
saveDocument → updateDocument
```
