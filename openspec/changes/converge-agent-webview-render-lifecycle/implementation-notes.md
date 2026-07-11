# Agent Webview Render Lifecycle Implementation Notes

## 变更

- OpenSpec：`converge-agent-webview-render-lifecycle`
- 实施边界：`@neko-agent/webview` 的 conversation render ownership、激活事务、后台投影、输入/队列、状态/时间、viewport、Markdown session 与 cleanup。
- 预发布策略：新 canonical path 不保留可成功返回的旧 activation/projector/Markdown fallback；非法 ownership、未知 snapshot、缺失 session 与错误 publication 顺序继续 fail-visible。

## 架构结论

1. `ConversationRenderCoordinator` 是 per-conversation canonical owner；React state/ref 只是 active conversation 的 compatibility projection。
2. 所有激活来源统一执行 `ingest -> prepare renderer resources -> commit visible state/foreground owner -> publish Markdown observers`。
3. 后台 conversation 可推进自身 snapshot、Markdown 与 Tab revision，但不能写前台 state/ref，也不能触发 scroll/focus。
4. composer、queue、status、elapsed baseline 与 viewport intent 均绑定 active snapshot，不再依赖全局 running flag。
5. active-turn release、component detach/StrictMode、hide/reveal、realm teardown 与 conversation disposal 是不同 cleanup scope。
6. normalized Markdown 是唯一成功渲染路径；没有 raw-source、旧 renderer 或 final-only fallback。

## 分批实施提交

| Commit | 内容 |
| --- | --- |
| `645303cfa` | characterization tests：conversation lifecycle、输入/队列、状态/时间、滚动/焦点 |
| `e9e91e5d1` | 新增 canonical `ConversationRenderCoordinator` |
| `abc6566e7` | 统一四类 conversation activation lifecycle |
| `5365d801f` | 隔离 background conversation projection |
| `614062ee6` | Tab status 订阅 owning conversation revision |
| `8fa8e53c3` | composer/queue 状态绑定 active render snapshot |
| `fde7405cf` | 恢复 per-conversation run status 与 elapsed baseline |
| `2790eccb4` | 保存并恢复 per-conversation viewport intent |
| `72b819247` | 区分 conversation、turn、component 与 realm cleanup |
| `ede83d101` | 关闭直接 activation/projector bypass |
| `45894d13a` | 收敛 conversation render projections |
| `a56ab303a` | 修复 realm teardown 期间 Markdown subscriber publication race |
| `23ed8e3c5` | 将仅内部使用的 render projection converters 收回文件私有范围 |
| `50e85c111` | 将 `turn-snapshot-unavailable` 的发布与 recovery cleanup 绑定到精确 Timeline owner |
| `cbb16299a` | 隔离多 Tab Timeline recovery diagnostics，禁止后台 conversation 污染前台 global error |

## Teardown race 根因与修复

真实 Extension Development Host 中，隐藏 Secondary Side Bar 会触发：

```text
pagehide
  -> renderRuntime.disposeRealm()
  -> markdown.disposeAll()
  -> entries.clear()
  -> notify(session subscribers)
  -> old React tree renders before actual destruction
  -> Timeline is still streaming but its session no longer exists
```

旧 realm 因而抛出 `Normalized Markdown streaming session is missing ...`。`a56ab303a` 将 realm-wide `disposeAll()` 改为直接清空 session/subscription，不向正在 teardown 的 React tree 发布；conversation/turn scoped disposal 仍执行正常 scoped invalidation。该修复没有引入 Markdown fallback。

## 延迟 snapshot-unavailable 根因与修复

旧 turn 请求 snapshot 后，其 owner/channel 可能已经被新 turn 替换。Extension 对旧请求返回 `turn-snapshot-unavailable` 是合法的；presenter 也会因 identity mismatch 保持新 Timeline state 不变。问题发生在 Webview timeline handler：它仍无条件发布全局错误，并且按 `conversationId` 重新读取 state 后执行 recovery cleanup，可能把旧 turn diagnostic 误用于同 conversation 的新 turn。

