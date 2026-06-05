# Intent-aware Content Access And Ingest

> Status: Active
>
> Related: [storage-strategy.md](./storage-strategy.md), [local-resource-access.md](./local-resource-access.md), [document-preview.md](./document-preview.md), [engine-file-access.md](./engine-file-access.md), [agent-media-architecture.md](./agent-media-architecture.md)

## 背景

Neko Suite 已经有统一资源缓存、PathResolver、LocalResourceAccessService 和 Engine File Access。剩余风险在于调用方仍可能按路径形态自行判断应该读取原始文件、缩略图、文档解包图、Preview 变体、视频代理或 Agent scratch 输出。

这个判断必须由 Host 侧的意图感知边界统一完成。实时预览需要快速、可投影、可重建的派生物；离线导出、打包、校验和 hash 必须使用原始 source 或原始 container entry，不能静默使用缩略图、代理、Webview URI 或扩展私有缓存。

## 职责边界

| 边界                         | 负责                                                                         | 不负责                                    |
| ---------------------------- | ---------------------------------------------------------------------------- | ----------------------------------------- |
| `PathResolver`               | 持久路径的展开与收缩，`${VAR}` / workspace-relative / media-library 路径转换 | 缓存选择、Webview 投影、导出语义          |
| `ResourceCacheService`       | 缩略图、文档页图、Preview 变体、代理、缓存 manifest、修复与 GC               | 原始素材身份、最终导出输入                |
| `LocalResourceAccessService` | Webview roots 授权与 `asWebviewUri(...)` 投影                                | 缓存物化、source fingerprint、缺失重建    |
| `ContentAccessService`       | 按操作意图选择 source/cache/proxy/engine token/bytes/Webview URI             | 写入新 source、管理 cache quota           |
| `ContentIngestService`       | 导入、注册已有 source、提升生成物、记录导出输出、委托 cache artifact         | 运行时预览投影、低层文件 range 读取       |
| Engine File Access           | 本地二进制源文件 token、range、container entry、engine source                | 持久项目身份、Webview URI、cache manifest |

## 读取意图

`ContentAccessService.resolve(request)` 必须收到稳定 ref 和明确 intent：

| Intent                | 默认策略                                                                      |
| --------------------- | ----------------------------------------------------------------------------- |
| `interactive-preview` | cache-first，可物化缩略图、文档页图、Preview variant，并按需投影到 Webview    |
| `agent-context`       | cache/preprocess-first，返回适合模型上下文的有界媒体，同时保留 source/locator |
| `edit-playback`       | 允许代理和 runtime stream，以保证剪辑/预览响应性                              |
| `cache-materialize`   | 从 source 物化 cache artifact                                                 |
| `final-export`        | source-first，默认读取原始文件或 engine source                                |
| `package`             | source-first，读取原始文件或原始 container entry bytes                        |
| `verify`              | source-first，读取原始 bytes 或 source token 做 hash/probe                    |

Target 只描述传输形态，不表达业务意图。`local-path` 既可能是预览缓存路径，也可能是原始 source 路径，因此调用方不能只靠 target 推断语义。

## 路径处理

读取带有路径变量的 source 时，必须先通过 `PathResolver.resolveSource(...)` 转换为本机路径，再传给文件系统、Engine File Access、导出、打包或校验流程。

持久写入 source ref 时，必须通过 `PathResolver.contract(...)` 或 workspace-relative 规则收缩路径。持久项目数据应保存：

- `ResourceRef`
- `ContentDocumentSourceRef + locator/entryPath`
- `ContentFileSourceRef` 中的 `${VAR}/path` 或 workspace-relative 路径
- `ContentGeneratedAssetSourceRef` 中已 promoted 的 generated asset 路径

持久项目数据不保存任意绝对 cache path、Webview URI、blob URL、object URL、engine token、stream id 或 preview token。

## 写入与导入

所有会进入项目、Canvas、Agent 长期结果、导出包或素材索引的内容，必须通过 `ContentIngestService.ingest(request)`：

| Mode                       | 用途                                           | 输出                                         |
| -------------------------- | ---------------------------------------------- | -------------------------------------------- |
| `import-source`            | 外部图片、文档、模型、音视频导入项目或媒体库   | 稳定 source ref，可带 prewarm hint           |
| `register-existing-source` | 注册已有 workspace/media-library/`${VAR}` 文件 | 收缩后的 source ref                          |
| `generated-output`         | Agent/tool 生成媒体提升为项目 generated asset  | promoted generated source ref                |
| `stage-export`             | 记录 final export/package 输出                 | staged output，不改写项目 source ref         |
| `cache-artifact`           | 缩略图、文档页图、代理、Preview 变体预热       | 委托 ResourceCacheService，不生成项目 source |

