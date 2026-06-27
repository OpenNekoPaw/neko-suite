# 子包边界与代码规范

更新日期：2026-06-15

本文记录当前代码库中已经由包结构、依赖守卫和边界测试体现的稳定规则。它补充根目录 `ARCHITECTURE_CN.md`，用于指导 Agent 和开发者在多子包改动前快速判断代码应该放在哪里、应该依赖谁、不能跨过哪些边界。

## 先回答三个问题

修改子包代码前，先做这三个判断：

1. 是否符合现有架构：改动是否落在正确运行平面，是否复用 `@neko/shared`、`@neko/proto`、`@neko/neko-client`、`@neko/ui`、`@neko/entity` 等既有边界。
2. 如何进一步降低耦合：能否用共享契约、host adapter、port、command bus、registry、strategy 或事件替代直接跨包 import。
3. 是否易于扩展与测试：新增接口、状态机、协议或关键分支是否有对应边界测试、单元测试或检查脚本。

多模块改动还要做五层分析：职责、依赖、接口、扩展、测试。

## 阅读顺序

最小阅读集：

1. `AGENTS.md`
2. `ARCHITECTURE_CN.md`
3. 本文
4. 具体领域文档：`docs/domains/<domain>/README.md` 或 `docs/domains/<domain>/architecture.md`

不要要求 Agent 同时读写大量分散文档。稳定跨包规则集中维护在本文；领域内部细则放到 `docs/domains/<domain>/`；状态和 gap 只放带日期快照。

## 运行平面

| 平面              | 典型目录                                                                                                                                              | 职责                                                                       | 禁止事项                                                        |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | --------------------------------------------------------------- |
| L0 共享契约       | `packages/neko-types` 主入口、`packages/neko-proto`、`packages/neko-client`、`packages/neko-market/packages/core`、`packages/neko-auth/packages/core` | 类型、IDL、基础设施、Engine client、领域无关核心                           | 依赖功能包、依赖具体 Extension/Webview 实现                     |
| L1 Extension Host | `packages/*/packages/extension/src`、部分历史根包 `src`                                                                                               | VS Code API、工作区访问、资源授权、命令注册、状态栏、Engine 启动和权限代理 | 引入 React、引入 Webview 实现、转发高频媒体帧                   |
| L2 Webview UI     | `packages/*/packages/webview/src`、`packages/neko-ui/src`                                                                                             | React UI、Zustand 状态、浏览器流消费、用户交互                             | 引入 `vscode`、Node API、Extension 实现、持久化运行时 URI/token |
| Engine            | `packages/neko-engine/packages/*`                                                                                                                     | 媒体、音频、设备、ML、Scene、Puppet、GPU 渲染和运行时权威                  | 把权威计算复制到 TypeScript 层                                  |
| 领域服务          | `packages/neko-entity/src`、`packages/neko-search/src` 等                                                                                             | 跨界面领域模型、索引、投影、port/adapters                                  | 依赖 UI、Webview、Agent 或具体功能实现                          |

依赖方向应流向契约层、port 或 Engine/client 边界。功能扩展之间不要通过包级 import 互相调用。

## 公共代码

### `@neko/shared`

`packages/neko-types` 的主入口是共享基础设施和类型契约入口，导出类型、工具、配置、错误、tools、core、operations、audio、logger、i18n、theme、path、entity-uri 和 nk\* 格式 SDK。

约束：

