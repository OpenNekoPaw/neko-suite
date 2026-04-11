# Neko Tools DI 改造方案

> 状态：Draft | 日期：2026-04-12  
> 关联：[diff.md](./diff.md) · [lsp.md](./lsp.md) · [ARCHITECTURE_CN.md](../../ARCHITECTURE_CN.md)

---

## 一、背景

`neko-tools` 当前已经具备一定的解耦基础：

- `MediaDiffService` 支持注入 `IGitMediaService` 与 `AnalyzerRegistry`
- `AssetDiff` 通过回调方式注入 `getEntity` / `compareVariants`
- Webview 侧国际化通过 `I18nProvider` 注入 `II18nService`

但从整体上看，仍存在以下问题：

1. 运行时依赖直接写死在实现中
   - VSCode API
   - Git 扩展 / Git CLI
   - neko-engine 扩展激活与端口发现
   - `acquireVsCodeApi()` / `window` / `requestAnimationFrame`
2. 组装点分散
   - `extension.ts`
   - `media-diff/index.ts`
   - `media-lsp/index.ts`
   - `asset-diff/index.ts`
3. 生命周期边界不清晰
   - 激活级单例
   - editor 级 session
   - request 级取消/超时
4. 部分组件“看起来可测”，但实际仍依赖全局状态或具体实现

因此需要一版按功能驱动、生命周期分层、接口优先的 DI 改造方案。

## 当前落地进度

已完成：

- Phase 1：Extension Host 组装层 DI 落地
  - `src/extension.ts` 已收口为薄壳入口
  - 已新增本地 `ServiceCollection`
  - 已引入 `bootstrapCoreServices` / `bootstrapNekoToolsExtension`
  - 已抽出 `IExtensionI18n`、`IAssetEntityReader`、`IVariantComparisonService`、`IEngineMediaService`
- Phase 1.5：运行时国际化修正
  - Extension runtime 文案已切到 `vscode.l10n`
  - Media Diff / Asset Diff webview 已注入 `data-vscode-locale`
- Phase 2（部分）：Webview runtime 依赖收口
  - `useMediaDiffProtocol` 不再直接依赖 `acquireVsCodeApi()` / `window.initialState`
  - 已改为 `bridge + initialState + Provider` 的组合方式
- Phase 2（部分）：Media Diff editor session 工厂化
  - `MediaDiffEditorProvider` 不再直接创建 `MediaDiffMessageHandler`
  - 已引入 `MediaDiffEditorSession` / `MediaDiffEditorSessionFactory`
  - session 生命周期已从 provider 内联逻辑中抽离

待完成：

- Request scope 的取消、超时、临时资源进一步收口
- `EngineMediaService` / `GitMediaService` 的更细粒度职责拆分
- Webview stream client factory 注入

### 本轮已落地实现

- Extension Host
  - `src/extension.ts` 已退化为单一 composition root 入口
  - 激活期依赖已集中到 `bootstrapCoreServices` / `bootstrapNekoToolsExtension`
  - `logger / errorHandler / extension i18n / asset reader / variant comparison / engine media service` 已可显式组装
- Media Diff Extension
  - 已新增 `MediaDiffEditorSession` / `MediaDiffEditorSessionFactory`
  - `MediaDiffEditorProvider` 仅保留 editor 壳层职责，不再直接拥有 message handler 生命周期
- Media Diff Webview
  - 已新增 `bridge`、`initialState`、`MediaDiffRuntimeProvider`
  - `useMediaDiffProtocol` 已改为依赖注入 runtime，而非直接读取全局对象
- i18n
  - extension runtime 文案已统一走 `vscode.l10n`
  - webview locale 注入链路已补齐

### 已验证

- `pnpm --dir packages/neko-tools run build:webview`
- `pnpm --dir packages/neko-tools run compile:extension`
- `pnpm --dir packages/neko-tools run compile`
- `pnpm --dir packages/neko-tools test -- --run`

---

## 二、设计目标

### 2.1 目标

1. 将运行时依赖集中到少数 composition root
2. 保持现有模块边界，不引入重量级反射式容器
3. 让核心功能可在 fake 依赖下做单元测试
4. 区分“静态契约”和“运行时服务”
5. 支持后续扩展更多 diff 类型、LSP 能力、流式播放能力

### 2.2 非目标

1. 不把所有模块都改造成 service
2. 不为纯函数/纯解析/纯渲染工具强行引入 DI
3. 不引入跨扩展共享的复杂 IoC 框架
4. 不改变现有对外协议与用户功能行为

---

## 三、核心结论

### 3.1 采用“手工 DI + 明确组装点”

推荐继续沿用仓库已有模式：

