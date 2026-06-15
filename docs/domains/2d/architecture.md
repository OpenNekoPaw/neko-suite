# 2D 创作领域架构

更新日期：2026-06-15

2D 创作领域围绕绘画、PSD、Puppet 和 2D 动画素材组织。它跨 `neko-sketch`、`neko-puppet`、Engine、Agent、Assets 和 UI，不按单个子包切分。

## 模块职责

| 参与者        | 职责                                                        |
| ------------- | ----------------------------------------------------------- |
| `neko-sketch` | 2D 绘画、图层、工具状态、PSD/AI 增强入口                    |
| `neko-puppet` | 2D 骨骼、脸部参数、Puppet bundle、编辑 UI                   |
| `neko-engine` | Puppet runtime、renderer、stream、导出、必要的图像/渲染能力 |
| `neko-assets` | 2D 素材、PSD、角色素材和生成结果管理                        |
| Agent         | 图像准备、分层建议、角色素材整理、Puppet 辅助与质量检查     |
| UI            | 绘画工具、属性面板、workbench 和键盘边界的复用层            |

## 稳定边界

- Webview 管绘画和 Puppet 编辑交互，Extension 管文件访问、资源授权和 StatusBar。
- Puppet runtime、renderer、stream 和导出由 Engine 负责。
- Sketch 与 Puppet 之间通过格式、asset/entity 引用和明确 bridge 连接，不读写彼此私有状态。
- PSD、Live2D/Inochi2D、图像准备和 AI 增强能力要通过 contract 或 Agent/Engine 能力接入。
- 通用 UI 可复用 `@neko/ui`，Sketch/Puppet 专属工具和面板留在对应包内。

## 历史 ADR 归并

- `adr-2d-bone-blendshape-animation.md`、`adr-engine-puppet-renderer.md`、`adr-puppet-model-format-integration.md`：归并到 2D/Puppet 架构细则。
- `sketch-2d-lighting.md`、`neko-sketch-psd-ai-development-plan.md`、`psd-to-puppet-bridge-design.md`：稳定边界进入本领域，计划和 gap 进入 status。
- Live2D/Inochi2D 许可证和制作指南进入 research 或 guides，不作为系统架构事实。