- 主入口不得导出 React UI 组件。
- `PathResolver` 是路径变量、相对路径和运行时绝对路径解析的统一入口。
- `@neko/shared/project-file-io` 是 JSON `nk*` 项目文件 host 持久化、codec registry、诊断和 portable source policy 的共享入口；domain codec 仍归各领域格式所有。
- `@neko/shared/vscode/extension` 的 `createHostContentAccessRuntime(...)` 是 Extension Host 侧内容访问、透明缓存、Webview projection、Engine source resolver hook 和 ingest provider 装配入口；功能包只传 provider/adapter，不直接装配底层 cache/content/local-resource service。
- `@neko/content` 是跨领域内容语义 domain service；Canvas、Cut、Preview、Agent 等共享的 document reader、manifest/range、locator 和 image metadata probe 放在这里，不放在 Agent platform。
- `ResourceRef` 是持久跨包 payload 的优先引用形式，不要把 blob URL、Webview URI、preview token、stream ID 或 engine token 写成持久事实。
- `ENTITY_FACADE_COMMANDS` 是实体跨包 facade 的命令契约，功能包通过命令或 adapter 访问实体能力。
- `@neko/shared/vscode`、`@neko/shared/vscode/extension`、`@neko/shared/i18n/react`、`@neko/shared/components` 是分层 subpath，不等同于主入口 L0。
- `@neko/shared/components` 是 legacy UI 兼容面；新 Webview UI 优先使用 `@neko/ui`。

新增功能涉及组件样式、主题、国际化、日志、错误/诊断、配置、路径、项目文件保存/读写、资源授权、缓存、DTO 或跨包契约时，必须先做公共基础能力审计：

- 先判断是否已有 `@neko/shared`、`@neko/ui`、`@neko/neko-client`、`@neko/proto`、`@neko/entity`、`@neko/search`、project-file-io、resource cache 或 domain service 可复用。
- 可复用但缺少小能力时，优先扩展公共契约、公共 adapter、公共 hook/primitive 或 domain service，再由 owning package 注入业务差异。
- 只有当能力只服务单一领域、包含明确业务语义、或提升到公共层会倒置依赖时，才保留在 owning package。
- 不得在功能包内并行实现 package-local design system、theme token、i18n runtime、logger/error 类型、项目文件 IO、cache manager、path resolver、Engine HTTP/WS client 或共享 DTO。
- 不得在 Agent、Canvas、Cut、Preview 等功能包内拥有跨领域 document/content parser、manifest/range reader、image metadata probe 或 container locator 规则；需要扩展时进入 `@neko/content`，通过 provider/adapter 注入 Host 读写和 Engine 文件访问。
- 不得在功能包内直接 `new HostContentAccessService`、`new HostContentIngestService`、`new VSCodeResourceCacheService`、使用 `ResourceCacheContentAccessProvider` / `SourceFileContentAccessProvider` / `DocumentEntryContentAccessProvider` 等公共底层 provider 重新拼装 runtime，或调用 `createDefaultLocalResourceAccessService` 形成第二套 Webview root 规则。跨领域内容访问必须从 `createHostContentAccessRuntime(...)` 进入；`scripts/check-content-access-boundaries.mjs` 会阻止回退。
- 若决定不更新公共层，需在 OpenSpec、PR 或交付说明中记录审计结论、保留原因、后续提取条件和验证命令。

### 跨子包能力复用

新功能涉及 provider、registry、bridge、protocol、message router、status bar、tree view、file decoration、history、selection、recent items、projector、facade、command router、capability provider、store slice 或 workflow adapter 时，必须做跨子包能力复用审计。

约束：

- 先搜索其他子包和共享层是否已有同类能力、相同交互模式、相同 host adapter、相同协议形态或可复用测试。
- 两个以上子包需要同类能力时，优先提取为中立共享契约、domain service、adapter factory、registry、strategy、hook、test utility 或 `@neko/ui` primitive。
- 不要复制其他功能包实现；不要通过直接 import 另一个功能包内部模块来复用。复用必须经共享包、public subpath、command/API facade、port、provider registry 或 domain service。
- 只有当职责、生命周期、领域语义、依赖方向或运行环境明显不同，且抽公共层会引入错误依赖时，才保留 package-local 实现。
- 保留 package-local 实现时，需记录查过哪些包、为何不能复用、为何不抽共享层、后续提取条件和验证命令。

### `@neko/proto`

`packages/neko-proto` 是跨层 IDL 的单一事实来源。涉及 Engine 通信、Scene、Timeline、Viewport、流 descriptor 或跨语言结构时，优先从 proto 生成类型或复用已有生成类型，不在功能包内手写平行协议。

### `@neko/neko-client`

`packages/neko-client` 是 Engine HTTP/WebSocket client 和流消费 client 的边界。