- Extension Host：`ServiceCollection + bootstrap`
- Webview：`Provider + factory + hook`

而不是：

- 运行时装饰器注入
- 全局反射式容器
- 深层 service locator

### 3.2 只对“运行时依赖”做 DI

应注入：

- logger
- error handler
- extension runtime i18n
- engine runtime resolver
- git gateway
- workspace I/O
- temp file service
- scheduler
- webview bridge
- stream client factory

不应强行 DI：

- `JviParser`
- `DiffRenderer`
- `FramePairBuffer`
- `audioUtils`
- theme token / tailwind preset / 常量表

### 3.3 采用三层生命周期

1. Activation Scope
   - 扩展激活级单例
2. Editor Session Scope
   - 每个 custom editor / webview panel 独立 session
3. Request Scope
   - 每次分析、seek、stream control 的取消与超时

---

## 四、现状问题拆解

### 4.1 Media Diff

当前问题：

- `EngineMediaService` 同时承担 engine 扩展发现、激活、命令调用、`EngineClient` 创建
- `GitMediaService` 同时承担 VSCode Git API 访问、Git CLI 执行、文件提取
- `MediaDiffEditorProvider` 内部默认创建 service，并重复执行 Git tracked 判断
- `MediaDiffMessageHandler` 堆积大量 session 状态和具体依赖
- `MediaDiffService` 仍保留单例工厂，不利于显式组装

### 4.2 Asset Diff

当前优点：

- 已具备函数注入能力

当前问题：

- 依赖形式仍偏“自由函数”，缺少稳定接口语义
- provider 仍承担较多状态持久化和 HTML 构造职责

### 4.3 Media LSP

当前优点：

- `JviHoverProvider` / `JviDefinitionProvider` 已通过构造函数接收依赖

当前问题：

- `MediaWorkspaceIndex` 直接绑定 `vscode.workspace` watcher 和文件系统
- `JviDiagnosticsProvider` 直接绑定 debounce 和 workspace FS
- 初始化入口尚未形成明确的 bootstrap 语义

### 4.4 Webview

当前问题：

- `useMediaDiffProtocol` 直接依赖 `acquireVsCodeApi()` 和 `window.initialState`
- 播放组件内部直接 `new AudioStreamClient()` / `new H264StreamClient()`
- Blob URL 生命周期管理与 bridge 通信混在同一个 hook 中

---

## 五、目标架构

### 5.1 Extension Host 目标结构

```text
activate()
  -> bootstrapNekoToolsServices(context)
  -> ServiceCollection
     -> Logger / ErrorHandler / ExtensionI18n
     -> EngineRuntimeResolver
     -> EngineMediaService
     -> GitMediaGateway
     -> WorkspaceIO / TempFileService / Scheduler
     -> MediaDiffService
     -> MediaDiffSessionFactory
     -> MediaProbeCache / MediaWorkspaceIndex
     -> AssetEntityReader / VariantComparisonService

feature bootstrap
  -> bootstrapMediaDiff(...)
  -> bootstrapAssetDiff(...)
  -> bootstrapMediaLsp(...)
```

### 5.2 Webview 目标结构

```text
mediaDiff.tsx
  -> AppProviders
     -> I18nProvider
     -> WebviewBridgeProvider
     -> LoggerProvider (optional)
  -> MediaDiffApp
     -> useMediaDiffProtocol(bridge, blobRegistry)
     -> useAudioDiffPlayback(streamFactory)
     -> useVideoDiffStreaming(streamFactory, rafScheduler)
```

### 5.3 生命周期模型

#### Activation Scope

单例：

- logger registry
- error handler registry
- extension i18n
- engine runtime resolver
- engine media service
- git media gateway
- workspace I/O
- temp file service
- scheduler
- media diff service
- media probe cache
- media workspace index

#### Editor Session Scope

每个 panel 独立：

- `MediaDiffSession`
- `MediaDiffMessageHandler`
- `StreamingController`
- `PreviousVersionExtractor`
- `SessionState`

#### Request Scope

每次请求独立：

- `AbortController`
- progress sink
- timeout handle
- per-request temp resources

---

## 六、接口设计

以下接口是本次改造建议优先落地的最小闭包。

### 6.1 Extension Host 接口

#### `IExtensionI18n`

职责：

- 封装 `vscode.l10n.t()`
- 统一 command / dialog / quick pick / notification 文案生成

建议接口：

```ts
export interface IExtensionI18n {
  t(key: string, params?: Record<string, string | number>): string;
}
```

#### `IEngineRuntimeResolver`

职责：

- 激活 `neko.neko-engine`
- 确保 frame server 启动
- 创建 `EngineClient`

建议接口：

```ts
export interface IEngineRuntimeResolver {
  ensureClient(): Promise<EngineClient | null>;
}
```

