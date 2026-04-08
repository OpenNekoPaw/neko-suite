# 故障修复执行清单（按批次排序）

最后更新：2026-04-08  
来源：`docs/TROUBLESHOOTING.md`

## 目标

- 将当前剩余 `open` 问题按可执行批次重新排序，避免“按包修复”导致跨链路返工。
- 优先恢复核心功能可用性，再收敛共享基础能力、安全边界、测试门禁与架构债。
- 每个批次都要求同时交付：实现修复、最小回归测试、文档状态回写。

## 当前盘点

- 剩余 `open`：53 项（批次 1 修复 13 项 + 验证 1 项，批次 2 修复 6 项 + 验证 2 项）
- 严重级别分布：`P0 = 8`，`P1 = 27`，`P2 = 17`，`P3 = 2`
- 已完成：`neko-engine` 10 项，`neko-cut` 6 项，`neko-canvas` 7 项，`neko-agent` 4 项，`neko-auth` 2 项

## 执行规则

- 先修“命令/消息/安装/认证”这类主链路断裂问题，再处理体验、统一化和维护性问题。
- 每个批次内先补契约测试，再修改实现，最后再做局部重构或清理。
- 涉及 `extension + webview` 的问题，必须把消息协议收敛为单一事实来源，禁止继续靠 `as` 强转兜底。
- 每个批次完成后，同步回写 `docs/TROUBLESHOOTING.md` 状态为 `fixed` 或 `verified`。

## 批次总览

| 批次 | 目标 | 主要范围 | 条目数 | 依赖 |
|---|---|---|---:|---|
| 批次 1 | 编辑器核心协议止血 | `neko-cut`、`neko-canvas` | 17 | 无 |
| 批次 2 | Agent/Auth 基础层稳定化 | `neko-agent`、`neko-auth` | 8 | 批次 1 可并行，优先完成 |
| 批次 3 | 市场与安装链路闭环 | `neko-market` | 8 | 依赖批次 2 |
| 批次 4 | 预览与剧本语义修复 | `neko-preview`、`neko-story` | 13 | 建议在批次 1 后执行 |
| 批次 5 | 资产与统一接入收口 | `neko-assets`、统一能力接入 | 16 | 依赖批次 3、4 |
| 批次 6 | 门禁、清理与收尾 | 横切收尾项 | 12 | 依赖批次 1-5 |

## 批次 1：编辑器核心协议止血

**目标**

- 恢复 `neko-cut` 与 `neko-canvas` 的主编辑链路，优先解决“可见但不可用”“请求发出但无响应”“状态不更新”这类故障。

**涉及编号**

- `NKC-001` `NKC-002` `NKC-003` `NKC-004` `NKC-005` `NKC-006` `NKC-008` `NKC-010`
- `NKV-001` `NKV-002` `NKV-003` `NKV-004` `NKV-005` `NKV-006` `NKV-007` `NKV-009` `NKV-010`

**执行清单**

- [x] 统一 `neko-cut` 对外 API 命令名与实际注册命令，消除 `neko.cut.timeline.*` 与 `neko.timeline.*`/`neko.element.*` 漂移。（NKC-001, 2026-04-08）
- [x] 在 `neko-cut` 收口时间线执行链路：移除 `TimelineBridge`，统一到 `TimelineToolExecutor`（extension 侧 ProjectData 直接变换）。（NKC-002, 2026-04-08）
- [x] 将 `asset:*` 消息接入 `neko-cut` 主消息总线，确保资产库增删改查和导入链路闭环。（NKC-003, 2026-04-08）
- [x] 统一 `neko-cut` AI 状态协议，修复前后端状态消息不一致。（NKC-004, 2026-04-08）
- [x] 修复导出完成事件 `outputPath` 丢失问题：从 job config 提取 outputPath 后再删除 job。（NKC-005, 2026-04-08）
- [x] 补全 `neko-cut` AI 输入源路径解析，通过 EditorRegistry 查询元素 `src` 字段。（NKC-006, 2026-04-08）
- [x] 修复 `neko-cut` 多编辑器可见性竞态，确保状态栏和大纲只由当前活动面板驱动。（NKC-008, 2026-04-08）
- [x] 统一 `neko-canvas` 的 `nodes.*` 请求/响应字段契约，修复 `scriptIndexResult`、`modelInstalledResult` 字段错位。（NKV-001/002/003, 2026-04-08）
- [x] 修复 `neko-canvas` `/batch`（缺 await）、AutoPrompt（Promise 回路）、空文件初始化（显式 fallback）和命令声明/实现不一致问题。（NKV-004/005/007/009, 2026-04-08）
- [x] 验证 `neko-canvas` `operationApplied` 脏标记链路正常，无需修复。（NKV-006, 2026-04-08 verified）
- [ ] 为 `neko-cut`、`neko-canvas` 补 extension 侧协议回归测试，覆盖命令注册、消息路由、脏标记与关键 round-trip。（NKC-010/NKV-010, 待补充）

**完成标志**

