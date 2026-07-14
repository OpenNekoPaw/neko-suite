# 验证记录

## 结论

- 风险等级：整体变更为 L3；迁移窗口关闭和代码清理子变更为 L2。变更跨共享存储契约、Extension/TUI Host adapter、Agent 会话恢复、用户数据迁移、公开导出、打包和真实 Agent workflow。
- 旧 Task 来源的逐项审批入口只用于本机 prelaunch 一次性恢复。真实 Memento 来源完成审批、备份、导入、校验和退休后，用户明确要求关闭迁移窗口并允许清理本机测试数据；最终产品不保留 Extension 审查命令、TUI `/migrate-tasks`、approval port、source adapter 或 public migration API。
- scoped review 未发现本次清理引入的新阻塞问题。Journal 仍是会话权威；SQLite catalog 是可重建投影；Task/Checkpoint 稳态只走 workspace-partitioned SQLite repository。Agent、Extension、TUI、Webview 和 manifest 的生产源码不再包含旧 Task path/key/command/migration API。
- 当前全仓 `check:legacy-debt` 与 `check:unused` 仍未清零，详见“未关闭门禁与风险”；因此这里只声明本变更的聚焦路径通过，不声明全仓质量基线通过。

## Evaluation 证据

Authoring decision 为 `create`：在既有 owning suite `agent-runtime.workflow-controller` 中新增 `conversation-persistence-resume`。用户行为是完成一个 TUI turn、销毁旧 App/session owner、恢复同一 conversation，再继续第二个 turn。

Canonical path：

```text
message.submit
  -> session.waitForIdle
  -> session.dispose
  -> session.resume (new TUI App/session owner)
  -> Journal history load
  -> user-global SQLite conversation catalog
  -> message.submit
```

禁止路径包括 `conversations-index.json`、VS Code Memento conversation authority、复用旧内存 session 和创建无关 conversation。

- Key-free gate：`pnpm test:agent:eval` 通过，39 个测试、261 个断言；严格发现 26 个 suite、38 个 case。
- Compiled TUI：`pnpm --filter @neko/cli build:exe` 通过。
- 真实 case：`node scripts/agent-eval/protocol-smoke.mjs --suite agent-runtime.workflow-controller --case conversation-persistence-resume --run-id normalize-storage-resume-20260713-final2` 通过。
- Target：`workflow:tui-workflow-controller`，contract hash `sha256:1d6cce3ecd3f19858161359cc356db50c10fc269698f34d4e9d2e9727d279960`。
- Effective model：`nekoapi-chat/gpt-5.5`；配置 digest `sha256:cab5b8af9235db02b5823061743327c25fef5a7d60289f712b26188214758ca6`。
- Assertion：runtime、canonical turn、conversation persistence、recovery ordering、terminal idle、final answer 共 6 个 hard gate 全部通过；facts 完整且 `droppedCount=0`。
- Persistence facts：`authority=journal`、`catalog=sqlite`、`databaseScope=user-global`、`resume.status=restored`、`recordSource=journal-projection`、`restoredMessageCount=2`，恢复前后 conversation ID 相同。
- 报告：`reports/agent-eval/agent-runtime.workflow-controller/conversation-persistence-resume/normalize-storage-resume-20260713-final2/`。
- Judge 和 baseline 未启用；token/cost 数据不可用。因此本次只验证真实 workflow 正确性，不形成输出质量提升或成本结论。

迁移窗口关闭的 authoring decision 为 `excluded`：删除一次性 deterministic migrator、命令和 Host wiring 不改变 prompt、Skill、capability/tool routing、provider/model 或 Agent turn。其证据来自 SQLite-only path tests、生产源码 guard、真实 Development Host 启动和既有 `conversation-persistence-resume` 真实 TUI case，不新增文本质量 Judge。

## 功能与迁移验证

