# 历史 docs/ADR 领域迁移分析

快照日期：2026-06-15
历史来源：`6ea9f0480481977fb27b667bad02c08928eea668` 的 `docs/architecture/`、`docs/analysis/`、`docs/development/`、`docs/guides/`。

## 当前结论

历史 `docs/architecture/` 混合了系统约束、领域架构、调研、gap、审计、开发计划和机器可读 JSON。当前不应原样恢复这些文件，而应按语义迁移：

- 稳定跨包约束：进入 `docs/architecture/`。
- 领域内部架构：进入 `docs/domains/<domain>/architecture.md`。
- 调研、竞品、技术对标和许可证分析：进入 `docs/research/`。
- gap、审计、迁移、计划和评估：进入 `docs/status/gap-analysis/`。
- 脚本/CI 消费的 JSON 台账：进入 `quality/`。

## 已创建创作领域入口

| 创作领域 | 入口                        | 主要历史来源                                                                               |
| -------- | --------------------------- | ------------------------------------------------------------------------------------------ |
| 视频创作 | `docs/domains/video/`       | cut、storyboard、canvas route、preview、media LSP、comic-to-animation、video understanding |
| 音频创作 | `docs/domains/audio/`       | AI DAW、audio workstation、device/audio runtime                                            |
| 模型创作 | `docs/domains/model/`       | 3D editor、LookDev、Route A、AI face sculpting、XR/Viewport                                |
| 2D 创作  | `docs/domains/2d/`          | sketch、PSD、2D lighting、Puppet、Live2D/Inochi2D、lipsync                                 |
| 互动创作 | `docs/domains/interactive/` | Canvas interactive narrative、preview routes、device/live、XR runtime                      |

## 迁移矩阵

| 历史主题                                                                                         | 建议去向                                                               | 处理方式                             |
| ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------- | ------------------------------------ |
| `adr-code-review-quality-gates.md`                                                               | `docs/architecture/`                                                   | 已保留为系统级质量门禁               |
| `vscode-constraints.md`、`local-resource-access.md`、`format-strategy.md`、`storage-strategy.md` | `docs/architecture/`                                                   | 稳定跨包约束，后续按需恢复           |
| Agent workflow/runtime/prompt/skill/memory/provider/subagent                                     | `docs/architecture/` 或具体创作领域 `integration.md`                   | 横切支撑能力，不作为创作领域         |
| Engine four-layer/runtime/kernel/pipeline/GPU/preview/file access                                | `docs/architecture/` 或具体创作领域 `integration.md`                   | 横切支撑能力，不作为创作领域         |
| Webview UI/layout/keyboard/shared components                                                     | `docs/architecture/` 或具体创作领域 `integration.md`                   | 横切支撑能力，不作为创作领域         |
| Canvas block/container/preview/agent integration                                                 | `docs/domains/interactive/`，涉及分镜/剪辑时链接 `docs/domains/video/` | 已形成互动创作架构种子               |
| Storyboard/story-agent/entity-canvas projection                                                  | `docs/domains/video/` 或 `docs/domains/interactive/`                   | 按产物目标归入视频或互动创作         |
| Cut/video/media LSP/preview/panorama/video understanding                                         | `docs/domains/video/`                                                  | 已形成视频创作架构种子               |
| Model/3D/LookDev/XR/face sculpting                                                               | `docs/domains/model/`，运行态互动链接 `docs/domains/interactive/`      | 已形成模型创作架构种子               |
| Audio/DAW/device/live audio                                                                      | `docs/domains/audio/`，实时控制链接 `docs/domains/interactive/`        | 已形成音频创作架构种子               |
| Puppet/Live2D/Inochi2D/PSD bridge/lipsync                                                        | `docs/domains/2d/`                                                     | 已形成 2D 创作架构种子               |
| Asset/entity/search/market/registry                                                              | `docs/architecture/` 或具体创作领域 `data-flow.md`                     | 横切支撑能力，不作为创作领域         |
| AI technology landscape、3DGS、Bevy、Headshot、Live2D license                                    | `docs/research/`                                                       | 不恢复为架构事实                     |
| package audit、dark theme audit、remaining tasks、feature gap、development plans                 | `docs/status/gap-analysis/`                                            | 只保留带日期快照                     |
| `agent-code-debt-lcd-register.json`、`code-debt-surface-ledger.json`                             | `quality/`                                                             | 机器可读输入，不放 docs/architecture |

## 后续建议

1. 优先细化 `video`、`audio`、`model`、`2d`、`interactive` 五个创作领域。
2. 对历史文档做逐篇恢复前，先验证当前代码是否仍支持该约束。
3. 领域文档只记录稳定边界；功能差距和实施计划继续放 status 或 OpenSpec。
4. 若某个领域规则开始影响多个领域，再提升到 `docs/architecture/`。
