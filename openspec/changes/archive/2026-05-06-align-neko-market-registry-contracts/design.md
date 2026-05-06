## Context

`neko-market` 已经存在 core / extension / webview 三层实现，`neko-types/src/types/asset/*` 也已有 AssetManifest、MarketClient、InstallTarget 等基础类型。但当前实现仍是旧 v3 形态：AssetType 以媒体/模型/预设的具体类型展开，缺少 `DistributionKind`、`EffectsManifest`、bundle orchestration、registration distribution、大素材状态和完整 Registry API v1 包络。

三份架构文档已经把边界拆清：

- `marketplace.md`：本仓只做客户端的装、说、管；InstallTarget 需要按 X/Y 归属解耦。
- `registry-server-contract.md`：server 是 manifest、trust、entitlement、ontology、签名、搜索和 billing 的权威。
- `manifest-schema-spec.md`：AssetManifest v4 是 client/server 共同消费的类型契约。

五层分析结论：

- 职责：`neko-types` 定契约，`market-core` 执行协议和安装编排，extension 只做 VSCode host adapter，webview 只做状态展示和用户操作。
- 依赖：Layer 0 core 不依赖 VSCode/React/领域包；Extension 可依赖 VSCode 但不得引 React；Webview 不得导入 `vscode`；Y 类 target 不留在 market。
- 接口：以 `AssetManifest`、`IMarketClient`、`IInstallManager`、`IInstallTarget`、`NekoMarketAPI` 和 postMessage 协议作为稳定边界。
- 扩展：新增字段 optional-first；InstallTarget 用贡献注册扩展；semantic/intent facets 由 server ontology 扩展。
- 测试：用 fixtures、contract tests、architecture guard、install lifecycle tests 和 webview message/store tests 覆盖。

## Goals / Non-Goals

**Goals:**

- 将本仓共享类型与 market 实现对齐到 AssetManifest v4、Registry API v1 和 marketplace 客户端边界。
- 保持 `neko-registry-server` 为独立项目，本仓只实现 HTTP client 和客户端兜底。
- 用接口、注册表、事件和 host adapters 降低 market 与 agent/assets/cut/model/tools 的耦合。
- 让安装生命周期对 archive / orchestration / registration、大素材、effects、rollback、bundle 和 entitlement 都有可测试行为。
- 提供迁移路径，让旧 market 包和旧 InstallTarget 在同一迭代内被替换，而不是长期双轨。

**Non-Goals:**

- 不实现 Publisher Portal、Upload API、Review Queue、server 签名生成、支付收单、搜索索引或 ontology 维护。
- 不把 7 个 Y 类 InstallTarget 的领域逻辑永久放在 `neko-market`。
- 不在 Webview 内嵌支付，不保存卡号、订单状态机、退款/申诉流程或 webhook secret。
- 不重写 `neko-assets` 的本地素材库；AssetLibrary 只 deep-link market，不成为 market 的第二个管理面。
- 不在 client 重做完整 server manifest 校验；client 只做安装/渲染所需兜底。

## Decisions

### Decision 1: AssetManifest v4 is the single shared contract

`packages/neko-types/src/types/asset/manifest.ts` 持有 v4 顶层结构、11 种 `AssetType`、按 type 判别的 `AssetTypeMetadata`、`DistributionKind`、`EffectsManifest`、`LargeAssetStrategy`、semantics、intent、embeddings 和 deprecation。`market.ts` 只定义市场查询、安装、授权和管理接口，并复用 manifest 类型。

替代方案是在 `neko-market` 内单独定义 server DTO，再映射到旧 `AssetManifest`。这会继续制造两套清单事实来源，且 agent/assets/cut 仍无法共享同一 contract。

### Decision 2: Keep server authority explicit in client code

`MarketClient` 只调用 Registry API v1，不拼装 manifest、不重算 trust/entitlement、不维护 ontology。签名 P0 只做 presence-check，P1/P2 的 hash/crypto verification 通过同一 verifier 接口渐进升级。

替代方案是 client 为离线体验补齐 trust、entitlement 或 ontology 推断。该方案会把 server 权威状态复制到本地，容易造成付费授权和审核结果不一致。

### Decision 3: The install runtime is a state machine with dispatchers

安装流程统一为 discover → resolve → preflight → fetch → verify → stage → activate → record，失败进入 rollback。`DistributionKind` 选择 dispatcher：archive 下载/校验/解包，orchestration 递归安装 bundle contents，registration 写子系统注册条目并注册运行时。

替代方案是在各 InstallTarget 内各自处理下载、解包和注册。它短期少改代码，但会让 rollback、effects 反演、bundle 引用计数和大素材 mini lifecycle 无法统一测试。

### Decision 4: EffectsManifest owns side effects; targets own domain-specific staging

`EffectsManifest` 是安装副作用的声明式清单，用于 preflight、activate 和 uninstall inversion。InstallTarget 仍可以执行 type-specific staging 与 host 注册，但必须通过 `onPreInstall`、`onPostInstall`、`onPreUninstall`、`onRollback` 接口暴露，不能在 target 内隐藏长期状态。