#### `IEngineMediaService`

职责：

- 提供 diff / probe / detectSilence / createStream / controlStream 等稳定能力
- 屏蔽 engine transport 和端口发现细节

#### `IGitMediaGateway`

职责：

- `isTracked`
- `getFileVersions`
- `getFileHistory`
- `extractFileToPath`

建议保留当前 `IGitMediaService` 语义，但去掉对具体实现的隐式依赖。

#### `IWorkspaceIO`

职责：

- 读取文件
- `stat`
- `findFiles`
- watcher 创建
- open text document / visible text editors 读取

这是 LSP 和 diff host 都会复用的基础能力。

#### `ITempFileService`

职责：

- 创建 temp file 路径
- 跟踪归属 session
- 统一清理

避免 analyzer、pipeline、streaming handler 各自直接拼 `os.tmpdir()`

#### `IScheduler`

职责：

- timeout
- debounce
- clear/cancel

用于替换散落在 provider / diagnostics / analysis pipeline 中的 `setTimeout`

#### `IMediaDiffSessionFactory`

职责：

- 为每个 editor panel 创建独立 session
- 负责注入会话依赖与 session state

建议接口：

```ts
export interface IMediaDiffSessionFactory {
  create(args: MediaDiffSessionArgs): IMediaDiffSession;
}
```

### 6.2 Webview 接口

#### `IWebviewBridge`

职责：

- `postMessage`
- `onMessage`
- `getInitialState`

建议接口：

```ts
export interface IWebviewBridge {
  postMessage(message: unknown): void;
  onMessage(listener: (message: unknown) => void): () => void;
  getInitialState<T>(): T | null;
}
```

#### `IBlobUrlRegistry`

职责：

- 创建 blob URL
- 跟踪 URL 生命周期
- 批量释放

#### `IStreamClientFactory`

职责：

- 创建 `AudioStreamClient`
- 创建 `H264StreamClient`

UI 组件不再直接 `new` 底层 client。

#### `IRafScheduler`

职责：

- `requestAnimationFrame`
- `cancelAnimationFrame`

用于播放时间推进和 seek/filter 逻辑测试替身。

---

## 七、按功能的改造方案

### 7.1 Media Diff

#### 职责

- Git 模式与本地模式 diff 编排
- 早期可视化数据发送
- 流式播放启动与控制
- custom editor session 生命周期

#### 依赖

- engine
- git
- workspace I/O
- temp file
- scheduler
- webview messenger

#### 方案

1. `EngineMediaService` 拆成两层
   - `VscodeEngineRuntimeResolver`
   - `EngineMediaService`
2. `GitMediaService` 拆成三层
   - `VscodeGitRepositoryAccessor`
   - `GitCliRunner`
   - `GitMediaGateway`
3. `MediaDiffService` 去掉模块级单例
4. `MediaDiffEditorProvider` 不再自行 `new MediaDiffService()` / `new EngineMediaService()`
5. 引入 `MediaDiffSessionFactory`
6. 将 `MediaDiffMessageHandler` 改为依赖 `MediaDiffSessionDeps`

#### 结果

- editor provider 成为纯壳层
- session 状态从全局 service 中剥离
- request 取消与 timeout 行为更可测试

### 7.2 Asset Diff

#### 职责

- 资产实体读取
- 变体对比
- asset diff webview 初始化

#### 依赖

- 资产实体读取
- 变体对比服务
- extension i18n

#### 方案

将当前函数注入收敛成接口：

- `IAssetEntityReader`
- `IVariantComparisonService`

保留当前的低耦合优势，不需要引入更多容器层。

### 7.3 Media LSP

#### 职责

- `.nkv` workspace 索引
- hover probe
- diagnostics
- definition / references

#### 依赖

- workspace
- file read/stat
- engine probe
- cache
- scheduler

#### 方案

1. `MediaWorkspaceIndex` 依赖 `IWorkspaceIO`
2. `JviDiagnosticsProvider` 依赖 `IScheduler + IWorkspaceIO + IMediaProbeService`
3. `media-lsp/index.ts` 只负责组装，不负责 new 散装依赖

#### 结果

- LSP provider 可做 fake workspace 测试
- debounce 与 watcher 生命周期集中管理

### 7.4 Media Diff Webview

#### 职责

- IPC bridge
- UI 状态同步
- blob URL 生命周期管理
- 音视频流 client 生命周期

#### 方案

1. `useMediaDiffProtocol(bridge, blobRegistry)`
2. `useAudioDiffPlayback(streamFactory, rafScheduler)`
3. `useVideoDiffStreaming(streamFactory, rafScheduler)`
4. 组件只消费 hook 暴露的状态和动作，不直接 new client

