# TODO

> **语言:** 中文 | [English](./TODO.md)

本文只跟踪当前仓库的活跃工作队列。历史 Sprint 日志、过期实现说明和代码路径任务不再放在这里；设计和验收细节进入 `openspec/changes/`，带日期的观察进入 `docs/status/`，稳定约束进入 `docs/architecture/` 或 `docs/domains/`。长期方向见 [ROADMAP_CN.md](./ROADMAP_CN.md)。

## 活跃主题

| 主题                  | 目标                                                               |
| --------------------- | ------------------------------------------------------------------ |
| 项目图谱              | 统一资产、实体、生成媒体、搜索、Dashboard 和 Agent 记忆            |
| Agent 能力模型        | 所有创作包通过稳定能力契约暴露给 Agent                             |
| Engine-first 媒体权威 | 二进制文件访问、预览、感知和导出走引擎权威路径                     |
| 共享 Webview UI       | 重复 UI primitive 进入 `neko-ui`，领域状态仍留在功能包             |
| 端到端 smoke          | 验证剧本意图到生成媒体、时间线装配、预览、导出和审阅               |
| 文档治理              | README、Architecture、docs、TODO、Roadmap 和 OpenSpec 保持职责分离 |

## 核心平台

- [ ] 保持 `neko-proto`、`neko-types`、`neko-client` 作为契约和客户端基础层同步演进。
- [ ] 继续清理 Layer 0 工具，但不引入内部包依赖。
- [ ] 守住 Webview、Extension Host、共享契约和 Rust 引擎依赖边界。
- [ ] 为跨扩展依赖和 Webview 沙箱规则补充聚焦架构守卫。

## 引擎

- [ ] 完成媒体 sink、preview provider、GPU budget、ML bridge 和 plugin lifecycle 的接口/管线解耦。
- [ ] 完成设备绑定和运行时路由，让实时设备输入以引擎为权威。
- [ ] 加固 headless export 和 batch render，支持 CI 与 Agent 自动化工作流。
- [ ] 保持 runtime-scene、runtime-puppet、runtime-audio、runtime-media、runtime-device、runtime-ml 通过宿主无关契约对齐。
- [ ] 未来 XR/game/simulation runtime 必须继续走明确 runtime-layering 决策。

## Agent

- [ ] 围绕审批、评估反馈、记忆投影和会话摘要加固 Draft / Plan / Apply 工作流。
- [ ] 用能力发现和共享 extension API 替代硬编码包假设。
- [ ] 统一生成媒体落盘，让 Chat、Canvas、Story、Cut、Assets、Search 看到同一套持久资产事实。
- [ ] 完成 storyboard、media card、comparison、gallery、report、model、audio、puppet 等富内容投递边界。
- [ ] 继续把 Webview 状态收敛到可预测 store 和更小的 context surface。

## Story、Canvas、Cut

- [ ] 验证从剧本场景到 Canvas 分镜、生成资产、Cut 时间线、预览和导出的主路径。
- [ ] Canvas 保持分镜和视觉编排职责，不复制 Story 或 Timeline 权威。
- [ ] 继续打磨 Canvas block/container layout、候选审阅、asset namespace 边界和大画布性能。
- [ ] 加固 Cut 导入、编辑、预览、导出、回读 smoke。
- [ ] Story 保持剧本文本事实、场景索引和文本优先审阅职责。

## Preview、Tools、Quality

- [ ] 完成文档、视频、音频、全景媒体和生成变体的 engine-first 预览覆盖。
- [ ] 通过 engine/client 契约继续推进 Media Diff 与语义审阅。
- [ ] 确定性质量检查与 Agent 主观评估分离；可复用检查应服务 tools 和 CI。
- [ ] 改善检查类界面的主题、焦点、i18n 和共享 UI 一致性。

## Assets、Market、Entity、Search

- [ ] 收敛资产注册表、生成资产 provenance、实体身份、搜索索引和 Dashboard 投影。
- [ ] 完成 Story、Entity、Assets、media、documents 和 Agent mention 的项目缓存/搜索适配。
- [ ] 保持 marketplace client 与 registry-server 职责分离。
- [ ] 扩展本地模型/provider 安装流程，但不把服务端权威放进客户端。

## 互动创作

- [ ] 围绕引擎权威和共享 UI 契约加固 model、puppet、sketch、audio、live。
- [ ] 继续收敛 Live Mode 边界，避免设备输入、tracking、scene composition、recording 在包间重复。
- [ ] 通过共享契约完善动作、表情、材质、光照和音频等可复用资产。
- [ ] 保持 2D/3D/video/audio 合成路径与引擎 runtime 和导出权威一致。

## 验证

按影响范围选择最小验证：

- [ ] `pnpm check`
- [ ] `pnpm test`
- [ ] `pnpm build`
- [ ] `cd packages/neko-engine && cargo test --workspace`
- [ ] 对变更涉及的 Story / Canvas / Cut / Agent / Engine 主路径做领域 smoke

## 文档卫生

- [ ] 新增系统级设计文档时，同步 `docs/architecture/README.md` 和 `docs/README.md`。
- [ ] 新增创作领域文档时，同步 `docs/domains/README.md`、对应领域 `README.md` 和必要的 `architecture.md`。
- [ ] 架构文档只保留决策、边界、不变量、风险和后果；仍活跃的实现任务放到 OpenSpec 或本文。
- [ ] Gap、迁移、健康度和审计文档只保存带日期快照，稳定结论提升到 `docs/architecture/` 或 `docs/domains/`。
- [ ] 调研、竞品和技术 spike 放入 `docs/research/`，并标注来源、日期或不确定性。
- [ ] 供脚本和 CI 消费的门禁数据放入 `quality/`，解释性政策保留在架构文档。
- [ ] 过期示例应删除或重写，不作为历史契约保存。
- [ ] 文档目录规则变化后，同步 README、Architecture、TODO、Roadmap 和 `AGENTS.md`。
- [ ] 文档改动至少执行 Markdown 格式检查、空白检查和本地链接检查。
