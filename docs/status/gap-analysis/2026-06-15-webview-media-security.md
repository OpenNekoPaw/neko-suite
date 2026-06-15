# Webview 媒体安全与兼容性缺口

日期：2026-06-15

## 背景

本次 harness engineering 分析补充了 VS Code Webview 下的三类硬限制：

- CSP 默认拒绝，资源来源必须最小开放。
- Webview 原生 audio/video 支持有限，不能按扩展名判断可播放性。
- `webview.asWebviewUri(...)` 不是大型媒体 Range 文件服务器。

稳定约束已提升到 [`../../architecture/webview-media-security.md`](../../architecture/webview-media-security.md)。

## 当前观察

| 区域                              | 观察                                                                                         | 风险                                                                                        |
| --------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `neko-preview` document preview   | 已有 `PreviewFileServer`，通过 Engine token 提供 Range-capable URL。                         | 是正确方向，应扩展到更多媒体预览路径。                                                      |
| `neko-cut` video editor CSP       | 生产 CSP 仍允许 `media-src ... file:`，并保留 `unsafe-eval` / `wasm-unsafe-eval`。           | 历史兼容面较宽，新增媒体路径可能误以为 `file:` 可作为通用方案。                             |
| `neko-tools` media/asset diff CSP | 部分 diff editor CSP 包含 `file:` 或 `unsafe-eval`。                                         | 资源授权和 CSP 边界不够清晰。                                                               |
| Agent media cards                 | 保留 fallback，但 `<video>` / `<audio>` 仍依赖传入 `src` 是否兼容。                          | 需要 DTO 明确声明 source 是 compatible preview URL、Engine stream/proxy，还是只能打开预览。 |
| Webview smoke                     | 现有 smoke 可观察 Webview target，但尚未捕获 media error、CSP violation 和 seek/Range 证据。 | 仍需场景化 Skill 测试。                                                                     |

## 建议后续

1. 为各 Webview HTML helper 增加 CSP 单元测试，至少覆盖生产 CSP 不新增无界 `file:`、宽泛 localhost 或无理由 `unsafe-eval`。
2. 将视频/音频 preview DTO 拆分为 `compatiblePreviewUrl`、`engineStreamDescriptor`、`openInPreviewRef` 和 `diagnostic`，避免 Webview 猜测 URL 可播放性。
3. 把需要 duration/seek 的媒体预览迁移到 Engine file access/range endpoint 或 Engine stream/proxy。
4. 增加 VS Code debugger Skill smoke：打开目标 Webview 后采集 console CSP violation、media element error、network status 和 fallback 可见性。
5. 用小型 fixture 验证行为，但性能/高质量渲染仍需真实高码率视频、长音频和不兼容 codec 样本。

## 不立即修改的原因

当前已有生产 Webview 可能依赖宽 CSP 或历史媒体 URL。直接收紧 `media-src file:`、`unsafe-eval` 或替换 `<video>` / `<audio>` 可能造成预览回归。应先为每个入口补测试和替代 Engine descriptor，再逐步收紧。