- `neko-cut` 对外 timeline API 可调用，Bridge 或工具执行链路只有一套真实实现。
- `neko-canvas` 的节点 API、AutoPrompt、`/batch`、安装状态回填、dirty 事件全部可闭环。
- 两个包至少各有一组 extension 协议测试，不再只依赖 webview slice 测试。

**最小验证**

- `pnpm -C packages/neko-cut test -- --run`
- `pnpm --filter neko-canvas test:packages`
- `pnpm --filter @neko-canvas/extension exec tsc --noEmit`

## 批次 2：Agent/Auth 基础层稳定化

**目标**

- 先把会话、工作区边界、shell 风险、迭代上限和认证广播机制收紧，否则后续市场、AI、技能和权限行为都不稳定。

**涉及编号**

- `NKA-001` `NKA-002` `NKA-003` `NKA-004` `NKA-005`
- `NKAT-001` `NKAT-002` `NKAT-003`

**执行清单**

- [x] 将 `neko-agent` 的 `configure()` 拆为 `_initializeSession()`（首次）和 `_reconfigureSession()`（每轮），避免每轮消息重建 session。（NKA-001, 2026-04-08）
- [x] 在 chat 主链路统一透传 `workspaceRoot`，恢复 AGENTS、项目记忆与工具默认工作目录。（NKA-002, 2026-04-08）
- [x] 验证 Plan 模式只读工具已正确限制工作区边界（rule-matcher.ts 已实现 read-only 限制）。（NKA-003, 2026-04-08 verified）
- [x] 将 skill 内嵌 shell（Bash ToolSet）改为 `alwaysActive: false` + `loadingTier: 'eager'`，需显式激活。（NKA-004, 2026-04-08）
- [x] 将 `maxIterations: Infinity` 改为 `200`（chat + plan 两处）。（NKA-005, 2026-04-08）
- [x] 修复 `neko-auth` 静默刷新后广播 `onDidChangeSession` 事件。（NKAT-001, 2026-04-08）
- [x] 验证 `neko-auth` 配置优先级正确：VSCode settings → config.json → 默认空配置。（NKAT-002, 2026-04-08 verified）
- [x] 区分刷新失败原因：`AuthNetworkError`（网络）保留 stale session，`AuthTokenError.isTokenInvalid`（401/403）才清空。（NKAT-003, 2026-04-08）

**完成标志**

- 多轮对话不再因反复 `configure()` 丢上下文。
- `workspaceRoot` 在 prompt、memory、core tools、plan 模式中表现一致。
- token 刷新后的消费者能收到 session 更新事件。

**最小验证**

- `pnpm --filter neko-agent test -- --runInBand`
- `pnpm --filter neko-agent compile`

## 批次 3：市场与安装链路闭环

**目标**

- 让市场系统的“搜索、安装、已安装、筛选、许可”与真实产物形态一致，避免“安装成功但不可用”。

**涉及编号**

- `NKM-001` `NKM-002` `NKM-003` `NKM-004` `NKM-005` `NKM-006` `NKM-007` `NKM-008`

**执行清单**

- [ ] 在 core 层补全“下载归档 → 校验 → 解包 → 交给 target hook”安装契约，修复安装目录形态错误。
- [ ] 为市场 Host/Webview 建立 DTO adapter，禁止直接把共享类型强转成 webview 扁平结构。
- [ ] 拆分“UI 聚合筛选类型”和“后端查询类型”，对齐共享 `AssetType` 契约。
- [ ] 为 `InstalledRegistry.load()` 引入 ready 阶段，消除首次打开已安装列表竞态。
- [ ] 给 `openSkills` 增加 webview ready 前的待发送消息队列。
- [ ] 接入 `neko-auth` 的许可/认证主链路，明确 `paid/private` 资产能力边界。
- [ ] 统一 `registryUrl` 与架构文档口径，移除 `nekoSuiteVersion` 硬编码。
- [ ] 补安装编排与 webview 协议级测试，覆盖下载、解包、注册、筛选和消息时序。

**完成标志**

- 技能、模型、预设安装后目录结构与 InstallTarget 假设一致。
- 市场列表与安装状态不再依赖 `as` 强转。
- `openSkills`、已安装列表、筛选与许可检查行为稳定可复现。

**最小验证**

- `pnpm --filter neko-market test`
- `pnpm --filter neko-market build`

## 批次 4：预览与剧本语义修复

**目标**

- 修复内容预览安全面、端口恢复能力、剧本格式承诺和媒体语义错误，避免“能打开但行为不可信”。

**涉及编号**

- `NKP-001` `NKP-002` `NKP-003` `NKP-004` `NKP-005` `NKP-006`
- `NKS-001` `NKS-002` `NKS-003` `NKS-004` `NKS-005` `NKS-006` `NKS-009`

**执行清单**