约束：

- TypeScript 侧请求 Engine 应走 `EngineClient` 或 `@neko/neko-client` 暴露的 stream/device/client API。
- 不在功能包中散落 ad hoc `fetch('/v1/...')`、裸 WebSocket URL 拼接或重复 wire normalizer。
- 普通 Webview 媒体播放的 H.264/audio/scheduler 创建、替换和释放应优先组合 `EngineAvStreamLifecycle`；Preview、Canvas、Cut 等播放器只保留渲染、seek gate、时钟选择、控件和领域错误 UI。
- 普通媒体时间标签应使用 `formatTime`、`formatMediaTime`、`formatMediaTimeFromMilliseconds` 或 `formatMediaTimeCentiseconds`。字幕 timecode、bar/beat、导出 ETA、聊天相对时间和领域 prose 可以保留在 owning package，但命名要表达领域语义。
- Webview 可以在 Extension 授权后使用 Engine client 或 stream client，但不能自己发现、启动或授权 Engine。
- Extension Host 负责权限、端口、token、资源 URI 和生命周期代理；高频视频帧、PCM 包和 scene delta 不应经 Extension Host 中继。

### `@neko/content`

`packages/neko-content` 是跨领域内容语义服务边界，当前公共入口包括 `@neko/content/document`。

约束：

- 可依赖 `@neko/shared` 的类型和契约，但不得依赖 VSCode、Webview、React、Agent runtime、Canvas/Cut/Preview 内部实现或 `@neko/neko-client`。
- 文档解析、manifest/range、locator、entry ref、图片元数据探测和格式识别放在这里；Host 侧通过 runtime deps 注入文本读取、二进制读取、container entry 读取和 parser module loading。
- 不管理 cache root、manifest、Webview URI、Engine token、authorized roots、workspace lifecycle 或 UI 状态。这些由 `@neko/shared/vscode/extension`、`ResourceCacheService`、`LocalResourceAccessService` 和 `@neko/neko-client` 负责。
- Agent 只能把它作为内容语义服务使用，不得在 Agent platform 或 extension 下重新实现 document reader/cache/path/media 目录。

### `@neko/ui`

`packages/neko-ui` 是 L2 React UI 公共层，当前公共入口包括 `viewport`、`primitives`、`creative`、`icons`、`hooks`、`workbench`、`keyboard`、`utils` 和 `test-utils`。

新增 Webview/React 组件前必须做组件复用审计：

- 先搜索 `packages/neko-ui/src`、当前包 `components/`、`hooks/`、`shared/`、相邻领域包和已有测试，确认是否已有按钮、选择器、面板、空状态、工具栏、列表、卡片、输入区、Header/Input 或 creative primitive 可增强。
- 优先增强既有组件的 prop、slot、variant、composition hook 或 package-local adapter，而不是复制一个视觉相近的新组件。
- 仅当职责、状态生命周期、交互契约、可访问性语义或领域边界明显不同，且增强旧组件会增加耦合或破坏既有使用方时，才新增组件。
- 新增组件要在 OpenSpec、PR 或交付说明中记录复用审计结论：查过哪些组件、为何不复用、为何不抽到 `@neko/ui`、新增测试覆盖什么。

约束：

- 不导入 `vscode`、Node-only module、功能包或 `acquireVsCodeApi`。
- 不放 package-specific 业务逻辑、命令协议、Engine 操作或 Agent runtime。
- `@neko/ui/error-boundary` 是 Webview React ErrorBoundary 捕获、日志、fallback/retry 的共享入口；功能包需要品牌 copy 或错误 handler 时保留薄 wrapper，不复制 catch/log/reset 实现。
- `@neko/ui/keyboard` 是 Webview 键盘焦点、editable target、shortcut suppression 和 focused root metadata 的共享入口；功能包不要保留本地 `editable-target` copy 或旧 keyboard reporter。
- Agent Header/Input/selector 等 Agent 专属交互留在 `neko-agent` Webview，不迁入 `@neko/ui`。
- 被多个创作 Webview 复用的无业务 UI、viewport shell、workbench layout、键盘边界和基础控件可以进入 `@neko/ui`。
- Cut、Canvas、Audio、Model、Sketch 等被动状态优先投影到 VS Code native StatusBar，避免在 Webview topbar 重复一套状态栏。