#### 结果

- 组件职责更聚焦
- bridge 与 stream 行为可单测
- 后续替换底层 stream client 成本更低

---

## 八、目录改造建议

### 8.1 Extension Host

```text
packages/neko-tools/packages/extension/src/
  bootstrap/
    serviceIds.ts
    bootstrapCoreServices.ts
    bootstrapMediaDiff.ts
    bootstrapAssetDiff.ts
    bootstrapMediaLsp.ts
  contracts/
    engine.ts
    git.ts
    workspace.ts
    temp.ts
    scheduler.ts
    i18n.ts
  infrastructure/
    vscode/
      VscodeEngineRuntimeResolver.ts
      VscodeWorkspaceIO.ts
      VscodeExtensionI18n.ts
    git/
      GitCliRunner.ts
      VscodeGitRepositoryAccessor.ts
      GitMediaGateway.ts
    fs/
      TempFileService.ts
    runtime/
      DefaultScheduler.ts
  media-diff/
    services/
    session/
  media-lsp/
    services/
    providers/
```

### 8.2 Webview

```text
packages/neko-tools/packages/webview/src/
  app/
    providers.tsx
  contracts/
    bridge.ts
    stream.ts
    scheduler.ts
    blob.ts
  infrastructure/
    vscodeBridge.ts
    streamClientFactory.ts
    rafScheduler.ts
    blobUrlRegistry.ts
  hooks/
    useMediaDiffProtocol.ts
    useAudioDiffPlayback.ts
    useVideoDiffStreaming.ts
```

---

## 九、迁移顺序

### Phase 1：建立接口与 bootstrap

目标：

- 新增 contracts
- 新增 `bootstrapCoreServices`
- 去掉 feature 内部默认 `new` 的入口

范围：

- 不改协议
- 不改 UI
- 不改 analyzer 业务逻辑

### Phase 2：重构 Media Diff Host

目标：

- 替换 `EngineMediaService` 的运行时发现逻辑
- 替换 `GitMediaService` 的散装依赖
- 去掉 `MediaDiffService` 单例
- 引入 session factory

### Phase 3：重构 Media LSP

目标：

- 将 workspace / scheduler / probe 依赖抽象化
- provider 全部通过接口注入

### Phase 4：重构 Webview

目标：

- 抽离 `IWebviewBridge`
- 抽离 blob 管理
- 抽离 stream client 创建

### Phase 5：统一 extension 运行时 i18n

目标：

- 统一 command / dialog / quick pick / message 文案来源
- 修复 webview locale 注入不一致问题

---

## 十、测试策略

### 10.1 单元测试

- `MediaDiffService`
  - fake `IGitMediaGateway`
  - fake `IAnalyzerRegistry`
  - fake `IScheduler`
- `MediaDiffEditorProvider`
  - fake `IMediaDiffService`
  - fake `IGitMediaGateway`
- `MediaDiffSession`
  - fake `IEngineMediaService`
  - fake `IWebviewMessenger`
- `JviDiagnosticsProvider`
  - fake `IWorkspaceIO`
  - fake `IMediaProbeService`
- `useMediaDiffProtocol`
  - fake `IWebviewBridge`
- `useAudioDiffPlayback` / `useVideoDiffStreaming`
  - fake `IStreamClientFactory`
  - fake `IRafScheduler`

### 10.2 集成测试

- custom editor 初始化
- local compare / git compare
- stream start / stop / seek
- `.nkv` hover / diagnostics / definition

---

## 十一、实施约束

### 11.1 必须遵守

1. 不引入 Webview 对 `vscode` 的直接依赖
2. 不让深层模块直接调用 VSCode API
3. 不让 Webview 组件直接承担底层 stream transport 创建
4. 不通过全局单例掩盖 session 级状态

### 11.2 保持不变

1. 现有 `postMessage` 协议
2. 现有媒体 diff 对外命令
3. 现有 analyzer registry 模式
4. 现有 asset diff 的虚拟文档方式

---

## 十二、最终决策

`neko-tools` 的 DI 改造采用以下原则：

1. **Extension Host 使用 `ServiceCollection + bootstrap` 作为唯一组装中心**
2. **Webview 使用 `Provider + factory + hook` 作为唯一组装中心**
3. **运行时依赖做 DI，纯逻辑模块保持直接 import**
4. **按 Activation / Session / Request 三层生命周期组织依赖**
5. **优先改造 Media Diff，再推进 Media LSP 与 Webview**

这套方案能在不破坏现有功能的前提下，显著改善：

- 可测试性
- 职责边界
- 扩展能力
- 运行时依赖可替换性

同时保持与 Neko Suite 现有架构风格一致。
