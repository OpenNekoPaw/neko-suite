# 重构计划：移除推模式 Stream 接口

## 背景
Extension 不生产帧，完全由 Rust 处理。推模式（createStream / pushStreamFrame）无业务调用者，属于过度设计。

## 变更范围

### 1. NAPI 层 - `native-napi/src/engine.rs`
- 删除 `create_stream()` 方法（317-372 行）
- 删除 `push_stream_frame()` 方法（374-416 行）
- 删除 `use neko_native_core::domain::FrameData` 导入
- 删除 `use neko_types::FrameFormat` 导入（如无其他引用）

### 2. NAPI 类型 - `native-napi/index.d.ts`
- 删除 `createStream()` 声明
- 删除 `pushStreamFrame()` 声明
- （此文件由 NAPI-RS 自动生成，删除 Rust 方法后重新生成即可）

### 3. EngineApi - `native-api/src/engine.rs`
- `stream_registry()` 方法从 `pub` 改为 `pub(crate)`
- （StreamRegistry 本身保留，拉模式的 register_external_stream 依赖它）

### 4. neko-cut/FrameServerService.ts
- 删除 `createStream()` 方法
- 删除 `pushFrame()` 方法
- 删除 `_activeStreams` 字段及相关方法（getActiveStreams / getStreamInfo）
- 删除 `NativeEngineInstance` 接口中的 `createStream` / `pushStreamFrame` 声明
- 删除 `StreamInfo` 导出接口（如无外部引用）

### 5. StreamRegistry - `native-api/src/registry/stream.rs`
- `try_send_frame()` 从 `pub` 改为 `pub(crate)`（仅内部转发任务使用）
- `send_frame()` 同理

## 不变更的部分
- StreamRegistry 本身（拉模式依赖）
- StreamController streams:* （内部使用）
- stream_loop / ActiveStreams（拉模式核心）
- startFrameServer / stopFrameServer（WebSocket 基础设施）
- dispatch / dispatchAction（统一入口）

## 执行顺序
1. native-napi/src/engine.rs - 删除两个方法
2. native-api/src/engine.rs - stream_registry() 改 pub(crate)
3. native-api/src/registry/stream.rs - send_frame/try_send_frame 改可见性
4. neko-cut FrameServerService.ts - 简化
5. cargo build 验证 Rust 编译
6. npm run build 验证 TypeScript 编译（如适用）