### `@neko/entity` 与 `@neko/search`

实体和搜索是跨领域服务，不是某个 Webview 的私有实现。

约束：

- core、providers、projections 通过 port 注入文件、锁、日志和事件能力。
- core/projections 不依赖 `vscode`、React、Webview、Extension、Agent 或具体功能包实现。
- Dashboard Webview 不做直接文件 mutation。
- entity facts 不写入 `.neko/.cache` 等缓存路径；缓存和事实分层管理。

## Extension Host 层

Extension 包负责宿主能力，而不是 UI 渲染或媒体权威计算。

应做：

- 注册 VS Code commands、custom editors、providers、status bar、disposables。
- 通过 `webview.asWebviewUri()` 暴露资源。
- 通过 typed `postMessage` bridge 与 Webview 通信。
- 为 Webview 授权 Engine port、stream descriptor、token 或资源访问。
- 为大型媒体、需要 seek 的资源和不兼容 codec 提供 Engine file access、preview proxy 或 stream descriptor。
- 调用 `EngineClient` 编排 Engine 操作。
- 用 `vscode.Disposable` 管理生命周期并显式释放。

不应做：

- import React 或 Webview implementation。
- 直接依赖其他功能扩展的 extension package。
- 在 Extension Host 中解码/转发高频视频帧、PCM 或 scene delta。
- 用 `file:`、绝对路径或宽泛 `localResourceRoots` 代替 Engine 授权和 Range 服务。
- 复制 Rust Engine 已经拥有的媒体、ML、Scene、Puppet、Audio、Device 计算。

历史形态需要注意：`neko-assets/src`、`neko-tools/src` 等仍有根级 extension-ish 代码；新代码优先维持清晰的 `packages/extension` 和 `packages/webview` 分层。

## Webview 层

Webview 包负责浏览器沙箱内的交互体验。

应做：

- 使用 React、Zustand、`@neko/ui` 和 package-local hooks/components 组织 UI。
- 通过 `@neko/shared/vscode` 或委托给它的 package-local typed facade 访问 VS Code Webview API；生产 Webview 源码不要直接调用或声明 `acquireVsCodeApi()`，业务组件不要依赖全局 `__vscode_api__` / `__vscodeApi` / `window.vscode` / `window.vscodeApi` shim，也不要实现 package-local mock `postMessage` fallback。
- 通过 `createWebviewI18n` 初始化 per-Webview i18n；不要在功能包里重复 `new I18nService(detectWebviewLocale())` 或本地 bundle registration loop。
- 通过 `createWebviewLoggerRegistry` 或委托给它的 package-local logger facade 创建 Webview logger；生产 Webview 源码不要直接 `console.*`，也不要在功能包里新建 `ConsoleLogger` root。
- 只保存可恢复 UI 状态和项目事实引用，运行时 URI/token/stream handle 只作为短生命周期状态。
- 通过 `@neko/neko-client` 消费 Extension 授权后的 Engine stream。
- 对媒体入口遵守 Webview CSP、格式兼容和 Range 限制；不兼容时展示 fallback/diagnostic。
- 将业务协议定义为类型化 contract，并在 Extension 侧测试 protocol。

不应做：

- import `vscode`、`node:*`、`fs`、`path` 或 Extension 实现。
- 绕过 Extension Host 读取工作区文件或扩展资源。
- 把 Engine 端权威数据结构复制成 Webview 私有事实。
- 假设任意 `.mp4`、`.m4a`、AAC、Opus、MOV、MKV 或本地文件 URL 都能被 `<video>` / `<audio>` 播放。
- 依赖 `asWebviewUri(...)` 对大型媒体提供 byte range、seek 或稳定流式读取。
- 把某个领域特有 UI 直接放进 `@neko/ui`。

## Engine 层

`neko-engine` 是媒体和运行时权威。它拥有：

