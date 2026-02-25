# Neko Suite 下一阶段任务计划

> 基于 2026-02-25 完成度分析，按优先级排列

---

## P0：阻塞性问题（立即处理）

### 1. neko-agent OpenAI streaming 实现
- 位置：`packages/neko-agent/packages/platform/` OpenAI adapter
- 问题：2 处 `throw new Error('Not implemented')` 阻塞 OpenAI streaming 功能
- 工作量：~2 天
- 影响：OpenAI 用户无法使用流式对话

### 2. neko-cut 资产拖拽导入
- 位置：`packages/neko-cut/packages/webview/src/hooks/useAssetLibrary.ts:310`
- 问题：拖拽导入未实现，影响基础编辑体验
- 工作量：~1 天
- 影响：用户无法通过拖拽添加素材到时间线

---

## P1：核心功能补全（当前迭代）

### 3. 零测试包补充测试
- neko-canvas（10,452 LOC，0 测试）— 画布交互逻辑复杂，回归风险高
- neko-client（2,179 LOC，0 测试）— 流媒体解码是底层关键路径
- neko-preview（3,590 LOC，0 测试）— 播放器状态管理需要测试
- 目标：每个包至少 20 个核心用例
- 工作量：~5 天

### 4. neko-cut 测试覆盖提升
- 现状：55K LOC 仅 104 个测试用例
- 重点：store slices（13 个）、hooks（13 个）、timeline 操作
- 目标：测试用例 → 300+
- 工作量：~5 天

### 5. neko-agent 迁移代码清理
- 3 处 `TODO: Remove after migration complete` 遗留代码
- 1 处 `TODO: Check workflow engine health`
- 工作量：~1 天

### 6. neko-cut ffprobe 元数据提取
- 位置：`packages/neko-cut/packages/extension/src/services/AssetService.ts:684`
- 通过 neko-engine 的 media probe 服务获取元数据
- 工作量：~1 天

---

## P2：功能增强（下一迭代）

### 7. neko-tools 媒体 Diff 核心功能
- 视频帧 seeking 和 extraction 未实现
- 文件比较和媒体信息展示未实现
- 工作量：~3 天

### 8. neko-assets Git Diff 分析
- `AssetDiffService.ts:241` — git ref 解析未实现
- `AssetDiffService.ts:274` — 变更分析未实现
- 工作量：~2 天

### 9. neko-cut 反向播放
- 位置：`packages/neko-cut/packages/webview/src/components/Timeline/TimelineTrack.tsx:612`
- 需要 neko-engine 配合支持反向解码
- 工作量：~3 天

### 10. neko-cut 导出增强
- 后台导出队列
- 导出预设管理
- 多分辨率预览切换
- 工作量：~5 天

### 11. neko-agent 时间线操作 Skills
- 批量操作支持
- 智能素材推荐
- 工作量：~5 天

### 12. neko-story 功能补全
- 错误诊断（LSP diagnostics）
- 时间线生成（剧本 → 时间线）
- PDF 导出
- 工作量：~5 天

---

## P3：新功能开发（后续迭代）

### 13. neko-agent 创作辅助 Skills
- 剧本解析 → 时间线自动生成
- 自动配乐
- AI 字幕生成
- 画面描述
- 工作量：~10 天

### 14. neko-canvas 渲染增强
- WebGPU 渲染
- 特效系统
- 自定义转场
- 导出功能（`ArtboardNode.tsx:116`）
- 工作量：~10 天

### 15. neko-model 3D 编辑器启动
- Phase 3.1：native-scene crate 骨架 + glTF 加载器
- Phase 3.1：@neko/scene-view R3F 视口组件
- Phase 3.1：neko-model 扩展骨架
- 详见 [3D 架构设计](./architecture/3d-capability-analysis.md)
- 工作量：~15 天（Phase 3.1）

---

## 技术债务（持续）

| 项目 | 优先级 | 说明 |
|------|--------|------|
| 统一错误处理 | P1 | 各包错误处理方式不一致 |
| git commit 规范化 | P2 | 当前全是 "update" 提交 |
| 文档补全 | P2 | docs/ 已有基础，需要持续更新 |
| 国际化扩展 | P3 | neko-cut/neko-agent 已有中英双语，其他包待跟进 |

---

## 里程碑对照

| 里程碑 | 对应任务 | 预计状态 |
|--------|----------|----------|
| M1 基础剪辑闭环 | P0 #1-2 + P1 #3-6 | 接近完成，补全测试和缺失功能后可达成 |
| M2 AI 集成 | P2 #11 + P3 #13 | 进行中，Agent 引擎已就绪，Skills 生态待建设 |
| M3 视觉增强 | P3 #14-15 | 规划阶段，3D 架构设计已完成 |

---

*生成日期：2026-02-25*