| 验证                                                       | 结果                                                                                                                                             |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Agent focused storage/architecture/command tests           | 6 个文件、83/83 通过                                                                                                                             |
| Extension focused SQLite/bootstrap tests                   | 2 个文件、9/9 通过                                                                                                                               |
| TUI focused router/session/SQLite binding tests            | 3 个文件、78/78 通过                                                                                                                             |
| Webview slash catalog test                                 | 1 个文件、12/12 通过                                                                                                                             |
| Agent Test Utils 全量                                      | 4 files / 6 tests 通过；退休的 `tasks.json` fixture 与 export 已删除                                                                             |
| Agent Core 全量                                            | 251 files 通过、1 skipped；2769 tests 通过、1 skipped                                                                                            |
| Agent Extension 全量                                       | 74 files / 732 tests 通过                                                                                                                        |
| Agent TUI 全量                                             | 88 files / 558 tests 通过；一次并行运行的 MessageQueuePanel 键盘测试波动已独立 7/7、随后全量 558/558 复验通过                                    |
| Agent Webview 全量                                         | 97 files / 790 tests 通过                                                                                                                        |
| `@neko/cli` build                                          | 通过，Node 24 target                                                                                                                             |
| Node SQLite adapter focused suite                          | 36/36 通过                                                                                                                                       |
| Bun SQLite adapter focused suite                           | 4/4 通过                                                                                                                                         |
| `pnpm test`                                                | 46/46 Turbo tasks 通过；本次删除后的全仓测试已重新执行                                                                                           |
| `pnpm build`                                               | 33/33 Turbo tasks 通过                                                                                                                           |
| `pnpm --filter @neko/auth-core test`                       | 4 files / 52 tests 通过                                                                                                                          |
| Assets / Canvas / Sketch 根测试入口                        | 均为 `pnpm exec vitest run`；不再组合错误的 `--dir`，也未使用 `passWithNoTests` 隐藏未执行测试                                                   |
| `pnpm check`                                               | 执行但未通过；Knip 基线仍有 1 个 unused file、5 个 unused dependencies、5 个 unlisted dependencies、85 个 unused exports、2 组 duplicate exports |
| `git diff --check`                                         | 通过                                                                                                                                             |
| `openspec validate normalize-neko-storage-scopes --strict` | 通过                                                                                                                                             |
| packaging/install smoke                                    | 10.7 已执行；非当前 Host 的平台只覆盖打包/形状检查                                                                                               |

真实旧 Task 来源恢复结果：

- 原 Memento source 含 19 条 Task、0 checkpoint；13 条具有可验证 owner scope，6 条终态 Task 缺少可验证 `runId` / `runStartedAt`。
- 13 条记录已事务导入 canonical workspace `e3693443-338c-4b44-956c-fe8db0c077fa` 并逐条校验；6 条没有伪造 scope，只在迁移报告中列出 exact missing fields。
- 恢复后 SQLite 为 13 Task、0 checkpoint、`integrity_check=ok`；orphan workspace `c9d051dc-93ac-49a9-b49a-8145507103b7` 仍保留且未合并、未删除。
- 真实 identity 恢复前备份仍为 `~/.neko/backups/neko-before-workspace-identity-recovery-2026-07-14T00-34-16-059Z.db`。
- 用户随后明确授权清理本机测试迁移产物。两个 Memento migration backup key 和 `~/.neko/tasks.json.{backup,migrated}-*` 已删除；重启 Development Host 后旧 Task/Memento/migration backup key 仍为 0，canonical 13 Task 不变。
- 最终复核 `integrity_check=ok`、canonical 13 Task、0 checkpoint 和空 legacy ItemTable key 后，已删除本次清理使用的 `/tmp/neko-vscode-state-before-task-migration-cleanup-20260714T091033.db` 临时安全副本；真实 identity 恢复备份继续保留。
- 生产源码 guard 证明 `tasks.json`、旧 Memento keys、`reviewLegacyTaskMigration`、`migrate-tasks`、migration module/API 和 JSON/Memento Task store 不再出现在 Agent/Extension/TUI/Webview steady-state path；同一 guard 也覆盖 `test-utils/src`，防止测试 fixture 继续制造退休 Task authority。

`Debug Dev (All)` 使用现有 `../neko-test/` Extension Development Host 和 `vscode-extension-debugger`，未启动独立 VS Code、Chrome、Electron 或浏览器替代宿主。运行证据包括：

