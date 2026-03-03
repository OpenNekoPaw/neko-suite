# TODO

> 当前迭代的活跃任务清单。长期路线图见 [ROADMAP.md](./ROADMAP.md)。

---

## 🔴 P0 — 阻塞性（本迭代必须完成）

### neko-engine
- [ ] 预加载优化：首帧解码延迟过高（>200ms）
- [ ] 音量标准化 API：`audios:normalize` 路由缺失

### neko-cut
- [ ] 多分辨率预览切换（1/4、1/2、Full）
- [ ] 拖拽导入优化：外部文件拖入时间线有竞态问题

---

## 🟡 P1 — 核心功能（当前迭代）

### neko-tools（媒体 Diff）
- [ ] **Diff Phase 3**：Engine 流式帧指标返回（SSIM 每 N 帧回调，Rust 工作量大）
  - 见 [docs/adr-media-diff-parallelism.md](./docs/adr-media-diff-parallelism.md#phase-3流式渐进式)
- [ ] 视频 probe 提前发送：需新增 `mediaDiff:probeResult` webview 消息处理（前端配合）

### neko-agent（AI Skills）
- [ ] 批量时间线操作 Skill（当前仅支持单元素操作）
- [ ] 剧本解析 → 时间线自动生成 Skill（neko-story 联动）
- [ ] AI 字幕生成 Skill（调用 Whisper / 云端 ASR）
- [ ] 智能素材推荐（根据剧本自动检索资产库）

### neko-story
- [ ] 错误诊断（LSP Diagnostics）：语法错误实时标红
- [ ] 时间线生成：`.nks` → `.jvi` 自动转换
- [ ] 导出 PDF（Fountain 标准格式）

### neko-assets（Phase 4）
- [ ] ShaderAssetHandler（编译验证 + 预览 + 热重载）
- [ ] PresetAssetHandler（LUT / 转场预设 / 导出预设）
- [ ] ModelAssetHandler（AI 模型下载 + 校验 + 量化选择）
- [ ] AI 生成结果自动入库（Agent 生成 → AssetRegistry.register）
- [ ] IAIAnalysisService 实现（接入 neko-agent AI 分类）

---

## 🟢 P2 — 增强功能（可延后）

### neko-cut
- [ ] 导出预设管理（常用配置保存/加载）
- [ ] 后台导出队列（多任务并发导出）
- [ ] 更多编码格式支持（ProRes、DNxHD）

### neko-engine
- [ ] WebGPU 实时预览优化（降低 GPU→CPU 回读延迟）
- [ ] 高精度波形 Zoom（按需加载超过 800 点的精细波形）
  - 见 [docs/adr-media-diff-parallelism.md](./docs/adr-media-diff-parallelism.md#9-高精度波形zoom-按需加载)

### neko-proto
- [ ] 接入 protoc/buf 自动生成（当前手动维护，同步成本高）
- [ ] 补齐 diff.proto 剩余类型定义

### neko-canvas
- [ ] WebGPU 渲染管线（当前 Canvas 2D 降级实现）
- [ ] 特效系统（复用 neko-engine WGSL shaders）
- [ ] 自定义转场（复用 engine 转场类型）

---

## 📋 技术债务

| 优先级 | 问题 | 影响 |
|--------|------|------|
| 高 | 统一错误处理机制（各包自行 catch，不统一） | 调试困难 |
| 高 | 单元测试覆盖率（neko-agent 47 个最多，其他包偏少） | 回归风险 |
| 高 | neko-engine 性能监控（telemetry 基础已有，需接入指标面板） | 性能盲区 |
| 中 | 规范化 git commit message（采用 Conventional Commits） | 追溯困难 |
| 中 | neko-types 类型文档完善（JSDoc 覆盖率低） | 开发体验差 |
| 低 | 国际化扩展（仅 neko-cut/neko-agent 有中英双语） | 国际化缺口 |

---

## 🚧 规划中（未开始）

| 模块 | 目标 | 参考 |
|------|------|------|
| neko-audio | 波形编辑 + 均衡器 + 录音 | Phase 4 |
| neko-live | 动捕 + 虚拟形象 + 直播 | Phase 5 |
| neko-sketch | 压感手绘 + 笔刷系统 | Phase 3 |
| neko-model (3D) | native-scene + R3F 视口 | Phase 3，架构设计已完成 |
| neko-assets Phase 5 | 社区分发（.neko 包格式 + 远程注册表） | Phase 6 |

---

*最后更新：2026-03-03*