替代方案是完全用 target hook 替代 `effects`。它会复现“装得上但卸不干净”的问题，并且无法在详情页展示权限、资源、冲突和注册副作用。

### Decision 5: X/Y InstallTarget ownership is enforced by API shape and guards

market-core / market extension 只内建 Media、Starter、Preset、Bundle 四个 X 类 target。Skill、Plugin、Shader、Identity、Endpoint、Provider、Model 七个 Y 类由对应子包贡献，并通过 `NekoMarketAPI.registerInstallTarget` 返回 Disposable。market extension 不得 import agent/cut/assets/model/tools 的领域类型。

替代方案是先在 market 内实现全部 11 个 target。它会让 market 成为领域包总线，破坏扩展之间通过共享层或契约层通信的约束。

### Decision 6: Management UI mirrors source-of-truth state, not domain catalogs

Webview 保持 Browse / Installed / Owned / Updates 四 Tab。AssetLibrary 和各领域面板通过 `onDidInstall` / `onDidUninstall` / `onDidStatusChange` 订阅可用资产，并 deep-link 到 market 详情；已购未装只在 Owned Tab 出现。

替代方案是在 AssetLibrary 或 LUT/Skill/Model 面板中复制 Owned/Installed 状态。它会产生双源状态和不一致的卸载/续费入口。

### Decision 7: Migration is breaking but bounded

本变更一次性迁移 AssetType v4 和 InstallTarget 路由，并保留明确的 legacy mapping helper 用于测试 fixtures、迁移日志和必要的用户提示。生产安装路径只接受 v4 manifest，旧 manifest 由 migration helper 转换后再进入 runtime。

替代方案是长期同时支持 v3/v4。它会让每个 target、UI filter、server query、InstalledRegistry 和 entitlement check 都出现分支，推高后续维护成本。

## Risks / Trade-offs

- [旧已装包记录无法直接读取] → 增加 InstalledRegistry migration，将旧 type 映射到 v4 type + metadata.kind，并保留迁移诊断。
- [server API 未一次性可用] → `GET /api/v1/version` capability probe 决定可用端点；UI 对 P1/P2 功能 graceful degradation。
- [scope 过大] → 按 manifest contract、client contract、install runtime、target contributions、management surfaces 五条线拆任务，每条线都有独立测试。
- [Y 类 target 迁移期间功能缺口] → market 可显示“需要扩展 X 才能安装此类型”，但不得降级到默认 target。
- [大素材流程复杂] → P0 先实现 eager + variant 的最小通路，sparse/proxy/delta 的类型和 UI 状态先固化，任务按阶段交付。
- [signature verification 初期较弱] → P0 presence-check 必须显式记录为阶段性验证，后续 hash/crypto verifier 不改变 InstallManager 调用点。
- [Webview 状态过多] → Store 使用 server/client 状态投影，按钮状态由 entitlement/install status 派生，避免组件内自建支付或安装状态机。

## Migration Plan

1. 升级 `neko-types` manifest/market/effects 类型，新增 v4 fixtures、legacy mapping helper 和 compile tests。
2. 升级 `MarketClient` 的请求/响应 DTO、Problem Details 错误、Bearer token、capability probe、cache/ETag 和 P0 search/detail/download/entitlement 方法。
3. 重构 install runtime 为 8 阶段 state machine，先接入 archive eager 路径，再接 orchestration/registration 和 effects inversion。
4. 迁移 InstallTargetRegistry 与 `NekoMarketAPI.registerInstallTarget`，把 X 类 target 留在 market，给 Y 类 target 建贡献 discovery 和缺失提示。
5. 更新 extension host adapter：registryUrl 配置、neko-auth token 注入、external checkout、Disposable 清理和 postMessage route。
6. 更新 webview store/UI：四 Tab、category/type/kind filters、Owned、Updates、buy/renew deep-link、large asset picker 状态和 i18n。
7. 接入子包贡献的 Y 类 target 或 compatibility adapter，并加 architecture guard 防 market import 领域包。
8. 更新文档实施状态、迁移说明和测试命令，运行 `pnpm --filter` 目标检查与 `openspec validate`。

Rollback 策略：类型契约迁移后不回滚到旧 AssetType；若安装 runtime 某阶段回归，可通过 feature flag 暂时禁用 orchestration/registration/large asset 分支，保留 v4 manifest 和 archive eager 主路径。

## Open Questions

- P0 是否同时实现 sparse/proxy/delta 下载，还是先提供 schema + UI 状态并只启用 eager/variant；建议先启用 eager/variant。
- Y 类 target 首批由哪些子包接入；建议 `skill` / `endpoint` / `provider` 先由 `neko-agent` 接，`shader` / `identity` / `model` 随后迁移。
- Signature P1 的 stable JSON canonicalization 是否放在本仓共享工具，还是 server 下发 manifest hash；建议本仓先定义 verifier interface，canonicalization 与 server 对齐后再启用。
