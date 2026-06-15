# 音频创作领域

本目录记录面向音频产物的创作领域架构，包括音频编辑、后期、效果链、录制、PCM 播放、设备输入和实时音频集成。

## 范围

- 音频文件导入、波形、播放、剪辑和元数据展示。
- 效果链、后期处理、loudness/silence 等分析。
- 录制、设备输入、实时音频和 live 场景。
- Agent 音频理解、后期建议、效果链生成和质量审阅。

## 不负责范围

- Engine audio/device 的通用权威边界：见 `docs/architecture/package-boundaries.md`。
- 视频剪辑、3D 模型、2D 绘画和互动叙事：见对应创作领域。

## 参与包与横切能力

| 类型       | 参与者                                   |
| ---------- | ---------------------------------------- |
| 主要创作包 | `neko-audio`, `neko-live`                |
| 支撑包     | `neko-preview`, `neko-assets`            |
| 横切能力   | Agent、Engine、Client、Proto、UI、Assets |

## 阅读路径

1. [`architecture.md`](architecture.md)
2. [`../../architecture/package-boundaries.md`](../../architecture/package-boundaries.md)
