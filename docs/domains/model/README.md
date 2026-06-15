# 模型创作领域

本目录记录面向 3D 模型和场景产物的创作领域架构，包括模型导入、编辑、LookDev、材质、Viewport、Scene stream、XR/3D 互动预览和 AI 辅助建模。

## 范围

- 3D 模型导入、预处理、查看、编辑和保存。
- Scene、Viewport、LookDev、材质、灯光和环境。
- Route A stream、scene control、低延迟交互和诊断。
- AI face sculpting、模型理解、场景编辑建议和验证。

## 不负责范围

- 通用 Engine/GPU/stream 约束：见 `docs/architecture/package-boundaries.md`。
- 互动叙事和实时设备创作：见 `docs/domains/interactive/`。

## 参与包与横切能力

| 类型       | 参与者                                   |
| ---------- | ---------------------------------------- |
| 主要创作包 | `neko-model`                             |
| 支撑包     | `neko-preview`, `neko-assets`            |
| 横切能力   | Agent、Engine、Client、Proto、UI、Assets |

## 阅读路径

1. [`architecture.md`](architecture.md)
2. [`../../architecture/package-boundaries.md`](../../architecture/package-boundaries.md)
3. `scripts/check-3d-route-a-boundaries.mjs`