导出结果若要再次成为项目素材，必须走新的 `import-source`。导出流程本身不能自动把项目 source ref 改成输出文件。

未 promoted 的 generated asset 仍属于 scratch/runtime 语义。`verify`、`package` 和 `final-export` 不从 scratch 生成物直接读取；调用方必须先用 `generated-output` 提升为 promoted source ref，再进入离线读取流程。

## Preview 与离线操作

实时预览可以使用：

- Resource cache 中的 thumbnail / preview / document page image / fov-crop
- Preview variant provider 返回的 runtime URL 或 cache artifact
- video proxy 或 runtime stream
- LocalResourceAccessService 投影出的 Webview URI

离线操作默认不能使用这些派生物。`final-export`、`package`、`verify` 如果收到 thumbnail、preview、proxy、Webview URI、blob URL、object URL、cache-only ref、legacy `cachePath` 或无 source 的 runtime token，应返回 `missing-source`、`unsupported-intent`、`non-portable` 或 `unrecoverable`，而不是复制缓存文件。

唯一例外是用户明确选择 draft/proxy 导出，调用方必须设置 `qualityMode: 'draft-proxy'`，并在 diagnostics 中记录使用了代理或派生媒体。

## 文档与归档 entry

文档、EPUB、CBZ、CBR、Office 嵌入图片和 PDF 页面必须保留 source 与 locator：

```
preview: source + locator/entryPath -> ResourceCacheService -> Webview URI
package: source + entryPath -> original container entry bytes
export:  source + locator -> original document render/extract at export quality
verify:  source or source + entryPath -> original bytes/hash
```

提取出的文档 cache image 只是派生物。它可以作为 Agent/Canvas 的实时预览证据，但不能被打包成原始 entry。

## Runtime handle 规则

Engine file token、stream id、range URL、preview token URL、Webview URI、blob URL、object URL 和 scratch/cache path 都是 runtime handle。

- 可以在当前 Webview 或当前操作中传递。
- 不能作为持久项目事实、Canvas 节点 source、Agent durable result、package manifest source 或 export input。
- 如果 runtime ref 携带稳定 `source`，离线恢复应从 `source` 重新解析，而不是从 token 字符串反推路径。
- 如果 runtime ref 没有稳定 `source`，离线恢复必须报告 `missing-source` 或 `unrecoverable`。

## Legacy `cachePath`

`cachePath` 是 input-only migration metadata：

- legacy payload 可读取 `cachePath` 来尝试构造 `ResourceRef`、`DocumentSourceRef + locator` 或 promoted generated source ref。
- 若缺少 source/locator/fingerprint，不能按顺序猜图，也不能沿用上一张缩略图。
- 跨 Agent/Canvas/Preview/Assets 发送时必须发送稳定 ref；`cachePath` 不作为 Canvas 缩略图身份。
- package/export/verify 不把 legacy `cachePath` 当作原始素材。

这条规则直接解决两类分镜问题：多个 shot 可显式引用同一个 ref；没有 ref 的 shot 显示 unresolved，不会按图片数组顺序误绑。

## Provider 与测试

Provider 必须小而专注，通过注册表选择：

- `ResourceCacheContentAccessProvider`：预览类 intent 的 cache/materialize/project。
- `SourceFileContentAccessProvider`：source-first intent 的 path resolve、bytes、local-path、engine-source。
- `DocumentEntryContentAccessProvider`：预览走 cache，package 走原始 entry bytes。
- `VideoProxyContentAccessProvider`：`interactive-preview` / `edit-playback` 的 proxy 或 stream。
- `PreviewVariantContentAccessProvider`：已有 Preview variant API 适配。
- Ingest providers：import、register、generated-output、stage-export、cache-artifact。

注册表采用 first-match 策略：provider 注册顺序就是优先级。Host 组装 provider 时应把更具体、更安全的 provider 放在前面，例如 preview cache/provider 在 source fallback 前，document entry provider 在通用 source provider 前。`registerProvider(id)` 可替换同 id provider，主要用于测试注入和运行时能力替换。

测试应覆盖：

- preview cache 缺失时可由 source 重建。
- final export 默认使用原始 source，显式 draft/proxy 才能使用代理。
- package 读取原始 archive/container entry。
- legacy-only `cachePath` 在离线操作中失败。
- runtime token 带 source 时可恢复；无 source 时失败。
- durable ingest 结果不暴露 private cache、scratch path 或 runtime URL。
