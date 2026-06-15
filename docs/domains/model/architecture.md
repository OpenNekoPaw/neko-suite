# 模型创作领域架构

更新日期：2026-06-15

模型创作领域以 Engine Scene/Viewport 为权威，Webview 承载交互和授权 stream 消费，Extension Host 负责 VS Code editor、资源授权和命令桥。该领域关注 3D 模型、场景、LookDev、材质、Viewport、XR/3D 互动预览和 AI 辅助编辑。

## 模块职责

| 参与者        | 职责                                                                     |
| ------------- | ------------------------------------------------------------------------ |
| Webview       | 模型编辑 UI、Viewport overlay、面板输入、授权 stream/control 消费        |
| Extension     | Custom editor、StatusBar、资源授权、Engine 端口和 command bridge         |
| Engine client | Scene command、stream descriptor、scene control socket、model preprocess |
| Engine        | Scene runtime、Viewport renderer、GPU render、H.264 stream、diagnostics  |
| Agent         | 模型理解、编辑建议、捏脸/材质/场景辅助和验证                             |

## Route A 边界

- Webview 直接消费授权后的 Engine canvas/stream/control。
- Extension Host 不代理视频帧、PCM 包或高频 scene delta。
- Authoring panels 生成 Engine commands，不直接改 Webview 私有 scene truth。
- `VideoViewport` 等主路径不挂载重复的 R3F model runtime。
- 低延迟交互 Scene stream 优先短 GOP，必要时 GOP=1；非交互导出或其他流不继承这个全局假设。

## 历史 ADR 归并

- 3D editor rendering、model lookdev、basic editing baseline：归并到本领域架构。
- 3DGS/headshot gap、AI face sculpting：稳定边界进入本领域，能力差距进入 status/research。
- XR authoring/runtime split：横切约束可在成熟后提升到 `docs/architecture/`，互动运行态细节链接到 `docs/domains/interactive/`。

## 验证

```bash
pnpm check:3d-route-a-boundaries
pnpm --filter @neko-model/webview test
```