`50e85c111` 将 diagnostic publication 与 cleanup 绑定到 `applyAgentTurnTimelineDiagnostic()` 实际接受并转为 `unavailable` 的精确 state：

- delayed/stale diagnostic 若未命中当前 `connectionEpoch + conversationId + turnId + messageId` owner，不修改新 turn、不清理新 turn recovery，也不写全局错误；
- 精确命中当前 owner 的 unavailable 仍清理该 owner recovery 并 fail-visible；
- 其他 diagnostic code 保持原有错误发布语义。

该修复没有 snapshot/Markdown fallback，也没有把当前 owner 的真实失败伪装为成功。

## 多 Tab revision-gap 冲突根因与修复

Markdown renderer、Timeline scheduler 和 canonical snapshot 已按 Timeline identity 分区，但 Webview 的 `globalError` 仍是 `ConversationController` 中的单例展示状态。后台 conversation A 出现 delivery revision gap 时，A 会正确进入 `suspended` 并请求 authoritative snapshot；旧 handler 随后仍把 `delivery-revision-gap` 写入单例 `globalError`，导致当前前台 conversation B 显示 A 的错误。这是 diagnostic publication ownership 缺失，不是 Markdown session key 或内容状态串线。

`cbb16299a` 收敛该边界：

- `delivery-revision-gap` 在 current Timeline 已进入 `suspended` 且 snapshot recovery 正在进行时，不再作为全局错误发布；snapshot request、recovery persistence 和后续 authoritative snapshot 恢复保持不变；
- Timeline diagnostic 只有属于当前 foreground conversation 时才能写入 `globalError`；后台 `turn-snapshot-unavailable` 仍更新其 owning conversation 为 `unavailable` 并执行 scoped cleanup，但不能污染另一个 Tab；
- 当前 foreground owner 的不可恢复 diagnostic 仍 fail-visible；无 state 可承接的 revision gap 也不会被伪装为成功。

Markdown 改造暴露了问题，是因为 canonical Timeline commit 与 snapshot recovery 让 owner/timing 更严格、后台交付更可观察；根因是遗留的全局错误通道没有跟随 per-conversation render ownership 一起收敛，而不是 normalized Markdown 渲染本身导致会话共享。

## 验证证据

### 聚焦与完整测试

- `pnpm --filter @neko-agent/webview exec vitest run src/markdown/agent-markdown-session-registry.test.ts src/render-lifecycle/conversation-render-runtime-lifecycle.test.ts src/render-lifecycle/conversation-render-state-adapter.test.ts src/render-lifecycle/__tests__/current-render-lifecycle-ownership.test.ts src/components/ConversationController.test.tsx`：5 files / 42 tests passed。
- teardown 修复聚焦回归：3 files / 36 tests passed。
- delayed snapshot diagnostic 聚焦路径：`work-item-handlers`、active-turn presenter 与 render runtime lifecycle，3 files / 72 tests passed。
- multi-Tab revision-gap 与 background diagnostic 聚焦路径：3 files / 74 tests passed。
- `pnpm --filter @neko-agent/webview test`：88 files / 786 tests passed。
- characterization、handler、MessageList、queue/input、status/time、viewport 与 poisoned-path 测试已随各实施批次运行并通过。

### 类型、构建与边界

- `pnpm --filter @neko-agent/webview exec tsc --noEmit --pretty false`：通过。
- `pnpm --filter @neko-agent/webview build`：通过。
- `pnpm --dir packages/neko-agent run compile:webview`：通过；仅有既有 Browserslist 与 chunk > 500 kB 警告。
- `pnpm check:webview-boundaries`：通过，生产 Webview 无 `vscode` 或 Node API import。
- `pnpm check:agent-boundaries`：被既有过期 compatibility exceptions 阻塞（`agent-turn-bridge-host-adapter`、`agent-runner-vscode-event-compat`），不属于本 change。

### Legacy / unused