- 媒体探测、解码、编码、导出、二进制文件访问。
- GPU 渲染、流生产、Scene/Viewport/Puppet/Audio/Device/ML runtime。
- 高成本感知、转换和预览管线。

约束：

- TS 层只编排、展示、请求和校验，不重写 Engine 权威计算。
- 新 Engine 能力先定义 proto/API/descriptor，再补 client，再接 Extension/Webview。
- GPU-first 和 zero-copy 是媒体与渲染路径的优先方向；确需 CPU fallback 时要有明确边界和测试。
- 低延迟交互 Scene stream 优先短 GOP，必要时 GOP=1；不要把 GOP=1 写成所有流的全局规则，因为 Timeline/Puppet/Preview 等路径存在不同编码目标。
- Engine file access 是二进制/媒体源、大型媒体、container entry、sibling resource 和需要 Range/seek 的源文件访问权威路径；纯文本、配置和 JSON `nk*` 项目事实仍由 `ProjectFileStore`、domain codec 和 Host fs adapter 管理，不经 Engine。
- 3D Route A 中 Extension Host 不代理视频帧/PCM，不 relay 高频 scene delta；Webview 消费 Engine canvas/stream/control，authoring panels 编译为 Engine commands。
- `runtime-puppet` 只拥有 `.nkp` Live2D/native Puppet character runtime；当前 `live2d-moc3-compat` 是 clean-room MOC3 compatibility，不是官方 Cubism SDK。官方 `live2d-cubism` 只能作为 optional adapter，公共 DTO、Proto、EngineClient、Webview message 和项目文件不暴露 SDK handle/type。
- `runtime-scene` 拥有 `.nkm profile: 2d | 3d | live` Scene runtime；generic 2D Scene creation（sprite/tilemap/camera/light/parallax/particle/scene graph）归 `neko-model`，不能回退到 `neko-puppet`。

## Agent 子包

`neko-agent` 是多子包结构，边界比普通功能包更细。

| 子包          | 职责                                                                      |
| ------------- | ------------------------------------------------------------------------- |
| `agent-types` | Agent/Webview/Extension contract、协议、状态投影类型                      |
| `agent`       | Host-agnostic runtime、workflow、prompt、skill、memory、tools、evaluation |
| `ai-sdk`      | Provider/AI SDK adapter，不承载 UI 或 VS Code 逻辑                        |
| `platform`    | host-agnostic 平台桥、配置和 provider glue                                |
| `extension`   | VS Code commands、配置桥接、host adapters、会话入口                       |
| `webview`     | Chat/Agent UI、消息投影、用户输入                                         |
| `cli-tui`     | 非 VS Code 的 TUI shell                                                   |
| `test-utils`  | 测试支撑                                                                  |

约束：

- Agent-first：核心行为先进入 runtime、workflow、tool、memory 或 contract，不从 Webview UI 反推业务。
- API-first：跨层消息、命令和 payload 先定义 contract，再接实现。
- Prompt-first：Prompt 模块只表达上下文和行为策略，避免把宿主副作用藏进 prompt 拼装。
- Skill-first：Skill 描述领域策略和工具组织，不变成工作流引擎。
- `agent`、`platform`、`ai-sdk`、`agent-types` 保持 host-agnostic，不导入 `vscode`、React、Webview 或 Extension API。
- Webview 不导入 `@neko/agent`、`@neko/platform`、`@neko/ai-sdk` 或 Extension API。
- Extension 可以做 host adapter 和命令注册，但不能把 runtime 业务留在 Extension 里扩散。
- 兼容桥必须有 owner、tracking、replacement、过期时间和验证命令。

## 领域包规则

