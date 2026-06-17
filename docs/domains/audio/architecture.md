# 音频创作领域架构

更新日期：2026-06-15

音频创作领域以 Engine audio runtime 和 `@neko/neko-client` 为媒体权威，Webview 负责波形、效果链和播放交互，Extension Host 负责文件授权、StatusBar 和命令入口。

## 模块职责

| 参与者        | 职责                                                     |
| ------------- | -------------------------------------------------------- |
| `neko-audio`  | 音频编辑器、波形 UI、效果链 UI、文件元数据状态           |
| `neko-live`   | 实时设备和直播交互，与 Engine device/audio 能力集成      |
| `neko-client` | `AudioStreamClient`、device clients、Engine audio action |
| `neko-engine` | 音频探测、PCM stream、效果、录制、设备和分析             |
| Agent         | 音频理解、后期建议、效果链生成和审阅                     |

## 稳定边界

- 音频探测、PCM stream、效果应用、loudness/silence 分析和设备 I/O 走 Engine。
- Webview 通过授权 stream client 播放 PCM，不直接访问本地文件或设备。
- Extension Host 管文件 URI、Engine 授权、StatusBar 和命令生命周期。
- 文件元数据等被动状态进入 native StatusBar，波形交互和编辑控件留在 Webview。
- Live 设备能力不绕过 Engine/device client 直接进入 Webview。

## 基础模式与专业模式

音频编辑器按“快速改善声音”和“完整 DAW 控制”区分模式。两种模式共享同一音频项目、效果链和 Engine audio runtime；基础模式不创建与专业模式平行的处理结果格式。

| 模式     | 定位                            | 能力边界                                                                                                                            |
| -------- | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| 基础模式 | AI 辅助音频清理、母带和快速导出 | 降噪、响度标准化、AI 母带、播客清理、推荐效果链、简单录音、基础剪切、淡入淡出和快速导出                                             |
| 专业模式 | DAW 级编辑和混音                | 多轨 timeline、mixer、bus/send、effect chain 精调、automation、markers/regions、preset、频谱/响度分析、录音路由、设备输入和导出参数 |

右侧 Dock 在基础模式显示快速处理、推荐链、录音/导出摘要和关键基础参数；专业模式显示 Effects、Recording、Export、Presets、Mixer、Automation 和分析面板。AI 在专业模式中作为效果链建议、问题解释和批处理辅助，不替代可审计的效果参数。

## 历史 ADR 归并

- AI DAW analysis、audio workstation evolution、audio workstation assessment：稳定边界进入本领域，能力差距进入 status/research。
- device management：设备通用边界与 live/audio 交叉，稳定约束可提升到 Engine 或系统架构。
