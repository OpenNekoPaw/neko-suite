# ADR：GPU 预算控制器

- **状态**：提议中
- **日期**：2026-05-13
- **作者**：Claude（架构师）
- **范围**：engine-kernel（gpu/budget.rs、services/impls/）
- **父文档**：[adr-engine-interface-pipeline-decoupling](./adr-engine-interface-pipeline-decoupling.md)
- **前置条件**：[adr-engine-pipeline-sink](./adr-engine-pipeline-sink.md)（Budget 管理 PipelineSink 管线）

---

## 背景

当前所有并发管线共享一个 `Arc<GpuContext>`，它包装一个 wgpu Device + Queue。`GpuContext` 上没有 mutex —— wgpu Device/Queue 通过 `Queue::submit()` 的内部串行化自行处理同步。但没有优先级、没有预算、GPU 过载时也没有暂停/限流路径。

当多条 GPU 管线并发运行时（如编辑预览 + 导出 + 后台转码），没有机制确保交互式预览不被后台任务挤占 GPU 时间片。编码器池（最多 4 个）和解码器池（最多 16 个）提供了粗粒度的资源上限，但 GPU 计算本身是无限制竞争的。

---

## 当前状态 —— 未受控共享

单个 `Arc<GpuContext>` 包装一个 wgpu Device + Queue，并被所有管线共享。`GpuContext` 上没有 mutex —— wgpu Device/Queue 通过 `Queue::submit()` 的内部串行化自行处理同步。

## 资源池

| 资源池    | 上限                           | 争用模型                                        |
| --------- | ------------------------------ | ----------------------------------------------- |
| Decoder   | 总计 16，每文件 2 个           | `Mutex<PoolState>`，按需创建直到上限            |
| Encoder   | 总计 4 个                      | `Mutex<Vec<PooledEncoder>>`，按需创建直到上限   |
| IOSurface | 无固定上限（每 backing store） | Apple 系统资源，约 4-6 个并发 VT session 后退化 |

## 并发管线场景

| 场景        | 管线                     | 风险                        |
| ----------- | ------------------------ | --------------------------- |
| 编辑 + 预览 | Timeline preview × 1     | 低                          |
| 编辑 + 导出 | Preview + ExportJob      | 中 —— GPU 时间片争用        |
| 多流        | Timeline + Video + Scene | **高** —— 3 条并发 GPU 管线 |
| 转码 + 预览 | 后台转码 + 任意预览      | 中 —— 编码器池压力          |

## GpuBudgetController 提议

`GpuBudgetController` 维护活跃管线列表，根据帧时间反馈实施限流/暂停策略。

**关键参数**（均应可配置，不硬编码）：

| 参数 | 含义 | 参考默认值 |
|------|------|-----------|
| `max_concurrent_gpu_pipelines` | 最大并发 GPU 管线数 | 3 |
| `max_concurrent_encoders` | 最大并发编码器数（与池大小一致） | 按并发场景需求配置 |
| `degradation_threshold_ns` | Interactive 帧时间 EMA 超过此值触发降级 | 18ms（超过 16.6ms 帧预算） |

**管线优先级**：

| 优先级 | 含义 | 降级策略 |
|--------|------|----------|
| `Interactive` | 编辑预览：最高优先级 | 永不降级 |
| `Export` | 用户触发导出 | 可排队，但不降级 |
| `Transcode` | 后台代理/转码 | 可暂停/限流，永不迁移到 CPU |

**压力触发条件**：wgpu 不暴露 GPU 利用率指标。因此 controller 使用 **多信号帧时间反馈**：

- 主信号：Interactive 管线的帧时间 EMA 超过 `degradation_threshold_ns`（18ms，表示交互预览受影响）
- 次级信号 A：所有活跃管线的加权帧时间 EMA 超过并发预算（避免后台 Transcode 消耗大量 GPU 但 Interactive 内容简单时漏判）
- 次级信号 B：`wgpu::Queue::on_submitted_work_done` 回调延迟持续升高（作为 GPU 队列深度代理）

这些指标可通过 `process_frame_to_iosurface_timed()` 已返回的 `GpuPipelineTiming` 和提交完成回调观测。预算控制必须同时记录 per-pipeline frame time 和全局 weighted EMA；只看 Interactive EMA 不足以判断系统总 GPU 压力。

**优先级规则**：

- `Interactive` > `Export` > `Transcode`
- GPU 过载时，`Transcode` 管线会被**暂停**
- `Export` 在 `Interactive` 后排队，但不会降级
- 编码器池大小应可配置（不硬编码），根据并发场景（导出 + 预览 + 转码）和平台 VT session 限制动态调整

**预算响应的真实含义**（纠正一个设计缺陷）：

原设计曾建议把 Transcode 降级为 `process_frame_to_nv12()` + 软件编码。但 `process_frame_to_nv12()` 仍会运行完整 GPU 合成管线（`process_frame_timed()`），只是跳过 zero-copy IOSurface 路径并增加一次 CPU readback。这不会降低 GPU 负载，反而增加工作量（GPU 合成 + GPU RGBA→NV12 + CPU readback）。

