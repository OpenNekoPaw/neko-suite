# Neko Suite Roadmap

> **语言:** 中文 | [English](./ROADMAP.md)

本文是方向性路线图，不是发布承诺。活跃执行项见 [TODO_CN.md](./TODO_CN.md)。当前架构边界见 [ARCHITECTURE_CN.md](./ARCHITECTURE_CN.md)。

## 路线原则

1. 先打通共享产品闭环，再增加孤立原型。
2. 保持引擎权威、共享契约和 Webview 沙箱边界。
3. Agent 能力来自各包提供的契约，而不是硬编码包知识。
4. 项目资产、实体记忆、搜索和生成媒体收敛到同一个项目图谱。
5. 推动可复用创意资产跨 Story、Canvas、Cut、Model、Puppet、Sketch、Audio、Live 流通。

## 近期：产品化加固

| 方向 | 目标 |
|------|------|
| Story 到视频 | 把剧本场景规划、Canvas 分镜导入、生成、Cut 装配、预览和导出验证成一条 smoke 主路径 |
| Agent 接地 | 生成结果、文件 chip、资产、实体引用和任务状态必须可持久化、可搜索 |
| Engine-first 预览 | 预览、文档读取、媒体 probe、全景媒体和导出源访问保持 engine/client 权威 |
| 共享 UI | 通用 Webview 控件进入 `neko-ui`，领域逻辑仍由功能包拥有 |
| 质量门禁 | 围绕高风险跨包主路径扩展确定性检查、smoke 和架构守卫 |

## 中期：创作工具成熟度

| 方向 | 目标 |
|------|------|
| Canvas | 改善 block/container layout、候选审阅、资产/实体接地和大画布性能 |
| Cut | 加固导入/编辑/导出回环、AI 分镜落地、媒体 QC 和 engine-native 合成 |
| Preview 与 Tools | 统一媒体/文档预览、Media Diff、语义审阅和检查工作流 |
| Audio | 多轨编辑、录音闭环、Mixer/Automation、Stem Export 和 Agent 音频工具 |
| Sketch 与 Puppet | 生产级创作体验、可复用动作/表情资产、光照/材质路径和导出可靠性 |
| Model | 场景编辑、LookDev、动画、IK、材质处理和 Agent 模型工具 |

## 中期：项目智能层

| 方向 | 目标 |
|------|------|
| 实体身份 | 角色、场景、物体、资产、剧本范围、Canvas 节点、时间线元素和媒体片段身份收敛 |
| 语义搜索 | OCR、ASR、embedding、元数据提取和派生索引进入统一项目搜索/缓存服务 |
| 角色记忆 | 长篇角色事实和变化按 story、scene、shot、cut range 和 provenance 保持作用域 |
| 多模态 Git | 媒体感知 diff、语义 JSON 审阅、实体影响分析和 commit 级摘要 |
| Dashboard | 项目任务、实体、资产、生成媒体、搜索和 Agent 状态在同一 hub 可检查 |

## 引擎与运行时演进

| 方向 | 目标 |
|------|------|
| Runtime 分层 | scene、puppet、audio、media、device、ML 和未来 stage runtime 通过契约分离 |
| Device 与 Live | 设备输入、tracking、校准、录制和 live scene composition 以引擎为权威 |
| Plugin 与 Marketplace | 为 format、shader、model、device、exporter、connector、provider 提供受控扩展点 |
| 本地模型运行时 | 本地 LLM、图像、视频、音频和感知 provider 通过明确 trust/capability 边界安装 |
| 未来 runtime | XR、game、simulation、interactive stage 只有在契约和运行时边界清楚时再升级 |

## 长期产品方向

| 方向 | 意图 |
|------|------|
| 交互叙事 | Canvas 分支图、标准场景文本、独立 preview/export runtime 和 Agent 辅助迭代 |
| 虚拟制片 | Live avatar、设备输入、动捕、场景合成、推流和录制 |
| 可复用角色包 | Model、Puppet、Motion、Expression、Voice、Material、Memory、Agent persona 作为可移植创意资产 |
| AI 感知-编辑-验证闭环 | Agent 观察项目事实和媒体输出，通过契约编辑，并用确定性与主观反馈验证 |
| 跨宿主未来 | 保持 engine 和 client 宿主无关，使未来独立创作宿主复用同一套契约 |

## 文档策略

Roadmap 只描述方向和优先级。不要在这里加入代码片段、实现日志、历史 Sprint 记录或易过期百分比。活跃实现工作放到 [TODO_CN.md](./TODO_CN.md) 或 OpenSpec。