| 领域/包          | 主要职责                                                                    | 关键边界                                                                                                                                                                               |
| ---------------- | --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `neko-cut`       | Timeline、视频编辑、导出、状态投影                                          | Webview 管 UI 和时间线交互；Extension 管 editor/provider/export/status；媒体请求走 Engine client                                                                                       |
| `neko-canvas`    | 画布、投影、创作结构和叙事节点                                              | Canvas 状态和投影走共享 contract；被动状态进 native StatusBar                                                                                                                          |
| `neko-audio`     | 波形、效果链、PCM 播放、音频工程                                            | 音频分析/流/效果走 Engine；Webview 消费 client；文件元数据进 StatusBar                                                                                                                 |
| `neko-model`     | `.nkm` 2D/3D/Live Scene authoring、Scene/Viewport、Route A stream           | Webview 直接消费授权 stream/control；Extension 不代理高频帧；2D Scene 的 sprite/tilemap/light/camera/parallax/particle 面板输出 Engine commands；Scene actor 只保存 `.nkp` stable refs |
| `neko-preview`   | video/audio/pdf/epub/docx/cbz/panorama 预览                                 | Extension 管 provider/resource/CSP；Webview 只渲染授权内容                                                                                                                             |
| `neko-sketch`    | 2D 绘画和图层交互                                                           | Webview 管画布交互；通用 UI 可复用 `@neko/ui`；状态投影不复制 topbar                                                                                                                   |
| `neko-puppet`    | `.nkp` Live2D/native Puppet 角色参数、motion、expression、physics、tracking | Engine 管 puppet runtime/adapter/stream；不承接 generic 2D Scene authoring；Agent 能力通过 contract 暴露                                                                               |
| `neko-story`     | 剧本、parser、叙事预览、实体索引                                            | parser/types 独立；Extension 管 LSP/provider/index；Webview 管表格和预览                                                                                                               |
| `neko-assets`    | 素材库、元数据、缩略图、实体绑定                                            | 路径经 `PathResolver`；实体访问走 facade；缓存不伪装事实                                                                                                                               |
| `neko-market`    | 市场、registry、插件安装目标                                                | core 与 extension/webview 分离；registry contract 不依赖 UI                                                                                                                            |
| `neko-auth`      | auth core 与 VS Code extension 登录桥                                       | core 保持共享服务；extension 承接 VS Code secret/env                                                                                                                                   |
| `neko-live`      | 实时合成、设备和直播交互                                                    | 设备/流走 Engine client；UI 不直接访问设备宿主 API                                                                                                                                     |
| `neko-tools`     | 工具集合、Media LSP、差异/诊断                                              | LSP/diagnostic 在 Extension；Webview 只消费授权结果                                                                                                                                    |
| `neko-dashboard` | 项目 dashboard、实体/搜索聚合视图                                           | Webview 不直接文件 mutation；聚合通过 entity/search/service contract                                                                                                                   |
| `neko-suite`     | 聚合发布包                                                                  | 不承载领域业务，只组织扩展组合和发布入口                                                                                                                                               |

领域内部架构文档放在 `docs/domains/<domain>/architecture.md`。只有跨多个领域、跨多个运行平面的不变量才提升到 `docs/architecture/`。

## 缓存、路径和实体

- 持久项目记录保存 workspace-relative path、`${VAR}/path`、stable `ResourceRef`、document source ref、asset/entity ID 和 provenance。
- JSON `nk*` 项目文件的 Extension Host 读写应通过 `ProjectFileStore`、注册的 domain codec 和 `createVSCodeProjectFileIoAdapter`，避免各 editor provider 直接承担项目文件解析、写入和路径收缩。
- 本地绝对路径只允许出现在本机设置、临时运行时状态或明确 host adapter 内。
- Cache 是派生数据，不能作为项目事实来源。
- Entity facts、assets、search index、agent memory 和 preview cache 要通过明确引用连接，不要直接互相读取私有存储。
- 所有跨包实体操作优先通过 facade command、port 或 adapter，不直接 import 另一个功能包实现。

## 验证命令

按影响范围选择最小必要验证：

```bash
pnpm check:deps
pnpm check:agent-boundaries
pnpm check:3d-route-a-boundaries
pnpm --dir packages/neko-ui test -- --run
pnpm --dir packages/neko-entity test -- --run
pnpm test
pnpm build
cd packages/neko-engine && cargo test
```

当前已知 gap 见
[`docs/status/gap-analysis/2026-06-15-package-boundaries.md`](../status/gap-analysis/2026-06-15-package-boundaries.md)。