- [ ] 修复 `neko-preview` 错误页的 HTML 注入面，加入最小 CSP 和统一转义函数。
- [ ] 修复 CBZ Blob URL 回收、PreviewFileServer 端口失效重试与对外配置项未接线问题。
- [ ] 清理 `document:data` 等文档消息协议与实现漂移，并补文档链路测试。
- [ ] 统一 `neko-story` 的格式支持集合，让文档、语言注册、索引和文档链接匹配到同一组扩展名。
- [ ] 修复 `AUDIO` 资产错误映射为 `image` 的问题，明确音频元素或音频轨道策略。
- [ ] 补齐剧本预览滚动同步、`neko-agent` 依赖声明和 `generateStoryboard` 占位入口处理。
- [ ] 为 CSP、滚动同步、音频映射和文档预览链路补回归测试。

**完成标志**

- 预览错误页不再直接拼接动态字符串。
- 引擎端口变化后文档预览可自恢复。
- `.nks/.story/.fountain` 的支持口径一致，音频素材进入时间线时语义正确。

**最小验证**

- `cd packages/neko-preview && npm test`
- `cd packages/neko-preview && npm run lint`
- `pnpm --filter neko-story run test:packages`
- `pnpm --filter neko-story run build`

## 批次 5：资产与统一接入收口

**目标**

- 处理功能宣称超前、统一入口未落地、共享抽象接入不一致等系统性问题，为后续新功能提供稳定基线。

**涉及编号**

- `NKAS-001` `NKAS-002` `NKAS-003` `NKAS-004` `NKAS-005` `NKAS-006` `NKAS-007`
- `NKUN-001` `NKUN-002` `NKUN-003` `NKUN-004` `NKUN-005` `NKUN-006` `NKUN-007` `NKUN-008`
- `NKAT-004`

**执行清单**

- [ ] 决定 `neko-assets` 的云同步/CI 渲染策略：要么补真实服务编排，要么下调功能宣称并移除未接线视图。
- [ ] 让 `AssetRegistry` 真正接入主链路，并为非媒体资产补持久化与恢复策略。
- [ ] 收敛 `neko-assets` 巨型入口与多工作区行为，建立明确的 workspace 选择策略。
- [ ] 为共享能力建立统一基线：Extension 入口模板、Webview 入口模板、主题/i18n/error/logger 接入规范。
- [ ] 统一 AI 菜单、tools/Shell 能力接入边界，避免共享抽象存在但业务包未实际采用。
- [ ] 校正文档与实现偏差，尤其是 `neko-tools`、`neko-auth` 等能力宣称问题。
- [ ] 为 `neko-assets` extension/provider/命令链路补最小集成测试。

**完成标志**

- `neko-assets` 的功能入口、视图贡献和真实能力一致。
- 共享层从“统一导出”升级为“统一落地规范”。
- 横切能力接入差异能被模板和检查项约束，而不是靠人工记忆。

**最小验证**

- `pnpm build`
- `pnpm test`
- `pnpm check`

## 批次 6：门禁、清理与收尾

**目标**

- 在主要功能恢复后，补齐安全边界、构建脚本、lint/test/tsc 门禁和低优先级清理项，防止问题回流。

**涉及编号**

- `NKC-007` `NKC-009`
- `NKA-006` `NKA-007` `NKA-008`
- `NKP-007` `NKP-008`
- `NKV-008`
- `NKS-007` `NKS-008` `NKS-010`
- `NKAT-005`

**执行清单**

- [ ] 收紧 `neko-cut` 资源访问边界，替换同步 I/O，并清理未接线/残留执行路径。
- [ ] 修复 `neko-agent`、`neko-preview`、`neko-canvas` 的 lint 脚本与 Flat Config 不兼容问题。
- [ ] 将真实外网集成测试拆出默认测试集，并为 `neko-agent` 构建脚本和巨型文件制定收口方案。
- [ ] 修复 `neko-preview` 的构建脚本吞错与重复卸载清理逻辑。
- [ ] 将 `neko-canvas` extension 类型检查纳入默认门禁。
- [ ] 为 `neko-story` 处理索引扩展性、i18n 迁移和非空断言清理。
- [ ] 为 `neko-auth` 增补 bridge 与 extension 层测试。

**完成标志**

- 默认 `lint/test/build/typecheck` 能覆盖主风险，不再出现“构建能过但契约已坏”的情况。
- 默认测试集不依赖真实外网。
- 低优先级脚本、清理与维护性问题不再阻塞后续迭代。

**最小验证**

- `pnpm build`
- `pnpm test`
- `pnpm check`

## 建议推进方式

1. 先完成批次 1 和批次 2，清空当前最具破坏性的 P0 主链路问题。
2. 再完成批次 3 和批次 4，恢复市场、预览、剧本与安装结果的可信度。
3. 最后执行批次 5 和批次 6，把能力统一、测试门禁和架构债收口。

## 文档维护要求

- 每完成一个批次，回写 `docs/TROUBLESHOOTING.md` 的状态、验证命令和日期。
- 若批次执行中发现问题拆分或合并，优先调整本清单，再回填原故障文档。
- 新增问题若阻断当前批次，应插入当前批次；若仅影响后续统一化，放入批次 5 或批次 6。