- VS Code CDP `9222`、Extension Host inspector `53629`；Extension Host Node `24.17.0`、SQLite `3.53.0`；
- 双连接冲突先返回 `metadata-transaction-failed`，释放后第二写者成功，revision 为 1，integrity 为 `ok`；
- 损坏数据库返回 `metadata-integrity-failed` 并投影 `local-metadata-corrupt`；
- 最新 bundle 通过主 `neko-suite` 窗口 Stop/Start 内置 `Debug Dev (All)` 重载；Development Host page target 从 `D3D...` 变为 `8CB...`，Agent iframe 从 `B11...` 变为 `AA4...`，workspace 仍为 `../neko-test/`。
- Webview snapshot 显示真实 Agent composer、开始对话/生成素材/角色扮演和模型控制；页面没有 migration approval、activation failure、identity conflict、`conversation-durability-failed` 或 `missing boolean success`。
- `agent.lifecycle-reload.p0` 真实功能场景的 12 个输入/点击/hide-reveal/reload 步骤与 4 个业务断言全部通过；fresh realm 可继续输入，Neko Agent Host 日志无业务 error。
- 场景总状态仍为 `case-fail`：严格 console policy 将 `Debug Dev (All)` 的既有宿主噪声判为失败，包括 debugger pause、Puppet 缺翻译、Handlebars MIME overwrite、large Memento warning、`punycode` deprecation 和未列入 scenario extension identity 的开发扩展 marketplace 404。报告为 `reports/webview-functional-diagnostic/agent.lifecycle-reload.p0/2026-07-14T01-24-19-154Z/`；不能把该状态描述为完整 runtime gate 通过。
- 本地截图证据为 `/tmp/neko-task-migration-cleanup-runtime.png`，仅用于当前机器验收。场景生成的唯一 `Lifecycle host projection` catalog row 与 Journal 已按授权清理；13 Task、0 checkpoint、DB integrity 均保持不变。

损坏和并发探针使用隔离临时 home，未修改真实 `~/.neko/neko.db`。

## 未关闭门禁与风险

- `pnpm check:legacy-debt` 已重跑但失败：全仓仍有 133 个 blocking 命中（122 个 `migrate-now`、11 个 `needs-review`）。已删除的 Task migration module/command/API 不再出现在生产扫描结果。
- `pnpm check:unused` 与 `pnpm check` 已重跑但失败：当前全仓基线仍报告 1 个动态执行的 validator CLI、5 个 unused dependencies、5 个 unlisted dependencies、85 个 unused exports 和 2 组 duplicate exports；没有本次删除后残留的 Task migration export/file。
- `pnpm check:agent-boundaries` 已重跑但失败：两个 failure 级兼容例外于 2026-07-04 过期，另有既有 `media-production-workflow-state.test.ts` `cachePath` finding；均不在本次修改路径。
- `pnpm check:deps` 已单独执行但失败：`packages/neko-content/src/document/index.ts`、`read-image-tool.ts`、`content-read-capability-provider.ts` 之间存在 2 个循环依赖。三个文件相对当前 `HEAD` 均无差异，确认不是本变更引入；该全仓基线仍需独立修复，不能把依赖门禁描述为通过。
- 真实运行态只在当前 macOS arm64 Host、VS Code `^1.128.0` / Node `24.17.0` 和 Bun `1.3.10` 完成。Windows、Linux、x64、其他 arm64 Host 和 Remote SSH/Container 只完成打包或静态矩阵检查，尚无同等真实并发/损坏恢复证据。
- 单一用户数据库扩大跨 workspace 的物理损坏影响面。在线备份、state-safe durability、typed corruption diagnostic、Journal/project facts 独立权威和 cache rebuild 能降低风险，但不能消除介质级损坏风险。
- 最终 Evaluation report 的 repetition 配置为 1，未生成统计 aggregate；它能拒绝错误恢复路径，但不能建立跨 provider/model 的统计稳定性结论。
- `agent.lifecycle-reload.p0` 的业务路径已通过，但 `Debug Dev (All)` 全宿主 console baseline 尚未收敛，严格 runtime-errors assertion 仍失败。需要在 `establish-vscode-webview-functional-testing` 中按真实 extension identity 分类全宿主开发噪声，同时不得把 Neko 业务 warning/error 泛化为 benign。
