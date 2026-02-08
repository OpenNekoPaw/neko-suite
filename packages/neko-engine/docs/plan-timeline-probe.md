# 实施方案：timelines:probe

## 背景

Timeline 读取的是自定义的 `.jvi` 时间线数据文件。`timelines:probe` 的职责是：
- 加载 .jvi 文件，解析项目元数据
- 验证引用的媒体文件是否存在
- 返回项目概要信息（不渲染）

## 修改文件清单

### 阶段 1：Domain 层 — 新增 TimelineProjectInfo 类型

#### 1.1 `packages/native-core/src/domain/mod.rs`
- **新增** `pub mod timeline_info;`
- **新增** `pub use timeline_info::*;`

#### 1.2 `packages/native-core/src/domain/timeline_info.rs`（新建）
```rust
/// Timeline project info (timelines:probe response)
pub struct TimelineProjectInfo {
    pub name: String,
    pub version: String,
    pub width: u32,
    pub height: u32,
    pub fps: f64,
    pub duration: f64,
    pub track_count: usize,
    pub element_count: usize,
    pub media_references: Vec<MediaReference>,
}

/// A media file referenced by the timeline
pub struct MediaReference {
    pub element_id: String,
    pub path: String,
    pub exists: bool,
    pub media_type: String, // "video" | "audio" | "image" | "text"
}
```

### 阶段 2：Service trait 层 — 新增 probe 方法

#### 2.1 `packages/native-core/src/services/timeline.rs`
- **新增** `probe` 方法到 `ITimelineService` trait：
```rust
async fn probe(&self, jvi_path: &Path) -> Result<TimelineProjectInfo>;
```

### 阶段 3：Service 实现层

#### 3.1 `packages/native-core/src/services/impls/timeline.rs`
- **新增** `probe` 实现：
  1. 使用 `JviLoader::load()` 加载 .jvi 文件
  2. 遍历 tracks/elements 统计数量
  3. 收集所有 `src` 路径，检查文件是否存在
  4. 返回 `TimelineProjectInfo`
- **新增** 测试

### 阶段 4：Controller 层

#### 4.1 `packages/native-api/src/controllers/timeline.rs`
- **新增** `"probe"` match 分支：
  - 从 `options.source` 或 `resource_id` 获取 .jvi 文件路径
  - 调用 `timeline_service.probe(path)`
  - 返回 JSON 响应
- **新增** `ProbeRequestOptions` 结构体（含 `source: Option<String>`）
- **更新** `actions()` 列表，添加 `"probe"`
- **新增** 测试

## 不修改的文件

| 文件 | 原因 |
|------|------|
| router.rs | timelines group 不变 |
| engine.rs | TimelineService 创建逻辑不变 |
| jvi/ 模块 | JviLoader 已有完整功能，直接复用 |

## 验证方案

```bash
cargo build --workspace
cargo test -p neko-native-api -p neko-native-core
```
