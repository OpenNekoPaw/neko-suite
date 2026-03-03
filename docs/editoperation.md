# EditOperation 指令序列系统

> 最后更新：2026-03-03
> 状态：✅ 已完成（Phase 1-4B 全部完成）

## 总览

用轻量操作对象替代全量快照，支持精确 undo/redo、增量同步、AI 操作审计。

| 阶段 | 描述 | 状态 |
|------|------|------|
| 阶段 1 | neko-types 基础设施（29 种操作类型，覆盖 47 个 action） | ✅ 已完成 |
| 阶段 2 | neko-cut 双轨运行（6/6 slice 迁移） | ✅ 已完成 |
| 阶段 3 | 全面切换（移除 historySlice + structuredClone 快照） | ✅ 已完成 |
| 阶段 4 | 增量同步 Extension ↔ Webview（operationApplied 消息） | ✅ 已完成 |
| 阶段 4B | Rust 引擎增量同步（3 种快速路径 + 兜底全量） | ✅ 已完成 |

---

## 架构

```
neko-types (共享层)
  ├─ operations/types.ts      — 29 种 EditOperation 类型定义
  ├─ operations/apply*.ts     — applyOperation 纯函数（track/element/shape/keyframe）
  ├─ operations/invert.ts     — invertOperation 纯函数（对称逆操作）
  └─ operations/__tests__/    — roundtrip + apply + invert 测试

neko-cut/webview (UI层)
  ├─ dispatchSlice.ts         — 操作分发中心
  ├─ operationHistorySlice.ts — 基于操作的 undo/redo 栈 (200 个操作)
  └─ 6 个 slice 全部迁移完成

neko-cut/extension (Host层)
  └─ messageHandler: operationApplied → applyOperation 增量更新模型

neko-engine (Rust层)
  ├─ domain/operations.rs     — EditOperationEnvelope 结构
  ├─ domain/timeline.rs       — try_apply_operation() 增量 patch
  └─ controllers/stream.rs    — applyOperation action handler
```

### 数据流

```
Webview dispatch(op)
  → applyOperation(project, op) + pushOperation(op)
    → syncOperationToExtension(op) → postMessage to Extension
                                       ↓
Extension handleMessage('operationApplied')
  → applyOperation(model._content, op) → 内存更新（不写磁盘）
  → Rust 快速路径: element.update / track.toggle / element.toggle (~100 bytes)
  → Rust 兜底路径: 其他 27 种操作 → streams:update (fullProjectData)

Cmd+S: Webview → Extension → 全量写入 .jvi（兜底）
```

### 拖拽 undo/redo

```
drag start → 记录 originalElement
drag move  → updateElement (raw set, no history)
drag end   → pushOperation({ type: 'element.update', before: original, payload: current })
```

---

## 关键设计决策

| 决策 | 选择 | 理由 |
|------|------|------|
| 逆操作数据 | 操作自身携带 before | 不需要访问 ProjectData，纯函数可测试 |
| 关键帧操作 | 3 种 × KeyframeTarget | 收敛 12 个 action，代码量减 >50% |
| 高频操作 | 操作合并（首个 before + 最新 updates） | 替代 300ms 防抖 |
| 增量操作范围 | 仅 3 种 Rust 快速路径 | 覆盖 ~80% 高频操作，复杂度可控 |
| 失败处理 | 快速路径失败 → 自动 fallback 全量更新 | 保证正确性不受增量实现影响 |

---

## 已知问题

| 问题 | 严重程度 | 说明 |
|------|---------|------|
| 测试脚本未配置 | ⚠️ 中 | neko-types `package.json` 缺少 test 脚本，测试文件已写但无法运行 |
| 手工测试未完成 | ⚠️ 中 | 所有操作的 undo/redo 正确性需手工验证 |
| migration-adapter 缺失 | 🔵 低 | 各 slice 手动构建 before（已验证模式可行） |
| 拖拽 undo 粒度 | 🔵 低 | 多元素批量拖拽可能需要 batch |
