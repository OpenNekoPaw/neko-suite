# 导出预设管理 — 设计文档

**日期**: 2026-03-05
**状态**: 已批准，待实现
**模块**: neko-cut（Extension + Webview）

---

## 背景

neko-cut 的 ExportPanel 已支持完整的导出参数配置（格式/编解码/分辨率/质量/帧率/音频码率），但每次打开后参数重置为默认值，无法保存用户常用配置。ROADMAP Phase 1 将"导出预设管理"列为剩余任务。

---

## 需求范围（MVP）

- **存储范围**：`vscode.workspaceState`（工作区级，每个项目独立）
- **功能**：内置预设 + 保存当前设置为自定义预设
- **不在此次范围**：删除预设、全局共享、导入/导出预设文件

---

## Section 1：数据架构

### 类型定义

新增到 `packages/neko-types/src/types/exportProtocol.ts`：

```typescript
export interface ExportPreset {
  id: string;           // 内置: 'builtin-social' | 'builtin-web' | 'builtin-master'
                        // 用户: uuid (crypto.randomUUID())
  name: string;         // 显示名称
  isBuiltin: boolean;
  settings: ExportSettings;
}
```

### 内置预设

| id | 名称 | 分辨率 | FPS | 格式 | 视频编码 | 音频编码 |
|----|------|--------|-----|------|----------|----------|
| `builtin-social` | 社交媒体优化 | 1920×1080 | 60 | mp4 | h264 | aac |
| `builtin-web` | Web 优化 | 1280×720 | 30 | webm | vp9 | opus |
| `builtin-master` | 高质量母版 | 3840×2160 | 60 | mov | h265 | aac |

### 存储

- **键**：`neko-cut.exportPresets`
- **类型**：`ExportPreset[]`（仅用户自定义预设，内置预设硬编码）
- **存储位置**：`vscode.ExtensionContext.workspaceState`

---

## Section 2：消息协议 & Extension 侧

### 消息类型

扩展 `packages/neko-types/src/types/cutProtocol.ts`（webview → extension）：

```typescript
{ type: 'preset:list' }
{ type: 'preset:save'; payload: { name: string; settings: ExportSettings } }
```

Extension → Webview：

```typescript
{ type: 'preset:list'; payload: { presets: ExportPreset[] } }
```

### ExportPresetService（新文件）

**路径**：`packages/neko-cut/packages/extension/src/services/ExportPresetService.ts`

```typescript
class ExportPresetService {
  constructor(private workspaceState: vscode.Memento) {}

  listPresets(): ExportPreset[] {
    // 内置预设 + workspaceState 中的用户预设合并
  }

  savePreset(name: string, settings: ExportSettings): ExportPreset {
    // 追加到 workspaceState
  }
}
```

**注册位置**：`videoEditorProvider.ts` 的 `handleMessage`，响应 `preset:list` 和 `preset:save` 消息。

不涉及 Rust 引擎改动。

---

## Section 3：Webview UI

### ExportPanel.tsx 改动

在现有设置列表顶部插入"预设"行：

```
┌─────────────────────────────┐
│ 导出设置                     │
├─────────────────────────────┤
│ 预设  [社交媒体优化    ▼] [💾] │  ← 新增此行
├─────────────────────────────┤
│ 格式     [MP4      ▼]       │
│ 编码     [H.264    ▼]       │
│ ...（现有设置不变）           │
└─────────────────────────────┘
```

**下拉框选项结构**：
```
── 内置预设 ──
• 社交媒体优化
• Web 优化
• 高质量母版
── 我的预设 ──（仅当存在用户预设时显示）
• [用户预设 1]
• [用户预设 2]
─────────────
  自定义
```

**💾 按钮行为**：触发 `vscode.window.showInputBox` 输入名称 → 发送 `preset:save` 消息。

### uiStateSlice.ts 改动

新增字段：
```typescript
selectedPresetId: string | null;   // null 表示"自定义"
```

**状态联动**：
- 选择预设 → 填充 `ExportSettings` 所有字段，设置 `selectedPresetId`
- 用户修改任意导出参数 → 自动将 `selectedPresetId` 置 `null`（显示"自定义"）

---

## 文件变更清单

| 文件 | 变更类型 | 说明 |
|------|----------|------|
| `neko-types/src/types/exportProtocol.ts` | 修改 | 新增 `ExportPreset` 接口 |
| `neko-types/src/types/cutProtocol.ts` | 修改 | 新增 `preset:list` / `preset:save` 消息类型 |
| `neko-cut/packages/extension/src/services/ExportPresetService.ts` | 新建 | 预设存取服务 |
| `neko-cut/packages/extension/src/editor/video/videoEditorProvider.ts` | 修改 | 注册 ExportPresetService，处理预设消息 |
| `neko-cut/packages/webview/src/stores/slices/uiStateSlice.ts` | 修改 | 新增 `selectedPresetId` 字段 |
| `neko-cut/packages/webview/src/components/Timeline/ExportPanel.tsx` | 修改 | 新增预设行（下拉 + 保存按钮） |
| `neko-cut/packages/webview/src/i18n/locales/zh-cn/export.ts` | 修改 | 新增预设相关 i18n key |
| `neko-cut/packages/webview/src/i18n/locales/en/export.ts` | 修改 | 英文 i18n key |

---

## 不在此次范围

- 预设删除 UI
- 全局 (`globalState`) 共享预设
- 预设导入/导出文件
- 与 neko-assets 的 `PresetMetadata` 集成（已有类型定义，留给 Phase 6）
