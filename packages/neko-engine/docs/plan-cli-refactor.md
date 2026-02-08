# 重构方案：native-cli 支持通用 group:action 调度

## 问题

1. `run_export` 仍使用已删除的 `"exports"` group（应改为 `"timelines:export"`）
2. CLI 只有 4 个硬编码命令，缺少通用的 `group:action` 调度能力
3. 前端和 CLI 应共享同一套 action 路由

## 修改文件

### 1. `args.rs` — 新增通用 Action 命令

新增 `Action` 子命令，支持 `neko-engine action <group> <action> [options-json]`：

```rust
/// Execute any engine action (group:action pattern)
Action {
    /// Action group (e.g., videos, audios, timelines, tasks, nodes)
    group: String,
    /// Action name (e.g., probe, capture, export, stream)
    action: String,
    /// Resource ID (optional)
    #[arg(long)]
    id: Option<String>,
    /// Options as JSON string
    #[arg(long)]
    options: Option<String>,
    /// Body as JSON string (for complex payloads)
    #[arg(long)]
    body: Option<String>,
    /// Output format (json, text)
    #[arg(short, long, default_value = "json")]
    format: String,
},
```

### 2. `runner.rs` — 修复 export 路由 + 新增 run_action

- **修复** `run_export` 中 `"exports"` → `"timelines"`
- **新增** `run_action` 通用调度方法
- **保留** 现有的 serve/export/probe/extract 作为快捷命令

### 3. 不修改的文件

| 文件 | 原因 |
|------|------|
| native-api/* | Controller 层已完成 |
| native-core/* | Service 层不变 |

## 验证

```bash
cargo build -p neko-native-cli
cargo test -p neko-native-cli
# 功能验证
neko-engine action nodes health
neko-engine action videos probe --options '{"source":"/path/to/video.mp4"}'
neko-engine action timelines probe --options '{"source":"/path/to/project.jvi"}'
```
