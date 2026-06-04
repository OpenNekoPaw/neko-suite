# Local Resource Access for VSCode Webviews

## 背景

VSCode Webview 只能读取 `localResourceRoots` 授权范围内的本地文件，并且本地文件必须由 Extension Host 通过 `webview.asWebviewUri(...)` 投影。Neko Suite 的媒体文件可能来自 workspace、`neko-assets` 媒体库、扩展缓存、workspace `.neko/.cache` 或用户临时选择的文件目录。

本地资源访问的统一边界是 `@neko/shared/vscode/extension` 中的 `LocalResourceAccessService`。各扩展应通过该服务配置 Webview roots 和投影本地媒体 URI，不应在业务 provider 中手写 `localResourceRoots` 或直接 `webview.asWebviewUri(vscode.Uri.file(...))`。

它只回答两个问题：

- 这个本地路径是否在当前 Webview 的授权根内？
- 如果允许，应该返回哪个 `asWebviewUri(...)` 字符串？

它不负责缓存身份、缓存物化、缺失文件重建、source fingerprint、quota 或 GC。上述职责由 `ResourceCacheService` 和 provider registry 承担。也就是说，Agent Webview 能显示 `globalStorageUri/document-image-cache` 下的图片，只代表 Agent 已授权自己的 extension-private cache；Canvas 不能把这条绝对路径当成可移植资源身份。

## 路径分类

- Extension bundle：`dist/webview` 下的 JS/CSS/font/icon 等静态资源，可继续使用 `asWebviewUri(vscode.Uri.joinPath(...))`。
- Workspace：当前 workspace folders，由默认 root provider 自动加入。
- Media library：用户在 `neko-assets` 中配置的媒体库根目录，由 `neko.assets.getMediaLibraryRoots` 暴露。
- Extension cache：扩展私有缓存，优先使用 `context.globalStorageUri`。
- Workspace cache：项目生成缓存，使用 workspace `.neko/.cache`。
- Resource cache：项目绑定派生资源统一放在 workspace `.neko/.cache/resources`，身份由 `ResourceRef` / `ResourceVariantRef` 表达，投影时仍委托本服务。
- Feature root：用户显式选择或项目相邻目录等窄范围根，只能作为当前 Webview 的 `extraRoots`。
- System temp：仅允许内部 scratch，不允许作为 Webview 预览资源根。

## 规则

- Webview provider 使用 `createDefaultLocalResourceAccessService(...).configureWebview(...)` 配置 roots。
- 本地媒体文件使用 `createSyncProjector(...)` 或 `toWebviewUri(...)` 投影。
- 不授权 filesystem root、用户 home、`os.tmpdir()` 作为根。
- 可预览临时输出必须写入 `globalStorageUri` 或 workspace `.neko/.cache`，再由统一服务投影。
- 跨 Agent/Canvas/Preview/Assets 的缓存-backed 视觉资源必须优先传 `ResourceRef`，由 Extension Host 调用 `ResourceCacheService.project(...)` 后再交给 Webview。
- Webview 不读取 `.neko/.cache/resources/manifest.json`，不扫描 package-local thumbnail/document cache。
- `extension-private` / no-workspace scratch 可以由所属扩展显示，但跨包消费者应收到 `non-portable` 或 unresolved 状态，除非资源被复制/重建到项目资源缓存。
- `neko-search` 与 `neko-entity` 仍是搜索、身份、绑定和 representation 语义来源；本地资源服务只消费已经解析出的本地路径或远程 URL。

## 用户修复路径

当媒体文件因为不在授权根内无法预览时，界面应提示用户执行以下任一操作：

- 将包含该文件的目录添加为 `neko-assets` 媒体库。
- 将文件移动到当前 workspace 或项目 `.neko/.cache` 派生目录。
- 对一次性导入文件，由 Extension Host 将文件所在目录作为当前 Webview 的窄 `extraRoots`。
- 对 `missing` / `stale` 的统一资源缓存，重新打开源文档、重新读取 range/locator，或重新生成缩略图/预览变体。
- 对 `unsupported` 状态，安装或启用对应 provider 所属扩展，或改用支持的格式。
- 对 `non-portable` 状态，在所属 Agent 会话中查看，或将源文档/图片重新导入当前 workspace 后再发送到 Canvas。

不要建议用户授权 home、filesystem root 或系统 temp。

## 当前 temp 审计

- `neko-assets` Git diff：内部 scratch，不进入 Webview。
- `neko-tools` `TempFileService`：内部 scratch，调用方负责清理，不进入 Webview。
- `neko-agent` `DocumentReaderService`：有 ExtensionContext 时使用 `globalStorageUri/document-image-cache`；无上下文 fallback 仅用于低层 runtime/test。
- `neko-cut` AI 输出：写入 workspace `.neko/.cache/cut-ai` 或扩展 storage cache。
- `neko-live` recording：workspace 存在时写入 `.neko/recordings`，否则写入 `globalStorageUri/recordings`。

## 守卫

源码守卫测试覆盖已迁移的 Extension Host 包：

- 禁止新增直接 `webview.asWebviewUri(vscode.Uri.file(...))` 媒体投影。
- 禁止新增手写 `localResourceRoots: [...]` 和 `const localResourceRoots` 拼装。
- 允许统一服务内部实现、测试 mock、以及 bundle 静态资源的 `Uri.joinPath` 投影。