真正降低 GPU 负载的选项：

1. **暂停** —— 完全暂停 Transcode 管线，直到 Interactive 帧时间恢复（最简单，P2 推荐）
2. **降低分辨率** —— 以半分辨率转码（GPU texture 操作减少约 4 倍）
3. **降低帧率** —— 每 N 帧转码一次（按比例减少 GPU 调用）

对视频帧、3D 渲染或 puppet 渲染来说，CPU 执行不是负载削减方案。它要么保留 GPU 工作并增加 readback stall，要么把高吞吐渲染转移到 CPU，带来 UI/系统卡顿风险。P2 实现选项 1（暂停）。选项 2-3 是 P3 增强项。

### Permit 生命周期

管线在每次 render loop 迭代前调用 `budget.acquire_permit(pipeline_id, priority)` 获取 `GpuPermit`。permit 行为取决于优先级和系统压力：

| 调用方优先级 | 无压力 | 有压力（Interactive EMA > 18ms） |
|-------------|--------|-------------------------------|
| `Interactive` | 立即返回 `Permit::Proceed` | 立即返回 `Permit::Proceed`（永不阻塞） |
| `Export` | 立即返回 `Permit::Proceed` | 返回 `Permit::Queued`——在 Interactive 帧之间交替调度 |
| `Transcode` | 立即返回 `Permit::Proceed` | 返回 `Permit::Paused(reason)`——管线必须 sleep 直到 controller 唤醒 |

**`Permit::Paused` 的消费方协议**：管线收到 `Paused` 后：
1. 释放当前帧的所有临时 GPU 资源（texture、staging buffer）
2. 通过 `budget.wait_for_resume(pipeline_id)` 阻塞（内部使用 `tokio::sync::Notify`）
3. Controller 在恢复条件满足时调用 `notify_one()`

**恢复滞回**：暂停在 Interactive EMA **持续** > 18ms（3 个连续采样点）时触发；恢复在 Interactive EMA **持续** < 14ms（5 个连续采样点）时触发。不对称窗口避免 Transcode 在边界值附近反复暂停/恢复（抖动）。

### Export 排队语义

`Export` 不被暂停，但在压力下交替调度——Interactive 帧和 Export 帧轮流获取 permit。这确保导出不会饿死，但 Interactive 帧率至少维持在非压力值的 50%。Export 排队是公平的（FIFO），多个并发导出按入队顺序交替。

### Preview Provider 被暂停时的用户体验

`PreviewProviderRegistry` 发起的 GPU 操作（如 `PanoramicRenderer`）以 `Transcode` 优先级运行。如果 permit 返回 `Paused`：

1. Provider 返回 `PreviewArtifact::Unavailable { reason: GpuBusy, retry_after_ms: 500 }`
2. 调用方（host-http handler）返回 HTTP 503 + `Retry-After: 1` header
3. 前端收到 503 后显示 loading 占位符并在 1s 后重试
4. 非 GPU 预览（PDF/EPUB/纯图片 resize）不受影响——它们不获取 GPU permit

---

## 实施计划

### P2-PR1：GpuBudgetController（约 120 行）

**变更文件**：

- 新增：`engine-kernel/src/gpu/budget.rs` —— `GpuBudgetController` + `PipelinePriority` + frame-time EMA
- 修改：`engine-kernel/src/services/impls/timeline.rs` —— 管线前获取 permit，并上报 frame time
- 修改：`engine-kernel/src/services/impls/video.rs` —— 获取 permit，接受降级/限流结果
- 修改：`engine-kernel/src/export/service.rs` —— 获取 permit

**能力**：基于帧时间优先级的并发管线管理。

---

## 设计决策

| 决策                                                         | 理由                                                                                                                    | 备选方案                                                                              |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| GPU 预算基于帧时间反馈，而不是 GPU 利用率                    | wgpu 不提供 GPU 利用率指标；帧时间可直接通过已有 `GpuPipelineTiming` 观测                                               | 查询 GPU 利用率（wgpu 不支持）                                                        |
| GPU 预算是软控制器，而不是硬锁                               | wgpu Device/Queue 是线程安全的；硬锁会把所有 GPU 工作串行化                                                             | 给 GpuContext 套 Mutex（会杀死并发）                                                  |

---

## 风险与缓解

| 风险                             | 影响                                  | 缓解措施                                                                                                                                                          |
| -------------------------------- | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GPU 预算 controller 误判降级     | Transcode 被不必要地暂停或限流        | 使用带滞回的帧时间 EMA（持续高于 18ms 时暂停，低于 14ms 时恢复）；管线数量作为次级保护                                                                            |

---

## 验证

**P2（GPU 预算）**：

- 并发 timeline 预览 + 导出：两者都成功完成，预览保持 >24fps
- 在 active preview 存在时，后台转码会被暂停或限流，但不影响预览（由帧时间 EMA > 18ms 触发）
- 正常并发负载下编码器池不会耗尽（预览 + 导出 + 转码）