- `pnpm check:legacy-debt`：既有结果 `blocking=87`、`migrate-now=76`、`needs-review=11`；主要位于本 Webview lifecycle replacement boundary 之外。
- `pnpm check:unused` 首次发现本 change 的两个多余 export：`toConversationStreamingSnapshot`、`toConversationRenderStreamingState`；已在 `23ed8e3c5` 收回文件私有。复跑确认这两个符号已不再出现；命令仍因仓库其他 1 个 unused file、5 个 unused dependencies、2 个 unlisted dependencies、25 个 unused exports 与 2 个 duplicate exports 返回 exit 1，其余报告为无关仓库 debt。

### VS Code Webview 运行态

- `pnpm smoke:webview:runtime`：通过，target counts 为 total 5 / page 2 / webview 2 / worker 1。
- 使用 Extension Development Host + `vscode-extension-debugger` 执行：A streaming 并暂停 -> hide/reveal -> 新建并切到 B -> 在 B 保持可编辑输入 -> A 后台继续并完成 -> 切回 A。
- hide/reveal 后 A 的 streaming Timeline、表格内容与 Tab 状态恢复；B 输入 `background-input-check-fixed` 保持焦点且 input/send 未被禁用；A 后台完成后切回可见 terminal content、完成状态、时间与 follow-tail 底部位置。
- 最终 console 仅有 VS Code container 的既有 `Unrecognized feature: 'local-network-access'` warning。
- 原 background/hide-reveal 生命周期场景未出现：`Normalized Markdown streaming session is missing`、`turn-snapshot-unavailable`、`background-visible-state-write`、`activation-publication-order-invalid`、`activation-already-committed`。
- 额外向真实 Webview frame 注入无 owner 的 delayed `turn-snapshot-unavailable`，确认不显示全局 rejected/unavailable；再建立 matching owner 并注入同一 diagnostic，确认仍显示 fail-visible 全局错误。
- 重启 Extension Development Host 后，向真实 Webview frame 注入后台 conversation revision 1 -> revision 3 gap；前台 entry/Tab 保持不变，DOM 中无 `delivery-revision-gap`、`Agent timeline event rejected` 或 `turn-snapshot-unavailable`，console 仅有 VS Code 的 benign `local-network-access` warning。
- 截图：`/tmp/neko-agent-render-lifecycle-fixed.png`；snapshot diagnostic 验证以 Webview frame DOM 断言为准。

## 性能观察

- Timeline frame scheduler 会把同一 frame、同一 owner 的连续 append 合并为一次 conversation/Markdown commit；foreground 与 background conversation 的 revision 分开推进。
- Markdown registry 在一个 staged commit 中只发布一次 external-store notification，append + completion 也只产生一个 final render revision；已有高 revision（`itemRevision: 4000`）与 2,000 字符 source 的 presenter fixture 覆盖大状态恢复。
- 本次未建立 wall-clock benchmark；结论仅限于可断言的 coalescing 次数与 ownership，不把单元测试推断为端到端帧率基准。

## 已移除或封闭的 bypass

- UI Tab、character-role Tab、Extension `tabState`、Extension `activeConversation` 的直接 cache/ref/setter activation sequence。
- background handler 对 visible React state/ref 的成功写入路径。
- migrated per-conversation map 的外部 writable access 与冗余 activation/projector helper。
- realm teardown 后继续向旧 React tree 发布 Markdown external-store 更新的路径。
- raw Markdown、legacy renderer、final-only parser 与空 snapshot success fallback。

## 剩余风险

- development stream replay 不写 conversation persistence，因此没有把 replay 当作 durability 验收。
- hide/reveal 恢复证据使用 paused active Timeline；外部 provider 的所有 timing/cancellation 组合未穷举。
- 未建立端到端性能基准；超大 Markdown、复杂表格与低性能设备仍需后续 profiling。
- 仓库仍存在与本 change 无关的 legacy debt、unused 报告、boundary compatibility exceptions、Browserslist 与 bundle-size 警告。
